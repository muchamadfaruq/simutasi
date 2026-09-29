/* Membuat basis data SIMUTASI versi LAMA (tanpa kolom nomor_surat)
   untuk menguji jalur peningkatan/migrasi. */
const Database = require('better-sqlite3');

const db = new Database('/data/simutasi.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nama TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'operator',
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  id            TEXT PRIMARY KEY,
  jenis         TEXT NOT NULL,
  tanggal       TEXT NOT NULL DEFAULT '',
  nis           TEXT NOT NULL DEFAULT '',
  nisn          TEXT NOT NULL DEFAULT '',
  nama          TEXT NOT NULL,
  jenis_kelamin TEXT NOT NULL DEFAULT '',
  kelas         TEXT NOT NULL DEFAULT '',
  tempat_lahir  TEXT NOT NULL DEFAULT '',
  tanggal_lahir TEXT NOT NULL DEFAULT '',
  nama_ortu     TEXT NOT NULL DEFAULT '',
  asal_sekolah  TEXT NOT NULL DEFAULT '',
  tujuan        TEXT NOT NULL DEFAULT '',
  alasan        TEXT NOT NULL DEFAULT '',
  keterangan    TEXT NOT NULL DEFAULT '',
  tahun_ajaran  TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, record_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0, stored_name TEXT NOT NULL, created_at TEXT NOT NULL, uploaded_by INTEGER
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id INTEGER,
  username TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT);
`);

const now = new Date().toISOString();
db.prepare(`INSERT INTO records (id, jenis, tanggal, nis, nisn, nama, jenis_kelamin, kelas, tempat_lahir,
  tanggal_lahir, nama_ortu, asal_sekolah, tujuan, alasan, keterangan, tahun_ajaran, created_at, updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .run('lama-1', 'masuk', '2026-01-15', '9001', '0123456789', 'Siswa Dari Versi Lama', 'L', 'X A',
    'Badung', '2010-01-01', 'Orang Tua Lama', 'SMA Lama', '', 'Mutasi', 'data sebelum upgrade',
    '2026/2027', now, now);

db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)`)
  .run('profil', JSON.stringify({ namaSekolah: 'SEKOLAH VERSI LAMA', alamatSekolah: 'Alamat Lama' }), now);

const cols = db.prepare('PRAGMA table_info(records)').all().map((c) => c.name);
console.log('basis data versi lama dibuat. kolom nomor_surat ada? ' + (cols.indexOf('nomor_surat') > -1));
console.log('jumlah data: ' + db.prepare('SELECT COUNT(*) n FROM records').get().n);
db.close();
