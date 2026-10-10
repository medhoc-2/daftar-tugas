'use strict';

// Tampilan Catatan Stok. Tidak punya akses ke Node/sistem file;
// semua operasi data lewat window.api (preload.js).

const L = window.Logika;
const layanan = window.api;

const keadaan = {
  data: { barang: [], transaksi: [] },
  info: null,
};

// ---------- Utilitas DOM ----------

const $ = (sel) => document.querySelector(sel);

// Buat elemen; teks selalu lewat textContent supaya aman dari HTML sisipan.
function el(tag, atribut, ...anak) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atribut || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const a of anak.flat()) {
    if (a === null || a === undefined || a === false) continue;
    e.append(a instanceof Node ? a : document.createTextNode(String(a)));
  }
  return e;
}

function notifikasi(pesan, jenis = 'sukses') {
  const p = el('div', { class: `pesan ${jenis === 'galat' ? 'galat' : ''}`, text: pesan });
  $('#notifikasi').append(p);
  setTimeout(() => p.remove(), jenis === 'galat' ? 6000 : 3000);
}

// Tampilkan hasil dari proses utama: { ok, pesan, batal, data }.
function tanganiHasil(hasil, pesanSukses) {
  if (!hasil) return false;
  if (hasil.ok) {
    if (hasil.data) keadaan.data = hasil.data;
    if (pesanSukses) notifikasi(pesanSukses);
    renderSemua();
    return true;
  }
  if (!hasil.batal && hasil.pesan) notifikasi(hasil.pesan, 'galat');
  return false;
}

// ---------- Tab ----------

function pilihTab(nama) {
  document.querySelectorAll('.tab button').forEach((b) => {
    b.classList.toggle('aktif', b.dataset.tab === nama);
    b.setAttribute('aria-selected', b.dataset.tab === nama ? 'true' : 'false');
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('aktif', p.id === `panel-${nama}`);
  });
}

document.querySelectorAll('.tab button').forEach((b) => {
  b.addEventListener('click', () => pilihTab(b.dataset.tab));
});

// ---------- Backup ----------

function renderBackup() {
  const info = keadaan.info;
  if (!info) return;
  $('#lokasi-file').textContent = info.lokasi.file;
  $('#lokasi-backup').textContent = info.lokasi.backup;
  $('#info-backup').textContent = info.backup.jumlah
    ? `${L.formatAngka(info.backup.jumlah)} file, terakhir ${L.formatTanggal(info.backup.terakhir)}`
    : 'Belum ada';
}

async function bukaFolderData() {
  tanganiHasil(await layanan.bukaFolderData());
}

$('#tombol-buka-folder').addEventListener('click', bukaFolderData);

// ---------- Layar data rusak ----------

function renderLayarRusak() {
  const rusak = keadaan.info && keadaan.info.status === 'rusak';
  $('#layar-rusak').hidden = !rusak;
  if (!rusak) return;
  $('#rusak-pesan').textContent = keadaan.info.pesan;
  const b = keadaan.info.backup;
  $('#rusak-backup-info').textContent = b.terakhir
    ? `Backup terakhir: ${L.formatTanggal(b.terakhir)}.`
    : 'Tidak ada backup otomatis. Jika punya file backup lain, pilih lewat tombol "Pilih File Backup…".';
  $('#rusak-pulihkan-terakhir').disabled = !b.terakhir;
}

async function setelahPemulihan(hasil) {
  if (hasil && hasil.ok) {
    await muatUlang();
    notifikasi('Data berhasil dipulihkan dari backup.');
  } else {
    tanganiHasil(hasil);
  }
}

$('#rusak-pulihkan-terakhir').addEventListener('click', async () => {
  setelahPemulihan(await layanan.pulihkanBackupTerakhir());
});
$('#rusak-pilih-file').addEventListener('click', async () => {
  setelahPemulihan(await layanan.pulihkanDariFile());
});
$('#rusak-buka-folder').addEventListener('click', bukaFolderData);

// ---------- Barang ----------

let idBarangDiedit = null;

function isiDatalist(id, nilai) {
  $(id).replaceChildren(...nilai.map((v) => el('option', { value: v })));
}

function aturModeFormBarang(barang) {
  idBarangDiedit = barang ? barang.id : null;
  $('#judul-form-barang').textContent = barang ? `Edit Barang: ${barang.nama}` : 'Tambah Barang';
  $('#tombol-simpan-barang').textContent = barang ? 'Simpan Perubahan' : 'Tambah Barang';
  $('#tombol-batal-edit').hidden = !barang;
  $('#barang-nama').value = barang ? barang.nama : '';
  $('#barang-kategori').value = barang ? barang.kategori : '';
  $('#barang-satuan').value = barang ? barang.satuan : '';
  $('#barang-minimum').value = barang ? L.formatAngka(barang.stokMinimum) : '';
  renderBarang();
  $('#barang-nama').focus();
}

function renderBarang() {
  const data = keadaan.data;
  isiDatalist('#daftar-kategori', L.daftarKategori(data));
  isiDatalist('#daftar-satuan', L.daftarSatuan(data));

  const cari = L.kunciNama($('#barang-cari').value);
  const stok = L.hitungStok(data);
  const jumlahTransaksi = new Map();
  for (const t of data.transaksi) jumlahTransaksi.set(t.barangId, (jumlahTransaksi.get(t.barangId) || 0) + 1);
  const baris = data.barang
    .filter((b) => !cari || L.kunciNama(b.nama).includes(cari) || L.kunciNama(b.kategori).includes(cari))
    .sort(L.urutkanNama);

  const wadah = $('#tabel-barang');
  if (!baris.length) {
    wadah.replaceChildren(el('div', {
      class: 'kosong',
      text: data.barang.length ? 'Tidak ada barang yang cocok.' : 'Belum ada barang. Tambahkan lewat form di atas.',
    }));
    return;
  }
  wadah.replaceChildren(el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { text: 'Nama Barang' }),
      el('th', { text: 'Kategori' }),
      el('th', { text: 'Satuan' }),
      el('th', { class: 'angka', text: 'Stok' }),
      el('th', { class: 'angka', text: 'Stok Minimum' }),
      el('th', { class: 'angka', text: 'Transaksi' }),
      el('th', { class: 'aksi', text: '' }),
    )),
    el('tbody', {}, baris.map((b) => {
      const nTrans = jumlahTransaksi.get(b.id) || 0;
      return el('tr', { class: b.id === idBarangDiedit ? 'sedang-diedit' : '' },
        el('td', { text: b.nama }),
        el('td', { text: b.kategori || '-' }),
        el('td', { text: b.satuan }),
        el('td', { class: 'angka', text: L.formatAngka(stok.get(b.id) || 0) }),
        el('td', { class: 'angka', text: L.formatAngka(b.stokMinimum) }),
        el('td', { class: 'angka', text: L.formatAngka(nTrans) }),
        el('td', { class: 'aksi' },
          el('button', { class: 'tombol kecil', type: 'button', text: 'Edit', onclick: () => aturModeFormBarang(b) }),
          el('button', {
            class: 'tombol kecil bahaya',
            type: 'button',
            text: 'Hapus',
            disabled: nTrans > 0,
            title: nTrans > 0 ? 'Tidak bisa dihapus karena sudah punya transaksi' : 'Hapus barang',
            onclick: () => hapusBarang(b),
          }),
        ),
      );
    })),
  ));
}

async function hapusBarang(b) {
  const setuju = await layanan.konfirmasi({
    judul: 'Hapus Barang',
    pesan: `Hapus barang "${b.nama}"?`,
    detail: 'Barang yang dihapus tidak bisa dikembalikan (kecuali dari backup).',
    tombolYa: 'Hapus',
    bahaya: true,
  });
  if (!setuju) return;
  if (tanganiHasil(await layanan.hapusBarang(b.id), `Barang "${b.nama}" dihapus.`) && idBarangDiedit === b.id) {
    aturModeFormBarang(null);
  }
}

$('#form-barang').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = {
    nama: $('#barang-nama').value,
    kategori: $('#barang-kategori').value,
    satuan: $('#barang-satuan').value,
    stokMinimum: $('#barang-minimum').value,
  };
  const sedangEdit = idBarangDiedit;
  const hasil = sedangEdit ? await layanan.ubahBarang(sedangEdit, input) : await layanan.tambahBarang(input);
  if (tanganiHasil(hasil, sedangEdit ? 'Perubahan barang disimpan.' : `Barang "${L.rapikan(input.nama)}" ditambahkan.`)) {
    aturModeFormBarang(null);
  }
});
$('#tombol-batal-edit').addEventListener('click', () => aturModeFormBarang(null));
$('#barang-cari').addEventListener('input', renderBarang);

// ---------- Transaksi ----------

let jenisTransaksi = 'masuk';

function pilihJenis(jenis) {
  jenisTransaksi = jenis;
  document.querySelectorAll('.pilihan-jenis button').forEach((b) => {
    b.classList.toggle('aktif', b.dataset.jenis === jenis);
    b.setAttribute('aria-pressed', b.dataset.jenis === jenis ? 'true' : 'false');
  });
  $('#tombol-simpan-transaksi').textContent = jenis === 'masuk' ? 'Simpan Barang Masuk' : 'Simpan Barang Keluar';
  renderInfoStok();
}

function renderInfoStok() {
  const b = L.cariBarang(keadaan.data, $('#transaksi-barang').value);
  const info = $('#transaksi-info-stok');
  if (!b) {
    info.replaceChildren();
    return;
  }
  const stok = L.stokBarang(keadaan.data, b.id);
  info.replaceChildren(
    'Stok saat ini: ',
    el('strong', { text: `${L.formatAngka(stok)} ${b.satuan}` }),
    stok < b.stokMinimum ? el('span', { class: 'lencana menipis', text: ' di bawah minimum ' }) : null,
  );
}

// Satu baris tabel transaksi (dipakai di tab Transaksi dan Riwayat).
function barisTransaksi(t, barangPeta, denganHapus) {
  const b = barangPeta.get(t.barangId);
  return el('tr', {},
    el('td', { text: L.formatTanggal(t.tanggal) }),
    el('td', {}, el('span', { class: `lencana ${t.jenis}`, text: L.JENIS[t.jenis] })),
    el('td', { text: b ? b.nama : '(barang terhapus)' }),
    el('td', { class: 'angka', text: L.formatAngka(t.jumlah) }),
    el('td', { text: b ? b.satuan : '' }),
    el('td', { text: t.keterangan || '-' }),
    denganHapus
      ? el('td', { class: 'aksi' },
        el('button', { class: 'tombol kecil bahaya', type: 'button', text: 'Hapus', onclick: () => hapusTransaksi(t) }))
      : null,
  );
}

function tabelTransaksi(daftar, denganHapus) {
  const barangPeta = new Map(keadaan.data.barang.map((b) => [b.id, b]));
  return el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { text: 'Tanggal' }),
      el('th', { text: 'Jenis' }),
      el('th', { text: 'Barang' }),
      el('th', { class: 'angka', text: 'Jumlah' }),
      el('th', { text: 'Satuan' }),
      el('th', { text: 'Keterangan' }),
      denganHapus ? el('th', { class: 'aksi', text: '' }) : null,
    )),
    el('tbody', {}, daftar.map((t) => barisTransaksi(t, barangPeta, denganHapus))),
  );
}

async function hapusTransaksi(t) {
  const b = L.cariBarang(keadaan.data, t.barangId);
  const setuju = await layanan.konfirmasi({
    judul: 'Hapus Transaksi',
    pesan: `Hapus transaksi barang ${t.jenis} ini?`,
    detail: `${L.formatTanggal(t.tanggal)} — ${b ? b.nama : ''} — ${L.formatAngka(t.jumlah)} ${b ? b.satuan : ''}` +
      (t.keterangan ? ` (${t.keterangan})` : '') + '\nStok akan dihitung ulang otomatis.',
    tombolYa: 'Hapus',
    bahaya: true,
  });
  if (!setuju) return;
  tanganiHasil(await layanan.hapusTransaksi(t.id), 'Transaksi dihapus.');
}

function renderTransaksi() {
  const data = keadaan.data;
  const adaBarang = data.barang.length > 0;
  $('#transaksi-tanpa-barang').hidden = adaBarang;
  $('#form-transaksi').hidden = !adaBarang;

  const tanggal = $('#transaksi-tanggal');
  tanggal.max = L.tanggalHariIni();
  if (!tanggal.value) tanggal.value = L.tanggalHariIni();

  // Isi pilihan barang, pertahankan pilihan sebelumnya.
  const pilih = $('#transaksi-barang');
  const sebelumnya = pilih.value;
  const stok = L.hitungStok(data);
  pilih.replaceChildren(
    el('option', { value: '', text: '— Pilih barang —' }),
    ...[...data.barang].sort(L.urutkanNama).map((b) =>
      el('option', { value: b.id, text: `${b.nama} (stok ${L.formatAngka(stok.get(b.id) || 0)} ${b.satuan})` })),
  );
  pilih.value = L.cariBarang(data, sebelumnya) ? sebelumnya : '';
  renderInfoStok();

  const terakhir = [...data.transaksi]
    .sort((a, b) => ((a.dibuat || '') < (b.dibuat || '') ? 1 : -1))
    .slice(0, 10);
  const wadah = $('#tabel-transaksi-terakhir');
  if (!terakhir.length) {
    wadah.replaceChildren(el('div', { class: 'kosong', text: 'Belum ada transaksi.' }));
  } else {
    wadah.replaceChildren(tabelTransaksi(terakhir, false));
  }
}

document.querySelectorAll('.pilihan-jenis button').forEach((b) => {
  b.addEventListener('click', () => pilihJenis(b.dataset.jenis));
});
$('#transaksi-barang').addEventListener('change', renderInfoStok);

$('#form-transaksi').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = {
    jenis: jenisTransaksi,
    tanggal: $('#transaksi-tanggal').value,
    barangId: $('#transaksi-barang').value,
    jumlah: $('#transaksi-jumlah').value,
    keterangan: $('#transaksi-keterangan').value,
  };
  const b = L.cariBarang(keadaan.data, input.barangId);
  const pesan = b
    ? `Barang ${input.jenis} dicatat: ${b.nama} ${L.formatAngka(L.parseAngka(input.jumlah))} ${b.satuan}.`
    : '';
  if (tanganiHasil(await layanan.tambahTransaksi(input), pesan)) {
    $('#transaksi-jumlah').value = '';
    $('#transaksi-keterangan').value = '';
    $('#transaksi-jumlah').focus();
  }
});

// ---------- Stok & ringkasan ----------

function renderRingkasan() {
  const r = L.ringkasan(keadaan.data, L.tanggalHariIni());
  $('#ringkasan-jenis').textContent = L.formatAngka(r.jenisBarang);
  $('#ringkasan-menipis').textContent = L.formatAngka(r.menipis);
  $('#kartu-menipis').classList.toggle('peringatan', r.menipis > 0);
  $('#ringkasan-hari-ini').textContent = L.formatAngka(r.transaksiHariIni);
  $('#ringkasan-hari-ini-rinci').textContent = r.transaksiHariIni
    ? `${L.formatAngka(r.masukHariIni)} masuk, ${L.formatAngka(r.keluarHariIni)} keluar`
    : '';
}

function isiPilihanKategori() {
  const pilih = $('#stok-kategori');
  const sebelumnya = pilih.value;
  const ada = L.daftarKategori(keadaan.data);
  const adaTanpa = keadaan.data.barang.some((b) => !b.kategori);
  pilih.replaceChildren(
    el('option', { value: '', text: 'Semua kategori' }),
    ...ada.map((k) => el('option', { value: k, text: k })),
    adaTanpa ? el('option', { value: L.TANPA_KATEGORI, text: '(Tanpa kategori)' }) : null,
  );
  pilih.value = [...pilih.options].some((o) => o.value === sebelumnya) ? sebelumnya : '';
}

function filterStokSaatIni() {
  return {
    cari: $('#stok-cari').value,
    kategori: $('#stok-kategori').value,
    hanyaMenipis: $('#stok-menipis').checked,
  };
}

function renderStok() {
  isiPilihanKategori();
  const baris = L.daftarStok(keadaan.data, filterStokSaatIni());
  const wadah = $('#tabel-stok');
  $('#stok-jumlah').textContent = keadaan.data.barang.length
    ? `Menampilkan ${L.formatAngka(baris.length)} dari ${L.formatAngka(keadaan.data.barang.length)} barang.`
    : '';
  if (!baris.length) {
    wadah.replaceChildren(el('div', {
      class: 'kosong',
      text: keadaan.data.barang.length
        ? 'Tidak ada barang yang cocok dengan pencarian/filter.'
        : 'Belum ada barang. Tambahkan barang dulu di tab Barang.',
    }));
    return;
  }
  wadah.replaceChildren(el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { text: 'Nama Barang' }),
      el('th', { text: 'Kategori' }),
      el('th', { text: 'Satuan' }),
      el('th', { class: 'angka', text: 'Stok Saat Ini' }),
      el('th', { class: 'angka', text: 'Stok Minimum' }),
      el('th', { text: 'Status' }),
    )),
    el('tbody', {}, baris.map((r) => el('tr', { class: r.menipis ? 'menipis' : '' },
      el('td', { text: r.barang.nama }),
      el('td', { text: r.barang.kategori || '-' }),
      el('td', { text: r.barang.satuan }),
      el('td', { class: 'angka stok', text: L.formatAngka(r.stok) }),
      el('td', { class: 'angka', text: L.formatAngka(r.barang.stokMinimum) }),
      el('td', {}, el('span', {
        class: `lencana ${r.menipis ? 'menipis' : 'aman'}`,
        text: r.menipis ? 'Stok menipis' : 'Aman',
      })),
    ))),
  ));
}

$('#stok-cari').addEventListener('input', renderStok);
$('#stok-kategori').addEventListener('change', renderStok);
$('#stok-menipis').addEventListener('change', renderStok);

function lihatStokMenipis() {
  $('#stok-cari').value = '';
  $('#stok-kategori').value = '';
  $('#stok-menipis').checked = true;
  pilihTab('stok');
  renderStok();
}
$('#kartu-menipis').addEventListener('click', lihatStokMenipis);
$('#kartu-menipis').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    lihatStokMenipis();
  }
});

// ---------- Render ----------

function renderSemua() {
  renderRingkasan();
  renderStok();
  renderTransaksi();
  renderBarang();
  renderBackup();
  renderLayarRusak();
}

async function muatUlang() {
  const info = await layanan.muatData();
  keadaan.info = info;
  keadaan.data = info.data || { barang: [], transaksi: [] };
  renderSemua();
}

muatUlang().catch((err) => {
  console.error(err);
  notifikasi(`Gagal memuat data: ${err.message}`, 'galat');
});
