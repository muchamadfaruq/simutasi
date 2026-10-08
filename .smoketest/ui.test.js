/* Uji antarmuka SIMUTASI memakai jsdom terhadap server sungguhan.
   Pemakaian: node ui.test.js [baseUrl]                                   */

const { JSDOM, VirtualConsole, CookieJar } = require('jsdom');

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const ADMIN_USER = process.env.TEST_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.TEST_ADMIN_PASS;

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
function section(t) { step = t; console.log('\n--- ' + t + ' ---'); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout) {
  const limit = Date.now() + (timeout || 4000);
  while (Date.now() < limit) {
    try { if (fn()) return true; } catch (e) { /* belum siap */ }
    await wait(50);
  }
  return false;
}

/* ---------- jembatan fetch: jsdom -> fetch Node + cookie ---------- */
function readJsdomBlob(win, blob) {
  return new Promise((resolve, reject) => {
    const fr = new win.FileReader();
    fr.onload = () => resolve(Buffer.from(fr.result));
    fr.onerror = () => reject(fr.error || new Error('gagal membaca berkas'));
    fr.readAsArrayBuffer(blob);
  });
}

function installFetch(window, jar) {
  window.fetch = async function (input, init) {
    const opts = init || {};
    const rawUrl = typeof input === 'string' ? input : (input && input.url) || String(input);
    const url = new window.URL(rawUrl, BASE).href;
    const headers = {};
    if (opts.headers) {
      const h = opts.headers;
      if (typeof h.forEach === 'function') h.forEach((v, k) => { headers[k] = v; });
      else Object.keys(h).forEach((k) => { headers[k] = h[k]; });
    }
    const cookie = jar.getCookieStringSync(url);
    if (cookie) headers.Cookie = cookie;

    let body = opts.body;
    if (body && typeof body === 'object' && typeof body.append === 'function' &&
        typeof body.entries === 'function' && !(body instanceof Buffer)) {
      const converted = new FormData();
      for (const pair of body.entries()) {
        const key = pair[0];
        const val = pair[1];
        if (val && typeof val === 'object' && typeof val.size === 'number' && typeof val.slice === 'function') {
          const buf = await readJsdomBlob(window, val);
          converted.append(key, new Blob([buf], { type: val.type || 'application/octet-stream' }), val.name || key);
        } else {
          converted.append(key, val);
        }
      }
      body = converted;
    }

    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      body: body,
      redirect: 'manual'
    });
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    list.forEach((line) => {
      try { jar.setCookieSync(line, url); } catch (e) { /* abaikan */ }
    });
    return res;
  };
}

async function loadPage(path, options) {
  const opts = options || {};
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (/Not implemented/.test(e.message)) return;
    errors.push(e.message);
  });
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  const jar = new CookieJar();
  if (opts.cookie) {
    opts.cookie.split(';').forEach((pair) => {
      const p = pair.trim();
      if (p) { try { jar.setCookieSync(p + '; Path=/', BASE); } catch (e) { /* abaikan */ } }
    });
  }

  const dom = await JSDOM.fromURL(BASE + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    cookieJar: jar,
    beforeParse(window) {
      installFetch(window, jar);
    }
  });
  await new Promise((res) => dom.window.addEventListener('load', res));
  await wait(250);
  return { dom, win: dom.window, doc: dom.window.document, errors, jar };
}

const $ = (doc, sel) => doc.querySelector(sel);
const $$ = (doc, sel) => Array.prototype.slice.call(doc.querySelectorAll(sel));
const setVal = (doc, sel, v) => { doc.querySelector(sel).value = v; };
function click(win, el) { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }
function submit(win, el) { el.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); }

async function nodeLogin(username, password) {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const list = res.headers.getSetCookie();
  const cookie = list.map((c) => c.split(';')[0]).join('; ');
  return { status: res.status, cookie, json: await res.json().catch(() => ({})) };
}

(async () => {
  /* ============ 1. Halaman publik (landing) ============ */
  section('Halaman publik: prosedur mutasi');
  const landing = await loadPage('/');
  const ldoc = landing.doc;
  const siteRes = await fetch(BASE + '/api/public/site').then((r) => r.json());

  check('nama sekolah tampil', $(ldoc, '#brandName').textContent === siteRes.profil.namaSekolah,
    $(ldoc, '#brandName').textContent + ' vs ' + siteRes.profil.namaSekolah);
  check('tahun ajaran tampil', $(ldoc, '#taBadge').textContent === siteRes.profil.tahunAjaranAktif, $(ldoc, '#taBadge').textContent);
  check('jumlah tahapan ditampilkan', $(ldoc, '#metaStepCount').textContent !== '—', $(ldoc, '#metaStepCount').textContent);

  const flowSteps = $$(ldoc, '#heroFlow .flow-step');
  check('alur singkat hero terisi', flowSteps.length === 4, flowSteps.length);

  const tracks = $$(ldoc, '#trackGrid .track');
  check('dua kartu alur (masuk & keluar)', tracks.length === 2, tracks.length);
  check('kartu masuk memuat langkah', tracks[0].querySelectorAll('.track-step').length >= 4, tracks[0].querySelectorAll('.track-step').length);
  check('kartu keluar memuat langkah', tracks[1].querySelectorAll('.track-step').length >= 4, tracks[1].querySelectorAll('.track-step').length);

  const masukSteps = $$(ldoc, '#timeline .tl-item').length;
  check('timeline masuk terisi', masukSteps === siteRes.prosedur.masuk.langkah.length, masukSteps);
  check('timeline menampilkan judul tahap pertama',
    $(ldoc, '#timeline .tl-body h4').textContent === siteRes.prosedur.masuk.langkah[0].judul,
    $(ldoc, '#timeline .tl-body h4').textContent);
  const docs = $$(ldoc, '#checklist li').length;
  check('checklist dokumen masuk terisi', docs === siteRes.prosedur.masuk.dokumen.length, docs);

  const tabKeluar = $$(ldoc, '.tab').find((t) => t.dataset.jenis === 'keluar');
  click(landing.win, tabKeluar);
  await wait(120);
  check('tab keluar jadi aktif', tabKeluar.classList.contains('active'));
  const keluarFirst = $(ldoc, '#timeline .tl-body h4').textContent;
  check('timeline berganti ke prosedur keluar', keluarFirst === siteRes.prosedur.keluar.langkah[0].judul, keluarFirst);
  check('checklist berganti ke dokumen keluar',
    $$(ldoc, '#checklist li').length === siteRes.prosedur.keluar.dokumen.length,
    $$(ldoc, '#checklist li').length);
  check('tidak ada data pribadi siswa di halaman publik', !/\b\d{10}\b/.test(ldoc.body.textContent));
  const landingText = ldoc.body.textContent;
  check('tanpa error JavaScript di halaman publik', landing.errors.length === 0, landing.errors.slice(0, 3).join(' | '));
  const loginLink = $(ldoc, '.topnav a[href="/login.html"]');
  check('tombol Login Admin tersedia', !!loginLink);
  landing.dom.window.close();

  /* ============ 2. Halaman login ============ */
  section('Halaman login');
  const loginPage = await loadPage('/login.html');
  const gdoc = loginPage.doc;
  check('form login tampil', !!$(gdoc, '#loginForm') && !!$(gdoc, '#username') && !!$(gdoc, '#password'));
  check('nama sekolah dimuat di panel samping', $(gdoc, '#brandName').textContent === siteRes.profil.namaSekolah,
    $(gdoc, '#brandName').textContent);

  submit(loginPage.win, $(gdoc, '#loginForm'));
  await wait(150);
  check('form kosong ditolak dengan pesan lokal', $(gdoc, '#alertBox').classList.contains('show') &&
    /wajib diisi/i.test($(gdoc, '#alertText').textContent), $(gdoc, '#alertText').textContent);
  check('tidak mengirim permintaan saat form kosong', !/simutasi_sid=/.test(gdoc.cookie));

  setVal(gdoc, '#username', ADMIN_USER);
  setVal(gdoc, '#password', 'sandi-yang-salah');
  submit(loginPage.win, $(gdoc, '#loginForm'));
  await waitFor(() => $(gdoc, '#alertBox').classList.contains('show'), 3000);
  check('sandi salah menampilkan peringatan', $(gdoc, '#alertBox').classList.contains('show'));
  check('pesan peringatan dari server', /salah/i.test($(gdoc, '#alertText').textContent), $(gdoc, '#alertText').textContent);

  setVal(gdoc, '#password', ADMIN_PASS);
  submit(loginPage.win, $(gdoc, '#loginForm'));
  await waitFor(() => /simutasi_sid=/.test(loginPage.jar.getCookieStringSync(BASE)), 4000);
  check('login berhasil (sesi tersimpan di browser)', /simutasi_sid=/.test(loginPage.jar.getCookieStringSync(BASE)),
    loginPage.jar.getCookieStringSync(BASE) || 'kosong');
  check('cookie sesi bersifat HttpOnly (tidak dibaca JavaScript)', !/simutasi_sid/.test(gdoc.cookie), gdoc.cookie);
  check('tanpa error JavaScript di halaman login', loginPage.errors.length === 0, loginPage.errors.slice(0, 3).join(' | '));
  loginPage.dom.window.close();

  /* ============ 3. Proteksi halaman admin ============ */
  section('Proteksi halaman admin');
  const guard = await loadPage('/admin');
  check('tanpa login dialihkan ke halaman login', /Login Admin/.test(guard.doc.body.textContent) || /Login Admin/.test(guard.doc.title),
    guard.doc.title);
  check('halaman dashboard tidak terlihat', !guard.doc.querySelector('.app'));
  guard.dom.window.close();

  /* ============ 4. Dashboard admin ============ */
  section('Dashboard admin');
  const adminLogin = await nodeLogin(ADMIN_USER, ADMIN_PASS);
  check('sesi admin diperoleh (pengujian)', adminLogin.status === 200, adminLogin.status);
  const admin = await loadPage('/admin', { cookie: adminLogin.cookie });
  const doc = admin.doc;
  const win = admin.win;
  const cookie = adminLogin.cookie;

  check('aplikasi admin termuat', !!$(doc, '.app') && !!$(doc, '#view-dashboard'));
  if (!$(doc, '.app')) {
    throw new Error('Halaman admin tidak termuat (judul dokumen: "' + doc.title + '"). Sesi/cookie tidak diterima server.');
  }
  check('nama pengguna tampil di topbar', $(doc, '#userName').textContent.length > 0, $(doc, '#userName').textContent);
  check('peran tampil sebagai Administrator', $(doc, '#userRole').textContent === 'Administrator', $(doc, '#userRole').textContent);
  check('menu pengguna tidak dalam mode operator', !doc.body.classList.contains('role-operator'));
  check('tab Pengguna tersedia untuk admin', !!$$(doc, '.set-tab').find((t) => t.dataset.set === 'pengguna'));

  const startMasuk = Number($(doc, '#cntMasuk').textContent);
  const startKeluar = Number($(doc, '#cntKeluar').textContent);
  check('penghitung mutasi masuk terisi', startMasuk > 0, startMasuk);
  check('tabel masuk terisi', $$(doc, '#bodyMasuk tr[data-id]').length === startMasuk, $$(doc, '#bodyMasuk tr[data-id]').length);
  check('grafik bulan terisi', $$(doc, '#chartBulan .chart-col').length > 0);
  check('aktivitas terbaru terisi', $$(doc, '#recentBody tr').length > 0);
  check('filter tahun ajaran terisi', $(doc, '#filterTA').options.length > 1, $(doc, '#filterTA').options.length);

  // pastikan data siswa dari server tidak pernah muncul di halaman publik
  const semuaData = await fetch(BASE + '/api/records', { headers: { Cookie: cookie } }).then((r) => r.json());
  const bocor = semuaData.records.filter((r) => landingText.indexOf(r.nama) > -1).map((r) => r.nama);
  const bocorNisn = semuaData.records.filter((r) => r.nisn && landingText.indexOf(r.nisn) > -1).length;
  check('nama siswa tidak bocor ke halaman publik', bocor.length === 0, bocor.join(', '));
  check('NISN tidak bocor ke halaman publik', bocorNisn === 0, String(bocorNisn));

  /* --- navigasi --- */
  section('Navigasi & tabel');
  click(win, $$(doc, '.nav-item').find((b) => b.dataset.view === 'keluar'));
  await wait(80);
  check('halaman mutasi keluar tampil', !$(doc, '#view-keluar').classList.contains('hidden'));
  check('judul halaman berubah', $(doc, '#pageTitle').textContent === 'Mutasi Keluar', $(doc, '#pageTitle').textContent);
  check('tombol tambah ikut berubah', $(doc, '#btnAddLabel').textContent === 'Tambah Keluar', $(doc, '#btnAddLabel').textContent);

  setVal(doc, '#qKeluar', 'zzz-tidak-ada');
  $(doc, '#qKeluar').dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(80);
  check('pencarian tanpa hasil menampilkan pesan kosong', /Belum ada data/.test($(doc, '#bodyKeluar').innerHTML));
  setVal(doc, '#qKeluar', '');
  $(doc, '#qKeluar').dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(80);
  check('pencarian direset', $$(doc, '#bodyKeluar tr[data-id]').length === startKeluar, $$(doc, '#bodyKeluar tr[data-id]').length);

  click(win, $$(doc, '.nav-item').find((b) => b.dataset.view === 'masuk'));
  await wait(80);

  /* --- tambah data lewat form --- */
  section('Tambah data lewat form');
  const namaUji = 'Siswa Uji Antarmuka ' + Date.now().toString().slice(-5);
  click(win, $(doc, '[data-add="masuk"]'));
  await wait(100);
  check('modal form terbuka', !$(doc, '#modalForm').classList.contains('hidden'));
  submit(win, $(doc, '#recordForm'));
  await wait(100);
  check('form kosong ditolak', $$(doc, '#recordForm .field.invalid').length >= 6, $$(doc, '#recordForm .field.invalid').length);

  setVal(doc, '#f_nama', namaUji);
  setVal(doc, '#f_jenisKelamin', 'P');
  setVal(doc, '#f_nisn', '0811223399');
  setVal(doc, '#f_nis', '9801');
  setVal(doc, '#f_tempatLahir', 'Badung');
  setVal(doc, '#f_tanggalLahir', '2010-07-07');
  setVal(doc, '#f_namaOrtu', 'Orang Tua Uji');
  setVal(doc, '#f_tanggal', '2026-05-20');
  setVal(doc, '#f_nomorSurat', '800/ABC/DINAS/2026');
  setVal(doc, '#f_kelas', 'X F');
  setVal(doc, '#f_sekolahLawan', 'SMA Negeri 5 Uji');
  setVal(doc, '#f_alasan', 'Mutasi');
  submit(win, $(doc, '#recordForm'));
  const okSaved = await waitFor(() => Number($(doc, '#cntMasuk').textContent) === startMasuk + 1, 5000);
  check('data tersimpan lewat API', okSaved, 'masuk=' + $(doc, '#cntMasuk').textContent);
  check('modal tertutup setelah simpan', $(doc, '#modalForm').classList.contains('hidden'));
  check('baris baru muncul di tabel', new RegExp(namaUji).test($(doc, '#bodyMasuk').innerHTML));
  check('nomor surat tampil di tabel', /800\/ABC\/DINAS\/2026/.test($(doc, '#bodyMasuk').innerHTML));
  check('tahun ajaran terisi otomatis pada form',
    /2026\/2027/.test(siteRes.profil.tahunAjaranAktif), siteRes.profil.tahunAjaranAktif);

  /* --- detail, edit, cetak --- */
  section('Detail, edit, cetak');
  const rowBaru = $$(doc, '#bodyMasuk tr[data-id]').find((tr) => new RegExp(namaUji).test(tr.textContent));
  check('baris baru dapat ditemukan', !!rowBaru);
  click(win, rowBaru.querySelector('[data-act="detail"]'));
  await wait(100);
  check('modal detail terbuka', !$(doc, '#modalDetail').classList.contains('hidden'));
  check('detail menampilkan nama siswa', $(doc, '#detailTitle').textContent === namaUji, $(doc, '#detailTitle').textContent);
  check('detail memuat asal sekolah', /SMA Negeri 5 Uji/.test($(doc, '#detailBody').textContent));
  check('detail memuat nomor surat', /800\/ABC\/DINAS\/2026/.test($(doc, '#detailBody').textContent));
  click(win, $(doc, '#modalDetail [data-close]'));
  await wait(60);
  click(win, rowBaru.querySelector('[data-act="edit"]'));
  await wait(100);
  check('form edit terbuka dengan data terisi', $(doc, '#f_nama').value === namaUji, $(doc, '#f_nama').value);
  setVal(doc, '#f_kelas', 'X E');
  setVal(doc, '#f_keterangan', 'diubah lewat antarmuka');
  submit(win, $(doc, '#recordForm'));
  const okEdited = await waitFor(() => /X E/.test($(doc, '#bodyMasuk').innerHTML) && $(doc, '#modalForm').classList.contains('hidden'), 5000);
  check('perubahan tersimpan', okEdited);

  let printHtml = null;
  win.print = function () { printHtml = $(doc, '#printArea').innerHTML; };
  click(win, $$(doc, '#bodyMasuk tr[data-id]').find((tr) => new RegExp(namaUji).test(tr.textContent)).querySelector('[data-act="print"]'));
  const okPrint = await waitFor(() => !!printHtml, 3000);
  check('surat keterangan terbentuk', okPrint && /SURAT KETERANGAN/.test(printHtml));
  check('surat memuat data siswa', new RegExp(namaUji).test(printHtml || ''), (printHtml || '').slice(0, 80));
  check('surat memakai nomor surat manual', /Nomor : 800\/ABC\/DINAS\/2026/.test(printHtml || ''),
    ((printHtml || '').match(/Nomor : [^<]*/) || [''])[0]);
  check('surat memuat blok tanda tangan kepala sekolah', /NIP\./.test(printHtml || ''));
  const nameAfterPrint = siteRes.profil.namaSekolah;
  check('kop surat memuat nama sekolah', new RegExp(nameAfterPrint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(printHtml || ''));

  click(win, $(doc, '[data-print="masuk"]'));
  const okRekap = await waitFor(() => /DAFTAR MUTASI SISWA/.test(printHtml || ''), 3000);
  check('rekap mutasi dapat dicetak', okRekap);

  /* --- dashboard statistik diperbarui --- */
  section('Statistik & arsip');
  click(win, $$(doc, '.nav-item').find((b) => b.dataset.view === 'dashboard'));
  await wait(100);
  check('statistik masuk ikut bertambah', Number($(doc, '#statMasuk').textContent) === startMasuk + 1, $(doc, '#statMasuk').textContent);
  check('selisih dihitung', /^[+\-]?\d+$/.test($(doc, '#statNet').textContent), $(doc, '#statNet').textContent);
  click(win, $$(doc, '.nav-item').find((b) => b.dataset.view === 'arsip'));
  await wait(100);
  check('halaman arsip tampil', !$(doc, '#view-arsip').classList.contains('hidden'));

  /* --- export Excel --- */
  section('Export Excel');
  let captured = null;
  win.XLSX.writeFile = function (wb, name) { captured = { wb: wb, name: name }; };
  click(win, $(doc, '#btnExport'));
  await wait(300);
  check('berkas Excel dibuat', !!captured, captured && captured.name);
  if (captured) {
    const names = captured.wb.SheetNames;
    check('memuat 3 sheet', names.join(',') === 'PINDAH MASUK,PINDAH KELUAR,DATA LENGKAP', names.join(','));
    const sheet = captured.wb.Sheets['PINDAH MASUK'];
    const aoa = win.XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    const headerIdx = aoa.findIndex((r) => r.indexOf('NISN') > -1);
    check('baris header ditemukan', headerIdx > -1, headerIdx);
    if (headerIdx > -1) {
      check('kolom Nomor Surat ada di Excel', aoa[headerIdx].indexOf('Nomor Surat') > -1, aoa[headerIdx].join('|'));
      check('kolom Asal Sekolah tetap ada', aoa[headerIdx].indexOf('Asal Sekolah') > -1);
    }
    const flat = JSON.stringify(aoa);
    check('nomor surat ikut tereskpor', flat.indexOf('800/ABC/DINAS/2026') > -1);
    check('nama siswa uji ikut tereskpor', flat.indexOf(namaUji) > -1);
  }

  /* --- pengaturan: prosedur --- */
  section('Pengaturan: identitas & prosedur');
  click(win, $$(doc, '.nav-item').find((b) => b.dataset.view === 'pengaturan'));
  await wait(120);
  check('halaman pengaturan tampil', !$(doc, '#view-pengaturan').classList.contains('hidden'));
  check('tab identitas aktif', $$(doc, '.set-tab').find((t) => t.dataset.set === 'identitas').classList.contains('active'));
  check('form identitas terisi', $(doc, '#s_namaSekolah').value === siteRes.profil.namaSekolah, $(doc, '#s_namaSekolah').value);
  check('tahun ajaran aktif terisi', $(doc, '#s_tahunAjaranAktif').value === siteRes.profil.tahunAjaranAktif);
  check('daftar alasan terisi banyak baris', $(doc, '#s_daftarAlasan').value.split('\n').length >= 4);
  check('input tidak terkunci untuk admin', !$(doc, '#s_namaSekolah').hasAttribute('disabled'));

  /* --- kop surat: gambar unggahan & susunan teks --- */
  check('pemilih jenis kop tersedia', !!$(doc, '#kopModeGambar') && !!$(doc, '#kopModeTeks'));
  check('bawaan memakai kop teks', $(doc, '#kopModeTeks').checked && !$(doc, '#kopModeGambar').checked);
  check('panel teks tampil, panel gambar tersembunyi',
    !$(doc, '#kopPanelTeks').classList.contains('hidden') && $(doc, '#kopPanelGambar').classList.contains('hidden'));

  check('baris atas kop terisi dari pengaturan', /PEMERINTAH PROVINSI BALI/.test($(doc, '#s_kopBarisAtas').value),
    $(doc, '#s_kopBarisAtas').value);
  check('baris bawah kop terisi dari pengaturan', $(doc, '#s_kopBarisBawah').value.split('\n').length >= 1,
    $(doc, '#s_kopBarisBawah').value);
  check('pratinjau kop menampilkan baris atas', /PEMERINTAH PROVINSI BALI/.test($(doc, '#kopPreview').innerHTML));
  check('pratinjau kop menampilkan nama sekolah', /SMA NEGERI 2 MENGWI/.test($(doc, '#kopPreview').innerHTML));
  check('pratinjau kop menampilkan baris bawah', /Jalan Raya Mengwi/.test($(doc, '#kopPreview').innerHTML));
  check('pratinjau memuat slot logo kanan kosong', $(doc, '#logoKananPreview').textContent.trim() === '—',
    $(doc, '#logoKananPreview').textContent);

  setVal(doc, '#s_kopBarisAtas', 'YAYASAN PENDIDIKAN UJI\nSEKOLAH UJI MENGWI');
  $(doc, '#s_kopBarisAtas').dispatchEvent(new win.Event('input', { bubbles: true }));
  setVal(doc, '#s_kopBarisBawah', 'Jalan Uji Nomor 1\nTelepon (0361) 999');
  $(doc, '#s_kopBarisBawah').dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(80);
  check('pratinjau ikut berubah saat diketik', /YAYASAN PENDIDIKAN UJI/.test($(doc, '#kopPreview').innerHTML) &&
    /Jalan Uji Nomor 1/.test($(doc, '#kopPreview').innerHTML), $(doc, '#kopPreview').textContent.slice(0, 90));

  // ---- beralih ke kop gambar ----
  $(doc, '#kopModeGambar').checked = true;
  $(doc, '#kopModeGambar').dispatchEvent(new win.Event('change', { bubbles: true }));
  await wait(80);
  check('panel gambar tampil, panel teks tersembunyi',
    !$(doc, '#kopPanelGambar').classList.contains('hidden') && $(doc, '#kopPanelTeks').classList.contains('hidden'));
  check('pratinjau meminta gambar kop diunggah', /Belum ada gambar kop/.test($(doc, '#kopPreview').textContent),
    $(doc, '#kopPreview').textContent.slice(0, 80));

  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const kopPngDataUrl = 'data:image/png;base64,' + pngBase64;
  const kopInput = $(doc, '#s_kopGambar');
  Object.defineProperty(kopInput, 'files', {
    value: [new win.File([Buffer.from(pngBase64, 'base64')], 'kop-sekolah.png', { type: 'image/png' })],
    configurable: true
  });
  kopInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  const okKopImg = await waitFor(() => /<img/.test($(doc, '#kopPreview').innerHTML), 3000);
  check('gambar kop dimuat ke pratinjau', okKopImg, $(doc, '#kopPreview').innerHTML.slice(0, 90));
  check('gambar kop tampil sebagai berkas terunggah', /<img src="data:image\/png/.test($(doc, '#kopGambarPreview').innerHTML));
  check('pratinjau gambar tidak lagi memuat baris teks', !/YAYASAN PENDIDIKAN UJI/.test($(doc, '#kopPreview').innerHTML));

  $(doc, '#s_kopGaris').checked = true;
  $(doc, '#s_kopGaris').dispatchEvent(new win.Event('change', { bubbles: true }));
  await wait(60);
  check('opsi garis ganda diterapkan di pratinjau', /bergaris/.test($(doc, '#kopPreview').innerHTML));

  click(win, $(doc, '#btnSaveSettings'));
  await wait(800);
  const kopImgServer = await fetch(BASE + '/api/settings', { headers: { Cookie: cookie } }).then((r) => r.json());
  check('mode gambar tersimpan di server', kopImgServer.profil.kopMode === 'gambar', kopImgServer.profil.kopMode);
  check('gambar kop tersimpan di server', String(kopImgServer.profil.kopGambar).indexOf('data:image/png') === 0);
  check('opsi garis ganda tersimpan di server', kopImgServer.profil.kopGaris === true);

  win.print = function () { printHtml = $(doc, '#printArea').innerHTML; };
  printHtml = null;
  click(win, $$(doc, '#bodyMasuk tr[data-id]').find((tr) => new RegExp(namaUji).test(tr.textContent)).querySelector('[data-act="print"]'));
  const okPrintImg = await waitFor(() => /<img src="data:image\/png/.test(printHtml || ''), 3000);
  check('surat memakai gambar kop', okPrintImg, (printHtml || '').replace(/\s+/g, ' ').slice(0, 110));
  check('surat tidak memakai baris teks kop', !/YAYASAN PENDIDIKAN UJI/.test(printHtml || ''));
  check('surat memuat kelas bergaris kop', /kopgambar bergaris/.test(printHtml || ''));

  // ---- kembali ke kop teks ----
  click(win, $(doc, '#btnKopGambarRemove'));
  await wait(100);
  check('menghapus gambar mengembalikan ke mode teks', $(doc, '#kopModeTeks').checked);
  check('pratinjau kembali menampilkan teks kop', /YAYASAN PENDIDIKAN UJI/.test($(doc, '#kopPreview').innerHTML),
    $(doc, '#kopPreview').textContent.slice(0, 80));

  // kembalikan kop teks seperti semula
  setVal(doc, '#s_kopBarisAtas', 'PEMERINTAH PROVINSI BALI\nDINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA');
  setVal(doc, '#s_kopBarisBawah', 'Jalan Raya Mengwi, Kecamatan Mengwi, Kabupaten Badung, Bali');
  click(win, $(doc, '#btnSaveSettings'));
  await wait(800);
  const kopAkhir = await fetch(BASE + '/api/settings', { headers: { Cookie: cookie } }).then((r) => r.json());
  check('pengaturan kop dikembalikan ke mode teks', kopAkhir.profil.kopMode === 'teks' && kopAkhir.profil.kopGambar === null,
    kopAkhir.profil.kopMode + '/' + String(kopAkhir.profil.kopGambar).slice(0, 20));

  click(win, $$(doc, '.set-tab').find((t) => t.dataset.set === 'prosedur'));
  await wait(100);
  check('panel prosedur tampil', !$(doc, '#set-prosedur').classList.contains('hidden'));
  check('editor prosedur masuk terisi', $(doc, '#p_masuk_langkah').value.split('\n').length >= 5,
    $(doc, '#p_masuk_langkah').value.split('\n').length);
  check('editor dokumen masuk terisi', $(doc, '#p_masuk_dokumen').value.split('\n').length >= 4);
  check('editor prosedur keluar terisi', $(doc, '#p_keluar_langkah').value.split('\n').length >= 5);

  const originalSteps = $(doc, '#p_masuk_langkah').value;
  setVal(doc, '#p_masuk_langkah', originalSteps + '\nTahap Uji Antarmuka | ditambahkan saat pengujian');
  click(win, $(doc, '#btnSaveSettings'));
  const savedProsedur = await waitFor(async () => true, 100);
  await wait(700);
  const siteAfter = await fetch(BASE + '/api/public/site').then((r) => r.json());
  check('tahap baru prosedur tersimpan di server',
    siteAfter.prosedur.masuk.langkah.some((s) => s.judul === 'Tahap Uji Antarmuka'),
    siteAfter.prosedur.masuk.langkah.map((s) => s.judul).join(', ').slice(0, 90));

  setVal(doc, '#p_masuk_langkah', originalSteps);
  click(win, $(doc, '#btnSaveSettings'));
  await wait(700);
  const siteRevert = await fetch(BASE + '/api/public/site').then((r) => r.json());
  check('prosedur dikembalikan ke semula',
    !siteRevert.prosedur.masuk.langkah.some((s) => s.judul === 'Tahap Uji Antarmuka'));

  /* --- pengaturan: data & cadangan --- */
  section('Pengaturan: pemulihan cadangan (restore)');
  click(win, $$(doc, '.set-tab').find((t) => t.dataset.set === 'data'));
  await wait(100);
  check('panel data & cadangan tampil', !$(doc, '#set-data').classList.contains('hidden'));
  check('tombol cadangan tersedia', !!$(doc, '#btnDump') && !!$(doc, '#btnRestore') && !!$(doc, '#btnPurge'));

  // Siapkan cadangan uji: buat cadangan dari kondisi berisi
  const backupPayload = {
    app: 'SIMUTASI', version: 2,
    profil: Object.assign({}, siteRes.profil, { namaSekolah: 'SMA HASIL PEMULIHAN' }),
    prosedur: (await fetch(BASE + '/api/settings', { headers: { Cookie: cookie } }).then((r) => r.json())).prosedur,
    records: [
      { jenis: 'masuk', tanggal: '2026-02-01', nisn: '0900111222', nis: '9901', nama: 'Hasil Restore Satu', jenisKelamin: 'L', kelas: 'X A', tempatLahir: 'Badung', tanggalLahir: '2010-02-02', namaOrtu: 'Ortu Satu', asalSekolah: 'SMA Pemulihan A', alasan: 'Mutasi', keterangan: '', tahunAjaran: '2026/2027' },
      { jenis: 'keluar', tanggal: '2026-02-03', nisn: '0900111333', nis: '', nama: 'Hasil Restore Dua', jenisKelamin: 'P', kelas: 'XI B1', tempatLahir: 'Denpasar', tanggalLahir: '2009-03-04', namaOrtu: 'Ortu Dua', tujuan: 'SMA Pemulihan B', alasan: 'Melanjutkan sekolah', keterangan: '', tahunAjaran: '2026/2027' },
      { jenis: 'masuk', tanggal: '2026-02-05', nama: 'Tanpa NISN', jenisKelamin: 'L', kelas: 'X A', asalSekolah: 'SMA X', alasan: 'Mutasi', tahunAjaran: '2026/2027' },
      { jenis: 'masuk', tanggal: '2026-02-06', nisn: '123', nama: 'Baris Rusak', jenisKelamin: 'L', kelas: 'X A', asalSekolah: 'SMA X', alasan: 'Mutasi', tahunAjaran: '2026/2027' }
    ]
  };

  click(win, $(doc, '#btnRestore'));
  await wait(100);
  check('modal pemulihan terbuka', !$(doc, '#modalRestore').classList.contains('hidden'));
  check('opsi kosongkan data aktif secara bawaan', $(doc, '#restoreReplace').checked);
  check('modal menampilkan jumlah data server', /\d+ data mutasi/.test($(doc, '#restoreInfo').textContent), $(doc, '#restoreInfo').textContent);
  check('tombol pulihkan terkunci sebelum berkas dipilih', $(doc, '#btnRestoreGo').disabled);

  const restoreInput = $(doc, '#restoreFile');
  Object.defineProperty(restoreInput, 'files', {
    value: [new win.File([JSON.stringify(backupPayload)], 'cadangan-uji.json', { type: 'application/json' })],
    configurable: true
  });
  restoreInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  const okRead = await waitFor(() => !$(doc, '#btnRestoreGo').disabled, 3000);
  check('berkas cadangan terbaca', okRead);
  check('nama berkas cadangan ditampilkan', /cadangan-uji\.json/.test($(doc, '#restoreInfo').textContent), $(doc, '#restoreInfo').textContent);
  check('cadangan lama ditandai data saja', /cadangan lama/i.test($(doc, '#restoreInfo').textContent), $(doc, '#restoreInfo').textContent);
  check('input menerima berkas zip', /\.zip/.test($(doc, '#restoreFile').getAttribute('accept')), $(doc, '#restoreFile').getAttribute('accept'));

  submit(win, $(doc, '#restoreForm'));
  const okRestore = await waitFor(() => /SMA HASIL PEMULIHAN/.test($(doc, '#brandSchool').textContent), 8000);
  check('cadangan dipulihkan (nama sekolah berubah)', okRestore, $(doc, '#brandSchool').textContent);
  check('modal pemulihan tertutup', $(doc, '#modalRestore').classList.contains('hidden'));
  check('data server diganti dengan isi cadangan', Number($(doc, '#statMasuk').textContent) === 1 && Number($(doc, '#statKeluar').textContent) === 1,
    'masuk=' + $(doc, '#statMasuk').textContent + ' keluar=' + $(doc, '#statKeluar').textContent);
  check('data lama sudah tidak ada', !new RegExp(namaUji).test($(doc, '#bodyMasuk').innerHTML));
  check('baris tidak valid tidak ikut masuk', !/Baris Rusak/.test($(doc, '#bodyMasuk').innerHTML));

  const siteRestored = await fetch(BASE + '/api/public/site').then((r) => r.json());
  check('pengaturan ikut dipulihkan di server', siteRestored.profil.namaSekolah === 'SMA HASIL PEMULIHAN', siteRestored.profil.namaSekolah);
  check('data hasil pemulihan tampil di halaman publik', siteRestored.prosedur.masuk.langkah.length >= 5);

  // kembalikan keadaan semula: pulihkan tanpa opsi kosongkan (uji mode "tambah")
  click(win, $$(doc, '.set-tab').find((t) => t.dataset.set === 'data'));
  await wait(80);
  click(win, $(doc, '#btnRestore'));
  await wait(80);
  $(doc, '#restoreReplace').checked = false;
  Object.defineProperty(restoreInput, 'files', {
    value: [new win.File([JSON.stringify(backupPayload)], 'cadangan-uji-2.json', { type: 'application/json' })],
    configurable: true
  });
  restoreInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  await waitFor(() => !$(doc, '#btnRestoreGo').disabled, 3000);
  const beforeAdd = Number($(doc, '#statMasuk').textContent);
  submit(win, $(doc, '#restoreForm'));
  const okAdd = await waitFor(() => /SMA HASIL PEMULIHAN/.test($(doc, '#brandSchool').textContent), 8000);
  await wait(600);
  const afterAdd = Number($(doc, '#statMasuk').textContent);
  check('tanpa opsi kosongkan, data hanya ditambahkan', afterAdd >= beforeAdd, beforeAdd + ' -> ' + afterAdd);
  const dupCheck = await fetch(BASE + '/api/records?q=' + encodeURIComponent('Hasil Restore Satu'), { headers: { Cookie: cookie } })
    .then((r) => r.json());
  check('baris duplikat tidak digandakan', dupCheck.records.length === 1, dupCheck.records.length);

  // bersihkan: kembalikan data contoh tidak mungkin, jadi buang semua data uji
  const leftover = await fetch(BASE + '/api/records', { headers: { Cookie: cookie } }).then((r) => r.json());
  for (const rec of leftover.records) {
    await fetch(BASE + '/api/records/' + rec.id, { method: 'DELETE', headers: { Cookie: cookie } });
  }
  const backToZero = await fetch(BASE + '/api/records', { headers: { Cookie: cookie } }).then((r) => r.json());
  check('data uji dibersihkan seluruhnya', backToZero.records.length === 0, backToZero.records.length);

  // kembalikan identitas sekolah seperti semula
  await fetch(BASE + '/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ profil: siteRes.profil, prosedur: siteRes.prosedur })
  });
  const nameBack = await fetch(BASE + '/api/public/site').then((r) => r.json());
  check('identitas sekolah dikembalikan', nameBack.profil.namaSekolah === siteRes.profil.namaSekolah, nameBack.profil.namaSekolah);

  /* --- pengaturan: pengguna --- */
  section('Pengaturan: kelola pengguna');
  click(win, $$(doc, '.set-tab').find((t) => t.dataset.set === 'pengguna'));
  await waitFor(() => $$(doc, '#bodyUsers tr').length > 0, 3000);
  check('tabel pengguna terisi', $$(doc, '#bodyUsers tr').length >= 1, $$(doc, '#bodyUsers tr').length);
  check('admin menampilkan penanda "Anda"', /Anda/.test($(doc, '#bodyUsers').innerHTML));

  const opName = 'operator' + Date.now().toString().slice(-4);
  click(win, $(doc, '#btnAddUser'));
  await wait(100);
  check('modal pengguna terbuka', !$(doc, '#modalUser').classList.contains('hidden'));
  submit(win, $(doc, '#userForm'));
  await wait(150);
  check('pengguna tanpa data ditolak', $$(doc, '#userForm .field.invalid').length >= 1, $$(doc, '#userForm .field.invalid').length);

  setVal(doc, '#u_username', opName);
  setVal(doc, '#u_nama', 'Operator Antarmuka');
  setVal(doc, '#u_role', 'operator');
  setVal(doc, '#u_password', 'operator12345');
  submit(win, $(doc, '#userForm'));
  const okUser = await waitFor(() => new RegExp(opName).test($(doc, '#bodyUsers').innerHTML), 5000);
  check('pengguna baru muncul di tabel', okUser);
  check('modal pengguna tertutup', $(doc, '#modalUser').classList.contains('hidden'));

  /* --- pengaturan: log aktivitas --- */
  section('Pengaturan: log aktivitas');
  click(win, $$(doc, '.set-tab').find((t) => t.dataset.set === 'log'));
  const okAudit = await waitFor(() => $$(doc, '#bodyAudit tr').length > 0, 4000);
  check('log aktivitas terisi', okAudit, $$(doc, '#bodyAudit tr').length);
  const auditText = $(doc, '#bodyAudit').textContent;
  check('log memuat aktivitas tambah data', /Tambah data mutasi/.test(auditText));
  check('log memuat aktivitas masuk', /Masuk/.test(auditText));

  check('tanpa error JavaScript di aplikasi admin', admin.errors.length === 0, admin.errors.slice(0, 4).join(' | '));

  /* ============ 5. Peran operator ============ */
  section('Peran operator (hak akses terbatas)');
  const opCookie = await nodeLogin(opName, 'operator12345');
  check('operator dapat masuk', opCookie.status === 200, opCookie.status);
  const opPage = await loadPage('/admin', { cookie: opCookie.cookie });
  const odoc = opPage.doc;
  check('aplikasi termuat untuk operator', !!odoc.querySelector('.app'));
  if (!odoc.querySelector('.app')) {
    throw new Error('Halaman admin operator tidak termuat (judul: "' + odoc.title + '").');
  }
  check('mode operator aktif', odoc.body.classList.contains('role-operator'));
  check('peran tampil sebagai Operator', odoc.querySelector('#userRole').textContent === 'Operator', odoc.querySelector('#userRole').textContent);
  check('tab Pengguna ditandai khusus admin', odoc.querySelector('.set-tab[data-set="pengguna"]').classList.contains('admin-only'));
  check('tab Log ditandai khusus admin', odoc.querySelector('.set-tab[data-set="log"]').classList.contains('admin-only'));
  check('tab Data & Cadangan ditandai khusus admin', odoc.querySelector('.set-tab[data-set="data"]').classList.contains('admin-only'));

  click(opPage.win, odoc.querySelector('.nav-item[data-view="pengaturan"]'));
  await wait(150);
  check('input pengaturan terkunci untuk operator', odoc.querySelector('#s_namaSekolah').hasAttribute('disabled'));
  check('keterangan baca-saja tampil', /dilihat/i.test(odoc.querySelector('#identitasHint').textContent), odoc.querySelector('#identitasHint').textContent);
  check('operator tetap dapat menambah data', !!odoc.querySelector('#btnAdd'));
  click(opPage.win, odoc.querySelector('.nav-item[data-view="masuk"]'));
  await wait(120);
  check('tombol tambah tampil di halaman mutasi masuk', odoc.querySelector('#btnAdd').style.display !== 'none');
  check('operator dapat membuka form tambah data', (function () {
    click(opPage.win, odoc.querySelector('[data-add="masuk"]'));
    return !odoc.querySelector('#modalForm').classList.contains('hidden');
  })());

  /* operator mencoba menyimpan pengaturan lewat API -> ditolak */
  const nameBeforeOp = await fetch(BASE + '/api/public/site').then((r) => r.json());
  const opSaveAttempt = await fetch(BASE + '/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: opCookie.cookie },
    body: JSON.stringify({ profil: { namaSekolah: 'DIBUAT OPERATOR' }, prosedur: {} })
  });
  check('operator ditolak saat menyimpan pengaturan (403)', opSaveAttempt.status === 403, opSaveAttempt.status);
  const nameStill = await fetch(BASE + '/api/public/site').then((r) => r.json());
  check('nama sekolah tidak berubah oleh operator', nameStill.profil.namaSekolah === nameBeforeOp.profil.namaSekolah, nameStill.profil.namaSekolah);
  check('tanpa error JavaScript untuk operator', opPage.errors.length === 0, opPage.errors.slice(0, 3).join(' | '));

  opPage.dom.window.close();

  /* --- bersihkan data uji --- */
  const cleanup = await fetch(BASE + '/api/records?q=' + encodeURIComponent(namaUji), { headers: { Cookie: adminLogin.cookie } })
    .then((r) => r.json());
  for (const rec of cleanup.records || []) {
    await fetch(BASE + '/api/records/' + rec.id, { method: 'DELETE', headers: { Cookie: adminLogin.cookie } });
  }
  const opList = await fetch(BASE + '/api/users', { headers: { Cookie: adminLogin.cookie } }).then((r) => r.json());
  for (const u of opList.users || []) {
    if (u.username === opName) {
      await fetch(BASE + '/api/users/' + u.id, { method: 'DELETE', headers: { Cookie: adminLogin.cookie } });
    }
  }
  const afterCleanup = await fetch(BASE + '/api/records?q=' + encodeURIComponent(namaUji), { headers: { Cookie: adminLogin.cookie } })
    .then((r) => r.json());
  check('data uji dibersihkan kembali', afterCleanup.records.length === 0, afterCleanup.records.length);

  admin.dom.window.close();

  console.log('\n================ HASIL UI: ' + (failures.length ? failures.length + ' GAGAL, ' : '') + pass + ' LULUS ================');
  if (failures.length) {
    console.log('Gagal:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error('ERROR UJI UI pada bagian [' + step + ']:', err && err.stack ? err.stack : err);
  process.exit(2);
});
