/* Uji API SIMUTASI - dijalankan di dalam container aplikasi.
   Pemakaian: node api.test.js [baseUrl]                                  */

const BASE = process.argv[2] || 'http://127.0.0.1:3000';

let pass = 0;
const failures = [];
let step = '';

function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else {
    console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : ''));
    failures.push(step + ' / ' + name);
  }
}
function section(title) { step = title; console.log('\n--- ' + title + ' ---'); }

/* --- sesi sederhana dengan cookie jar --- */
function makeSession() {
  const jar = {};
  return {
    jar,
    cookie() {
      return Object.keys(jar).map((k) => k + '=' + jar[k]).join('; ');
    },
    store(res) {
      const list = typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
      list.forEach((line) => {
        const pair = String(line).split(';')[0];
        const i = pair.indexOf('=');
        if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
      });
    },
    async req(method, path, body, isForm) {
      const headers = { Accept: 'application/json' };
      const cookie = this.cookie();
      if (cookie) headers.Cookie = cookie;
      let payload;
      if (isForm) payload = body;
      else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
      const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
      this.store(res);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { /* bukan json */ }
      return { status: res.status, json, text, headers: res.headers, res };
    },
    get(p) { return this.req('GET', p); },
    post(p, b) { return this.req('POST', p, b); },
    put(p, b) { return this.req('PUT', p, b); },
    del(p) { return this.req('DELETE', p); }
  };
}

(async () => {
  const admin = makeSession();
  const operator = makeSession();
  const anon = makeSession();

  /* ---------------------------------------------------- kesehatan */
  section('Kesehatan & halaman publik');
  const health = await anon.get('/api/health');
  check('GET /api/health mengembalikan ok', health.status === 200 && health.json.ok === true, health.status);

  const site = await anon.get('/api/public/site');
  check('GET /api/public/site tanpa login berhasil', site.status === 200, site.status);
  check('profil sekolah terisi', !!(site.json && site.json.profil && site.json.profil.namaSekolah), JSON.stringify(site.json && site.json.profil));
  check('prosedur masuk punya >= 5 langkah', site.json.prosedur.masuk.langkah.length >= 5, site.json.prosedur.masuk.langkah.length);
  check('prosedur keluar punya >= 5 langkah', site.json.prosedur.keluar.langkah.length >= 5, site.json.prosedur.keluar.langkah.length);
  check('prosedur masuk punya daftar dokumen', site.json.prosedur.masuk.dokumen.length >= 4, site.json.prosedur.masuk.dokumen.length);
  check('respons publik hanya memuat profil & prosedur',
    Object.keys(site.json).sort().join(',') === 'profil,prosedur', Object.keys(site.json).join(','));
  check('tidak ada angka NISN pada respons publik', !/\b\d{10}\b/.test(site.text));

  const indexHtml = await fetch(BASE + '/');
  const indexText = await indexHtml.text();
  check('halaman utama dapat diakses publik', indexHtml.status === 200 && /Layanan Mutasi Siswa/.test(indexText), indexHtml.status);
  check('halaman utama memuat tautan login', /\/login\.html/.test(indexText));

  const loginPage = await fetch(BASE + '/login.html');
  check('halaman login dapat diakses', loginPage.status === 200 && /Login Admin/.test(await loginPage.text()), loginPage.status);

  const adminPageAnon = await fetch(BASE + '/admin', { redirect: 'manual' });
  check('halaman admin dialihkan saat belum login', adminPageAnon.status === 302 || adminPageAnon.status === 303, adminPageAnon.status);
  check('pengalihan menuju halaman login', /login/.test(adminPageAnon.headers.get('location') || ''), adminPageAnon.headers.get('location'));

  /* ---------------------------------------------------- keamanan */
  section('Keamanan & header');
  check('CSP terpasang', /default-src 'self'/.test(health.headers.get('content-security-policy') || ''), health.headers.get('content-security-policy'));
  check('X-Content-Type-Options: nosniff', health.headers.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options terpasang', !!health.headers.get('x-frame-options'));
  check('header X-Powered-By tidak bocor', !health.headers.get('x-powered-by'));

  const apiAnon = await anon.get('/api/records');
  check('API data ditolak tanpa login (401)', apiAnon.status === 401, apiAnon.status);
  const usersAnon = await anon.get('/api/users');
  check('API pengguna ditolak tanpa login', usersAnon.status === 401, usersAnon.status);

  /* ---------------------------------------------------- login */
  section('Login');
  const badLogin = await anon.post('/api/auth/login', { username: 'admin', password: 'salah-sekali' });
  check('sandi salah ditolak (401)', badLogin.status === 401, badLogin.status);
  check('pesan kesalahan tidak membocorkan detail', /salah/i.test(badLogin.json.error || ''), badLogin.json.error);

  const username = process.env.TEST_ADMIN_USER || 'admin';
  const password = process.env.TEST_ADMIN_PASS;
  const login = await admin.post('/api/auth/login', { username, password });
  check('login admin berhasil', login.status === 200, login.status + ' ' + login.text.slice(0, 120));
  check('cookie sesi dikirim', /simutasi_sid=/.test(admin.cookie()), admin.cookie());
  check('peran admin benar', login.json.user.role === 'admin', JSON.stringify(login.json.user));
  check('sandi tidak dikembalikan', !/password/i.test(login.text));

  const me = await admin.get('/api/auth/me');
  check('GET /api/auth/me mengembalikan pengguna', me.status === 200 && me.json.user.username === username);

  /* ---------------------------------------------------- data */
  section('Data mutasi');
  const list = await admin.get('/api/records');
  check('daftar data terisi (7 contoh)', list.json.records.length === 7, list.json.records.length);
  check('referensi tahun ajaran tersedia', list.json.referensi.tahunAjaran.indexOf('2026/2027') > -1, JSON.stringify(list.json.referensi.tahunAjaran));
  check('data membawa daftar lampiran', Array.isArray(list.json.records[0].lampiran));
  check('data contoh punya NISN 10 digit', /^\d{10}$/.test(list.json.records[0].nisn));

  // data siswa tidak boleh muncul di halaman publik (diuji dengan data sungguhan)
  const publik = await anon.get('/api/public/site');
  const bocorNama = list.json.records.filter((r) => publik.text.indexOf(r.nama) > -1).map((r) => r.nama);
  const bocorNisn = list.json.records.filter((r) => r.nisn && publik.text.indexOf(r.nisn) > -1).map((r) => r.nisn);
  const bocorOrtu = list.json.records.filter((r) => r.namaOrtu && publik.text.indexOf(r.namaOrtu) > -1).length;
  check('nama siswa tidak bocor ke halaman publik', bocorNama.length === 0, bocorNama.join(', '));
  check('NISN siswa tidak bocor ke halaman publik', bocorNisn.length === 0, bocorNisn.join(', '));
  check('nama orang tua tidak bocor ke halaman publik', bocorOrtu === 0, String(bocorOrtu));

  const filtered = await admin.get('/api/records?jenis=masuk');
  check('filter jenis=masuk bekerja', filtered.json.records.every((r) => r.jenis === 'masuk'), filtered.json.records.length);

  const searched = await admin.get('/api/records?q=Sri%20Wahyuni');
  check('pencarian bekerja', searched.json.records.length === 1, searched.json.records.length);

  const invalid = await admin.post('/api/records', {
    jenis: 'masuk', nama: 'Uji Tidak Valid', jenisKelamin: 'L', nisn: '123', kelas: 'X A',
    asalSekolah: 'SMA Negeri 1 Uji', alasan: 'Mutasi', tanggal: '2026-05-01', tahunAjaran: '2026/2027'
  });
  check('NISN tidak valid ditolak (400)', invalid.status === 400, invalid.status);
  check('kesalahan menunjuk kolom nisn', !!(invalid.json.fields && invalid.json.fields.nisn), JSON.stringify(invalid.json.fields));

  const missingField = await admin.post('/api/records', {
    jenis: 'keluar', nama: 'Tanpa Tujuan', jenisKelamin: 'P', nisn: '0987654321', kelas: 'X B',
    alasan: 'Mutasi', tanggal: '2026-05-02', tahunAjaran: '2026/2027'
  });
  check('sekolah tujuan wajib untuk mutasi keluar', missingField.status === 400 && !!(missingField.json.fields || {}).tujuan,
    JSON.stringify(missingField.json.fields));

  const created = await admin.post('/api/records', {
    jenis: 'masuk', nama: 'Siswa Uji Otomatis', jenisKelamin: 'L', nisn: '0111222333', nis: '9700',
    kelas: 'X A', tempatLahir: 'Badung', tanggalLahir: '2010-01-05', namaOrtu: 'Bapak Uji',
    asalSekolah: 'SMA Negeri 1 Uji', alasan: 'Mutasi', tanggal: '2026-05-03',
    nomorSurat: '421.3/123/SMAN2MGW/2026',
    tahunAjaran: '2026/2027', keterangan: 'dibuat oleh uji otomatis'
  });
  check('data baru dibuat (201)', created.status === 201, created.status + ' ' + created.text.slice(0, 140));
  const newId = created.json.record.id;
  check('data baru tersimpan benar', created.json.record.nama === 'Siswa Uji Otomatis' && created.json.record.nisn === '0111222333');
  check('NISN dipangkas jadi angka saja', created.json.record.nis === '9700');
  check('nomor surat tersimpan apa adanya', created.json.record.nomorSurat === '421.3/123/SMAN2MGW/2026',
    created.json.record.nomorSurat);

  const byNomor = await admin.get('/api/records?q=' + encodeURIComponent('421.3/123'));
  check('pencarian menemukan data lewat nomor surat', byNomor.json.records.length === 1, byNomor.json.records.length);

  const longNomor = await admin.post('/api/records', {
    jenis: 'masuk', nama: 'Nomor Terlalu Panjang', jenisKelamin: 'L', nisn: '0111222444', kelas: 'X A',
    asalSekolah: 'SMA Uji', alasan: 'Mutasi', tanggal: '2026-05-07',
    nomorSurat: 'X'.repeat(120), tahunAjaran: '2026/2027'
  });
  check('nomor surat berlebihan ditolak', longNomor.status === 400 && !!(longNomor.json.fields || {}).nomorSurat,
    longNomor.status + ' ' + JSON.stringify(longNomor.json.fields));

  const dup = await admin.post('/api/records', {
    jenis: 'masuk', nama: 'Duplikat NISN', jenisKelamin: 'P', nisn: '0111222333', kelas: 'X B',
    asalSekolah: 'SMA Negeri 2 Uji', alasan: 'Mutasi', tanggal: '2026-05-04', tahunAjaran: '2026/2027'
  });
  check('NISN ganda pada jenis sama ditolak (409)', dup.status === 409, dup.status);

  const sameNisnOtherJenis = await admin.post('/api/records', {
    jenis: 'keluar', nama: 'Siswa Uji Otomatis', jenisKelamin: 'L', nisn: '0111222333', kelas: 'X A',
    tujuan: 'SMA Negeri 3 Uji', alasan: 'Melanjutkan Sekolah', tanggal: '2027-01-10', tahunAjaran: '2026/2027'
  });
  check('NISN sama boleh ada di jenis berbeda (riwayat masuk lalu keluar)', sameNisnOtherJenis.status === 201, sameNisnOtherJenis.status);
  const keluarId = sameNisnOtherJenis.json.record.id;

  const updated = await admin.put('/api/records/' + newId, Object.assign({}, created.json.record, { kelas: 'X B', keterangan: 'diubah' }));
  check('data dapat diubah', updated.status === 200 && updated.json.record.kelas === 'X B', JSON.stringify(updated.json.record && updated.json.record.kelas));
  check('waktu perubahan diperbarui', updated.json.record.updatedAt !== updated.json.record.createdAt);

  /* ---------------------------------------------------- lampiran */
  section('Lampiran berkas');
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xc3, 0xa4, 0xc3, 0xbc]);
  const fd = new FormData();
  fd.append('files', new Blob([pdfBytes], { type: 'application/pdf' }), 'surat-pindah.pdf');
  const upload = await admin.req('POST', '/api/records/' + newId + '/attachments', fd, true);
  check('unggah berkas PDF berhasil (201)', upload.status === 201, upload.status + ' ' + upload.text.slice(0, 140));
  check('lampiran tercatat pada data', upload.json.attachments.length === 1, (upload.json.attachments || []).length);
  const attId = upload.json.attachments[0].id;
  check('ukuran berkas tercatat', upload.json.attachments[0].size === pdfBytes.length);

  const fdBad = new FormData();
  fdBad.append('files', new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])], { type: 'application/pdf' }), 'palsu.pdf');
  const uploadBad = await admin.req('POST', '/api/records/' + newId + '/attachments', fdBad, true);
  check('berkas palsu (bukan PDF) ditolak', uploadBad.status === 400, uploadBad.status);

  const fdTxt = new FormData();
  fdTxt.append('files', new Blob([new Uint8Array([0x68, 0x69])], { type: 'text/plain' }), 'catatan.txt');
  const uploadTxt = await admin.req('POST', '/api/records/' + newId + '/attachments', fdTxt, true);
  check('jenis berkas tidak didukung ditolak', uploadTxt.status === 400, uploadTxt.status);

  const raw = await fetch(BASE + '/api/attachments/' + attId + '/raw', { headers: { Cookie: admin.cookie() } });
  const rawBuf = new Uint8Array(await raw.arrayBuffer());
  check('berkas dapat diunduh kembali', raw.status === 200, raw.status);
  check('jenis konten sesuai', raw.headers.get('content-type') === 'application/pdf', raw.headers.get('content-type'));
  check('isi berkas utuh', rawBuf.length === pdfBytes.length && rawBuf[0] === 0x25 && rawBuf[5] === 0x31,
    'panjang=' + rawBuf.length + ' byte4=' + rawBuf[5]);
  check('content-disposition memuat nama berkas', /surat-pindah\.pdf/.test(raw.headers.get('content-disposition') || ''), raw.headers.get('content-disposition'));

  const rawAnon = await fetch(BASE + '/api/attachments/' + attId + '/raw', { redirect: 'manual' });
  check('berkas tidak dapat diakses tanpa login', rawAnon.status === 401, rawAnon.status);

  const allAtt = await admin.get('/api/attachments');
  check('daftar arsip memuat berkas', allAtt.json.attachments.some((a) => a.id === attId));
  check('arsip memuat info pemilik', allAtt.json.attachments[0].record && !!allAtt.json.attachments[0].record.nama);

  /* ---------------------------------------------------- impor massal */
  section('Impor massal');
  const bulk = await admin.post('/api/records/bulk', {
    records: [
      { jenis: 'masuk', nama: 'Impor Satu', jenisKelamin: 'L', nisn: '0222333444', kelas: 'X C', asalSekolah: 'SMA A', alasan: 'Mutasi', tanggal: '2026-06-01', tahunAjaran: '2026/2027' },
      { jenis: 'keluar', nama: 'Impor Dua', jenisKelamin: 'P', nisn: '0222333555', kelas: 'X D', tujuan: 'SMA B', alasan: 'Mutasi', tanggal: '2026-06-02', tahunAjaran: '2026/2027' },
      { jenis: 'masuk', nama: 'Impor Duplikat', jenisKelamin: 'L', nisn: '0222333444', kelas: 'X C', asalSekolah: 'SMA A', alasan: 'Mutasi', tanggal: '2026-06-03', tahunAjaran: '2026/2027' },
      { jenis: 'masuk', nama: 'Impor Tidak Valid', jenisKelamin: 'L', nisn: '99', kelas: 'X C', asalSekolah: 'SMA A', alasan: 'Mutasi', tanggal: '2026-06-04', tahunAjaran: '2026/2027' }
    ]
  });
  check('impor massal: 2 ditambahkan', bulk.json.added === 2, JSON.stringify(bulk.json));
  check('impor massal: 1 duplikat dilewati', bulk.json.skipped === 1, bulk.json.skipped);
  check('impor massal: 1 baris tidak valid', bulk.json.invalid === 1, bulk.json.invalid);
  check('laporan baris tidak valid disertakan', bulk.json.details.invalid[0].errors.nisn !== undefined);

  /* ---------------------------------------------------- pengaturan */
  section('Pengaturan sekolah & prosedur');
  const settings = await admin.get('/api/settings');
  check('pengaturan dapat dibaca', settings.status === 200 && !!settings.json.profil.namaSekolah);
  check('prosedur tersimpan di server', settings.json.prosedur.masuk.langkah.length >= 5);

  const newName = 'SMA NEGERI 2 MENGWI (UJI)';
  const saveSettings = await admin.put('/api/settings', {
    profil: Object.assign({}, settings.json.profil, { namaSekolah: newName, telepon: '(0361) 999999' }),
    prosedur: settings.json.prosedur
  });
  check('pengaturan dapat disimpan', saveSettings.status === 200 && saveSettings.json.profil.namaSekolah === newName, saveSettings.status);

  const siteAfter = await anon.get('/api/public/site');
  check('perubahan tampil di halaman publik', siteAfter.json.profil.namaSekolah === newName, siteAfter.json.profil.namaSekolah);

  const editedProsedur = JSON.parse(JSON.stringify(settings.json.prosedur));
  editedProsedur.masuk.langkah.push({ judul: 'Tahap Uji', isi: 'ditambahkan oleh pengujian' });
  const saveProsedur = await admin.put('/api/settings', { profil: settings.json.profil, prosedur: editedProsedur });
  check('prosedur dapat ditambah tahap', saveProsedur.json.prosedur.masuk.langkah.length === editedProsedur.masuk.langkah.length,
    saveProsedur.json.prosedur.masuk.langkah.length);
  const siteProsedur = await anon.get('/api/public/site');
  check('tahap baru tampil publik', siteProsedur.json.prosedur.masuk.langkah.some((s) => s.judul === 'Tahap Uji'));

  /* --- kop surat diisi manual --- */
  const kopPut = await admin.put('/api/settings', {
    profil: Object.assign({}, saveSettings.json.profil, {
      kopBarisAtas: '  YAYASAN PENDIDIKAN UJI  \n\n  SMA NEGERI 2 MENGWI  ',
      kopBarisBawah: 'Jalan Uji Nomor 1\nTelepon (0361) 111 · surel@uji.sch.id'
    }),
    prosedur: editedProsedur
  });
  check('baris atas kop dibersihkan dan disimpan', kopPut.json.profil.kopBarisAtas === 'YAYASAN PENDIDIKAN UJI\nSMA NEGERI 2 MENGWI',
    JSON.stringify(kopPut.json.profil.kopBarisAtas));
  check('baris bawah kop tersimpan (2 baris)', kopPut.json.profil.kopBarisBawah.split('\n').length === 2,
    JSON.stringify(kopPut.json.profil.kopBarisBawah));

  const kopBanyak = await admin.put('/api/settings', {
    profil: Object.assign({}, kopPut.json.profil, {
      kopBarisAtas: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'].join('\n')
    }),
    prosedur: editedProsedur
  });
  check('baris kop dibatasi 5 baris', kopBanyak.json.profil.kopBarisAtas.split('\n').length === 5,
    kopBanyak.json.profil.kopBarisAtas.split('\n').length);

  const kopKosong = await admin.put('/api/settings', {
    profil: Object.assign({}, kopBanyak.json.profil, { kopBarisAtas: '' }),
    prosedur: editedProsedur
  });
  check('baris kop boleh dikosongkan sengaja', kopKosong.json.profil.kopBarisAtas === '', kopKosong.json.profil.kopBarisAtas);

  const kopBaca = await admin.get('/api/settings');
  check('baris kop terbaca kembali', kopBaca.json.profil.kopBarisBawah.indexOf('Jalan Uji') === 0, kopBaca.json.profil.kopBarisBawah);
  check('profil hasil baca punya kunci kop', typeof kopBaca.json.profil.kopBarisAtas === 'string');
  check('logo kanan bawaan kosong', kopBaca.json.profil.logoKanan === null, String(kopBaca.json.profil.logoKanan));

  const logoKananBesar = 'data:image/png;base64,' + 'A'.repeat(900000);
  const logoKananReject = await admin.put('/api/settings', {
    profil: Object.assign({}, kopBaca.json.profil, { logoKanan: logoKananBesar }),
    prosedur: editedProsedur
  });
  check('logo kanan terlalu besar ditolak', logoKananReject.json.profil.logoKanan === null);
  const logoKananKecil = 'data:image/png;base64,iVBORw0KGgo=';
  const logoKananOk = await admin.put('/api/settings', {
    profil: Object.assign({}, kopBaca.json.profil, { logoKanan: logoKananKecil }),
    prosedur: editedProsedur
  });
  check('logo kanan kecil diterima', logoKananOk.json.profil.logoKanan === logoKananKecil, String(logoKananOk.json.profil.logoKanan));

  /* --- kop surat berupa gambar unggahan --- */
  const kopPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const kopGambar = await admin.put('/api/settings', {
    profil: Object.assign({}, kopBaca.json.profil, {
      kopMode: 'gambar', kopGambar: kopPng, kopGaris: true,
      kopBarisAtas: 'TIDAK DIPAKAI SAAT MODE GAMBAR'
    }),
    prosedur: editedProsedur
  });
  check('mode kop gambar tersimpan', kopGambar.json.profil.kopMode === 'gambar', kopGambar.json.profil.kopMode);
  check('gambar kop tersimpan utuh', kopGambar.json.profil.kopGambar === kopPng,
    String(kopGambar.json.profil.kopGambar).slice(0, 40));
  check('opsi garis ganda kop tersimpan', kopGambar.json.profil.kopGaris === true);

  const kopGambarBaca = await admin.get('/api/settings');
  check('gambar kop terbaca kembali', kopGambarBaca.json.profil.kopGambar === kopPng);
  check('teks kop tetap tersimpan walau tidak dipakai',
    kopGambarBaca.json.profil.kopBarisAtas === 'TIDAK DIPAKAI SAAT MODE GAMBAR');

  const kopTanpaGambar = await admin.put('/api/settings', {
    profil: Object.assign({}, kopGambarBaca.json.profil, { kopGambar: null }),
    prosedur: editedProsedur
  });
  check('mode gambar tanpa gambar jatuh ke mode teks', kopTanpaGambar.json.profil.kopMode === 'teks',
    kopTanpaGambar.json.profil.kopMode);
  check('kop tetap punya baris teks sebagai cadangan', kopTanpaGambar.json.profil.kopBarisAtas.length > 0);

  const kopBukanGambar = await admin.put('/api/settings', {
    profil: Object.assign({}, kopBaca.json.profil, { kopMode: 'gambar', kopGambar: 'data:text/plain;base64,AAAA' }),
    prosedur: editedProsedur
  });
  check('berkas bukan gambar ditolak sebagai kop', kopBukanGambar.json.profil.kopGambar === null &&
    kopBukanGambar.json.profil.kopMode === 'teks', kopBukanGambar.json.profil.kopMode);

  const kopTerlaluBesar = await admin.put('/api/settings', {
    profil: Object.assign({}, kopBaca.json.profil, {
      kopMode: 'gambar', kopGambar: 'data:image/png;base64,' + 'A'.repeat(4100000)
    }),
    prosedur: editedProsedur
  });
  check('gambar kop melebihi 3 MB ditolak', kopTerlaluBesar.json.profil.kopGambar === null &&
    kopTerlaluBesar.json.profil.kopMode === 'teks', kopTerlaluBesar.json.profil.kopMode);

  const kopGarisFalse = await admin.put('/api/settings', {
    profil: Object.assign({}, kopBaca.json.profil, { kopMode: 'gambar', kopGambar: kopPng, kopGaris: false }),
    prosedur: editedProsedur
  });
  check('opsi garis ganda dapat dimatikan', kopGarisFalse.json.profil.kopGaris === false);

  // kembalikan pengaturan semula untuk pengujian berikutnya
  await admin.put('/api/settings', { profil: saveSettings.json.profil, prosedur: editedProsedur });
  const restoredKop = await admin.get('/api/settings');
  check('baris kop kembali ke nilai awal', restoredKop.json.profil.kopBarisAtas === settings.json.profil.kopBarisAtas,
    JSON.stringify(restoredKop.json.profil.kopBarisAtas));

  const logoTooBig = 'data:image/png;base64,' + 'A'.repeat(900000);
  const logoReject = await admin.put('/api/settings', { profil: Object.assign({}, saveSettings.json.profil, { logo: logoTooBig }), prosedur: editedProsedur });
  check('logo terlalu besar ditolak (disimpan null)', logoReject.json.profil.logo === null, logoReject.json.profil.logo ? 'masih ada' : 'null');

  /* ---------------------------------------------------- pengguna */
  section('Kelola pengguna');
  const users = await admin.get('/api/users');
  check('daftar pengguna dapat dibaca admin', users.status === 200 && users.json.users.length >= 1, users.status);
  const adminId = users.json.users[0].id;

  const createOp = await admin.post('/api/users', { username: 'operator1', nama: 'Petugas Uji', role: 'operator', password: 'operator12345' });
  check('operator baru dibuat', createOp.status === 201, createOp.status + ' ' + createOp.text.slice(0, 140));
  const opId = createOp.json.user.id;

  const dupUser = await admin.post('/api/users', { username: 'operator1', nama: 'Kembar', role: 'operator', password: 'operator12345' });
  check('nama pengguna ganda ditolak (409)', dupUser.status === 409, dupUser.status);

  const weakPass = await admin.post('/api/users', { username: 'operator2', nama: 'Sandi Lemah', role: 'operator', password: '123' });
  check('sandi lemah ditolak', weakPass.status === 400 && weakPass.json.fields.password, weakPass.status);

  const opLogin = await operator.post('/api/auth/login', { username: 'operator1', password: 'operator12345' });
  check('operator dapat masuk', opLogin.status === 200 && opLogin.json.user.role === 'operator', opLogin.status);

  const opCreateRecord = await operator.post('/api/records', {
    jenis: 'masuk', nama: 'Data oleh Operator', jenisKelamin: 'P', nisn: '0333444555', kelas: 'X E',
    asalSekolah: 'SMA C', alasan: 'Mutasi', tanggal: '2026-06-05', tahunAjaran: '2026/2027'
  });
  check('operator dapat menambah data', opCreateRecord.status === 201, opCreateRecord.status);

  const opUsers = await operator.get('/api/users');
  check('operator tidak boleh mengelola pengguna (403)', opUsers.status === 403, opUsers.status);

  const opSettings = await operator.put('/api/settings', { profil: settings.json.profil, prosedur: settings.json.prosedur });
  check('operator tidak boleh mengubah pengaturan (403)', opSettings.status === 403, opSettings.status);

  const opPurge = await operator.del('/api/records/all');
  check('operator tidak boleh menghapus semua data (403)', opPurge.status === 403, opPurge.status);

  const selfDemote = await admin.put('/api/users/' + adminId, { username, role: 'operator', isActive: true });
  check('admin tidak dapat menurunkan dirinya sendiri', selfDemote.status === 400, selfDemote.status);

  const selfDelete = await admin.del('/api/users/' + adminId);
  check('admin tidak dapat menghapus dirinya sendiri', selfDelete.status === 400, selfDelete.status);

  const deactivateOp = await admin.put('/api/users/' + opId, { isActive: false });
  check('operator dapat dinonaktifkan', deactivateOp.status === 200 && deactivateOp.json.user.isActive === false,
    deactivateOp.status + ' ' + JSON.stringify(deactivateOp.json.user));
  check('menonaktifkan akun memutus sesinya', (await operator.get('/api/auth/me')).status === 401);
  const opBlocked = await makeSession().post('/api/auth/login', { username: 'operator1', password: 'operator12345' });
  check('akun nonaktif tidak dapat masuk', opBlocked.status === 401, opBlocked.status);
  const reactivate = await admin.put('/api/users/' + opId, { isActive: true, nama: 'Petugas Uji' });
  check('operator dapat diaktifkan kembali', reactivate.status === 200 && reactivate.json.user.isActive === true,
    reactivate.status + ' ' + JSON.stringify(reactivate.json.user));

  // sesi baru untuk pengujian berikutnya (sesi lama sudah diputus)
  const opLogin2 = await operator.post('/api/auth/login', { username: 'operator1', password: 'operator12345' });
  check('operator dapat masuk kembali', opLogin2.status === 200, opLogin2.status);

  /* ---------------------------------------------------- ganti sandi */
  section('Ganti sandi');
  const newPassword = 'SandiBaruUji2026';
  const wrongCurrent = await operator.post('/api/auth/password', { currentPassword: 'salah', newPassword: newPassword });
  check('sandi lama salah ditolak', wrongCurrent.status === 400, wrongCurrent.status);
  const changePass = await operator.post('/api/auth/password', { currentPassword: 'operator12345', newPassword: newPassword });
  check('sandi berhasil diubah', changePass.status === 200, changePass.status + ' ' + changePass.text.slice(0, 120));

  const oldPass = await makeSession().post('/api/auth/login', { username: 'operator1', password: 'operator12345' });
  check('sandi lama tidak berlaku lagi', oldPass.status === 401, oldPass.status);
  const newPass = await makeSession().post('/api/auth/login', { username: 'operator1', password: newPassword });
  check('sandi baru dapat dipakai', newPass.status === 200, newPass.status);
  const shortPass = await operator.post('/api/auth/password', { currentPassword: newPassword, newPassword: '123' });
  check('sandi baru terlalu pendek ditolak', shortPass.status === 400, shortPass.status);
  const noCurrent = await operator.post('/api/auth/password', { currentPassword: 'ngawur', newPassword: 'SandiLain2026' });
  check('sandi saat ini wajib benar', noCurrent.status === 400, noCurrent.status);

  /* ---------------------------------------------------- log aktivitas */
  section('Log aktivitas');
  const audit = await admin.get('/api/settings/audit?limit=200');
  check('log aktivitas dapat dibaca admin', audit.status === 200 && audit.json.audit.length > 5, audit.status + ' n=' + (audit.json.audit || []).length);
  const actions = audit.json.audit.map((a) => a.action);
  check('log mencatat login', actions.indexOf('login') > -1);
  check('log mencatat tambah data', actions.indexOf('tambah-data') > -1);
  check('log mencatat unggah berkas', actions.indexOf('unggah-berkas') > -1);
  check('log mencatat perubahan pengaturan', actions.indexOf('ubah-pengaturan') > -1);
  check('log mencatat percobaan login gagal', actions.indexOf('login.gagal') > -1);
  const opAudit = await operator.get('/api/settings/audit');
  check('operator tetap boleh melihat log', opAudit.status === 200, opAudit.status);

  /* ---------------------------------------------------- hapus */
  section('Hapus data');
  const delAtt = await admin.del('/api/attachments/' + attId);
  check('lampiran dapat dihapus', delAtt.status === 200, delAtt.status);
  const rawGone = await fetch(BASE + '/api/attachments/' + attId + '/raw', { headers: { Cookie: admin.cookie() } });
  check('berkas hilang setelah dihapus', rawGone.status === 404, rawGone.status);

  const delKeluar = await admin.del('/api/records/' + keluarId);
  check('data dapat dihapus', delKeluar.status === 200, delKeluar.status);
  const delAgain = await admin.del('/api/records/' + keluarId);
  check('hapus data yang tidak ada -> 404', delAgain.status === 404, delAgain.status);

  const beforeCount = (await admin.get('/api/records')).json.records.length;
  const purge = await admin.del('/api/records/all');
  check('hapus semua data berhasil', purge.status === 200 && purge.json.deleted === beforeCount, JSON.stringify(purge.json));
  const afterCount = (await admin.get('/api/records')).json.records.length;
  check('data benar-benar kosong', afterCount === 0, afterCount);
  const auditAfterPurge = await admin.get('/api/settings/audit?limit=5');
  check('penghapusan semua data tercatat di log', auditAfterPurge.json.audit.some((a) => a.action === 'hapus-semua-data'));

  /* ---------------------------------------------------- sesi */
  section('Sesi & logout');
  const logout = await admin.post('/api/auth/logout');
  check('logout berhasil', logout.status === 200);
  const afterLogout = await admin.get('/api/auth/me');
  check('sesi tidak berlaku setelah logout', afterLogout.status === 401, afterLogout.status);

  /* ---------------------------------------------------- batas login */
  section('Pembatasan percobaan login');
  const attacker = makeSession();
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const r = await attacker.post('/api/auth/login', { username: 'admin', password: 'salah' + i });
    if (r.status === 429) { got429 = true; break; }
  }
  check('percobaan login berulang dibatasi (429)', got429);

  /* ---------------------------------------------------- hasil */
  console.log('\n================ HASIL API: ' + (failures.length ? failures.length + ' GAGAL, ' : '') + pass + ' LULUS ================');
  if (failures.length) {
    console.log('Gagal:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error('ERROR UJI pada bagian [' + step + ']:', err && err.stack ? err.stack : err);
  process.exit(2);
});
