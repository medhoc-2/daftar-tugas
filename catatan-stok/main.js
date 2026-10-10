'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');
const { Penyimpanan, tanggalLokal } = require('./src/penyimpanan');
const L = require('./src/logika');

const FILE_TAMPILAN = path.join(__dirname, 'renderer', 'index.html');
const URL_TAMPILAN = pathToFileURL(FILE_TAMPILAN).href;
const FILE_IKON = path.join(__dirname, 'build', 'icon.png');

// Pakai lokal Indonesia untuk tampilan Chromium (misalnya kalender input tanggal).
app.commandLine.appendSwitch('lang', 'id');

// Hanya satu jendela aplikasi supaya data tidak ditulis dobel.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let jendela = null;
let penyimpanan = null;
// status: 'ok' (data siap dipakai) atau 'rusak' (data.json tidak terbaca, tidak boleh ditimpa)
let keadaan = { status: 'ok', data: null, pesan: '' };

function errorPengguna(pesan) {
  const e = new Error(pesan);
  e.pengguna = true;
  return e;
}

// ---------- Data ----------

async function muatData() {
  penyimpanan = new Penyimpanan(path.join(app.getPath('documents'), 'CatatanStok'));
  penyimpanan.siapkanFolder();
  const hasil = penyimpanan.baca();
  if (hasil.status === 'rusak') {
    keadaan = { status: 'rusak', data: null, pesan: hasil.pesan };
    return;
  }
  keadaan = { status: 'ok', data: hasil.data, pesan: '' };
  if (hasil.status === 'baru') {
    await penyimpanan.simpan(hasil.data);
  }
  try {
    await penyimpanan.backupHarian(tanggalLokal());
  } catch (err) {
    console.error('Backup otomatis gagal:', err);
  }
}

function keadaanUntukTampilan() {
  const daftar = penyimpanan.daftarBackup();
  return {
    status: keadaan.status,
    pesan: keadaan.pesan,
    data: keadaan.data,
    lokasi: {
      folder: penyimpanan.folder,
      file: penyimpanan.fileData,
      backup: penyimpanan.folderBackup,
    },
    backup: {
      jumlah: daftar.length,
      terakhir: daftar.length ? daftar[0].tanggal : null,
    },
    versiAplikasi: app.getVersion(),
  };
}

// Semua perubahan data lewat antrean supaya penulisan file tidak bertabrakan.
let antrean = Promise.resolve();

function ubahData(ubah) {
  const tugas = antrean.then(async () => {
    if (keadaan.status !== 'ok') {
      throw errorPengguna('Data sedang bermasalah. Pulihkan dari backup terlebih dahulu.');
    }
    const baru = ubah(keadaan.data);
    await penyimpanan.simpan(baru);
    keadaan.data = baru;
    return { ok: true, data: baru };
  });
  antrean = tugas.catch(() => {});
  return tugas.catch((err) => {
    if (!err.pengguna) console.error(err);
    return { ok: false, pesan: err.pengguna ? err.message : `Gagal menyimpan data: ${err.message}` };
  });
}

function ringkasData(data) {
  return `${data.barang.length} barang dan ${data.transaksi.length} transaksi`;
}

async function konfirmasi({ judul, pesan, detail, tombolYa = 'Ya', bahaya = false }) {
  const { response } = await dialog.showMessageBox(jendela, {
    type: bahaya ? 'warning' : 'question',
    title: judul || 'Konfirmasi',
    message: pesan,
    detail: detail || undefined,
    buttons: [tombolYa, 'Batal'],
    defaultId: bahaya ? 1 : 0,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
}

// Ganti data.json dengan data hasil pemulihan, tanpa menghilangkan file lama.
function terapkanPemulihan(dataBaru) {
  const tugas = antrean.then(async () => {
    if (keadaan.status === 'rusak') await penyimpanan.amankanFileRusak();
    else await penyimpanan.amankanSebelumPulih();
    await penyimpanan.simpan(dataBaru);
    keadaan = { status: 'ok', data: dataBaru, pesan: '' };
    try {
      await penyimpanan.backupHarian(tanggalLokal());
    } catch (err) {
      console.error('Backup otomatis gagal:', err);
    }
    return { ok: true, data: dataBaru };
  });
  antrean = tugas.catch(() => {});
  return tugas.catch((err) => {
    console.error(err);
    return { ok: false, pesan: `Pemulihan gagal: ${err.message}` };
  });
}

async function pulihkanBackupTerakhir() {
  const b = penyimpanan.backupTerakhirValid();
  if (!b) return { ok: false, pesan: 'Tidak ada file backup yang bisa dipakai.' };
  const setuju = await konfirmasi({
    judul: 'Pulihkan dari Backup',
    pesan: `Pulihkan data dari backup tanggal ${b.tanggal.split('-').reverse().join('/')}?`,
    detail: `Backup berisi ${ringkasData(b.data)}. File data yang sekarang tetap disimpan sebagai cadangan di folder data.`,
    tombolYa: 'Pulihkan',
    bahaya: true,
  });
  if (!setuju) return { ok: false, batal: true };
  return terapkanPemulihan(b.data);
}

async function pulihkanDariFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog(jendela, {
    title: 'Pilih File Backup',
    defaultPath: penyimpanan.folderBackup,
    filters: [{ name: 'Backup Catatan Stok', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false, batal: true };
  let data;
  try {
    data = penyimpanan.bacaFileBackup(filePaths[0]);
  } catch (err) {
    return { ok: false, pesan: `File tidak bisa dipakai: ${err.message}` };
  }
  const setuju = await konfirmasi({
    judul: 'Pulihkan dari Backup',
    pesan: `Ganti semua data saat ini dengan isi file "${path.basename(filePaths[0])}"?`,
    detail: `File berisi ${ringkasData(data)}. Data yang sekarang tetap disimpan sebagai cadangan di folder backup.`,
    tombolYa: 'Pulihkan',
    bahaya: true,
  });
  if (!setuju) return { ok: false, batal: true };
  return terapkanPemulihan(data);
}

// ---------- IPC ----------

// Hanya terima pesan dari halaman aplikasi sendiri.
function tangani(kanal, fungsi) {
  ipcMain.handle(kanal, async (event, ...args) => {
    if (!event.senderFrame || event.senderFrame.url !== URL_TAMPILAN) {
      throw new Error('Pengirim tidak dikenal.');
    }
    return fungsi(...args);
  });
}

function daftarkanIpc() {
  tangani('data:muat', () => keadaanUntukTampilan());
  tangani('dialog:konfirmasi', (opsi) => konfirmasi(opsi || {}));
  tangani('folder:buka', async () => {
    const galat = await shell.openPath(penyimpanan.folder);
    return galat ? { ok: false, pesan: `Folder tidak bisa dibuka: ${galat}` } : { ok: true };
  });
  tangani('backup:pulihkanTerakhir', () => pulihkanBackupTerakhir());
  tangani('backup:pulihkanDariFile', () => pulihkanDariFile());

  tangani('barang:tambah', (input) =>
    ubahData((data) => L.tambahBarang(data, input, randomUUID(), new Date().toISOString()))
  );
  tangani('barang:ubah', (id, input) => ubahData((data) => L.ubahBarang(data, id, input)));
  tangani('barang:hapus', (id) => ubahData((data) => L.hapusBarang(data, id)));
}

// ---------- Jendela ----------

function buatJendela() {
  jendela = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Catatan Stok',
    backgroundColor: '#f4f5f7',
    show: false,
    icon: fs.existsSync(FILE_IKON) ? FILE_IKON : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  const wc = jendela.webContents;

  // Jangan izinkan membuka jendela baru atau berpindah halaman.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => {
    if (url !== URL_TAMPILAN) e.preventDefault();
  });

  // Pintasan keyboard: zoom (Ctrl + / - / 0), DevTools hanya saat pengembangan (F12).
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (!app.isPackaged && input.key === 'F12') {
      wc.toggleDevTools();
      e.preventDefault();
      return;
    }
    if (input.control && !input.alt) {
      const level = wc.getZoomLevel();
      if (input.key === '=' || input.key === '+') wc.setZoomLevel(Math.min(level + 0.5, 4));
      else if (input.key === '-') wc.setZoomLevel(Math.max(level - 0.5, -3));
      else if (input.key === '0') wc.setZoomLevel(0);
      else return;
      e.preventDefault();
    }
  });

  // Teruskan pesan console tampilan ke terminal saat pengembangan.
  if (!app.isPackaged) {
    wc.on('console-message', (e) => {
      console.log(`[tampilan:${e.level}] ${e.message}`);
    });
  }
  wc.on('preload-error', (_e, p, err) => console.error('Preload error:', p, err));
  wc.on('render-process-gone', (_e, d) => console.error('Proses tampilan berhenti:', d.reason));

  jendela.once('ready-to-show', () => jendela.show());
  jendela.on('closed', () => {
    jendela = null;
  });
  jendela.loadFile(FILE_TAMPILAN);
}

app.on('second-instance', () => {
  if (jendela) {
    if (jendela.isMinimized()) jendela.restore();
    jendela.show();
    jendela.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // Aplikasi sepenuhnya offline: tolak izin (kamera, notifikasi, dll.), matikan
  // pemeriksa ejaan (yang bisa mengunduh kamus), dan blokir semua permintaan jaringan.
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _izin, cb) => cb(false));
  ses.setSpellCheckerEnabled(false);
  if (process.platform !== 'darwin') ses.setSpellCheckerLanguages([]);
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) =>
    cb({ cancel: true })
  );

  try {
    await muatData();
  } catch (err) {
    dialog.showErrorBox(
      'Catatan Stok',
      `Folder data tidak bisa disiapkan:\n${err.message}\n\nAplikasi akan ditutup.`
    );
    app.quit();
    return;
  }
  daftarkanIpc();
  buatJendela();
});

app.on('window-all-closed', () => {
  app.quit();
});
