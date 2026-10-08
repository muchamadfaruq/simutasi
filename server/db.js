'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(config.filesDir, { recursive: true });

const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nama          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'operator',
  password_hash TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS records (
  id            TEXT PRIMARY KEY,
  jenis         TEXT NOT NULL,
  tanggal       TEXT NOT NULL DEFAULT '',
  nomor_surat   TEXT NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS idx_records_jenis   ON records(jenis);
CREATE INDEX IF NOT EXISTS idx_records_ta      ON records(tahun_ajaran);
CREATE INDEX IF NOT EXISTS idx_records_nisn    ON records(nisn);
CREATE INDEX IF NOT EXISTS idx_records_tanggal ON records(tanggal);

CREATE TABLE IF NOT EXISTS attachments (
  id          TEXT PRIMARY KEY,
  record_id   TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL DEFAULT 0,
  stored_name TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  uploaded_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attachments_record ON attachments(record_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  user_id   INTEGER,
  username  TEXT,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  detail    TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at DESC);
`);

const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------- migrasi */
/** Menambah kolom baru pada basis data lama tanpa menghapus data. */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (columns.indexOf(column) === -1) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log('[SIMUTASI] migrasi: kolom ' + table + '.' + column + ' ditambahkan');
  }
}

ensureColumn('records', 'nomor_surat', "TEXT NOT NULL DEFAULT ''");

/* ------------------------------------------------------------------ users */

const userCols = 'id, username, nama, role, is_active, created_at, updated_at';

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nama: row.nama,
    role: row.role,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const users = {
  byUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username || ''));
  },
  byId(id) {
    return mapUser(db.prepare(`SELECT ${userCols} FROM users WHERE id = ?`).get(id));
  },
  byIdFull(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  list() {
    return db.prepare(`SELECT ${userCols} FROM users ORDER BY role, username`).all().map(mapUser);
  },
  countActiveAdmins(excludeId) {
    return db.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?"
    ).get(excludeId || 0).n;
  },
  countAll() {
    return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  },
  create({ username, nama, role, passwordHash }) {
    const at = nowIso();
    const info = db.prepare(
      `INSERT INTO users (username, nama, role, password_hash, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).run(username, nama || '', role, passwordHash, at, at);
    return info.lastInsertRowid;
  },
  update(id, fields) {
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!current) return false;
    const next = {
      username: fields.username !== undefined ? fields.username : current.username,
      nama: fields.nama !== undefined ? fields.nama : current.nama,
      role: fields.role !== undefined ? fields.role : current.role,
      is_active: fields.isActive !== undefined ? (fields.isActive ? 1 : 0) : current.is_active,
      password_hash: fields.passwordHash || current.password_hash,
      updated_at: nowIso()
    };
    db.prepare(
      `UPDATE users SET username = ?, nama = ?, role = ?, is_active = ?, password_hash = ?, updated_at = ?
       WHERE id = ?`
    ).run(next.username, next.nama, next.role, next.is_active, next.password_hash, next.updated_at, id);
    return true;
  },
  remove(id) {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
  }
};

/* --------------------------------------------------------------- sessions */

const sessions = {
  create(tokenHash, userId, expiresAtMs) {
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash, userId, nowIso(), new Date(expiresAtMs).toISOString());
  },
  get(tokenHash) {
    const row = db.prepare(
      `SELECT s.token_hash, s.user_id, s.expires_at, u.username, u.nama, u.role, u.is_active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    ).get(tokenHash);
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    if (!row.is_active) return null;
    return {
      tokenHash: row.token_hash,
      user: { id: row.user_id, username: row.username, nama: row.nama, role: row.role, isActive: true }
    };
  },
  remove(tokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  },
  removeByUser(userId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },
  cleanExpired() {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
  }
};

/* ---------------------------------------------------------------- records */

function mapRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    jenis: row.jenis,
    tanggal: row.tanggal,
    nomorSurat: row.nomor_surat || '',
    nis: row.nis,
    nisn: row.nisn,
    nama: row.nama,
    jenisKelamin: row.jenis_kelamin,
    kelas: row.kelas,
    tempatLahir: row.tempat_lahir,
    tanggalLahir: row.tanggal_lahir,
    namaOrtu: row.nama_ortu,
    asalSekolah: row.asal_sekolah,
    tujuan: row.tujuan,
    alasan: row.alasan,
    keterangan: row.keterangan,
    tahunAjaran: row.tahun_ajaran,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lampiran: []
  };
}

const RECORD_FIELDS = {
  id: 'id', jenis: 'jenis', tanggal: 'tanggal', nomorSurat: 'nomor_surat',
  nis: 'nis', nisn: 'nisn', nama: 'nama',
  jenisKelamin: 'jenis_kelamin', kelas: 'kelas', tempatLahir: 'tempat_lahir',
  tanggalLahir: 'tanggal_lahir', namaOrtu: 'nama_ortu', asalSekolah: 'asal_sekolah',
  tujuan: 'tujuan', alasan: 'alasan', keterangan: 'keterangan', tahunAjaran: 'tahun_ajaran'
};

function cleanRecord(input) {
  const out = {};
  Object.keys(RECORD_FIELDS).forEach((key) => {
    let value = input[key];
    if (value === undefined || value === null) value = '';
    out[key] = String(value).trim();
  });
  out.jenis = out.jenis === 'keluar' ? 'keluar' : 'masuk';
  out.jenisKelamin = out.jenisKelamin === 'L' ? 'L' : out.jenisKelamin === 'P' ? 'P' : '';
  out.nis = out.nis.replace(/\D/g, '');
  out.nisn = out.nisn.replace(/\D/g, '');
  return out;
}

const records = {
  list(filters) {
    const f = filters || {};
    const where = [];
    const params = [];
    if (f.jenis) { where.push('jenis = ?'); params.push(f.jenis); }
    if (f.tahunAjaran) { where.push('tahun_ajaran = ?'); params.push(f.tahunAjaran); }
    if (f.kelas) { where.push('kelas = ?'); params.push(f.kelas); }
    if (f.alasan) { where.push('alasan = ?'); params.push(f.alasan); }
    if (f.q) {
      where.push('(nama LIKE ? OR nisn LIKE ? OR nis LIKE ? OR nomor_surat LIKE ? OR kelas LIKE ? OR alasan LIKE ? OR asal_sekolah LIKE ? OR tujuan LIKE ? OR nama_ortu LIKE ?)');
      const like = '%' + f.q + '%';
      for (let i = 0; i < 9; i++) params.push(like);
    }
    const sql = 'SELECT * FROM records' + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY (tanggal = \'\') ASC, tanggal DESC, updated_at DESC';
    return db.prepare(sql).all(...params).map(mapRecord);
  },
  get(id) {
    return mapRecord(db.prepare('SELECT * FROM records WHERE id = ?').get(id));
  },
  exists(id) {
    return !!db.prepare('SELECT 1 FROM records WHERE id = ?').get(id);
  },
  insert(data) {
    const at = nowIso();
    const r = cleanRecord(data);
    if (!r.id) r.id = require('crypto').randomUUID();
    db.prepare(
      `INSERT INTO records (id, jenis, tanggal, nomor_surat, nis, nisn, nama, jenis_kelamin, kelas, tempat_lahir,
         tanggal_lahir, nama_ortu, asal_sekolah, tujuan, alasan, keterangan, tahun_ajaran, created_at, updated_at)
       VALUES (@id, @jenis, @tanggal, @nomorSurat, @nis, @nisn, @nama, @jenisKelamin, @kelas, @tempatLahir,
         @tanggalLahir, @namaOrtu, @asalSekolah, @tujuan, @alasan, @keterangan, @tahunAjaran, @createdAt, @updatedAt)`
    ).run(Object.assign({}, r, {
      createdAt: (typeof data.createdAt === 'string' && data.createdAt) ? data.createdAt : at,
      updatedAt: (typeof data.updatedAt === 'string' && data.updatedAt) ? data.updatedAt : at
    }));
    return this.get(r.id);
  },
  update(id, data) {
    const at = nowIso();
    const r = cleanRecord(data);
    const info = db.prepare(
      `UPDATE records SET jenis=@jenis, tanggal=@tanggal, nomor_surat=@nomorSurat, nis=@nis, nisn=@nisn, nama=@nama,
         jenis_kelamin=@jenisKelamin, kelas=@kelas, tempat_lahir=@tempatLahir, tanggal_lahir=@tanggalLahir,
         nama_ortu=@namaOrtu, asal_sekolah=@asalSekolah, tujuan=@tujuan, alasan=@alasan,
         keterangan=@keterangan, tahun_ajaran=@tahunAjaran, updated_at=@updatedAt
       WHERE id=@id`
    ).run(Object.assign({}, r, { id, updatedAt: at }));
    return info.changes > 0 ? this.get(id) : null;
  },
  remove(id) {
    return db.prepare('DELETE FROM records WHERE id = ?').run(id).changes > 0;
  },
  /** Cari data kembar: NISN sama pada jenis yang sama, atau nama+kelas+jenis sama. */
  findDuplicate(data, excludeId) {
    const r = cleanRecord(data);
    const row = db.prepare(
      `SELECT id, nama FROM records
       WHERE jenis = @jenis AND id <> @exclude
         AND ( (nisn <> '' AND nisn = @nisn)
            OR (LOWER(nama) = LOWER(@nama) AND kelas = @kelas) )
       LIMIT 1`
    ).get({ jenis: r.jenis, nisn: r.nisn, nama: r.nama, kelas: r.kelas, exclude: excludeId || '' });
    return row || null;
  },
  distinct(field) {
    const allowed = ['tahun_ajaran', 'kelas', 'alasan'];
    if (allowed.indexOf(field) === -1) return [];
    const rows = db.prepare(
      `SELECT DISTINCT ${field} AS v FROM records WHERE ${field} <> '' ORDER BY ${field}`
    ).all();
    return rows.map((r) => r.v);
  },
  stats() {
    const total = db.prepare('SELECT jenis, COUNT(*) AS n FROM records GROUP BY jenis').all();
    const out = { masuk: 0, keluar: 0 };
    total.forEach((r) => { out[r.jenis] = r.n; });
    return out;
  }
};

/* ------------------------------------------------------------ attachments */

function mapAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    recordId: row.record_id,
    name: row.name,
    type: row.mime,
    size: row.size,
    createdAt: row.created_at
  };
}

const attachments = {
  listByRecord(recordId) {
    return db.prepare('SELECT * FROM attachments WHERE record_id = ? ORDER BY created_at').all(recordId).map(mapAttachment);
  },
  listAll() {
    return db.prepare(
      `SELECT a.*, r.nama AS record_nama, r.kelas AS record_kelas, r.jenis AS record_jenis,
              r.asal_sekolah, r.tujuan, r.tanggal
       FROM attachments a JOIN records r ON r.id = a.record_id
       ORDER BY r.tanggal DESC, a.created_at`
    ).all().map((row) => Object.assign(mapAttachment(row), {
      record: {
        id: row.record_id, nama: row.record_nama, kelas: row.record_kelas,
        jenis: row.record_jenis, asalSekolah: row.asal_sekolah, tujuan: row.tujuan, tanggal: row.tanggal
      }
    }));
  },
  get(id) {
    return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) || null;
  },
  /** Seluruh baris mentah (snake_case) untuk cadangan lengkap. */
  listAllRaw() {
    return db.prepare('SELECT * FROM attachments ORDER BY created_at').all();
  },
  counts() {
    const rows = db.prepare('SELECT record_id, COUNT(*) AS n FROM attachments GROUP BY record_id').all();
    const map = {};
    rows.forEach((r) => { map[r.record_id] = r.n; });
    return map;
  },
  insert(a) {
    db.prepare(
      `INSERT INTO attachments (id, record_id, name, mime, size, stored_name, created_at, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(a.id, a.recordId, a.name, a.mime, a.size, a.storedName, a.createdAt || nowIso(), a.uploadedBy || null);
    return mapAttachment(this.get(a.id));
  },
  remove(id) {
    const row = this.get(id);
    if (!row) return null;
    db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    return row;
  },
  allStoredNames() {
    return db.prepare('SELECT stored_name FROM attachments').all().map((r) => r.stored_name);
  }
};

/* --------------------------------------------------------------- settings */

const settings = {
  get(key, fallback) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch (e) { return fallback; }
  },
  set(key, value) {
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(value), nowIso());
  }
};

/* ------------------------------------------------------------------ audit */

const audit = {
  add(entry) {
    db.prepare(
      'INSERT INTO audit (at, user_id, username, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(nowIso(), (entry.user && entry.user.id) || null, (entry.user && entry.user.username) || null,
      entry.action, entry.entity || null, entry.entityId || null, entry.detail || null);
  },
  list(limit) {
    return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit || 100);
  },
  clear() {
    db.prepare('DELETE FROM audit').run();
  }
};

module.exports = { db, users, sessions, records, attachments, settings, audit, nowIso };
