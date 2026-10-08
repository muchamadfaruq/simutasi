'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const unzipper = require('unzipper');

const config = require('../config');
const store = require('../db');
const seed = require('../seed');
const { validateRecord } = require('../validate');
const { withProfilDefaults, sanitizeProfil, sanitizeProsedur } = require('./settings');

const router = express.Router();

fs.mkdirSync(config.tmpDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.tmpDir),
    filename: (req, file, cb) => cb(null, 'restore-' + Date.now() + '-' + Math.round(Math.random() * 1e9))
  }),
  limits: { fileSize: config.maxBackupMb * 1024 * 1024, files: 1 }
});

function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Payload cadangan logis: seluruh data mutasi + metadata lampiran. */
function buildBackupPayload() {
  const records = store.records.list().map((r) => ({
    id: r.id,
    jenis: r.jenis, tanggal: r.tanggal, nomorSurat: r.nomorSurat, nis: r.nis, nisn: r.nisn, nama: r.nama,
    jenisKelamin: r.jenisKelamin, kelas: r.kelas, tempatLahir: r.tempatLahir, tanggalLahir: r.tanggalLahir,
    namaOrtu: r.namaOrtu, asalSekolah: r.asalSekolah, tujuan: r.tujuan, alasan: r.alasan,
    keterangan: r.keterangan, tahunAjaran: r.tahunAjaran,
    createdAt: r.createdAt, updatedAt: r.updatedAt
  }));

  const attachments = store.attachments.listAllRaw().map((a) => ({
    id: a.id,
    recordId: a.record_id,
    name: a.name,
    mime: a.mime,
    size: a.size,
    storedName: a.stored_name,
    createdAt: a.created_at
  }));

  return {
    app: 'SIMUTASI',
    version: 3,
    exportedAt: new Date().toISOString(),
    profil: withProfilDefaults(store.settings.get('profil', null)),
    prosedur: store.settings.get('prosedur', seed.DEFAULT_SETTINGS.prosedur),
    records,
    attachments
  };
}

/* --------------------------------------------------------------- unduh ZIP */

router.get('/download', (req, res) => {
  const payload = buildBackupPayload();
  const fname = 'simutasi-cadangan-' + todayIso() + '.zip';

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
  res.setHeader('Cache-Control', 'no-store');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('warning', (err) => {
    if (err && err.code === 'ENOENT') return;
    console.error('[BACKUP] peringatan arsip:', err);
  });
  archive.on('error', (err) => {
    console.error('[BACKUP] gagal membuat arsip:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Gagal membuat berkas cadangan.' });
    else res.end();
  });

  archive.pipe(res);
  archive.append(JSON.stringify(payload, null, 2), { name: 'backup.json' });

  let free = 0;
  store.attachments.listAllRaw().forEach((a) => {
    const base = path.basename(a.stored_name);
    const full = path.join(config.filesDir, base);
    if (base && fs.existsSync(full)) {
      archive.file(full, { name: 'files/' + base });
    } else {
      free += 1;
    }
  });
  archive.finalize();

  store.audit.add({
    user: req.user, action: 'unduh-cadangan', entity: 'backup',
    detail: payload.records.length + ' data, ' + payload.attachments.length + ' lampiran' +
      (free ? ' (' + free + ' berkas tidak ditemukan)' : '')
  });
});

/* ------------------------------------------------------------- pulihkan */

/** Hanya menerima 'backup.json' atau 'files/<nama>' untuk mencegah zip-slip. */
function safeEntry(entryPath) {
  const norm = String(entryPath || '').replace(/\\/g, '/');
  if (norm === 'backup.json') return { kind: 'manifest' };
  if (norm.indexOf('files/') === 0) {
    const base = path.basename(norm);
    if (!base || base === '.' || base === '..') return null;
    return { kind: 'file', name: base };
  }
  return null;
}

/** Membaca isi ZIP: manifest + referensi entri berkas (dibaca sesuai kebutuhan). */
async function readZip(zipPath) {
  const directory = await unzipper.Open.file(zipPath);
  const out = { manifest: null, entries: new Map() };
  for (const entry of directory.files) {
    if (entry.type === 'Directory') continue;
    const target = safeEntry(entry.path);
    if (!target) continue;
    if (target.kind === 'manifest') {
      out.manifest = JSON.parse((await entry.buffer()).toString('utf8'));
    } else if (!out.entries.has(target.name)) {
      out.entries.set(target.name, entry);
    }
  }
  return out;
}

function clearAllData() {
  store.db.prepare('DELETE FROM records').run();
  fs.readdirSync(config.filesDir).forEach((name) => {
    fs.rmSync(path.join(config.filesDir, path.basename(name)), { force: true, recursive: true });
  });
}

async function applyRestore(manifest, entries, replace) {
  const recordsIn = Array.isArray(manifest.records) ? manifest.records : [];
  const attachmentsIn = Array.isArray(manifest.attachments) ? manifest.attachments : [];

  if (replace) clearAllData();

  if (manifest.profil) store.settings.set('profil', sanitizeProfil(manifest.profil));
  if (manifest.prosedur) store.settings.set('prosedur', sanitizeProsedur(manifest.prosedur));

  const idMap = {};
  let addedRecords = 0;
  let skipped = 0;

  recordsIn.forEach((raw) => {
    const payload = Object.assign({}, raw);
    const oldId = String(payload.id || '');
    if (!validateRecord(payload).ok) { skipped += 1; return; }

    const keepId = oldId && !store.records.exists(oldId);
    const newId = keepId ? oldId : crypto.randomUUID();
    const dup = store.records.findDuplicate(payload, newId);
    if (dup) {
      if (oldId) idMap[oldId] = dup.id;
      skipped += 1;
      return;
    }
    payload.id = newId;
    store.records.insert(payload);
    if (oldId) idMap[oldId] = newId;
    addedRecords += 1;
  });

  let addedFiles = 0;
  let missingFiles = 0;
  let orphanFiles = 0;

  for (let a of attachmentsIn) {
    const mappedRecord = idMap[a.recordId] || a.recordId;
    if (!mappedRecord || !store.records.exists(mappedRecord)) { orphanFiles += 1; continue; }

    const storedName = path.basename(String(a.storedName || ''));
    const entry = storedName ? entries.get(storedName) : null;
    if (!entry) { missingFiles += 1; continue; }
    if (store.attachments.get(a.id)) { // id bentrok, buat baru
      a = Object.assign({}, a, { id: crypto.randomUUID() });
    }

    const buf = await entry.buffer();
    fs.writeFileSync(path.join(config.filesDir, storedName), buf);
    store.attachments.insert({
      id: a.id,
      recordId: mappedRecord,
      name: String(a.name || 'berkas').slice(0, 180),
      mime: a.mime,
      size: buf.length,
      storedName,
      createdAt: a.createdAt
    });
    addedFiles += 1;
  }

  return {
    records: addedRecords,
    skipped,
    attachments: addedFiles,
    missingFiles,
    orphanFiles
  };
}

router.post('/restore', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada berkas cadangan yang diunggah.' });
  const replace = ['1', 'true', 'on'].indexOf(String(req.body.replace || '').toLowerCase()) > -1;
  const isZip = /\.zip$/i.test(req.file.originalname) || req.file.mimetype === 'application/zip';

  try {
    let manifest;
    let entries = new Map();
    if (isZip) {
      const parsed = await readZip(req.file.path);
      manifest = parsed.manifest;
      entries = parsed.entries;
    } else {
      manifest = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
    }
    if (!manifest || !Array.isArray(manifest.records)) {
      return res.status(400).json({ error: 'Format berkas cadangan tidak sesuai.' });
    }

    const summary = await applyRestore(manifest, entries, replace);
    store.audit.add({
      user: req.user, action: 'pulihkan-cadangan', entity: 'backup',
      detail: summary.records + ' data, ' + summary.attachments + ' lampiran' + (replace ? ' (ganti total)' : '')
    });
    res.json(summary);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(400).json({ error: 'Format berkas cadangan tidak sesuai.' });
    }
    next(err);
  } finally {
    fs.rm(req.file.path, { force: true }, () => {});
  }
});

module.exports = router;
