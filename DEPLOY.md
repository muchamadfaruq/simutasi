# DEPLOY.md — Panduan Penerapan Produksi

Panduan menjalankan SIMUTASI di server publik (VPS) dengan Docker,
domain, dan HTTPS otomatis.

---

## 1. Siapkan Server

Kebutuhan minimal untuk satu sekolah:

| Komponen | Saran |
|---|---|
| CPU / RAM | 1 vCPU / 1 GB RAM |
| Disk | 10 GB (bertambah sesuai banyaknya pindaian surat) |
| Sistem operasi | Ubuntu 22.04 / 24.04 LTS |
| Perangkat lunak | Docker Engine + Compose Plugin |

Pasang Docker (Ubuntu):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # lalu keluar-masuk sesi agar berlaku
docker --version && docker compose version
```

**Firewall** — hanya tiga port ini yang perlu dibuka:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp      # HTTP  (wajib untuk perpanjangan sertifikat)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

Port `8080` (ALT_PORT) tidak perlu dibuka bila sudah memakai domain/HTTPS.

---

## 2. Unggah Aplikasi

```bash
# dari komputer Anda
scp -r simutasi/ user@IP-SERVER:~/simutasi

# atau bila memakai Git
ssh user@IP-SERVER
git clone <alamat-repositori> simutasi
```

> Jangan sertakan folder `node_modules`, `data`, dan berkas `.env` saat menyalin.
> Keduanya sudah tercantum pada `.dockerignore`.

---

## 3. Konfigurasi Domain & HTTPS

Arahkan domain ke server melalui DNS (biasanya di panel penyedia domain):

| Tipe | Nama | Nilai |
|---|---|---|
| `A` | `mutasi` (atau `@`) | alamat IP publik server |

Tunggu hingga DNS aktif (uji dengan `nslookup mutasi.sekolah.sch.id`), lalu
sunting `.env` pada server:

```bash
nano .env
```

```ini
DOMAIN=mutasi.sekolah.sch.id
ACME_EMAIL=admin@sekolah.sch.id
ADMIN_USERNAME=admin
ADMIN_PASSWORD=            # biarkan kosong agar dibuat acak (lebih aman)
ADMIN_NAME=Administrator Sekolah
SEED_SAMPLE_DATA=false     # server produksi: mulai tanpa data contoh
```

Catatan:

- Caddy akan meminta sertifikat HTTPS **otomatis** pada saat pertama dijalankan
  dan memperpanjangnya sendiri. Syaratnya: domain sudah mengarah ke server dan
  port 80 serta 443 terbuka.
- Bila **belum punya domain** dan ingin uji coba lewat IP:
  ```ini
  DOMAIN=:8080
  ALT_PORT=8080
  ```
  Akses melalui `http://IP-SERVER:8080`. Perlu diketahui: tanpa HTTPS, sandi
  login terkirim tanpa enkripsi — hanya untuk uji coba, jangan untuk data nyata.

---

## 4. Jalankan

```bash
cd ~/simutasi
docker compose up -d --build
docker compose ps
```

Semua sudah siap. Buka `https://mutasi.sekolah.sch.id`.

### Akun admin pertama

Bila `ADMIN_PASSWORD` dikosongkan, sandi dibuat acak dan dicetak pada log:

```bash
docker compose logs app | grep Sandi
```

Contoh keluaran:

```
   Pengguna : admin
   Sandi    : nCeTrhB7TCEuM7
```

Segera masuk dan ganti sandi melalui menu pengguna (kanan atas) → **Ganti Sandi**,
lalu tambahkan akun operator melalui **Pengaturan → Pengguna**.

Sandi hanya dibuat **satu kali**, yaitu saat basis data masih kosong. Mengubah
`ADMIN_PASSWORD` setelahnya tidak berpengaruh.

---

## 5. Backup & Restore

Seluruh data (basis data + lampiran) ada di dalam volume Docker bernama
**`simutasi-data`**. Nama ini dikunci pada `docker-compose.yml`, jadi perintah
di bawah selalu sama meskipun folder proyek berbeda nama.

> **Penting — jangan memakai tanda pipe (`|`) atau `>` untuk menyimpan cadangan.**
> Contoh perintah seperti `docker compose exec app tar czf - . > backup.tar.gz`
> akan **merusak berkas** pada Windows/PowerShell (keluaran biner diubah menjadi
> teks). Selalu tulis cadangan **di dalam container** seperti contoh berikut.

### 5.1 Membuat cadangan penuh

```bash
cd ~/simutasi
mkdir -p backup

# hentikan aplikasi beberapa detik agar salinan konsisten
docker compose stop app

docker run --rm \
  -v simutasi-data:/data:ro \
  -v "$PWD/backup:/backup" \
  alpine sh -c 'tar czf /backup/simutasi-$(date +%F).tar.gz -C /data .'

docker compose start app
ls -lh backup/
```

Hasilnya, misalnya `backup/simutasi-2026-09-29.tar.gz`, berisi:

```
simutasi.db      basis data
simutasi.db-wal  data sementara SQLite (mode WAL)
simutasi.db-shm
files/           seluruh berkas lampiran
```

> Berkas `-wal` dan `-shm` **wajib** ikut tersalin. Menyalin `simutasi.db` saja
> berisiko kehilangan data yang belum sempat ditulis ke berkas utama.

> **Pengaturan sekolah ikut tercadang.** Kop surat (gambar unggahan), logo, nama
> kepala sekolah, dan prosedur mutasi disimpan di dalam `simutasi.db`, sehingga
> ikut terbawa pada cadangan di atas. Tidak perlu menyalin terpisah.

### 5.2 Cadangan harian otomatis

```bash
crontab -e
```

Tambahkan satu baris (sesuaikan `/home/user/simutasi`):

```cron
0 1 * * * cd /home/user/simutasi && docker compose stop app && docker run --rm -v simutasi-data:/data:ro -v /home/user/simutasi/backup:/backup alpine sh -c 'tar czf /backup/simutasi-$(date +\%F).tar.gz -C /data .' && docker compose start app && find /home/user/simutasi/backup -name 'simutasi-*.tar.gz' -mtime +30 -delete
```

Jalankan pukul 01.00 (aplikasi berhenti beberapa detik), menyimpan 30 hari
terakhir, dan menghapus cadangan yang lebih lama.

### 5.3 Memulihkan

```bash
cd ~/simutasi
docker compose stop app

docker run --rm \
  -v simutasi-data:/data \
  -v "$PWD/backup:/backup" \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/simutasi-2026-09-29.tar.gz -C /data'

docker compose start app
```

Setelah dipulihkan, seluruh isi kembali seperti saat dicadangkan — termasuk
data mutasi, pengaturan sekolah, akun pengguna, dan **berkas lampiran**.
Sandi admin yang berlaku adalah sandi **pada saat cadangan dibuat**, bukan yang
tertulis di `.env`.

### 5.4 Memastikan cadangan benar-benar dapat dipulihkan

Lakukan sekali saat pertama kali menyiapkan server, lalu ulangi setiap beberapa
bulan. Ringkasnya:

```bash
# 1) periksa isi cadangan (harus muncul simutasi.db + files/)
docker run --rm -v "$PWD/backup:/b:ro" alpine tar tzf /b/simutasi-2026-09-29.tar.gz

# 2) hitung data sebelum dipulihkan
docker compose exec app node -e "const s=require('/app/server/db');console.log('data:',s.db.prepare('SELECT COUNT(*) n FROM records').get().n)"

# 3) pulihkan (bagian 5.3), lalu ulangi langkah 2 dan bandingkan hasilnya.
```

Bila Anda menyalin folder `.smoketest` ke server, tersedia latihan otomatis
yang membuat data uji beserta lampiran lalu memeriksa keutuhannya:

```bash
docker run --rm --network container:simutasi-app \
  -v "$PWD/.smoketest:/test:ro" -w /test node:20-bookworm-slim \
  node backup-drill.js seed http://127.0.0.1:3000 admin '<sandi-admin>'
# ... lakukan pencadangan dan pemulihan ...
docker run --rm --network container:simutasi-app \
  -v "$PWD/.smoketest:/test:ro" -w /test node:20-bookworm-slim \
  node backup-drill.js verify http://127.0.0.1:3000 admin '<sandi-admin>'
```

### 5.5 Cadangan lengkap dari dalam aplikasi (ZIP)

Login sebagai admin → **Pengaturan → Data & Cadangan → Unduh Cadangan Lengkap
(ZIP)**. Menghasilkan satu berkas `simutasi-cadangan-YYYY-MM-DD.zip` yang berisi:

```
backup.json      data mutasi + pengaturan sekolah + prosedur
files/           seluruh berkas lampiran/surat yang diunggah
```

Cocok untuk memindahkan seluruh arsip antar sekolah/server tanpa akses terminal.
Pulihkan melalui **Pulihkan Cadangan** (unggah berkas `.zip`):

- Centang **"Kosongkan data mutasi yang ada sebelum memulihkan"** untuk
  mengganti seluruh data **dan berkas** dengan isi cadangan (disarankan saat
  pindah server agar tidak tercampur).
- Tanpa centang, data/berkas hanya ditambahkan dan baris yang sama dilewati.

Berkas `.json` cadangan versi lama tetap dapat dipulihkan, tetapi hanya memuat
data (tanpa berkas lampiran). Batas ukuran unggahan cadangan diatur oleh
`MAX_BACKUP_MB` (bawaan 1024 MB).

---

## 6. Memperbarui Aplikasi

```bash
cd ~/simutasi
docker compose exec -T app sh -c 'cd /data && tar czf - .' > backup/sebelum-update-$(date +%F).tar.gz
git pull                       # bila memakai Git, atau salin berkas baru
docker compose up -d --build
docker compose ps
```

Data pada volume tidak terpengaruh proses pembaruan.

> **Peningkatan versi basis data berjalan otomatis.** Saat aplikasi versi baru
> dijalankan di atas basis data lama, kolom/tabel yang baru ditambahkan sendiri
> pada saat mulai (tercatat pada log sebagai `migrasi: ...`). Data yang sudah ada
> tidak dihapus. Tetap buat cadangan (§5.1) sebelum memperbarui.

Cek hasilnya:

```bash
docker compose logs app | grep -i migrasi
docker compose exec app node -e "const s=require('/app/server/db');console.log('data:',s.db.prepare('SELECT COUNT(*) n FROM records').get().n)"
```

---

## 7. Pemantauan & Perawatan

```bash
docker compose ps                      # status container
docker compose logs -f app             # log aplikasi
docker compose logs -f caddy           # log HTTPS / akses
docker stats                           # pemakaian CPU & RAM
```

Pemeriksaan kesehatan otomatis: `http://<alamat>/api/health` → `{"ok":true}`.

### Membebaskan ruang disk

Berkas lampiran ikut terhapus saat data mutasi dihapus. Untuk memeriksa pemakaian:

```bash
docker system df
du -sh ~/simutasi/backup
```

---

## 8. Daftar Periksa Keamanan

- [ ] `ADMIN_PASSWORD` **tidak** diisi nilai yang mudah ditebak; lebih baik dikosongkan agar acak
- [ ] Sandi admin sudah diganti melalui aplikasi setelah login pertama
- [ ] Setiap petugas memiliki akun sendiri (jangan berbagi akun)
- [ ] Operator tidak diberi peran admin
- [ ] Bila belum memakai HTTPS: jangan masukkan data siswa yang sebenarnya
- [ ] Port 8080 tidak dibuka ke internet bila sudah memakai domain
- [ ] Backup harian berjalan dan pernah **diuji dipulihkan**
- [ ] `SEED_SAMPLE_DATA=false` pada server produksi (bila tidak ingin data contoh)
- [ ] Akses SSH memakai kunci (bukan sandi) dan `sudo ufw status` menunjukkan hanya port yang diperlukan
- [ ] Periksa **Log Aktivitas** secara berkala untuk hal yang tidak wajar

---

## 9. Mengatasi Masalah

| Gejala | Penyebab & solusi |
|---|---|
| `Error: adapting config using caddyfile` | `Caddyfile` tidak valid — pastikan `DOMAIN` pada `.env` tidak kosong (nilai cadangan `:8080` otomatis dipakai). |
| Situs tidak dapat dibuka, container caddy restart terus | Periksa `docker compose logs caddy`. Umumnya DNS belum mengarah ke server, atau port 80/443 tertutup. |
| Sertifikat HTTPS gagal dibuat | Domain harus sudah mengarah ke IP server **dan** port 80 terbuka. Tunggu propagasi DNS, lalu `docker compose restart caddy`. |
| Lupa sandi admin | Lihat *Reset Akun Admin* di bawah. |
| Login berhasil tetapi selalu kembali ke halaman masuk | Cookie tidak tersimpan. Pastikan membuka lewat HTTPS bila `COOKIE_SECURE=always`, atau lewat satu alamat saja (jangan bergantian IP/domain). |
| `Penyimpanan berkas...` / unggahan gagal | Ukuran berkas melebihi `MAX_UPLOAD_MB`, atau jenis berkas bukan PDF/JPG/PNG/WEBP. |
| Berkas tidak dapat dibuka | Berkas mungkin terhapus dari volume; pulihkan dari backup. |
| Data hilang setelah `docker compose down` | Data terhapus bila memakai opsi `-v`. Jangan memakai `-v` kecuali memang ingin menghapus semuanya. |

### Reset Akun Admin

Bila sandi admin benar-benar hilang, tambahkan akun admin baru melalui basis data:

```bash
cd ~/simutasi

# 1) buat hash sandi baru memakai kode aplikasi
docker compose exec -T app node -e "
const a=require('/app/server/auth');
console.log(a.hashPassword(process.argv[1]));
" 'SandiBaruSaya2026'
#    -> salin keluaran (diawali 'scrypt$...')

# 2) tulis ke basis data (ganti NAMA_BARU dan HASH)
docker compose exec -T app node -e "
const store=require('/app/server/db');
const lupa=store.users.byUsername(process.argv[1]);
const id=lupa ? lupa.id : store.users.create({username:process.argv[1],nama:'Administrator',role:'admin',passwordHash:process.argv[2]});
if (lupa) store.users.update(id,{passwordHash:process.argv[2],role:'admin',isActive:true});
store.sessions.removeByUser(id);
console.log('Akun admin siap:', process.argv[1]);
" NAMA_BARU 'HASH_DARI_LANGKAH_1'
```

---

## 10. Pemindahan ke Server Lain

1. Di server lama: buat cadangan penuh (§5.1) dan salin berkas `backup/*.tar.gz`
   ke komputer/server baru.
2. Siapkan Docker pada server baru, salin folder aplikasi beserta `.env`
   (sesuaikan `DOMAIN` bila berubah).
3. `docker compose up -d --build` — biarkan sekali agar volume `simutasi-data`
   terbentuk, lalu `docker compose stop app`.
4. Pulihkan cadangan dengan perintah pada §5.3.
5. `docker compose start app`, lalu uji login dan beberapa data.

> Sandi admin yang berlaku setelah pemulihan adalah sandi dari server lama.
> Bila lupa, ikuti *Reset Akun Admin* pada §9.

**Alternatif tanpa akses terminal:** gunakan cadangan ZIP dari dalam aplikasi
(§5.5) — login di server baru, lalu **Pengaturan → Data & Cadangan → Pulihkan
Cadangan** dengan berkas `.zip` dan opsi *"Kosongkan data mutasi yang ada"*
tetap dicentang. Cara ini ikut memindahkan seluruh berkas surat pindai.
