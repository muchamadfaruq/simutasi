'use strict';

const express = require('express');
const store = require('../db');
const seed = require('../seed');

const router = express.Router();

const LIMITS = {
  namaSekolah: 120, alamatSekolah: 240, telepon: 40, email: 120, website: 160,
  kotaTandaTangan: 60, kepsek: 120, pangkatKepsek: 80, nipKepsek: 40, tahunAjaranAktif: 20
};

const MAX_LOGO_CHARS = 800000;      // sekitar 585 KB berkas
const MAX_KOP_IMAGE_CHARS = 4000000; // sekitar 3 MB berkas gambar kop
const MAX_STEPS = 20;
const MAX_DOCS = 25;
const MAX_KOP_LINES = 5;
const KOP_LINE_LEN = 160;

function text(value, max) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, max);
}

/** Beberapa baris teks: satu baris = satu baris pada kop surat. */
function multiline(value, maxLines, maxLen) {
  if (typeof value !== 'string') return '';
  return value.split(/\r?\n/)
    .map((line) => line.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n');
}

function stringList(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  const out = [];
  value.forEach((v) => {
    const s = text(v, maxLen);
    if (s && out.indexOf(s) === -1) out.push(s);
  });
  return out.slice(0, maxItems);
}

function sanitizeProsedur(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  ['masuk', 'keluar'].forEach((jenis) => {
    const bag = src[jenis] && typeof src[jenis] === 'object' ? src[jenis] : {};
    const langkah = Array.isArray(bag.langkah) ? bag.langkah : [];
    out[jenis] = {
      judul: text(bag.judul, 120) || (jenis === 'masuk' ? 'Prosedur Mutasi Masuk' : 'Prosedur Mutasi Keluar'),
      ringkas: text(bag.ringkas, 300),
      langkah: langkah.slice(0, MAX_STEPS).map((step) => ({
        judul: text(step && step.judul, 120),
        isi: text(step && step.isi, 600)
      })).filter((step) => step.judul || step.isi),
      dokumen: stringList(bag.dokumen, MAX_DOCS, 200)
    };
  });
  return out;
}

function sanitizeProfil(input) {
  const src = input && typeof input === 'object' ? input : {};
  const def = seed.DEFAULT_SETTINGS.profil;
  const out = {};
  Object.keys(LIMITS).forEach((key) => { out[key] = text(src[key], LIMITS[key]); });

  if (!out.namaSekolah) out.namaSekolah = def.namaSekolah;
  if (!out.tahunAjaranAktif) out.tahunAjaranAktif = def.tahunAjaranAktif;

  // Baris kop surat diketik manual. Bila dikosongkan sengaja, kop tetap kosong.
  out.kopBarisAtas = src.kopBarisAtas === undefined
    ? def.kopBarisAtas
    : multiline(src.kopBarisAtas, MAX_KOP_LINES, KOP_LINE_LEN);
  out.kopBarisBawah = src.kopBarisBawah === undefined
    ? def.kopBarisBawah
    : multiline(src.kopBarisBawah, MAX_KOP_LINES, KOP_LINE_LEN);

  const imageOrNull = (value) => (
    typeof value === 'string' && value.startsWith('data:image/') && value.length <= MAX_LOGO_CHARS
      ? value
      : null
  );
  out.logo = imageOrNull(src.logo);
  out.logoKanan = imageOrNull(src.logoKanan);

  // Kop surat: gambar unggahan (utama) atau susunan teks
  const kopGambar = (
    typeof src.kopGambar === 'string' && src.kopGambar.startsWith('data:image/') &&
    src.kopGambar.length <= MAX_KOP_IMAGE_CHARS
  ) ? src.kopGambar : null;
  const mintaGambar = String(src.kopMode || '') === 'gambar';
  // Bila gambar diminta tetapi tidak ada/tidak sah, kembali ke mode teks
  // agar surat tetap memiliki kop.
  out.kopMode = (mintaGambar && kopGambar) ? 'gambar' : 'teks';
  out.kopGambar = kopGambar;
  out.kopGaris = src.kopGaris === true || src.kopGaris === 'true' || src.kopGaris === 1;

  const kelas = stringList(src.daftarKelas, 80, 40);
  const alasan = stringList(src.daftarAlasan, 60, 120);
  out.daftarKelas = kelas.length ? kelas : def.daftarKelas;
  out.daftarAlasan = alasan.length ? alasan : def.daftarAlasan;
  return out;
}

/** Menggabungkan pengaturan tersimpan dengan nilai bawaan untuk kunci baru. */
function withProfilDefaults(stored) {
  return Object.assign({}, seed.DEFAULT_SETTINGS.profil, stored || {});
}

router.get('/', (req, res) => {
  res.json({
    profil: withProfilDefaults(store.settings.get('profil', null)),
    prosedur: store.settings.get('prosedur', seed.DEFAULT_SETTINGS.prosedur)
  });
});

router.put('/', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Hanya admin yang dapat mengubah pengaturan.' });
  }
  const body = req.body || {};

  const profil = sanitizeProfil(body.profil);
  const prosedur = sanitizeProsedur(body.prosedur);

  store.settings.set('profil', profil);
  store.settings.set('prosedur', prosedur);
  store.audit.add({ user: req.user, action: 'ubah-pengaturan', entity: 'settings', detail: 'Profil sekolah & prosedur mutasi' });

  res.json({ profil, prosedur });
});

router.get('/audit', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  res.json({ audit: store.audit.list(limit) });
});

module.exports = { router, sanitizeProfil, sanitizeProsedur, withProfilDefaults };
