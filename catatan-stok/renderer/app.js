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

// ---------- Render ----------

function renderSemua() {
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
