# SIMUTASI — Sistem Informasi Mutasi Siswa

Layanan administrasi **mutasi siswa (pindah masuk & pindah keluar)** untuk
SMA Negeri 2 Mengwi. Terdiri dari:

- **Halaman publik** — prosedur lengkap mutasi masuk & keluar, daftar dokumen
  persyaratan, dan tombol **Login Admin**.
- **Aplikasi admin** (perlu login) — pencatatan data mutasi, arsip berkas
  persyaratan, cetak surat keterangan, impor/ekspor Excel, dan pengaturan sekolah.
- **Server API** dengan basis data **SQLite** dan penyimpanan berkas di server.

Data siswa **tidak pernah tampil ke publik** — hanya dapat diakses setelah login.

---

## Fitur

### Halaman publik (tanpa login)
- Profil sekolah, logo, alamat, telepon, dan surel
- **Visualisasi prosedur** mutasi masuk & mutasi keluar (alur ringkas + tahapan
  rinci berbentuk timeline)
- Daftar dokumen persyaratan untuk masing-masing jenis mutasi
- Tombol login menuju halaman masuk petugas

### Aplikasi admin
| Bagian | Kegunaan |
|---|---|
| Dashboard | Jumlah mutasi masuk/keluar, selisih, grafik per bulan, alasan terbanyak, sebaran kelas, aktivitas terbaru |
| Mutasi Masuk / Keluar | Tambah, ubah, hapus, cari, filter kelas/alasan/tahun ajaran, urut otomatis per tanggal |
| Nomor Surat | **Diketik manual per siswa** (mis. `421.3/123/SMAN2MGW/2026`); kolomnya tampil di tabel dengan penanda "belum" bila belum diisi |
| Arsip Surat | Seluruh berkas lampiran beserta pemilik datanya, pencarian, dan pratinjau |
| Cetak | Surat keterangan mutasi per siswa memakai **kop surat dan nomor surat manual**, ditambah rekap daftar mutasi |
| Import/Export | Impor `.xls/.xlsx/.csv` dengan deteksi kolom otomatis (termasuk kolom *Nomor Surat*); ekspor ke Excel 3 sheet |
| Pengaturan | **Kop surat dari gambar unggahan** (PNG/JPG, tampil sebagai pratinjau) atau disusun dari teks + dua logo; identitas sekolah, prosedur mutasi (mengubah isi halaman publik), referensi kelas/alasan, tahun ajaran |
| Pengguna | Kelola akun petugas (admin/operator) — khusus admin |
| Log Aktivitas | Riwayat semua tindakan penting — khusus admin |
| Data & Cadangan | Unduh cadangan JSON, pulihkan cadangan (opsi mengganti seluruh data), hapus semua data mutasi |

### Peran pengguna
| Peran | Hak akses |
|---|---|
| **Admin** | Seluruh fitur: data, berkas, cetak, impor/ekspor, **pengaturan**, **kelola pengguna**, **log aktivitas** |
| **Operator** | Data mutasi, berkas lampiran, cetak, impor/ekspor. Pengaturan hanya dapat dilihat (tidak dapat diubah) |

---

## Menjalankan Cepat (Docker)

```bash
cd simutasi
docker compose up -d --build
```

Buka **http://localhost:8080**.

Sandi admin pertama dibuat otomatis dan dicetak pada log:

```bash
docker compose logs app | findstr Sandi      # Windows
docker compose logs app | grep Sandi         # Linux/macOS
```

Untuk mengubah sandi: login → menu pengguna (kanan atas) → **Ganti Sandi**.
Untuk menghentikan: `docker compose down`
(ditambah `-v` bila ingin menghapus seluruh data).

> Petunjuk penerapan di server publik (domain, HTTPS, firewall, backup)
> ada di **[DEPLOY.md](DEPLOY.md)**.

---

## Menjalankan Tanpa Docker

Memerlukan Node.js 20 atau lebih baru.

```bash
cd simutasi
npm install
cp .env.example .env        # sesuaikan bila perlu
npm start                   # http://localhost:3000
```

---

## Konfigurasi (.env)

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `DOMAIN` | `:8080` | Alamat situs untuk Caddy. Isi domain (mis. `mutasi.sekolah.sch.id`) agar HTTPS aktif otomatis. |
| `ACME_EMAIL` | `webmaster@localhost` | Surel pendaftaran sertifikat HTTPS. |
| `HTTP_PORT` / `HTTPS_PORT` / `ALT_PORT` | `80` / `443` / `8080` | Port pada server host. |
| `ADMIN_USERNAME` | `admin` | Nama pengguna admin pertama (hanya saat basis data masih kosong). |
| `ADMIN_PASSWORD` | *(kosong)* | Sandi admin pertama. **Kosong = dibuat acak** lalu dicetak di log. |
| `SESSION_HOURS` | `12` | Lama sesi login (jam). |
| `COOKIE_SECURE` | `auto` | `auto` (ikut protokol), `always`, atau `never`. |
| `MAX_UPLOAD_MB` | `15` | Batas ukuran satu berkas lampiran. |
| `SEED_SAMPLE_DATA` | `true` | Memuat 7 data contoh saat basis data masih kosong. |

---

## Penyimpanan Data

Seluruh data berada pada satu volume Docker (`simutasi-data`):

```
/data
├── simutasi.db          basis data SQLite (data mutasi, pengguna, pengaturan, log)
├── simutasi.db-wal      berkas sementara SQLite (mode WAL)
└── files/               berkas lampiran (PDF/JPG/PNG/WEBP)
```

- **Aman saat restart** — data tidak hilang ketika container dijalankan ulang.
- **Hanya** hilang bila volume dihapus (`docker compose down -v`).
- Perhatikan mode WAL: saat menyalin berkas basis data, salin **ketiga** berkas
  `.db`, `.db-wal`, dan `.db-shm` (lihat DEPLOY.md).

### Cadangan
1. **Cadangan penuh (disarankan)** — basis data + seluruh berkas lampiran.
   Perintahnya ada di [DEPLOY.md](DEPLOY.md) bagian *Backup & Restore*.
2. **Cadangan logis cepat** — login sebagai admin → Pengaturan → tab
   **Data & Cadangan** → *Unduh Cadangan (JSON)*. Memuat data mutasi, pengaturan
   sekolah, dan prosedur (tanpa berkas lampiran). Saat memulihkan, tersedia opsi
   **mengosongkan data lama lebih dulu** — berguna ketika pindah server agar
   tidak tercampur dengan data contoh.

---

## Ringkasan API

Semua alamat di bawah `/api` memerlukan login, kecuali yang ditandai publik.

| Metode | Alamat | Keterangan |
|---|---|---|
| `GET` | `/api/health` | Status server (publik) |
| `GET` | `/api/public/site` | Profil sekolah + prosedur mutasi (publik) |
| `POST` | `/api/auth/login` | Masuk (publik) |
| `POST` | `/api/auth/logout` | Keluar |
| `GET` | `/api/auth/me` | Pengguna yang sedang masuk |
| `POST` | `/api/auth/password` | Ganti sandi sendiri |
| `GET/POST` | `/api/records` | Daftar / tambah data mutasi |
| `GET/PUT/DELETE` | `/api/records/:id` | Rincian / ubah / hapus data |
| `POST` | `/api/records/bulk` | Impor massal (maks. 2000 baris) |
| `DELETE` | `/api/records/all` | Hapus semua data (admin) |
| `POST` | `/api/records/:id/attachments` | Unggah berkas lampiran (multipart) |
| `GET` | `/api/attachments` | Daftar seluruh arsip berkas |
| `GET` | `/api/attachments/:id/raw` | Pratinjau/unduh berkas |
| `DELETE` | `/api/attachments/:id` | Hapus berkas |
| `GET/PUT` | `/api/settings` | Baca / simpan pengaturan (PUT: admin) |
| `GET` | `/api/settings/audit` | Log aktivitas |
| `GET/POST` | `/api/users` | Daftar / tambah pengguna (admin) |
| `PUT/DELETE` | `/api/users/:id` | Ubah / hapus pengguna (admin) |

---

## Keamanan

- Sandi disimpan sebagai hash **scrypt** (bukan teks biasa).
- Sesi memakai token acak 256-bit di cookie **HttpOnly + SameSite=Lax**;
  dapat dipaksa `Secure` melalui `COOKIE_SECURE`.
- Pembatasan percobaan login (bawaan 10 kali / 15 menit per alamat IP).
- `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`,
  dan `Referrer-Policy` terpasang; header `X-Powered-By` dimatikan.
- Berkas lampiran diperiksa dari isi (magic bytes), bukan hanya dari nama/tipe
  yang dikirim peramban; hanya PDF/JPG/PNG/WEBP yang diterima.
- Berkas tersimpan di luar folder publik dan hanya dapat diakses setelah login.
- Setiap tindakan penting dicatat pada **log aktivitas**.
- Container berjalan sebagai pengguna **non-root** (`node`).

---

## Struktur Berkas

```
simutasi/
├── server/
│   ├── index.js              titik masuk (Express, header keamanan, rute)
│   ├── config.js             pembacaan konfigurasi .env
│   ├── db.js                 skema SQLite + seluruh kueri
│   ├── auth.js               sandi, sesi, peran, pembatasan login
│   ├── validate.js           validasi data mutasi & pengguna
│   ├── seed.js               pengaturan awal + data contoh
│   └── routes/               auth, public, records, files, settings, users
├── public/                   berkas yang boleh diakses publik
│   ├── index.html            halaman prosedur (landing)
│   ├── login.html            halaman masuk petugas
│   ├── assets/               landing.js/css, login.js, admin.js/css
│   └── vendor/               SheetJS (baca/tulis Excel, offline)
├── views/admin.html          kerangka aplikasi admin (hanya untuk yang login)
├── Dockerfile                image produksi (multi-stage, non-root)
├── docker-compose.yml        aplikasi + Caddy (HTTPS otomatis)
├── Caddyfile                 konfigurasi reverse proxy
├── .env.example              contoh konfigurasi
├── README.md                 berkas ini
├── DEPLOY.md                 panduan penerapan produksi
└── .smoketest/               skrip pengujian (tidak ikut ke dalam image)
```

---

## Pengujian

Tersedia tiga rangkaian uji otomatis (tidak diperlukan untuk menjalankan
aplikasi). Uji API dan uji antarmuka mengubah data, jadi jalankan masing-masing
pada **tumpukan yang baru dibuat**:

```bash
cd simutasi

# ---------- 1) Uji antarmuka dengan jsdom ----------
docker compose down -v && docker compose up -d && sleep 10
docker compose logs app | grep Sandi          # catat sandinya
docker run --rm --network container:simutasi-app \
  -v "$PWD/.smoketest:/test" -w /test \
  -e TEST_ADMIN_USER=admin -e TEST_ADMIN_PASS=<sandi> \
  node:20-alpine sh -c "npm i jsdom@24 --silent && node ui.test.js http://127.0.0.1:3000"

# ---------- 2) Uji API ----------
docker compose down -v && docker compose up -d && sleep 10
docker compose logs app | grep Sandi          # sandi baru
docker run --rm --network container:simutasi-app \
  -v "$PWD/.smoketest:/test:ro" -w /test \
  -e TEST_ADMIN_USER=admin -e TEST_ADMIN_PASS=<sandi> \
  node:20-bookworm-slim node api.test.js http://127.0.0.1:3000

# ---------- 3) Latihan backup & restore (opsional) ----------
docker run --rm --network container:simutasi-app \
  -v "$PWD/.smoketest:/test:ro" -w /test \
  node:20-bookworm-slim node backup-drill.js seed http://127.0.0.1:3000 admin <sandi>
#   ... lakukan pencadangan + pemulihan (DEPLOY.md §5) ...
docker run --rm --network container:simutasi-app \
  -v "$PWD/.smoketest:/test:ro" -w /test \
  node:20-bookworm-slim node backup-drill.js verify http://127.0.0.1:3000 admin <sandi>
```

> Di Windows PowerShell, ganti `$PWD` dengan `${PWD}` dan `grep` dengan `findstr`.

Cakupan: autentikasi & peran, CRUD data, validasi, nomor surat manual, unggah
berkas (termasuk penolakan berkas palsu), impor massal, pengaturan & prosedur
publik, kop surat (gambar unggahan maupun susunan teks, batas 5 baris, dua logo),
kelola pengguna, log aktivitas, batas percobaan login, pemulihan cadangan,
ekspor Excel, serta tampilan halaman publik, login, dashboard, form, dan cetak.

Tersedia pula `buat-db-lama.js` untuk menguji **jalur peningkatan versi**:
skrip itu membuat basis data versi lama (tanpa kolom `nomor_surat`), lalu
aplikasi dijalankan di atasnya untuk memastikan migrasi berjalan dan data lama
tidak hilang.

---

## Data Contoh & Kerahasiaan Data Siswa

Saat basis data masih kosong, aplikasi memuat **7 data contoh yang fiktif**
(nama, NISN berawalan `999`, dan nama orang tua semuanya karangan) sebagai bahan
uji coba. Data contoh itu **bukan data siswa sungguhan**.

- Data siswa yang sebenarnya **tidak disertakan di repositori ini** — tidak ada
  berkas Excel, hasil pindai surat, maupun basis data yang ikut ter-commit
  (lihat berkas `.gitignore`).
- Untuk memakai data sebenarnya: masuk sebagai admin, lalu **Import** berkas
  Excel dari komputer Anda, atau pulihkan cadangan (JSON / volume Docker).
- Menonaktifkan data contoh: set `SEED_SAMPLE_DATA=false` pada `.env`.

Penulisan pada data contoh sengaja dibiarkan tidak baku — misalnya
`Permintaan Orang tua`, kelas `XC`/`X F`, dan NIS yang kosong — agar tampilan
data apa adanya tetap terlihat. Rapikan melalui **Pengaturan → Referensi**.
