'use strict';

const express = require('express');
const store = require('../db');
const seed = require('../seed');
const settingsRoutes = require('./settings');

const router = express.Router();

/** Informasi sekolah & prosedur mutasi yang boleh diakses publik. */
router.get('/site', (req, res) => {
  const p = settingsRoutes.withProfilDefaults(store.settings.get('profil', null));
  const prosedur = store.settings.get('prosedur', seed.DEFAULT_SETTINGS.prosedur);

  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    profil: {
      namaSekolah: p.namaSekolah,
      alamatSekolah: p.alamatSekolah,
      telepon: p.telepon,
      email: p.email,
      website: p.website,
      tahunAjaranAktif: p.tahunAjaranAktif,
      kotaTandaTangan: p.kotaTandaTangan,
      kepsek: p.kepsek,
      logo: p.logo || null
    },
    prosedur
  });
});

module.exports = router;
