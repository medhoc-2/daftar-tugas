# Rencana — Catatan Stok

1. Proyek Electron di folder `catatan-stok/` (aplikasi daftar tugas lama di root repo tidak diubah).
2. Proses utama (`main.js`): satu jendela 1200x800 (min 900x600), single instance, menu bawaan dihilangkan, keamanan ketat (contextIsolation, sandbox, tanpa nodeIntegration, CSP).
3. `preload.js` hanya membuka API kecil lewat `contextBridge` + IPC; tampilan tidak pernah menyentuh sistem file.
4. `src/penyimpanan.js`: data di `Documents\CatatanStok\data.json`, tulis atomik (file sementara → rename), backup harian otomatis (maks. 30), deteksi file rusak tanpa menimpa + pemulihan dari backup.
5. `src/logika.js`: aturan bisnis bersama (validasi barang/transaksi, hitung stok, filter, ringkasan, format angka/tanggal Indonesia, CSV) — dipakai proses utama dan tampilan, diuji dengan `node --test`.
6. Tahap 2: master barang (tambah/edit/hapus, nama unik, tidak bisa hapus jika ada transaksi).
7. Tahap 3: transaksi masuk/keluar, stok otomatis, tolak keluar melebihi stok.
8. Tahap 4–5: halaman Stok + ringkasan + tanda stok menipis; Riwayat dengan filter & hapus; export CSV (UTF-8 BOM); menu Backup.
9. Tahap 6: ikon .ico buatan sendiri (skrip Node tanpa dependensi), electron-builder NSIS x64, installer dengan pilihan folder + shortcut + uninstaller, data di Documents tidak ikut terhapus.
10. Setiap tahap: jalankan aplikasi, cek console bebas error, tes otomatis, commit (Bahasa Indonesia) dan push.
