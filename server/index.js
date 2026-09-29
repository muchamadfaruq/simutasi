'use strict';

const path = require('path');
const express = require('express');

const config = require('./config');
const auth = require('./auth');
const seed = require('./seed');
const store = require('./db');

const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const recordsRoutes = require('./routes/records');
const filesRoutes = require('./routes/files');
const settingsRoutes = require('./routes/settings');
const usersRoutes = require('./routes/users');

// Siapkan pengaturan, akun admin pertama, dan data contoh bila perlu.
seed.run();

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VIEWS_DIR = path.join(__dirname, '..', 'views');

if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

/* --------------------------------------------------------- keamanan dasar */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join('; '));
  next();
});

/* ------------------------------------------------------------- body parse */
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(auth.attachUser);

if (config.env !== 'production' || process.env.LOG_REQUESTS === 'true') {
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      console.log(
        new Date().toISOString() + '  ' + res.statusCode + '  ' +
        req.method + ' ' + req.originalUrl + '  ' + (Date.now() - started) + 'ms' +
        (req.user ? '  [' + req.user.username + ']' : '')
      );
    });
    next();
  });
}

/* ------------------------------------------------------------------ statik */
app.use(express.static(PUBLIC_DIR, {
  index: false,
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(css|js|png|jpe?g|svg|webp|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

/* -------------------------------------------------------------------- api */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'SIMUTASI', time: new Date().toISOString() });
});

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);

// seluruh API di bawah ini wajib login
app.use('/api', auth.requireAuth);
app.use('/api/records', recordsRoutes);
app.use('/api/attachments', filesRoutes.router);
app.use('/api/settings', settingsRoutes.router);
app.use('/api/users', auth.requireRole('admin'), usersRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Alamat API tidak ditemukan.' }));

/* ------------------------------------------------------------------ halaman */
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/login.html', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.get('/admin', auth.requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(VIEWS_DIR, 'admin.html'));
});

app.get('/admin/*', auth.requireAuth, (req, res) => res.redirect('/admin'));

app.use((req, res) => {
  if (auth.isApiRequest(req)) return res.status(404).json({ error: 'Alamat API tidak ditemukan.' });
  res.redirect('/');
});

/* ------------------------------------------------------------ error handler */
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const isApi = auth.isApiRequest(req);
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT')) {
    const message = 'Ukuran berkas melebihi batas ' + config.maxUploadMb + ' MB.';
    return isApi ? res.status(413).json({ error: message }) : res.status(413).send(message);
  }
  if (err && err.type === 'entity.too.large') {
    return isApi ? res.status(413).json({ error: 'Data yang dikirim terlalu besar.' }) : res.status(413).send('Terlalu besar.');
  }
  if (err && err.type === 'entity.parse.failed') {
    return isApi ? res.status(400).json({ error: 'Format data tidak valid.' }) : res.status(400).send('Format tidak valid.');
  }
  console.error('[ERROR]', err && err.stack ? err.stack : err);
  if (isApi) return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  res.status(500).send('Terjadi kesalahan pada server.');
});

const server = app.listen(config.port, () => {
  console.log('[SIMUTASI] berjalan di port ' + config.port + ' (mode ' + config.env + ')');
  console.log('[SIMUTASI] data: ' + config.dataDir);
  const counts = store.records.stats();
  console.log('[SIMUTASI] data mutasi: ' + counts.masuk + ' masuk, ' + counts.keluar + ' keluar');
});

/* Koneksi keep-alive dipertahankan lebih lama daripada milik reverse proxy.
   Tanpa ini, server menutup koneksi diam setelah 5 detik dan permintaan
   berikutnya dari klien yang memakai koneksi itu bisa gagal. */
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 120000;

function shutdown(signal) {
  console.log('\n[SIMUTASI] ' + signal + ' diterima, menutup server...');
  server.close(() => {
    try { store.db.close(); } catch (e) { /* abaikan */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => console.error('[UNHANDLED]', err));

module.exports = app;
