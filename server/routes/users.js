'use strict';

const express = require('express');
const auth = require('../auth');
const store = require('../db');
const { validateUser } = require('../validate');

const router = express.Router();

const byId = (id) => store.users.byId(id);

function countOtherActiveAdmins(userId) {
  return store.users.countActiveAdmins(userId);
}

router.get('/', (req, res) => {
  res.json({ users: store.users.list() });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const check = validateUser(body, { isNew: true });
  if (!check.ok) return res.status(400).json({ error: 'Data pengguna belum lengkap.', fields: check.errors });

  const username = String(body.username).trim();
  if (store.users.byUsername(username)) {
    return res.status(409).json({ error: 'Nama pengguna sudah dipakai.', fields: { username: 'Sudah dipakai.' } });
  }

  const id = store.users.create({
    username,
    nama: String(body.nama || '').trim(),
    role: body.role,
    passwordHash: auth.hashPassword(String(body.password))
  });
  store.audit.add({ user: req.user, action: 'tambah-pengguna', entity: 'user', entityId: String(id), detail: username + ' (' + body.role + ')' });
  res.status(201).json({ user: byId(id) });
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = byId(id);
  if (!target) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });

  const body = req.body || {};
  const check = validateUser(Object.assign({}, target, body), { isNew: false });
  if (!check.ok) return res.status(400).json({ error: 'Data pengguna belum lengkap.', fields: check.errors });

  const username = String(body.username === undefined ? target.username : body.username).trim();
  const existing = store.users.byUsername(username);
  if (existing && existing.id !== id) {
    return res.status(409).json({ error: 'Nama pengguna sudah dipakai.', fields: { username: 'Sudah dipakai.' } });
  }

  const nextRole = body.role === undefined ? target.role : body.role;
  const nextActive = body.isActive === undefined ? target.isActive : !!body.isActive;

  if (id === req.user.id && (!nextActive || nextRole !== 'admin')) {
    return res.status(400).json({ error: 'Anda tidak dapat menurunkan atau menonaktifkan akun Anda sendiri.' });
  }
  if (target.role === 'admin' && target.isActive && (nextRole !== 'admin' || !nextActive) && countOtherActiveAdmins(id) === 0) {
    return res.status(400).json({ error: 'Harus ada minimal satu admin yang aktif.' });
  }

  store.users.update(id, {
    username,
    nama: body.nama === undefined ? target.nama : String(body.nama).trim(),
    role: nextRole,
    isActive: nextActive,
    passwordHash: body.password ? auth.hashPassword(String(body.password)) : null
  });

  if (body.password || !nextActive) store.sessions.removeByUser(id);

  store.audit.add({
    user: req.user, action: 'ubah-pengguna', entity: 'user', entityId: String(id),
    detail: username + ' (' + nextRole + (nextActive ? '' : ', nonaktif') + ')' + (body.password ? ' · sandi diubah' : '')
  });
  res.json({ user: byId(id) });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = byId(id);
  if (!target) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });

  if (id === req.user.id) {
    return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri.' });
  }
  if (target.role === 'admin' && target.isActive && countOtherActiveAdmins(id) === 0) {
    return res.status(400).json({ error: 'Harus ada minimal satu admin yang aktif.' });
  }

  store.sessions.removeByUser(id);
  store.users.remove(id);
  store.audit.add({ user: req.user, action: 'hapus-pengguna', entity: 'user', entityId: String(id), detail: target.username });
  res.json({ ok: true });
});

module.exports = router;
