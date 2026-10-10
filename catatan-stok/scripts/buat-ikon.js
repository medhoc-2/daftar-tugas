'use strict';

// Membuat ikon aplikasi (gudang dengan tumpukan kardus) tanpa dependensi tambahan.
// Hasil: build/icon.ico (16–256 px) dan build/icon.png (512 px).
// Jalankan: node scripts/buat-ikon.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- Gambar (koordinat 0..1) ----------

const WARNA = {
  latarAtas: [88, 106, 122],
  latarBawah: [62, 77, 90],
  gudang: [236, 239, 242],
  pintu: [44, 55, 65],
  kardus: [205, 160, 92],
  lakban: [168, 124, 60],
};

function bentuk() {
  const b = [];
  const kotak = (x0, y0, x1, y1, warna, r = 0) => b.push({ jenis: 'kotak', x0, y0, x1, y1, r, warna });
  const segitiga = (titik, warna) => b.push({ jenis: 'poligon', titik, warna });

  kotak(0.03, 0.03, 0.97, 0.97, 'latar', 0.2);
  // Atap dan dinding gudang
  segitiga([[0.12, 0.47], [0.5, 0.17], [0.88, 0.47]], WARNA.gudang);
  kotak(0.2, 0.44, 0.8, 0.84, WARNA.gudang);
  // Pintu gudang terbuka
  kotak(0.29, 0.53, 0.71, 0.84, WARNA.pintu);
  // Tumpukan kardus
  const kardus = (x0, y0, x1, y1) => {
    kotak(x0, y0, x1, y1, WARNA.kardus, 0.012);
    const tengah = (x0 + x1) / 2;
    kotak(tengah - 0.012, y0, tengah + 0.012, y0 + (y1 - y0) * 0.45, WARNA.lakban);
  };
  kardus(0.32, 0.685, 0.495, 0.84);
  kardus(0.505, 0.685, 0.68, 0.84);
  kardus(0.41, 0.56, 0.59, 0.675);
  return b;
}

function dalamKotak(s, x, y) {
  if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) return false;
  if (!s.r) return true;
  const cx = Math.min(Math.max(x, s.x0 + s.r), s.x1 - s.r);
  const cy = Math.min(Math.max(y, s.y0 + s.r), s.y1 - s.r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= s.r ** 2;
}

function dalamPoligon(titik, x, y) {
  let dalam = false;
  for (let i = 0, j = titik.length - 1; i < titik.length; j = i++) {
    const [xi, yi] = titik[i];
    const [xj, yj] = titik[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dalam = !dalam;
  }
  return dalam;
}

function warnaDi(daftar, x, y) {
  let warna = null;
  for (const s of daftar) {
    const kena = s.jenis === 'kotak' ? dalamKotak(s, x, y) : dalamPoligon(s.titik, x, y);
    if (!kena) continue;
    if (s.warna === 'latar') {
      const t = y;
      warna = WARNA.latarAtas.map((a, i) => a + (WARNA.latarBawah[i] - a) * t);
    } else {
      warna = s.warna;
    }
  }
  return warna;
}

// Render RGBA dengan anti-aliasing (supersampling 5x5).
function render(ukuran) {
  const daftar = bentuk();
  const px = Buffer.alloc(ukuran * ukuran * 4);
  const N = 5;
  for (let py = 0; py < ukuran; py++) {
    for (let pxx = 0; pxx < ukuran; pxx++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const w = warnaDi(daftar, (pxx + (sx + 0.5) / N) / ukuran, (py + (sy + 0.5) / N) / ukuran);
          if (!w) continue;
          r += w[0]; g += w[1]; b += w[2]; a += 1;
        }
      }
      const i = (py * ukuran + pxx) * 4;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  return px;
}

// ---------- PNG ----------

const TABEL_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABEL_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function potongan(tipe, data) {
  const panjang = Buffer.alloc(4);
  panjang.writeUInt32BE(data.length);
  const isi = Buffer.concat([Buffer.from(tipe, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(isi));
  return Buffer.concat([panjang, isi, crc]);
}

function png(ukuran, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ukuran, 0);
  ihdr.writeUInt32BE(ukuran, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const mentah = Buffer.alloc(ukuran * (ukuran * 4 + 1));
  for (let y = 0; y < ukuran; y++) {
    rgba.copy(mentah, y * (ukuran * 4 + 1) + 1, y * ukuran * 4, (y + 1) * ukuran * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    potongan('IHDR', ihdr),
    potongan('IDAT', zlib.deflateSync(mentah, { level: 9 })),
    potongan('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- ICO ----------
// Ukuran kecil disimpan sebagai BMP 32-bit (paling kompatibel), 256 px sebagai PNG.

function bmpIco(ukuran, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(ukuran, 4);
  header.writeInt32LE(ukuran * 2, 8); // tinggi XOR + AND
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const xor = Buffer.alloc(ukuran * ukuran * 4);
  for (let y = 0; y < ukuran; y++) {
    for (let x = 0; x < ukuran; x++) {
      const s = (y * ukuran + x) * 4;
      const d = ((ukuran - 1 - y) * ukuran + x) * 4; // BMP disimpan dari bawah
      xor[d] = rgba[s + 2];
      xor[d + 1] = rgba[s + 1];
      xor[d + 2] = rgba[s];
      xor[d + 3] = rgba[s + 3];
    }
  }
  const barisAnd = Math.ceil(ukuran / 32) * 4;
  const and = Buffer.alloc(barisAnd * ukuran); // semua 0: transparansi dari kanal alfa
  return Buffer.concat([header, xor, and]);
}

function ico(gambar) {
  const kepala = Buffer.alloc(6 + 16 * gambar.length);
  kepala.writeUInt16LE(0, 0);
  kepala.writeUInt16LE(1, 2);
  kepala.writeUInt16LE(gambar.length, 4);
  let offset = kepala.length;
  gambar.forEach(({ ukuran, data }, i) => {
    const e = 6 + 16 * i;
    kepala[e] = ukuran >= 256 ? 0 : ukuran;
    kepala[e + 1] = ukuran >= 256 ? 0 : ukuran;
    kepala.writeUInt16LE(1, e + 4);
    kepala.writeUInt16LE(32, e + 6);
    kepala.writeUInt32LE(data.length, e + 8);
    kepala.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([kepala, ...gambar.map((g) => g.data)]);
}

// ---------- Utama ----------

const folder = path.join(__dirname, '..', 'build');
fs.mkdirSync(folder, { recursive: true });

const gambar = [16, 24, 32, 48, 64, 128, 256].map((ukuran) => {
  const rgba = render(ukuran);
  return { ukuran, data: ukuran >= 256 ? png(ukuran, rgba) : bmpIco(ukuran, rgba) };
});
fs.writeFileSync(path.join(folder, 'icon.ico'), ico(gambar));
fs.writeFileSync(path.join(folder, 'icon.png'), png(512, render(512)));
console.log('Ikon dibuat: build/icon.ico dan build/icon.png');
