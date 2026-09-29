'use strict';

const express = require('express');
const config = require('../config');
const store = require('../db');
const auth = require('../auth');

const router = express.Router();

function publicUser(user) {
  return { id: user.id, username: user.username, nama: user.nama, role: user.role };
}

router.post('/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!auth.loginAllowed(ip)) {
    return res.status(429).json({
      error: 'Terlalu banyak percobaan masuk. Coba lagi dalam ' + config.loginWindowMinutes + ' menit.'
    });
  }

  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'Nama pengguna dan sandi wajib diisi.' });
  }

  const user = store.users.byUsername(username);
  const ok = user && user.is_active && auth.verifyPassword(password, user.password_hash);
  if (!ok) {
    auth.loginFailed(ip);
    store.audit.add({ action: 'login.gagal', entity: 'user', entityId: username, detail: 'Percobaan masuk gagal' });
    return res.status(401).json({ error: 'Nama pengguna atau sandi salah.' });
  }

  auth.loginSucceeded(ip);
  auth.startSession(res, req, user.id);
  store.audit.add({ user: { id: user.id, username: user.username }, action: 'login', entity: 'user', entityId: String(user.id) });
  return res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  if (req.user) {
    store.audit.add({ user: req.user, action: 'logout', entity: 'user', entityId: String(req.user.id) });
  }
  auth.endSession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Belum masuk.' });
  res.json({ user: publicUser(req.user) });
});

router.post('/password', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Belum masuk.' });

  const current = String((req.body && req.body.currentPassword) || '');
  const next = String((req.body && req.body.newPassword) || '');
  if (next.length < 8) {
    return res.status(400).json({ error: 'Sandi baru minimal 8 karakter.' });
  }

  const row = store.users.byIdFull(req.user.id);
  if (!row || !auth.verifyPassword(current, row.password_hash)) {
    return res.status(400).json({ error: 'Sandi saat ini salah.' });
  }

  store.users.update(req.user.id, { passwordHash: auth.hashPassword(next) });
  // seluruh sesi lain diputus, lalu sesi perangkat ini diperbarui
  store.sessions.removeByUser(req.user.id);
  auth.startSession(res, req, req.user.id);
  store.audit.add({ user: req.user, action: 'ganti-sandi', entity: 'user', entityId: String(req.user.id) });
  res.json({ ok: true });
});

module.exports = router;
