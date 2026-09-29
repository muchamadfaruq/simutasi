/* Latihan backup & restore SIMUTASI.
 *
 *   node backup-drill.js seed   http://127.0.0.1:3000 admin <sandi>
 *       -> membuat data uji + 2 lampiran, mencetak ringkasan
 *   node backup-drill.js verify http://127.0.0.1:3000 admin <sandi>
 *       -> memeriksa data & lampiran masih utuh setelah dipulihkan
 *
 * Dipakai untuk membuktikan cadangan volume Docker (DEPLOY.md bagian 5)
 * benar-benar dapat dipulihkan.
 */

const crypto = require('crypto');

const mode = process.argv[2];
const BASE = process.argv[3] || 'http://127.0.0.1:3000';
const USER = process.argv[4] || 'admin';
const PASS = process.argv[5];

const NISN_A = '0511223300';
const NISN_B = '0511223311';

/* Isi berkas dibuat deterministik agar hash-nya dapat dibandingkan. */
function pdfBytes() {
  return Buffer.from('%PDF-1.4\n' + 'SIMUTASI-BACKUP-DRILL\n'.repeat(40) + '%%EOF\n', 'utf8');
}
function pngBytes() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64'
  );
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

let cookie = '';

async function req(method, path, body, isForm) {
  const headers = { Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (isForm) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  list.forEach((line) => {
    const pair = String(line).split(';')[0];
    if (/^simutasi_sid=/.test(pair)) cookie = pair;
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* bukan json */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function login() {
  const res = await req('POST', '/api/auth/login', { username: USER, password: PASS });
  if (res.status !== 200) {
    console.error('Gagal login:', res.status, res.text.slice(0, 150));
    process.exit(2);
  }
}

async function seed() {
  await login();

  const records = [
    { jenis: 'masuk', tanggal: '2026-03-01', nisn: NISN_A, nis: '9951', nama: 'Drill Backup Satu', jenisKelamin: 'L', kelas: 'X A', tempatLahir: 'Badung', tanggalLahir: '2010-05-05', namaOrtu: 'Ortu Drill', asalSekolah: 'SMA Drill A', alasan: 'Mutasi', keterangan: 'data latihan backup', tahunAjaran: '2026/2027' },
    { jenis: 'keluar', tanggal: '2026-03-02', nisn: NISN_B, nis: '', nama: 'Drill Backup Dua', jenisKelamin: 'P', kelas: 'XI B1', tempatLahir: 'Denpasar', tanggalLahir: '2009-06-06', namaOrtu: 'Ortu Drill Dua', tujuan: 'SMA Drill B', alasan: 'Melanjutkan sekolah', keterangan: 'data latihan backup', tahunAjaran: '2026/2027' }
  ];

  const ids = [];
  for (const rec of records) {
    const res = await req('POST', '/api/records', rec);
    if (res.status === 201) ids.push(res.json.record.id);
    else if (res.status === 409) {
      const found = await req('GET', '/api/records?q=' + rec.nisn);
      if (found.json.records.length) ids.push(found.json.records[0].id);
    } else {
      console.error('Gagal membuat data:', res.status, res.text.slice(0, 150));
      process.exit(2);
    }
  }

  const files = [
    { name: 'surat-drill.pdf', type: 'application/pdf', bytes: pdfBytes() },
    { name: 'bukti-drill.png', type: 'image/png', bytes: pngBytes() }
  ];

  for (const f of files) {
    const fd = new FormData();
    fd.append('files', new Blob([f.bytes], { type: f.type }), f.name);
    const res = await req('POST', '/api/records/' + ids[0] + '/attachments', fd, true);
    if (res.status !== 201) {
      console.error('Gagal mengunggah ' + f.name + ':', res.status, res.text.slice(0, 150));
      process.exit(2);
    }
  }

  const all = await req('GET', '/api/records');
  const att = await req('GET', '/api/attachments');
  console.log('DATA LATIHAN SIAP');
  console.log('  data mutasi   : ' + all.json.records.length);
  console.log('  berkas        : ' + att.json.attachments.length);
  console.log('  sha256 PDF    : ' + sha(pdfBytes()));
  console.log('  sha256 PNG    : ' + sha(pngBytes()));
}

async function verify() {
  await login();

  const a = await req('GET', '/api/records?q=' + NISN_A);
  const b = await req('GET', '/api/records?q=' + NISN_B);
  const att = await req('GET', '/api/attachments');

  const problems = [];
  if (a.json.records.length !== 1) problems.push('data masuk latihan tidak ditemukan');
  if (b.json.records.length !== 1) problems.push('data keluar latihan tidak ditemukan');

  const rec = a.json.records[0];
  if (rec) {
    if (rec.keterangan !== 'data latihan backup') problems.push('keterangan data berubah');
    if (rec.nama !== 'Drill Backup Satu') problems.push('nama data berubah');
  }

  const mine = (att.json.attachments || []).filter((x) => x.name.indexOf('drill') > -1);
  if (mine.length !== 2) problems.push('jumlah berkas latihan = ' + mine.length + ' (diharapkan 2)');

  const expect = { 'surat-drill.pdf': sha(pdfBytes()), 'bukti-drill.png': sha(pngBytes()) };
  for (const f of mine) {
    const res = await fetch(BASE + '/api/attachments/' + f.id + '/raw', { headers: { Cookie: cookie } });
    if (res.status !== 200) { problems.push(f.name + ' tidak dapat diunduh (' + res.status + ')'); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const actual = sha(buf);
    if (expect[f.name] !== actual) problems.push(f.name + ' isinya berbeda (sha256 tidak sama)');
    if (buf.length !== f.size) problems.push(f.name + ' ukurannya berbeda');
  }

  console.log('HASIL PEMERIKSAAN SETELAH PEMULIHAN');
  console.log('  data mutasi total : ' + (await req('GET', '/api/records')).json.records.length);
  console.log('  berkas total      : ' + (att.json.attachments || []).length);
  console.log('  berkas latihan    : ' + mine.length + '/2');

  if (problems.length) {
    console.log('\n  GAGAL:');
    problems.forEach((p) => console.log('   - ' + p));
    process.exit(1);
  }
  console.log('\n  OK - data dan lampiran utuh setelah dipulihkan.');
  process.exit(0);
}

if (mode === 'seed') seed().catch((e) => { console.error(e); process.exit(2); });
else if (mode === 'verify') verify().catch((e) => { console.error(e); process.exit(2); });
else {
  console.log('Pemakaian: node backup-drill.js seed|verify [baseUrl] [user] [sandi]');
  process.exit(2);
}
