'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const config = require('../config');
const store = require('../db');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 10 }
});

/** Mengenali jenis berkas dari beberapa byte pertama (mencegah berkas palsu). */
function detectMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.slice(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Menyimpan berkas unggahan ke folder data dan mencatatnya di basis data.
 * Mengembalikan daftar berkas tersimpan dan yang ditolak.
 */
function saveUploadedFiles(recordId, files, user) {
  const saved = [];
  const rejected = [];

  (files || []).forEach((file) => {
    const detected = detectMime(file.buffer);
    const declared = String(file.mimetype || '').toLowerCase();
    if (!detected || config.allowedMime.indexOf(detected) === -1) {
      rejected.push({ name: file.originalname, reason: 'Jenis berkas tidak didukung (hanya PDF, JPG, PNG, WEBP).' });
      return;
    }
    if (declared && declared !== detected && !(declared === 'image/jpg' && detected === 'image/jpeg')) {
      rejected.push({ name: file.originalname, reason: 'Isi berkas tidak sesuai dengan jenisnya.' });
      return;
    }

    const id = crypto.randomUUID();
    const storedName = id + path.extname(file.originalname).toLowerCase().slice(0, 8);
    fs.writeFileSync(path.join(config.filesDir, storedName), file.buffer);

    saved.push(store.attachments.insert({
      id,
      recordId,
      name: String(file.originalname || 'berkas').slice(0, 180),
      mime: detected,
      size: file.size,
      storedName,
      uploadedBy: (user && user.id) || null
    }));
  });

  return { saved, rejected };
}

function removeStoredFile(storedName) {
  if (!storedName) return;
  const full = path.join(config.filesDir, path.basename(storedName));
  fs.rm(full, { force: true }, () => {});
}

/** Menghapus semua berkas milik satu data mutasi (dipakai saat data dihapus). */
function removeFilesOfRecord(recordId) {
  store.attachments.listByRecord(recordId).forEach((a) => {
    const row = store.attachments.get(a.id);
    if (row) removeStoredFile(row.stored_name);
  });
}

function contentDisposition(name, inline) {
  const safe = String(name || 'berkas').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return (inline ? 'inline' : 'attachment') + '; filename="' + safe + '"; filename*=UTF-8\'\'' + encodeURIComponent(name || 'berkas');
}

/* ------------------------------------------------------------------ routes */

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let list = store.attachments.listAll();
  if (q) {
    list = list.filter((a) => (
      (a.name + ' ' + a.record.nama + ' ' + a.record.kelas + ' ' + (a.record.asalSekolah || '') + ' ' + (a.record.tujuan || '')).toLowerCase().indexOf(q) > -1
    ));
  }
  res.json({ attachments: list });
});

router.get('/:id/raw', (req, res) => {
  const row = store.attachments.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
  const full = path.join(config.filesDir, path.basename(row.stored_name));
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Berkas sudah tidak ada di penyimpanan.' });

  res.setHeader('Content-Type', row.mime);
  res.setHeader('Content-Length', String(fs.statSync(full).size));
  res.setHeader('Content-Disposition', contentDisposition(row.name, true));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  fs.createReadStream(full).pipe(res);
});

router.get('/:id/download', (req, res) => {
  const row = store.attachments.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
  const full = path.join(config.filesDir, path.basename(row.stored_name));
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Berkas sudah tidak ada di penyimpanan.' });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition(row.name, false));
  fs.createReadStream(full).pipe(res);
});

router.delete('/:id', (req, res) => {
  const row = store.attachments.remove(req.params.id);
  if (!row) return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
  removeStoredFile(row.stored_name);
  store.audit.add({
    user: req.user, action: 'hapus-berkas', entity: 'attachment', entityId: row.id, detail: row.name
  });
  res.json({ ok: true });
});

module.exports = { router, upload, saveUploadedFiles, removeFilesOfRecord, removeStoredFile, detectMime };
