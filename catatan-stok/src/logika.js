// Aturan bisnis bersama Catatan Stok.
// Dipakai oleh proses utama (lewat require) dan tampilan (lewat <script>),
// jadi file ini tidak boleh memakai API Node maupun DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logika = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const POLA_TANGGAL = /^(\d{4})-(\d{2})-(\d{2})$/;
  const formatterAngka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });

  function duaDigit(n) {
    return String(n).padStart(2, '0');
  }

  function tanggalHariIni(d = new Date()) {
    return `${d.getFullYear()}-${duaDigit(d.getMonth() + 1)}-${duaDigit(d.getDate())}`;
  }

  // 1250 -> "1.250", 2.5 -> "2,5"
  function formatAngka(n) {
    return formatterAngka.format(n);
  }

  // "2026-10-10" -> "10/10/2026"
  function formatTanggal(iso) {
    const m = POLA_TANGGAL.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  return {
    tanggalHariIni,
    formatAngka,
    formatTanggal,
  };
});
