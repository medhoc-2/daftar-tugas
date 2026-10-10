'use strict';

// Penyimpanan data.json: baca, tulis atomik, backup harian, dan pemulihan.
// Modul ini tidak bergantung pada Electron supaya mudah diuji.

const fs = require('fs');
const path = require('path');

const VERSI_DATA = 1;
const MAKS_BACKUP_HARIAN = 30;
const MAKS_SALINAN_SEBELUM_PULIH = 10;
const POLA_BACKUP_HARIAN = /^data-(\d{4}-\d{2}-\d{2})\.json$/;
const POLA_SEBELUM_PULIH = /^sebelum-pulih-[\d-]+\.json$/;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function dataKosong() {
  return { versi: VERSI_DATA, barang: [], transaksi: [] };
}

function duaDigit(n) {
  return String(n).padStart(2, '0');
}

// Tanggal lokal (bukan UTC) dalam format YYYY-MM-DD.
function tanggalLokal(d = new Date()) {
  return `${d.getFullYear()}-${duaDigit(d.getMonth() + 1)}-${duaDigit(d.getDate())}`;
}

function capWaktu(d = new Date()) {
  return `${tanggalLokal(d)}-${duaDigit(d.getHours())}${duaDigit(d.getMinutes())}${duaDigit(d.getSeconds())}`;
}

// Memastikan isi file benar-benar data Catatan Stok. Melempar Error jika tidak.
function validasiStruktur(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Isi file bukan data Catatan Stok.');
  }
  if (!Array.isArray(data.barang) || !Array.isArray(data.transaksi)) {
    throw new Error('Bagian "barang" atau "transaksi" tidak ditemukan.');
  }
  if (typeof data.versi === 'number' && data.versi > VERSI_DATA) {
    throw new Error('File dibuat oleh versi aplikasi yang lebih baru.');
  }
  const idBarang = new Set();
  for (const b of data.barang) {
    if (!b || typeof b.id !== 'string' || typeof b.nama !== 'string' || !b.nama.trim()) {
      throw new Error('Ada data barang yang tidak lengkap.');
    }
    if (typeof b.stokMinimum !== 'number' || !Number.isFinite(b.stokMinimum) || b.stokMinimum < 0) {
      throw new Error(`Stok minimum barang "${b.nama}" tidak valid.`);
    }
    idBarang.add(b.id);
  }
  for (const t of data.transaksi) {
    if (!t || typeof t.id !== 'string' || !idBarang.has(t.barangId)) {
      throw new Error('Ada transaksi yang tidak lengkap atau barangnya tidak ditemukan.');
    }
    if (t.jenis !== 'masuk' && t.jenis !== 'keluar') {
      throw new Error('Ada transaksi dengan jenis yang tidak dikenal.');
    }
    if (typeof t.jumlah !== 'number' || !Number.isFinite(t.jumlah) || t.jumlah <= 0) {
      throw new Error('Ada transaksi dengan jumlah yang tidak valid.');
    }
    if (typeof t.tanggal !== 'string' || !POLA_TANGGAL.test(t.tanggal)) {
      throw new Error('Ada transaksi dengan tanggal yang tidak valid.');
    }
  }
  return {
    versi: VERSI_DATA,
    barang: data.barang,
    transaksi: data.transaksi,
  };
}

function uraikanJson(teks) {
  // Buang BOM jika file pernah disimpan dengan editor lain.
  const bersih = teks.charCodeAt(0) === 0xfeff ? teks.slice(1) : teks;
  if (!bersih.trim()) throw new Error('File kosong.');
  let data;
  try {
    data = JSON.parse(bersih);
  } catch {
    throw new Error('Format JSON rusak.');
  }
  return validasiStruktur(data);
}

function tunda(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Tulis atomik: tulis ke file sementara, fsync, lalu rename menimpa file asli.
// Di Windows rename bisa gagal sesaat (EPERM/EBUSY) jika file sedang dipindai
// antivirus, jadi dicoba ulang beberapa kali.
async function tulisAtomik(fileTujuan, isi) {
  const fileSementara = `${fileTujuan}.${process.pid}.${Date.now()}.tmp`;
  const fh = await fs.promises.open(fileSementara, 'w');
  try {
    await fh.writeFile(isi, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  let percobaan = 0;
  for (;;) {
    try {
      await fs.promises.rename(fileSementara, fileTujuan);
      return;
    } catch (err) {
      percobaan += 1;
      const bisaDiulang = ['EPERM', 'EBUSY', 'EACCES'].includes(err.code);
      if (!bisaDiulang || percobaan >= 10) {
        await fs.promises.rm(fileSementara, { force: true });
        throw err;
      }
      await tunda(50 * percobaan);
    }
  }
}

class Penyimpanan {
  constructor(folderData) {
    this.folder = folderData;
    this.fileData = path.join(folderData, 'data.json');
    this.folderBackup = path.join(folderData, 'backup');
  }

  siapkanFolder() {
    fs.mkdirSync(this.folderBackup, { recursive: true });
  }

  // Hasil: { status: 'ok' | 'baru', data } atau { status: 'rusak', pesan }.
  baca() {
    let teks;
    try {
      teks = fs.readFileSync(this.fileData, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return { status: 'baru', data: dataKosong() };
      return { status: 'rusak', pesan: `File data tidak bisa dibuka (${err.code || err.message}).` };
    }
    try {
      return { status: 'ok', data: uraikanJson(teks) };
    } catch (err) {
      return { status: 'rusak', pesan: err.message };
    }
  }

  async simpan(data) {
    const valid = validasiStruktur(data);
    await tulisAtomik(this.fileData, JSON.stringify(valid, null, 2));
  }

  // Salin data.json ke backup/data-YYYY-MM-DD.json (maks. satu per hari),
  // lalu sisakan 30 backup terbaru. Hanya dipanggil jika data.json terbaca baik.
  async backupHarian(hariIni = tanggalLokal()) {
    if (!fs.existsSync(this.fileData)) return null;
    const tujuan = path.join(this.folderBackup, `data-${hariIni}.json`);
    let dibuat = null;
    if (!fs.existsSync(tujuan)) {
      const isi = await fs.promises.readFile(this.fileData, 'utf8');
      await tulisAtomik(tujuan, isi);
      dibuat = tujuan;
    }
    await this.rotasiBackup();
    return dibuat;
  }

  async rotasiBackup() {
    const hapusLebih = async (pola, maks) => {
      const nama = (await fs.promises.readdir(this.folderBackup)).filter((n) => pola.test(n)).sort().reverse();
      for (const n of nama.slice(maks)) {
        await fs.promises.rm(path.join(this.folderBackup, n), { force: true });
      }
    };
    await hapusLebih(POLA_BACKUP_HARIAN, MAKS_BACKUP_HARIAN);
    await hapusLebih(POLA_SEBELUM_PULIH, MAKS_SALINAN_SEBELUM_PULIH);
  }

  // Daftar backup harian, terbaru lebih dulu.
  daftarBackup() {
    let nama = [];
    try {
      nama = fs.readdirSync(this.folderBackup);
    } catch {
      return [];
    }
    return nama
      .map((n) => ({ n, m: POLA_BACKUP_HARIAN.exec(n) }))
      .filter((x) => x.m)
      .sort((a, b) => (a.n < b.n ? 1 : -1))
      .map((x) => ({ file: path.join(this.folderBackup, x.n), tanggal: x.m[1] }));
  }

  // Backup harian terbaru yang isinya valid.
  backupTerakhirValid() {
    for (const b of this.daftarBackup()) {
      try {
        const data = this.bacaFileBackup(b.file);
        return { ...b, data };
      } catch {
        // lanjut ke backup yang lebih lama
      }
    }
    return null;
  }

  bacaFileBackup(file) {
    return uraikanJson(fs.readFileSync(file, 'utf8'));
  }

  // Simpan salinan data.json saat ini sebelum ditimpa oleh pemulihan.
  async amankanSebelumPulih() {
    if (!fs.existsSync(this.fileData)) return null;
    const tujuan = path.join(this.folderBackup, `sebelum-pulih-${capWaktu()}.json`);
    await fs.promises.copyFile(this.fileData, tujuan);
    return tujuan;
  }

  // Ganti nama data.json yang rusak supaya tidak hilang/tertimpa.
  async amankanFileRusak() {
    if (!fs.existsSync(this.fileData)) return null;
    const tujuan = path.join(this.folder, `data-rusak-${capWaktu()}.json`);
    await fs.promises.rename(this.fileData, tujuan);
    return tujuan;
  }
}

module.exports = {
  Penyimpanan,
  dataKosong,
  tanggalLokal,
  capWaktu,
  validasiStruktur,
  uraikanJson,
  tulisAtomik,
  MAKS_BACKUP_HARIAN,
};
