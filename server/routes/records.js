'use strict';

const crypto = require('crypto');
const express = require('express');

const store = require('../db');
const files = require('./files');
const { validateRecord } = require('../validate');

const router = express.Router();

/** Melampirkan daftar berkas ke setiap data mutasi. */
function withAttachments(list) {
  const counts = store.attachments.counts();
  return list.map((r) => Object.assign({}, r, {
    jumlahLampiran: counts[r.id] || 0,
    lampiran: store.attachments.listByRecord(r.id)
  }));
}

router.get('/', (req, res) => {
  const list = store.records.list({
    jenis: req.query.jenis,
    tahunAjaran: req.query.ta,
    kelas: req.query.kelas,
    alasan: req.query.alasan,
    q: String(req.query.q || '').trim()
  });
  res.json({
    records: withAttachments(list),
    referensi: {
      tahunAjaran: store.records.distinct('tahun_ajaran'),
      kelas: store.records.distinct('kelas'),
      alasan: store.records.distinct('alasan')
    }
  });
});

router.get('/:id', (req, res) => {
  const rec = store.records.get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  res.json({ record: withAttachments([rec])[0] });
});

router.post('/', (req, res) => {
  const payload = Object.assign({}, req.body);
  payload.jenis = payload.jenis === 'keluar' ? 'keluar' : 'masuk';

  const check = validateRecord(payload);
  if (!check.ok) return res.status(400).json({ error: 'Data belum lengkap.', fields: check.errors });

  const dup = store.records.findDuplicate(payload, null);
  if (dup) {
    return res.status(409).json({ error: 'Data serupa sudah ada: ' + dup.nama + '.' });
  }

  const rec = store.records.insert(Object.assign({}, payload, { id: crypto.randomUUID() }));
  store.audit.add({
    user: req.user, action: 'tambah-data', entity: 'record', entityId: rec.id,
    detail: rec.jenis + ' · ' + rec.nama
  });
  res.status(201).json({ record: withAttachments([rec])[0] });
});

router.put('/:id', (req, res) => {
  const current = store.records.get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Data tidak ditemukan.' });

  const payload = Object.assign({}, req.body, { id: req.params.id });
  payload.jenis = payload.jenis === 'keluar' ? 'keluar' : current.jenis;

  const check = validateRecord(payload);
  if (!check.ok) return res.status(400).json({ error: 'Data belum lengkap.', fields: check.errors });

  const dup = store.records.findDuplicate(payload, req.params.id);
  if (dup) return res.status(409).json({ error: 'Data serupa sudah ada: ' + dup.nama + '.' });

  const rec = store.records.update(req.params.id, payload);
  store.audit.add({
    user: req.user, action: 'ubah-data', entity: 'record', entityId: rec.id,
    detail: rec.jenis + ' · ' + rec.nama
  });
  res.json({ record: withAttachments([rec])[0] });
});

/* Menghapus seluruh data mutasi (khusus admin). Didaftarkan sebelum /:id. */
router.delete('/all', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Hanya admin yang dapat menghapus seluruh data.' });
  }
  const list = store.records.list();
  list.forEach((r) => files.removeFilesOfRecord(r.id));
  const info = store.db.prepare('DELETE FROM records').run();
  store.audit.add({
    user: req.user, action: 'hapus-semua-data', entity: 'record',
    detail: info.changes + ' data mutasi dihapus'
  });
  res.json({ ok: true, deleted: info.changes });
});

router.delete('/:id', (req, res) => {
  const rec = store.records.get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Data tidak ditemukan.' });

  files.removeFilesOfRecord(rec.id);
  store.records.remove(rec.id);
  store.audit.add({
    user: req.user, action: 'hapus-data', entity: 'record', entityId: rec.id,
    detail: rec.jenis + ' · ' + rec.nama
  });
  res.json({ ok: true });
});

/* ----------------------------------------------------- lampiran per data */

router.get('/:id/attachments', (req, res) => {
  if (!store.records.exists(req.params.id)) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  res.json({ attachments: store.attachments.listByRecord(req.params.id) });
});

router.post('/:id/attachments', files.upload.array('files', 10), (req, res) => {
  const rec = store.records.get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Tidak ada berkas yang diunggah.' });

  const result = files.saveUploadedFiles(rec.id, req.files, req.user);
  if (result.saved.length === 0) {
    return res.status(400).json({
      error: 'Berkas ditolak: ' + result.rejected.map((r) => r.name + ' (' + r.reason + ')').join('; '),
      rejected: result.rejected
    });
  }
  store.audit.add({
    user: req.user, action: 'unggah-berkas', entity: 'record', entityId: rec.id,
    detail: result.saved.map((f) => f.name).join(', ')
  });
  res.status(201).json({
    attachments: store.attachments.listByRecord(rec.id),
    rejected: result.rejected
  });
});

/* --------------------------------------------------------- impor massal */

router.post('/bulk', (req, res) => {
  const incoming = Array.isArray(req.body && req.body.records) ? req.body.records : null;
  if (!incoming) return res.status(400).json({ error: 'Format impor tidak sesuai.' });
  if (incoming.length > 2000) return res.status(413).json({ error: 'Maksimal 2000 baris sekali impor.' });

  const added = [];
  const skipped = [];
  const invalid = [];

  incoming.forEach((raw, index) => {
    const payload = Object.assign({}, raw);
    payload.jenis = payload.jenis === 'keluar' ? 'keluar' : 'masuk';
    const check = validateRecord(payload);
    if (!check.ok) {
      invalid.push({ baris: index + 1, nama: String(payload.nama || ''), errors: check.errors });
      return;
    }
    const dup = store.records.findDuplicate(payload, null);
    if (dup) {
      skipped.push({ baris: index + 1, nama: payload.nama, alasan: 'sudah ada' });
      return;
    }
    added.push(store.records.insert(Object.assign({}, payload, { id: crypto.randomUUID() })));
  });

  if (added.length) {
    store.audit.add({
      user: req.user, action: 'impor-data', entity: 'record',
      detail: added.length + ' data ditambahkan, ' + skipped.length + ' dilewati, ' + invalid.length + ' tidak valid'
    });
  }

  res.json({
    added: added.length,
    skipped: skipped.length,
    invalid: invalid.length,
    details: { skipped, invalid }
  });
});

module.exports = router;
