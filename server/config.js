'use strict';

const path = require('path');

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  dataDir,
  filesDir: path.join(dataDir, 'files'),
  tmpDir: path.join(dataDir, 'tmp'),
  dbFile: process.env.DB_FILE || path.join(dataDir, 'simutasi.db'),

  // Cadangan lengkap (ZIP: data + berkas lampiran)
  maxBackupMb: int(process.env.MAX_BACKUP_MB, 1024),

  // Sesi login
  sessionHours: int(process.env.SESSION_HOURS, 12),
  cookieName: 'simutasi_sid',
  // auto = ikut protokol permintaan (aman di belakang reverse proxy HTTPS)
  cookieSecure: (process.env.COOKIE_SECURE || 'auto').toLowerCase(),

  // Unggahan
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 15),
  allowedMime: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],

  // Data contoh (hanya dipakai saat database masih kosong)
  seedSampleData: bool(process.env.SEED_SAMPLE_DATA, true),

  // Akun pertama
  bootstrapAdmin: {
    username: (process.env.ADMIN_USERNAME || 'admin').trim(),
    password: process.env.ADMIN_PASSWORD || '',
    nama: (process.env.ADMIN_NAME || 'Administrator').trim()
  },

  trustProxy: bool(process.env.TRUST_PROXY, true),

  // Pembatasan percobaan login
  loginMaxAttempts: int(process.env.LOGIN_MAX_ATTEMPTS, 10),
  loginWindowMinutes: int(process.env.LOGIN_WINDOW_MINUTES, 15)
};
