// Aturan bisnis bersama Catatan Stok.
// Dipakai oleh proses utama (lewat require) dan tampilan (lewat <script>),
// jadi file ini tidak boleh memakai API Node maupun DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logika = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const POLA_TANGGAL = /^(\d{4})-(\d{2})-(\d{2})$/;
  const formatterAngka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });

  function duaDigit(n) {
    return String(n).padStart(2, '0');
  }

  function tanggalHariIni(d = new Date()) {
    return `${d.getFullYear()}-${duaDigit(d.getMonth() + 1)}-${duaDigit(d.getDate())}`;
  }

  // 1250 -> "1.250", 2.5 -> "2,5"
  function formatAngka(n) {
    return formatterAngka.format(n);
  }

  // "2026-10-10" -> "10/10/2026"
  function formatTanggal(iso) {
    const m = POLA_TANGGAL.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  // ---------- Umum ----------

  function gagal(pesan) {
    const e = new Error(pesan);
    e.pengguna = true; // pesan aman untuk ditampilkan ke pengguna
    throw e;
  }

  function salin(data) {
    return JSON.parse(JSON.stringify(data));
  }

  // Rapikan spasi berlebih.
  function rapikan(teks) {
    return String(teks == null ? '' : teks).replace(/\s+/g, ' ').trim();
  }

  function kunciNama(teks) {
    return rapikan(teks).toLocaleLowerCase('id-ID');
  }

  // Baca angka gaya Indonesia: "1.250" = 1250, "2,5" = 2.5, "1.250,5" = 1250.5.
  // Titik dianggap pemisah ribuan hanya jika diikuti tepat tiga digit,
  // jadi "2.5" tetap dibaca 2,5.
  function parseAngka(nilai) {
    if (typeof nilai === 'number') return Number.isFinite(nilai) ? nilai : NaN;
    let s = String(nilai == null ? '' : nilai).replace(/\s/g, '');
    if (!s) return NaN;
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  // Simpan angka maksimal 3 desimal supaya tidak ada sisa pembulatan.
  function bulatkan(n) {
    return Math.round(n * 1000) / 1000;
  }

  // ---------- Barang ----------

  const SATUAN_UMUM = ['pcs', 'dus', 'kg', 'gram', 'liter', 'pak', 'lusin', 'botol', 'meter', 'karung', 'rim', 'set'];

  function cariBarang(data, id) {
    return data.barang.find((b) => b.id === id) || null;
  }

  function urutkanNama(a, b) {
    return a.nama.localeCompare(b.nama, 'id-ID', { sensitivity: 'base', numeric: true });
  }

  function daftarKategori(data) {
    const peta = new Map();
    for (const b of data.barang) {
      if (b.kategori) peta.set(kunciNama(b.kategori), b.kategori);
    }
    return [...peta.values()].sort((a, b) => a.localeCompare(b, 'id-ID', { sensitivity: 'base' }));
  }

  function daftarSatuan(data) {
    const peta = new Map(SATUAN_UMUM.map((s) => [s, s]));
    for (const b of data.barang) {
      if (b.satuan && !peta.has(kunciNama(b.satuan))) peta.set(kunciNama(b.satuan), b.satuan);
    }
    return [...peta.values()];
  }

  // Validasi isian barang. idDiedit diisi saat mengedit supaya nama sendiri tidak dianggap dobel.
  function bersihkanBarang(data, input, idDiedit) {
    const nama = rapikan(input && input.nama);
    const kategori = rapikan(input && input.kategori);
    const satuan = rapikan(input && input.satuan);
    if (!nama) gagal('Nama barang wajib diisi.');
    if (nama.length > 100) gagal('Nama barang terlalu panjang (maksimal 100 karakter).');
    if (kategori.length > 60) gagal('Kategori terlalu panjang (maksimal 60 karakter).');
    if (!satuan) gagal('Satuan wajib diisi.');
    if (satuan.length > 20) gagal('Satuan terlalu panjang (maksimal 20 karakter).');
    const teksMin = input && input.stokMinimum;
    const stokMinimum = teksMin === '' || teksMin == null ? 0 : parseAngka(teksMin);
    if (!Number.isFinite(stokMinimum) || stokMinimum < 0) gagal('Stok minimum harus berupa angka 0 atau lebih.');
    const dobel = data.barang.find((b) => b.id !== idDiedit && kunciNama(b.nama) === kunciNama(nama));
    if (dobel) gagal(`Barang dengan nama "${dobel.nama}" sudah ada.`);
    // Samakan penulisan kategori dengan yang sudah ada (misalnya "sembako" -> "Sembako").
    const lainnya = { barang: data.barang.filter((b) => b.id !== idDiedit) };
    const kategoriAda = daftarKategori(lainnya).find((k) => kunciNama(k) === kunciNama(kategori));
    return { nama, kategori: kategoriAda || kategori, satuan, stokMinimum: bulatkan(stokMinimum) };
  }

  function tambahBarang(data, input, id, waktu) {
    const nilai = bersihkanBarang(data, input, null);
    const baru = salin(data);
    baru.barang.push({ id, ...nilai, dibuat: waktu });
    return baru;
  }

  function ubahBarang(data, id, input) {
    const lama = cariBarang(data, id);
    if (!lama) gagal('Barang tidak ditemukan.');
    const nilai = bersihkanBarang(data, input, id);
    const baru = salin(data);
    const i = baru.barang.findIndex((b) => b.id === id);
    baru.barang[i] = { ...baru.barang[i], ...nilai };
    return baru;
  }

  function hapusBarang(data, id) {
    const barang = cariBarang(data, id);
    if (!barang) gagal('Barang tidak ditemukan.');
    const jumlahTransaksi = data.transaksi.filter((t) => t.barangId === id).length;
    if (jumlahTransaksi > 0) {
      gagal(`"${barang.nama}" tidak bisa dihapus karena sudah punya ${jumlahTransaksi} transaksi.`);
    }
    const baru = salin(data);
    baru.barang = baru.barang.filter((b) => b.id !== id);
    return baru;
  }

  // ---------- Transaksi & stok ----------

  const JENIS = { masuk: 'Masuk', keluar: 'Keluar' };

  // Stok = total masuk - total keluar. Dihitung dalam satuan seperseribu
  // supaya penjumlahan desimal (mis. 0,1 + 0,2) tetap tepat.
  function hitungStok(data) {
    const seribu = new Map(data.barang.map((b) => [b.id, 0]));
    for (const t of data.transaksi) {
      const n = Math.round(t.jumlah * 1000) * (t.jenis === 'keluar' ? -1 : 1);
      seribu.set(t.barangId, (seribu.get(t.barangId) || 0) + n);
    }
    const stok = new Map();
    for (const [id, n] of seribu) stok.set(id, n / 1000);
    return stok;
  }

  function stokBarang(data, barangId) {
    return hitungStok(data).get(barangId) || 0;
  }

  function tanggalValid(iso) {
    const m = POLA_TANGGAL.exec(iso || '');
    if (!m) return false;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
  }

  function tambahTransaksi(data, input, id, waktu, hariIni) {
    const jenis = input && input.jenis;
    if (!JENIS[jenis]) gagal('Jenis transaksi tidak dikenal.');
    const barang = cariBarang(data, input.barangId);
    if (!barang) gagal('Pilih barang terlebih dahulu.');
    const tanggal = input.tanggal;
    if (!tanggalValid(tanggal)) gagal('Tanggal tidak valid.');
    if (tanggal > hariIni) gagal('Tanggal tidak boleh melebihi hari ini.');
    const jumlah = parseAngka(input.jumlah);
    if (!Number.isFinite(jumlah) || jumlah <= 0) gagal('Jumlah harus berupa angka lebih dari 0.');
    if (bulatkan(jumlah) !== jumlah) gagal('Jumlah maksimal 3 angka di belakang koma.');
    const keterangan = rapikan(input.keterangan);
    if (keterangan.length > 200) gagal('Keterangan terlalu panjang (maksimal 200 karakter).');
    if (jenis === 'keluar') {
      const stok = stokBarang(data, barang.id);
      if (jumlah > stok) {
        gagal(
          `Stok "${barang.nama}" tidak cukup. Stok saat ini ${formatAngka(stok)} ${barang.satuan}, ` +
            `diminta keluar ${formatAngka(jumlah)} ${barang.satuan}.`
        );
      }
    }
    const baru = salin(data);
    baru.transaksi.push({ id, tanggal, barangId: barang.id, jenis, jumlah, keterangan, dibuat: waktu });
    return baru;
  }

  function hapusTransaksi(data, id) {
    const t = data.transaksi.find((x) => x.id === id);
    if (!t) gagal('Transaksi tidak ditemukan.');
    const baru = salin(data);
    baru.transaksi = baru.transaksi.filter((x) => x.id !== id);
    if (t.jenis === 'masuk') {
      const barang = cariBarang(data, t.barangId);
      const sisa = stokBarang(baru, t.barangId);
      if (sisa < 0) {
        gagal(
          `Transaksi ini tidak bisa dihapus karena stok "${barang.nama}" akan menjadi minus ` +
            `(${formatAngka(sisa)} ${barang.satuan}). Hapus dulu transaksi barang keluar yang terkait.`
        );
      }
    }
    return baru;
  }

  // Terbaru dulu: tanggal transaksi, lalu waktu input.
  function urutkanTransaksiTerbaru(a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    const da = a.dibuat || '';
    const db = b.dibuat || '';
    return da === db ? 0 : da < db ? 1 : -1;
  }

  // ---------- Halaman stok & ringkasan ----------

  const TANPA_KATEGORI = '__tanpa_kategori__';

  // Stok menipis = stok di bawah stok minimum.
  function daftarStok(data, filter) {
    const f = filter || {};
    const stok = hitungStok(data);
    const cari = kunciNama(f.cari);
    return data.barang
      .map((b) => {
        const s = stok.get(b.id) || 0;
        return { barang: b, stok: s, menipis: s < b.stokMinimum };
      })
      .filter((r) => {
        if (cari && !kunciNama(r.barang.nama).includes(cari) && !kunciNama(r.barang.kategori).includes(cari)) return false;
        if (f.kategori === TANPA_KATEGORI && r.barang.kategori) return false;
        if (f.kategori && f.kategori !== TANPA_KATEGORI && kunciNama(r.barang.kategori) !== kunciNama(f.kategori)) return false;
        if (f.hanyaMenipis && !r.menipis) return false;
        return true;
      })
      .sort((a, b) => urutkanNama(a.barang, b.barang));
  }

  function ringkasan(data, hariIni) {
    const hari = data.transaksi.filter((t) => t.tanggal === hariIni);
    return {
      jenisBarang: data.barang.length,
      menipis: daftarStok(data).filter((r) => r.menipis).length,
      transaksiHariIni: hari.length,
      masukHariIni: hari.filter((t) => t.jenis === 'masuk').length,
      keluarHariIni: hari.filter((t) => t.jenis === 'keluar').length,
    };
  }

  // ---------- Riwayat ----------

  function daftarRiwayat(data, filter) {
    const f = filter || {};
    return data.transaksi
      .filter((t) => {
        if (f.barangId && t.barangId !== f.barangId) return false;
        if (f.jenis && t.jenis !== f.jenis) return false;
        if (f.dari && t.tanggal < f.dari) return false;
        if (f.sampai && t.tanggal > f.sampai) return false;
        return true;
      })
      .sort(urutkanTransaksiTerbaru);
  }

  // ---------- CSV ----------
  // Pemisah titik koma dan koma desimal, sesuai Excel dengan pengaturan wilayah Indonesia.
  // BOM UTF-8 ditambahkan saat file disimpan.

  const PEMISAH_CSV = ';';

  function selTeks(v) {
    let s = String(v == null ? '' : v);
    // Cegah teks dibaca Excel sebagai rumus.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (/[";\r\n]/.test(s) || s.includes(PEMISAH_CSV)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function selAngka(n) {
    return String(n).replace('.', ',');
  }

  function barisCsv(kolom) {
    return kolom.join(PEMISAH_CSV);
  }

  function csvStok(baris) {
    const isi = [barisCsv(['Nama Barang', 'Kategori', 'Satuan', 'Stok Saat Ini', 'Stok Minimum', 'Status'].map(selTeks))];
    for (const r of baris) {
      isi.push(barisCsv([
        selTeks(r.barang.nama),
        selTeks(r.barang.kategori),
        selTeks(r.barang.satuan),
        selAngka(r.stok),
        selAngka(r.barang.stokMinimum),
        selTeks(r.menipis ? 'Stok menipis' : 'Aman'),
      ]));
    }
    return isi.join('\r\n') + '\r\n';
  }

  function csvRiwayat(data, daftar) {
    const peta = new Map(data.barang.map((b) => [b.id, b]));
    const isi = [barisCsv(['Tanggal', 'Jenis', 'Nama Barang', 'Kategori', 'Jumlah', 'Satuan', 'Keterangan'].map(selTeks))];
    for (const t of daftar) {
      const b = peta.get(t.barangId) || { nama: '', kategori: '', satuan: '' };
      isi.push(barisCsv([
        formatTanggal(t.tanggal),
        selTeks(JENIS[t.jenis]),
        selTeks(b.nama),
        selTeks(b.kategori),
        selAngka(t.jumlah),
        selTeks(b.satuan),
        selTeks(t.keterangan),
      ]));
    }
    return isi.join('\r\n') + '\r\n';
  }

  return {
    tanggalHariIni,
    formatAngka,
    formatTanggal,
    parseAngka,
    rapikan,
    kunciNama,
    cariBarang,
    urutkanNama,
    daftarKategori,
    daftarSatuan,
    tambahBarang,
    ubahBarang,
    hapusBarang,
    JENIS,
    hitungStok,
    stokBarang,
    tanggalValid,
    tambahTransaksi,
    hapusTransaksi,
    urutkanTransaksiTerbaru,
    TANPA_KATEGORI,
    daftarStok,
    ringkasan,
    daftarRiwayat,
    csvStok,
    csvRiwayat,
  };
});
