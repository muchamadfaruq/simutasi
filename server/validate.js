'use strict';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  if (isNaN(d)) return false;
  return d.toISOString().slice(0, 10) === value;
}

/**
 * Validasi data mutasi. Mengembalikan {ok, errors}.
 * Aturan disamakan dengan validasi pada aplikasi (form) agar konsisten.
 */
function validateRecord(rec) {
  const errors = {};
  const r = rec || {};

  if (!String(r.nama || '').trim()) errors.nama = 'Nama wajib diisi.';
  else if (String(r.nama).trim().length > 120) errors.nama = 'Nama terlalu panjang (maks. 120 karakter).';

  if (['L', 'P'].indexOf(r.jenisKelamin) === -1) errors.jenisKelamin = 'Jenis kelamin harus L atau P.';

  const nisn = String(r.nisn || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(nisn)) errors.nisn = 'NISN harus 10 digit angka.';

  const nis = String(r.nis || '').replace(/\D/g, '');
  if (nis && nis.length > 12) errors.nis = 'NIS terlalu panjang.';

  if (!r.tanggal) errors.tanggal = 'Tanggal mutasi wajib diisi.';
  else if (!validDate(r.tanggal)) errors.tanggal = 'Format tanggal tidak valid (YYYY-MM-DD).';

  if (String(r.nomorSurat || '').length > 80) {
    errors.nomorSurat = 'Nomor surat maksimal 80 karakter.';
  }

  if (r.tanggalLahir && !validDate(r.tanggalLahir)) errors.tanggalLahir = 'Format tanggal lahir tidak valid.';

  if (!String(r.kelas || '').trim()) errors.kelas = 'Kelas wajib diisi.';
  if (!String(r.alasan || '').trim()) errors.alasan = 'Alasan mutasi wajib diisi.';
  if (!String(r.tahunAjaran || '').trim()) errors.tahunAjaran = 'Tahun ajaran wajib diisi.';

  const jenis = r.jenis === 'keluar' ? 'keluar' : 'masuk';
  if (jenis === 'masuk' && !String(r.asalSekolah || '').trim()) {
    errors.asalSekolah = 'Asal sekolah wajib diisi.';
  }
  if (jenis === 'keluar' && !String(r.tujuan || '').trim()) {
    errors.tujuan = 'Sekolah tujuan wajib diisi.';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function validateUser(input, { isNew }) {
  const errors = {};
  const u = input || {};
  const username = String(u.username || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    errors.username = 'Nama pengguna 3-32 karakter (huruf, angka, titik, garis bawah, atau strip).';
  }
  if (String(u.nama || '').trim().length > 80) errors.nama = 'Nama terlalu panjang.';
  if (['admin', 'operator'].indexOf(u.role) === -1) errors.role = 'Peran harus admin atau operator.';
  if (isNew && String(u.password || '').length < 8) errors.password = 'Sandi minimal 8 karakter.';
  if (!isNew && u.password && String(u.password).length < 8) errors.password = 'Sandi minimal 8 karakter.';
  return { ok: Object.keys(errors).length === 0, errors };
}

module.exports = { validateRecord, validateUser, validDate };
