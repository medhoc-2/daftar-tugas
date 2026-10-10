'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Penyimpanan, dataKosong } = require('../src/penyimpanan');

function folderSementara() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'catatan-stok-'));
}

test('file belum ada dianggap data baru', () => {
  const p = new Penyimpanan(folderSementara());
  p.siapkanFolder();
  assert.deepStrictEqual(p.baca(), { status: 'baru', data: dataKosong() });
});

test('simpan lalu baca kembali, tanpa file sementara tersisa', async () => {
  const folder = folderSementara();
  const p = new Penyimpanan(folder);
  p.siapkanFolder();
  const data = {
    versi: 1,
    barang: [{ id: 'b1', nama: 'Gula', kategori: 'Sembako', satuan: 'kg', stokMinimum: 5 }],
    transaksi: [{ id: 't1', barangId: 'b1', jenis: 'masuk', jumlah: 10, tanggal: '2026-10-10', keterangan: '' }],
  };
  await p.simpan(data);
  assert.deepStrictEqual(p.baca(), { status: 'ok', data });
  assert.deepStrictEqual(fs.readdirSync(folder).sort(), ['backup', 'data.json']);
});

test('file rusak dilaporkan dan tidak ditimpa', () => {
  const folder = folderSementara();
  const p = new Penyimpanan(folder);
  p.siapkanFolder();
  fs.writeFileSync(p.fileData, '{"barang": [');
  const hasil = p.baca();
  assert.strictEqual(hasil.status, 'rusak');
  assert.strictEqual(fs.readFileSync(p.fileData, 'utf8'), '{"barang": [');
});

test('struktur salah dianggap rusak', () => {
  const p = new Penyimpanan(folderSementara());
  p.siapkanFolder();
  fs.writeFileSync(p.fileData, JSON.stringify({ barang: [], transaksi: [{ id: 'x', barangId: 'tidak-ada', jenis: 'masuk', jumlah: 1, tanggal: '2026-01-01' }] }));
  assert.strictEqual(p.baca().status, 'rusak');
});

test('backup harian maksimal satu per hari dan disisakan 30', async () => {
  const p = new Penyimpanan(folderSementara());
  p.siapkanFolder();
  await p.simpan(dataKosong());
  for (let i = 1; i <= 31; i++) {
    await p.backupHarian(`2026-01-${String(i).padStart(2, '0')}`);
  }
  await p.backupHarian('2026-02-01');
  assert.strictEqual(await p.backupHarian('2026-02-01'), null, 'hari yang sama tidak dibuat ulang');
  const daftar = p.daftarBackup();
  assert.strictEqual(daftar.length, 30);
  assert.strictEqual(daftar[0].tanggal, '2026-02-01');
  assert.strictEqual(daftar[29].tanggal, '2026-01-03');
});

test('backup terakhir yang valid dilewati jika rusak', async () => {
  const p = new Penyimpanan(folderSementara());
  p.siapkanFolder();
  await p.simpan(dataKosong());
  await p.backupHarian('2026-03-01');
  fs.writeFileSync(path.join(p.folderBackup, 'data-2026-03-02.json'), 'rusak');
  assert.strictEqual(p.backupTerakhirValid().tanggal, '2026-03-01');
});
