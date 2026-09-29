'use strict';

const crypto = require('crypto');
const config = require('./config');
const store = require('./db');
const auth = require('./auth');

const DEFAULT_SETTINGS = {
  profil: {
    namaSekolah: 'SMA NEGERI 2 MENGWI',
    alamatSekolah: 'Jalan Raya Mengwi, Kecamatan Mengwi, Kabupaten Badung, Bali',
    telepon: '(0361) 123456',
    email: 'info@sman2mengwi.sch.id',
    website: '',
    kotaTandaTangan: 'Badung',
    kepsek: 'Ni Luh Made Ratna Agustini, S.Pd., M.Pd.',
    pangkatKepsek: 'Pembina Utama Muda / IV c',
    nipKepsek: '19680814 199103 2 007',
    tahunAjaranAktif: '2026/2027',
    logo: null,
    logoKanan: null,
    /* Kop surat: diunggah sebagai gambar (cara utama) atau disusun dari teks. */
    kopMode: 'teks',
    kopGambar: null,
    kopGaris: false,
    kopBarisAtas: 'PEMERINTAH PROVINSI BALI\nDINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA',
    kopBarisBawah: 'Jalan Raya Mengwi, Kecamatan Mengwi, Kabupaten Badung, Bali\nTelepon (0361) 123456 · info@sman2mengwi.sch.id',
    daftarKelas: ['X A', 'X B', 'X C', 'X D', 'X E', 'X F', 'XI A1', 'XI A2', 'XI B1', 'XI B2', 'XI B3', 'XI C', 'XII A1', 'XII A2', 'XII A3', 'XII B1', 'XII B2', 'XII C'],
    daftarAlasan: ['Permintaan Orang Tua', 'Mengikuti Orang Tua', 'Melanjutkan Sekolah', 'Atlet Daerah Mengwi', 'Mutasi', 'Kembali Tinggal dengan Orang Tua', 'Alasan Ekonomi', 'Jarak Tempuh']
  },
  prosedur: {
    masuk: {
      judul: 'Prosedur Mutasi Masuk',
      ringkas: 'Siswa pindah dari sekolah lain dan diterima di SMA Negeri 2 Mengwi.',
      langkah: [
        { judul: 'Pengajuan Permohonan', isi: 'Orang tua/wali mengajukan permohonan pindah masuk kepada Kepala SMA Negeri 2 Mengwi, disertai alasan pindah dan data siswa (nama, NISN, kelas, serta sekolah asal).' },
        { judul: 'Pemeriksaan Daya Tampung', isi: 'Sekolah memeriksa ketersediaan rombongan belajar pada kelas yang dituju serta memastikan NISN siswa aktif dan identitas lengkap.' },
        { judul: 'Surat Keterangan Sanggup Menerima', isi: 'SMA Negeri 2 Mengwi menerbitkan Surat Keterangan Sanggup Menerima untuk disampaikan kepada sekolah asal dan Dinas Pendidikan.' },
        { judul: 'Rekomendasi Dinas Pendidikan', isi: 'Orang tua mengajukan permohonan rekomendasi pindah kepada Disdikpora Provinsi Bali dengan melampirkan Surat Keterangan Sanggup Menerima.' },
        { judul: 'Surat Keterangan Pindah dari Sekolah Asal', isi: 'Sekolah asal menerbitkan Surat Keterangan Pindah dan menyiapkan arsip siswa berupa rapor, buku induk, serta dokumen pendukung lainnya.' },
        { judul: 'Penyerahan Berkas', isi: 'Orang tua menyerahkan Surat Keterangan Pindah beserta arsip siswa kepada SMA Negeri 2 Mengwi untuk diverifikasi.' },
        { judul: 'Pencatatan Data Mutasi Masuk', isi: 'Operator mencatat data siswa pada aplikasi SIMUTASI sebagai mutasi masuk dan menyampaikan tembusan kepada Dinas Pendidikan.' },
        { judul: 'Penempatan Kelas & Pembaruan Dapodik', isi: 'Siswa ditempatkan pada kelas yang sesuai, data siswa diperbarui pada Dapodik sekolah, dan siswa mulai mengikuti pembelajaran.' }
      ],
      dokumen: [
        'Surat permohonan pindah dari orang tua/wali',
        'Surat Keterangan Sanggup Menerima dari SMA Negeri 2 Mengwi',
        'Surat rekomendasi dari Disdikpora Provinsi Bali',
        'Surat Keterangan Pindah dari sekolah asal',
        'Fotokopi Kartu Keluarga dan Akta Kelahiran',
        'Fotokopi rapor/transkrip nilai terakhir',
        'Cetakan bukti NISN aktif',
        'Pas foto ukuran 3x4 sebanyak 2 lembar'
      ]
    },
    keluar: {
      judul: 'Prosedur Mutasi Keluar',
      ringkas: 'Siswa SMA Negeri 2 Mengwi pindah dan melanjutkan pendidikan di sekolah lain.',
      langkah: [
        { judul: 'Pengajuan Permohonan Pindah', isi: 'Orang tua/wali mengajukan permohonan pindah keluar kepada Kepala SMA Negeri 2 Mengwi dengan menyebutkan alasan pindah dan sekolah tujuan.' },
        { judul: 'Surat Keterangan Sanggup Menerima', isi: 'Sekolah tujuan menerbitkan Surat Keterangan Sanggup Menerima sebagai dasar persetujuan pindah bagi siswa yang bersangkutan.' },
        { judul: 'Verifikasi oleh Sekolah', isi: 'SMA Negeri 2 Mengwi memverifikasi permohonan dan kelengkapan berkas, serta memastikan tidak ada ganjalan administrasi seperti peminjaman buku atau tunggakan.' },
        { judul: 'Penerbitan Surat Keterangan Pindah', isi: 'SMA Negeri 2 Mengwi menerbitkan Surat Keterangan Pindah Sekolah beserta tembusan kepada Disdikpora Provinsi Bali.' },
        { judul: 'Penyerahan Arsip Siswa', isi: 'Arsip siswa berupa rapor, buku induk, dan Surat Keterangan Pindah diserahkan kepada orang tua/wali untuk dibawa ke sekolah tujuan.' },
        { judul: 'Pencatatan Data Mutasi Keluar', isi: 'Operator mencatat data siswa pada aplikasi SIMUTASI sebagai mutasi keluar beserta lampiran surat persyaratannya.' },
        { judul: 'Pembaruan Dapodik', isi: 'Data siswa dikeluarkan dari rombongan belajar dan diperbarui pada Dapodik sekolah.' },
        { judul: 'Arsip & Pelaporan', isi: 'Berkas permohonan diarsipkan di sekolah dan rekapitulasi mutasi dilaporkan kepada Dinas Pendidikan.' }
      ],
      dokumen: [
        'Surat permohonan pindah dari orang tua/wali',
        'Surat Keterangan Sanggup Menerima dari sekolah tujuan',
        'Surat Keterangan Pindah dari SMA Negeri 2 Mengwi',
        'Surat rekomendasi Disdikpora (bila diperlukan)',
        'Fotokopi Kartu Keluarga',
        'Fotokopi rapor terakhir',
        'Kartu pelajar/identitas siswa',
        'Bebas peminjaman buku dan administrasi sekolah'
      ]
    }
  }
};

/* Data contoh FIKTIF (bukan data siswa sungguhan).
   Dipakai hanya untuk mencoba aplikasi saat basis data masih kosong.
   Untuk data sebenarnya, gunakan menu Import Excel atau Pulihkan Cadangan.
   Penulisan sengaja dibiarkan tidak baku ("Permintaan Orang tua", kelas "XC",
   NIS kosong) agar tampilan data apa adanya tetap terlihat. */
const SAMPLE_RECORDS = [
  { jenis: 'masuk', tanggal: '2026-07-03', nis: '', nisn: '9990000001', nama: 'Ni Luh Ayu Pratiwi', jenisKelamin: 'P', kelas: 'XI A1', tempatLahir: 'Denpasar', tanggalLahir: '2010-07-02', namaOrtu: 'I Wayan Sukadana', asalSekolah: 'SMA Negeri 1 Contoh, Lombok Barat', tujuan: '', alasan: 'Permintaan Orang tua', keterangan: '', tahunAjaran: '2026/2027' },
  { jenis: 'masuk', tanggal: '2026-08-10', nis: '9404', nisn: '9990000002', nama: 'I Made Surya Nugraha', jenisKelamin: 'L', kelas: 'XII A3', tempatLahir: 'Denpasar', tanggalLahir: '2009-04-02', namaOrtu: 'I Made Gede Wiranata, S.T.', asalSekolah: 'SMA Negeri 1 Contoh', tujuan: '', alasan: 'Atlet Daerah', keterangan: '', tahunAjaran: '2026/2027' },
  { jenis: 'masuk', tanggal: '2026-08-11', nis: '9405', nisn: '9990000003', nama: 'Ni Ketut Sri Wahyuni', jenisKelamin: 'P', kelas: 'XII C', tempatLahir: 'Denpasar', tanggalLahir: '2008-09-02', namaOrtu: 'I Ketut Widiana', asalSekolah: 'SMA Negeri 2 Contoh', tujuan: '', alasan: 'Pindah kembali tinggal dengan ortu', keterangan: '', tahunAjaran: '2026/2027' },
  { jenis: 'masuk', tanggal: '2026-10-01', nis: '9406', nisn: '9990000004', nama: 'I Komang Bagus Setiawan', jenisKelamin: 'L', kelas: 'XC', tempatLahir: 'Timuhun', tanggalLahir: '2010-08-21', namaOrtu: 'I Komang Asmara', asalSekolah: 'SMAS Pariwisata Contoh', tujuan: '', alasan: 'Mutasi', keterangan: '', tahunAjaran: '2026/2027' },
  { jenis: 'keluar', tanggal: '2026-07-15', nis: '', nisn: '9990000005', nama: 'Made Arta Wibawa', jenisKelamin: 'L', kelas: 'X F', tempatLahir: 'Badung', tanggalLahir: '2010-02-23', namaOrtu: 'I Gede Denny Saputra', asalSekolah: '', tujuan: 'SMA Negeri 3 Contoh', alasan: 'Melanjutkan sekolah', keterangan: '', tahunAjaran: '2026/2027' },
  { jenis: 'keluar', tanggal: '2026-08-21', nis: '', nisn: '9990000006', nama: 'I Nyoman Raka Putra', jenisKelamin: 'L', kelas: 'XI B3', tempatLahir: 'Mangupura', tanggalLahir: '2009-12-05', namaOrtu: 'I Nyoman Sutama', asalSekolah: '', tujuan: 'SMA Negeri 4 Contoh', alasan: 'Melanjutkan sekolah', keterangan: '', tahunAjaran: '2026/2027' },
  { jenis: 'keluar', tanggal: '2026-09-01', nis: '', nisn: '9990000007', nama: 'Ni Komang Ayu Lestari', jenisKelamin: 'P', kelas: 'XII B2', tempatLahir: 'Tabanan', tanggalLahir: '2008-09-21', namaOrtu: 'I Kadek Dwi Sadu', asalSekolah: '', tujuan: 'PKBM Contoh Sentana', alasan: 'Melanjutkan sekolah', keterangan: 'Tanggal dikonversi dari format serial Excel', tahunAjaran: '2026/2027' }
];

function ensureSettings() {
  const current = store.settings.get('profil', null);
  if (!current) store.settings.set('profil', DEFAULT_SETTINGS.profil);
  const prosedur = store.settings.get('prosedur', null);
  if (!prosedur) store.settings.set('prosedur', DEFAULT_SETTINGS.prosedur);
}

function ensureAdmin() {
  if (store.users.countAll() > 0) return;
  const { username, password, nama } = config.bootstrapAdmin;
  const generated = !password;
  const finalPassword = generated ? auth.randomPassword(14) : password;
  store.users.create({
    username: username || 'admin',
    nama: nama || 'Administrator',
    role: 'admin',
    passwordHash: auth.hashPassword(finalPassword)
  });
  if (generated) {
    console.log('');
    console.log('============================================================');
    console.log(' AKUN ADMIN DIBUAT OTOMATIS');
    console.log('   Pengguna : ' + (username || 'admin'));
    console.log('   Sandi    : ' + finalPassword);
    console.log(' Simpan sandi ini, lalu ganti melalui menu Pengaturan.');
    console.log('============================================================');
    console.log('');
  } else {
    console.log('[SIMUTASI] Akun admin "' + (username || 'admin') + '" dibuat dari konfigurasi.');
  }
}

function ensureSampleRecords() {
  if (!config.seedSampleData) return;
  if (store.db.prepare('SELECT COUNT(*) AS n FROM records').get().n > 0) return;
  SAMPLE_RECORDS.forEach((r) => store.records.insert(Object.assign({}, r, { id: crypto.randomUUID() })));
  console.log('[SIMUTASI] ' + SAMPLE_RECORDS.length + ' data contoh dimuat (SEED_SAMPLE_DATA=false untuk menonaktifkan).');
}

function run() {
  ensureSettings();
  ensureAdmin();
  ensureSampleRecords();
}

module.exports = { run, DEFAULT_SETTINGS, SAMPLE_RECORDS };
