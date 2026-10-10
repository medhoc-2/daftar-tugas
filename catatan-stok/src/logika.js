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
  };
});
