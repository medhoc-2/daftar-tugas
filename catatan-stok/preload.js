'use strict';

// Jembatan satu-satunya antara tampilan dan proses utama.
// Tampilan hanya bisa memanggil fungsi-fungsi di bawah ini.
const { contextBridge, ipcRenderer } = require('electron');

const panggil = (kanal) => (...args) => ipcRenderer.invoke(kanal, ...args);

contextBridge.exposeInMainWorld('api', {
  muatData: panggil('data:muat'),
  konfirmasi: panggil('dialog:konfirmasi'),
  bukaFolderData: panggil('folder:buka'),
  pulihkanBackupTerakhir: panggil('backup:pulihkanTerakhir'),
  pulihkanDariFile: panggil('backup:pulihkanDariFile'),
  buatBackup: panggil('backup:buat'),
  simpanCsv: panggil('csv:simpan'),
  tambahBarang: panggil('barang:tambah'),
  ubahBarang: panggil('barang:ubah'),
  hapusBarang: panggil('barang:hapus'),
  tambahTransaksi: panggil('transaksi:tambah'),
  hapusTransaksi: panggil('transaksi:hapus'),
});
