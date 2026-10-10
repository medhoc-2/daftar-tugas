# Catatan Stok

Aplikasi desktop Windows sederhana untuk mencatat stok barang, barang masuk, dan barang keluar.
Dipakai satu orang di satu laptop, **sepenuhnya offline** (tanpa internet maupun server).

Dibuat dengan Electron + HTML/CSS/JavaScript biasa (tanpa framework UI dan tanpa bundler).

## Fitur

- **Stok**: tabel semua barang dan stok saat ini, pencarian, filter kategori, filter "hanya stok menipis".
  Baris dengan stok di bawah minimum ditandai merah.
- **Transaksi**: catat Barang Masuk / Barang Keluar (tanggal, barang, jumlah, keterangan).
  Stok dihitung otomatis; barang keluar ditolak jika melebihi stok.
- **Riwayat**: daftar transaksi terbaru, filter barang, jenis, dan rentang tanggal; hapus transaksi yang salah input.
- **Barang**: tambah, edit, hapus barang (nama tidak boleh dobel; barang yang sudah punya transaksi tidak bisa dihapus).
- **Backup**: buat backup ke lokasi pilihan, pulihkan dari file backup, buka folder data di Explorer.
- Ringkasan di bagian atas: jenis barang, jumlah stok menipis, transaksi hari ini.
- Export CSV (stok dan riwayat) yang terbuka rapi di Excel.

## Menjalankan saat pengembangan

Butuh [Node.js LTS](https://nodejs.org/) dan Git.

```bash
cd catatan-stok
npm install        # sekali saja, mengunduh Electron dan electron-builder
npm start          # menjalankan aplikasi
npm test           # menjalankan tes otomatis (logika stok & penyimpanan)
```

Saat pengembangan, tekan **F12** untuk membuka DevTools. Pesan console tampilan juga ikut tampil di terminal.
**Ctrl +** / **Ctrl -** / **Ctrl 0** untuk memperbesar, memperkecil, dan mengembalikan ukuran tampilan.

## Membuat installer (.exe)

Di Windows:

```bash
cd catatan-stok
npm install
npm run dist
```

Hasilnya: `catatan-stok/dist/Catatan-Stok-Setup-1.0.0.exe` (installer NSIS, Windows x64).
Folder `dist/` tidak ikut di-commit ke Git.

Installer:
- bisa memilih folder instalasi (default: `%LOCALAPPDATA%\Programs\Catatan Stok`, tanpa hak admin),
- membuat shortcut di Desktop dan Start Menu,
- punya uninstaller (Settings → Apps, atau "Uninstall Catatan Stok.exe" di folder instalasi).

Ikon aplikasi (`build/icon.ico` dan `build/icon.png`) dibuat oleh `npm run ikon` (skrip `scripts/buat-ikon.js`, tanpa dependensi tambahan).

> Membuat installer di Linux/macOS juga bisa, tetapi electron-builder membutuhkan **Wine** (termasuk Wine 32-bit)
> untuk menyusun uninstaller NSIS.

### Peringatan Windows SmartScreen

Installer **tidak ditandatangani** (tidak memakai sertifikat code signing berbayar). Karena itu, saat installer
pertama kali dijalankan, Windows SmartScreen akan menampilkan "Windows protected your PC".
Klik **More info**, lalu **Run anyway**. Ini normal untuk aplikasi buatan sendiri.

## Lokasi data dan backup

| Isi | Lokasi |
| --- | --- |
| Data utama | `Documents\CatatanStok\data.json` |
| Backup otomatis | `Documents\CatatanStok\backup\data-YYYY-MM-DD.json` |
| Salinan sebelum pemulihan | `Documents\CatatanStok\backup\sebelum-pulih-….json` |
| File data rusak yang diamankan | `Documents\CatatanStok\data-rusak-….json` |

- Folder dibuat otomatis saat aplikasi pertama kali dibuka.
- Data ditulis dengan aman: ditulis ke file sementara dulu, lalu di-rename, sehingga file tidak rusak
  jika aplikasi/laptop mati mendadak.
- **Backup otomatis**: setiap kali aplikasi dibuka, `data.json` disalin ke folder `backup` (maksimal satu per hari).
  Hanya 30 backup harian terbaru yang disimpan.
- Jika `data.json` rusak/tidak bisa dibaca, file itu **tidak ditimpa**. Aplikasi menampilkan pesan dan menawarkan
  pemulihan dari backup terakhir (file rusak disimpan sebagai `data-rusak-….json`).
- **Uninstall tidak menghapus** folder `Documents\CatatanStok`. Data tetap aman jika aplikasi diinstal ulang.

## Export CSV

File CSV disimpan dengan **UTF-8 + BOM**, pemisah **titik koma (;)**, dan **koma desimal**: format yang dipakai Excel
dengan pengaturan wilayah Indonesia, sehingga file langsung terbuka rapi dengan double-click.
Jika Windows Anda memakai pengaturan wilayah Inggris/AS (pemisah daftar koma), buka lewat
Excel → Data → From Text/CSV dan pilih pemisah "Semicolon".

## Format angka dan tanggal

- Angka ditampilkan gaya Indonesia: `1.250`, `2,5`.
- Saat mengetik jumlah: `1.250` dibaca seribu dua ratus lima puluh, `2,5` (atau `2.5`) dibaca dua koma lima.
  Maksimal 3 angka di belakang koma.
- Tanggal ditampilkan `dd/mm/yyyy`.

## Struktur proyek

```
catatan-stok/
├── main.js            Proses utama Electron: jendela, single instance, IPC, dialog
├── preload.js         Jembatan aman (contextBridge) antara tampilan dan proses utama
├── src/
│   ├── logika.js      Aturan bisnis (validasi, stok, filter, ringkasan, CSV); dipakai main & tampilan
│   └── penyimpanan.js data.json, tulis atomik, backup harian, pemulihan
├── renderer/          Tampilan (index.html, style.css, app.js)
├── build/             Ikon aplikasi untuk installer
├── scripts/           Skrip pembuat ikon
└── test/              Tes otomatis (node --test)
```

Keamanan Electron: `contextIsolation` aktif, `nodeIntegration` mati, `sandbox` aktif, Content-Security-Policy ketat,
navigasi/jendela baru diblokir, dan semua permintaan jaringan diblokir (aplikasi benar-benar offline).
