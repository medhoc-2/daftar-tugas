'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/logika');

const kosong = () => ({ versi: 1, barang: [], transaksi: [] });
const WAKTU = '2026-10-10T08:00:00.000Z';

test('format angka dan tanggal Indonesia', () => {
  assert.strictEqual(L.formatAngka(1250), '1.250');
  assert.strictEqual(L.formatAngka(2.5), '2,5');
  assert.strictEqual(L.formatTanggal('2026-10-05'), '05/10/2026');
});

test('parse angka gaya Indonesia', () => {
  assert.strictEqual(L.parseAngka('1.250'), 1250);
  assert.strictEqual(L.parseAngka('1.250,75'), 1250.75);
  assert.strictEqual(L.parseAngka('2,5'), 2.5);
  assert.strictEqual(L.parseAngka('2.5'), 2.5);
  assert.strictEqual(L.parseAngka(' 12 '), 12);
  assert.ok(Number.isNaN(L.parseAngka('')));
  assert.ok(Number.isNaN(L.parseAngka('12a')));
});

test('tambah barang dan tolak nama dobel (tanpa beda huruf besar/spasi)', () => {
  let d = L.tambahBarang(kosong(), { nama: 'Gula  Pasir', kategori: 'Sembako', satuan: 'kg', stokMinimum: '5' }, 'b1', WAKTU);
  assert.strictEqual(d.barang[0].nama, 'Gula Pasir');
  assert.strictEqual(d.barang[0].stokMinimum, 5);
  assert.throws(() => L.tambahBarang(d, { nama: ' gula pasir ', satuan: 'kg' }, 'b2', WAKTU), /sudah ada/);
  d = L.tambahBarang(d, { nama: 'Teh', kategori: 'sembako', satuan: 'dus' }, 'b2', WAKTU);
  assert.strictEqual(d.barang[1].kategori, 'Sembako', 'kategori disamakan penulisannya');
});

test('validasi isian barang', () => {
  assert.throws(() => L.tambahBarang(kosong(), { nama: '', satuan: 'kg' }, 'b', WAKTU), /wajib/);
  assert.throws(() => L.tambahBarang(kosong(), { nama: 'A', satuan: '' }, 'b', WAKTU), /Satuan/);
  assert.throws(() => L.tambahBarang(kosong(), { nama: 'A', satuan: 'kg', stokMinimum: '-1' }, 'b', WAKTU), /minimum/);
  assert.throws(() => L.tambahBarang(kosong(), { nama: 'A', satuan: 'kg', stokMinimum: 'abc' }, 'b', WAKTU), /minimum/);
});

test('edit barang boleh tetap memakai namanya sendiri', () => {
  let d = L.tambahBarang(kosong(), { nama: 'Gula', satuan: 'kg' }, 'b1', WAKTU);
  d = L.tambahBarang(d, { nama: 'Teh', satuan: 'kg' }, 'b2', WAKTU);
  d = L.ubahBarang(d, 'b1', { nama: 'GULA', satuan: 'karung', stokMinimum: '2' });
  assert.deepStrictEqual([d.barang[0].nama, d.barang[0].satuan, d.barang[0].stokMinimum], ['GULA', 'karung', 2]);
  assert.throws(() => L.ubahBarang(d, 'b1', { nama: 'teh', satuan: 'kg' }), /sudah ada/);
});

test('barang yang punya transaksi tidak bisa dihapus', () => {
  let d = L.tambahBarang(kosong(), { nama: 'Gula', satuan: 'kg' }, 'b1', WAKTU);
  d.transaksi.push({ id: 't1', barangId: 'b1', jenis: 'masuk', jumlah: 1, tanggal: '2026-10-10', keterangan: '' });
  assert.throws(() => L.hapusBarang(d, 'b1'), /tidak bisa dihapus/);
  d.transaksi = [];
  assert.strictEqual(L.hapusBarang(d, 'b1').barang.length, 0);
});

function dataContoh() {
  let d = L.tambahBarang(kosong(), { nama: 'Gula', satuan: 'kg', stokMinimum: '5' }, 'b1', WAKTU);
  d = L.tambahBarang(d, { nama: 'Teh', satuan: 'dus' }, 'b2', WAKTU);
  return d;
}
const HARI = '2026-10-10';
let urut = 0;
const trx = (d, jenis, barangId, jumlah, tanggal = HARI) =>
  L.tambahTransaksi(d, { jenis, barangId, jumlah, tanggal, keterangan: '' }, `t${++urut}`, `2026-10-10T08:00:0${urut % 10}Z`, HARI);

test('stok dihitung dari transaksi masuk dan keluar', () => {
  let d = dataContoh();
  d = trx(d, 'masuk', 'b1', '10');
  d = trx(d, 'masuk', 'b1', '2,5');
  d = trx(d, 'keluar', 'b1', '0,1');
  d = trx(d, 'keluar', 'b1', '0,2');
  assert.strictEqual(L.stokBarang(d, 'b1'), 12.2);
  assert.strictEqual(L.stokBarang(d, 'b2'), 0);
});

test('barang keluar melebihi stok ditolak', () => {
  let d = trx(dataContoh(), 'masuk', 'b1', '10');
  assert.throws(() => trx(d, 'keluar', 'b1', '11'), /tidak cukup/);
  d = trx(d, 'keluar', 'b1', '10');
  assert.strictEqual(L.stokBarang(d, 'b1'), 0);
  assert.throws(() => trx(d, 'keluar', 'b2', '1'), /tidak cukup/);
});

test('validasi transaksi', () => {
  const d = dataContoh();
  assert.throws(() => trx(d, 'masuk', 'b1', '0'), /lebih dari 0/);
  assert.throws(() => trx(d, 'masuk', 'b1', '-3'), /lebih dari 0/);
  assert.throws(() => trx(d, 'masuk', 'b1', 'abc'), /lebih dari 0/);
  assert.throws(() => trx(d, 'masuk', 'b1', '1,2345'), /3 angka/);
  assert.throws(() => trx(d, 'masuk', 'tidak-ada', '1'), /Pilih barang/);
  assert.throws(() => trx(d, 'masuk', 'b1', '1', '2026-02-30'), /Tanggal tidak valid/);
  assert.throws(() => trx(d, 'masuk', 'b1', '1', '2026-10-11'), /melebihi hari ini/);
  assert.throws(() => trx(d, 'pinjam', 'b1', '1'), /Jenis/);
});

test('hapus transaksi masuk ditolak jika stok jadi minus', () => {
  let d = trx(dataContoh(), 'masuk', 'b1', '10');
  const idMasuk = d.transaksi[0].id;
  d = trx(d, 'keluar', 'b1', '4');
  assert.throws(() => L.hapusTransaksi(d, idMasuk), /minus/);
  const idKeluar = d.transaksi[1].id;
  d = L.hapusTransaksi(d, idKeluar);
  d = L.hapusTransaksi(d, idMasuk);
  assert.strictEqual(d.transaksi.length, 0);
});
