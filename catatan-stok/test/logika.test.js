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
