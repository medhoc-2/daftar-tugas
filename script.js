// 1. Ambil elemen-elemen dari HTML
const inputTugas = document.getElementById("input-tugas");
const tombolTambah = document.getElementById("tombol-tambah");
const daftar = document.getElementById("daftar");
const info = document.getElementById("info");

// 2. Ambil data yang tersimpan; kalau belum ada, mulai dengan daftar kosong
let tugas = JSON.parse(localStorage.getItem("tugas")) || [];

// 3. Fungsi untuk menyimpan data ke browser
function simpan() {
  localStorage.setItem("tugas", JSON.stringify(tugas));
}

// 4. Fungsi untuk menampilkan semua tugas ke layar
function tampilkan() {
  daftar.innerHTML = "";

  tugas.forEach(function (item, nomor) {
    const li = document.createElement("li");
    if (item.selesai) {
      li.classList.add("selesai");
    }

    const centang = document.createElement("input");
    centang.type = "checkbox";
    centang.checked = item.selesai;
    centang.addEventListener("change", function () {
      tugas[nomor].selesai = centang.checked;
      simpan();
      tampilkan();
    });

    const teks = document.createElement("span");
    teks.textContent = item.teks;

    const hapus = document.createElement("button");
    hapus.textContent = "✕";
    hapus.className = "tombol-hapus";
    hapus.addEventListener("click", function () {
      tugas.splice(nomor, 1);
      simpan();
      tampilkan();
    });

    li.append(centang, teks, hapus);
    daftar.appendChild(li);
  });

  const sisa = tugas.filter(function (item) {
    return !item.selesai;
  }).length;

  if (tugas.length === 0) {
    info.textContent = "Belum ada tugas.";
  } else {
    info.textContent = sisa + " dari " + tugas.length + " tugas belum selesai.";
  }
}

// 5. Fungsi untuk menambah tugas baru
function tambahTugas() {
  const teksBaru = inputTugas.value.trim();
  if (teksBaru === "") {
    alert("Tugas tidak boleh kosong!");
    return;
  }
  tugas.push({ teks: teksBaru, selesai: false });
  inputTugas.value = "";
  simpan();
  tampilkan();
}

// 6. Sambungkan tombol Tambah dan tombol Enter ke fungsi tambahTugas
tombolTambah.addEventListener("click", tambahTugas);
inputTugas.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    tambahTugas();
  }
});

// 7. Tampilkan daftar saat halaman pertama kali dibuka
tampilkan();