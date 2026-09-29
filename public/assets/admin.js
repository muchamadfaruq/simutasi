/* ==========================================================
   SIMUTASI - Aplikasi Admin (terhubung ke API server)
   ========================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     0. Utilitas
     ------------------------------------------------------------------ */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function str(v) {
    if (v === undefined || v === null) return '';
    if (v instanceof Date) return isoOf(v);
    if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6).replace(/\.0+$/, '');
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isoOf(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function todayIso() { return isoOf(new Date()); }

  function fromIso(iso) {
    if (!iso) return null;
    var p = String(iso).split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d) ? null : d;
  }

  function fmtTanggal(iso) {
    var d = fromIso(iso);
    if (!d) return '&mdash;';
    return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtTanggalSingkat(iso) {
    var d = fromIso(iso);
    if (!d) return '&mdash;';
    return pad2(d.getDate()) + ' ' + BULAN_SINGKAT[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtBerkas(n) {
    if (!n && n !== 0) return '';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v : v.toFixed(1)) + ' ' + u[i];
  }

  function fmtWaktu(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return pad2(d.getDate()) + ' ' + BULAN_SINGKAT[d.getMonth()] + ' ' + d.getFullYear() +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ------------------------------------------------------------------
     1. Parsing tanggal
     ------------------------------------------------------------------ */
  var MONTH_INDEX = (function () {
    var m = {};
    for (var i = 0; i < 12; i++) {
      m[BULAN[i].toLowerCase()] = i + 1;
      m[BULAN_SINGKAT[i].toLowerCase()] = i + 1;
    }
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].forEach(function (x, i) { m[x] = i + 1; });
    m.mei = 5;
    return m;
  })();

  function monthIndex(name) {
    var k = String(name).toLowerCase();
    if (MONTH_INDEX[k]) return MONTH_INDEX[k];
    for (var i = 2; i <= k.length && i <= 4; i++) {
      if (MONTH_INDEX[k.slice(0, i)]) return MONTH_INDEX[k.slice(0, i)];
    }
    return 0;
  }

  function buildIso(y, m, d) {
    if (!y || !m || !d) return '';
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return '';
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  function parseAnyDate(v) {
    if (v === undefined || v === null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : isoOf(v);

    if (typeof v === 'number' && isFinite(v)) {
      if (v < 1000 || v > 80000) return '';
      var ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
      var dd = new Date(ms);
      return dd.getUTCFullYear() + '-' + pad2(dd.getUTCMonth() + 1) + '-' + pad2(dd.getUTCDate());
    }

    var s = String(v).trim();
    if (!s) return '';

    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return buildIso(+m[1], +m[2], +m[3]);

    s = s.replace(/(\d)([A-Za-z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2');
    s = s.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

    m = s.match(/^(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{4})$/);
    if (m) return buildIso(+m[3], +m[2], +m[1]);

    m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      var mi = monthIndex(m[2]);
      if (mi) return buildIso(+m[3], mi, +m[1]);
    }

    m = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
    if (m) {
      var mi2 = monthIndex(m[1]);
      if (mi2) return buildIso(+m[3], mi2, +m[2]);
    }
    return '';
  }

  /* ------------------------------------------------------------------
     2. API
     ------------------------------------------------------------------ */
  function api(method, url, body) {
    var init = { method: method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(url, init).then(function (res) {
      if (res.status === 401) {
        window.location.replace('/login.html?next=' + encodeURIComponent('/admin'));
        throw new Error('Sesi berakhir.');
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ('Permintaan gagal (' + res.status + ').'));
          err.status = res.status;
          err.fields = data.fields || null;
          err.rejected = data.rejected || null;
          throw err;
        }
        return data;
      });
    }, function () {
      // kegagalan jaringan (bukan kesalahan server)
      var err = new Error('Koneksi ke server terputus. Periksa jaringan lalu coba lagi.');
      err.offline = true;
      throw err;
    });
  }

  /* ------------------------------------------------------------------
     3. State
     ------------------------------------------------------------------ */
  var state = {
    user: null,
    profil: { daftarKelas: [], daftarAlasan: [] },
    prosedur: { masuk: {}, keluar: {} },
    records: [],
    referensi: { tahunAjaran: [], kelas: [], alasan: [] },
    users: [],
    audit: [],
    currentTA: 'ALL',
    currentView: 'dashboard',
    tableState: { masuk: { q: '', kelas: '', alasan: '' }, keluar: { q: '', kelas: '', alasan: '' } },
    form: { id: null, jenis: 'masuk', files: [], removed: [], kept: [] },
    detailId: null,
    userEditId: null,
    importPlan: [],
    importWb: null,
    busy: false
  };

  function isAdmin() { return state.user && state.user.role === 'admin'; }

  /* ------------------------------------------------------------------
     4. Toast & modal
     ------------------------------------------------------------------ */
  var ICO = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 17h12v4H6z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7"/><path d="M8 10h8M8 14h5"/><circle cx="18" cy="18" r="3"/></svg>'
  };

  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'err' ? ' err' : type === 'warn' ? ' warn' : '');
    el.innerHTML = (type === 'err' || type === 'warn' ? ICO.alert : ICO.check) + '<span>' + esc(msg) + '</span>';
    $('#toasts').appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, type === 'err' ? 6000 : 3200);
  }

  function openModal(id) {
    var panel = $('#userPanel');
    if (panel) panel.classList.add('hidden');
    $('#' + id).classList.remove('hidden');
  }
  function closeModal(id) { $('#' + id).classList.add('hidden'); }
  function closeAllModals() { $$('.modal-backdrop').forEach(function (m) { m.classList.add('hidden'); }); }

  var confirmCb = null;
  function askConfirm(title, sub, msg, cb) {
    $('#confirmTitle').textContent = title;
    $('#confirmSub').textContent = sub || '';
    $('#confirmMsg').innerHTML = msg;
    confirmCb = cb;
    openModal('modalConfirm');
  }

  /* ------------------------------------------------------------------
     5. Turunan data
     ------------------------------------------------------------------ */
  function tahunAjaranList() {
    var set = {};
    state.records.forEach(function (r) { if (r.tahunAjaran) set[r.tahunAjaran] = 1; });
    (state.referensi.tahunAjaran || []).forEach(function (t) { set[t] = 1; });
    if (state.profil.tahunAjaranAktif) set[state.profil.tahunAjaranAktif] = 1;
    return Object.keys(set).sort().reverse();
  }

  function inTA(r) { return state.currentTA === 'ALL' || r.tahunAjaran === state.currentTA; }
  function recFiltered(jenis) { return state.records.filter(function (r) { return r.jenis === jenis && inTA(r); }); }

  function sortByTanggal(list, desc) {
    return list.slice().sort(function (a, b) {
      var ta = a.tanggal || '', tb = b.tanggal || '';
      if (ta === tb) return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      if (!ta) return 1;
      if (!tb) return -1;
      return desc ? tb.localeCompare(ta) : ta.localeCompare(tb);
    });
  }

  function sortKelas(list) {
    return list.slice().sort(function (a, b) {
      var ra = String(a).replace(/(\d+)/g, function (m) { return pad2(+m); });
      var rb = String(b).replace(/(\d+)/g, function (m) { return pad2(+m); });
      return ra.localeCompare(rb);
    });
  }

  function kelasRef() {
    var set = {};
    (state.profil.daftarKelas || []).forEach(function (k) { set[k] = 1; });
    (state.referensi.kelas || []).forEach(function (k) { set[k] = 1; });
    return sortKelas(Object.keys(set));
  }

  function alasanRef() {
    var set = {};
    (state.profil.daftarAlasan || []).forEach(function (k) { set[k] = 1; });
    (state.referensi.alasan || []).forEach(function (k) { set[k] = 1; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }

  function countArsip() {
    return state.records.reduce(function (n, r) { return n + ((r.lampiran || []).length); }, 0);
  }

  /* ------------------------------------------------------------------
     6. Navigasi
     ------------------------------------------------------------------ */
  var VIEW_META = {
    dashboard: ['Dashboard', 'Ringkasan perpindahan siswa'],
    masuk: ['Mutasi Masuk', 'Data siswa pindah masuk'],
    keluar: ['Mutasi Keluar', 'Data siswa pindah keluar'],
    arsip: ['Arsip Surat', 'Berkas persyaratan mutasi siswa'],
    pengaturan: ['Pengaturan', 'Identitas sekolah, prosedur, dan pengguna']
  };

  function setView(view) {
    state.currentView = view;
    $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    $$('.view').forEach(function (s) { s.classList.add('hidden'); });
    var sec = $('#view-' + view);
    if (sec) sec.classList.remove('hidden');
    var meta = VIEW_META[view] || ['SIMUTASI', ''];
    $('#pageTitle').textContent = meta[0];
    $('#pageSub').textContent = meta[1];

    var addJenis = view === 'keluar' ? 'keluar' : 'masuk';
    $('#btnAdd').dataset.jenis = addJenis;
    $('#btnAddLabel').textContent = 'Tambah ' + (addJenis === 'masuk' ? 'Masuk' : 'Keluar');
    $('#btnAdd').style.display = view === 'pengaturan' ? 'none' : '';

    document.body.classList.remove('nav-open');
    if (view === 'dashboard') renderDashboard();
    if (view === 'masuk') renderTable('masuk');
    if (view === 'keluar') renderTable('keluar');
    if (view === 'arsip') renderArsip();
    if (view === 'pengaturan') fillSettingsForm();
  }

  function renderHeaderInfo() {
    $('#brandSchool').textContent = state.profil.namaSekolah || 'Sekolah';
    $('#footerTA').innerHTML = 'Tahun Ajaran ' + esc(state.profil.tahunAjaranAktif || '—');
    document.title = 'SIMUTASI — ' + (state.profil.namaSekolah || 'Sekolah');
    renderLogos();
    renderUserChip();
  }

  function initials(name) {
    var w = String(name || '').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    return ((w[0] || 'S')[0] + (w[1] || 'M')[0]).toUpperCase();
  }

  function logoBox(src, label) {
    if (src) return '<div class="logo has-img"><img src="' + esc(src) + '" alt="Logo"></div>';
    return label ? '<div class="logo">' + esc(label) + '</div>' : '';
  }

  /** Data URL gambar yang sudah divalidasi server (tanpa escape agar cepat). */
  function dataUrl(value) {
    return (typeof value === 'string' && value.indexOf('data:image/') === 0) ? value : '';
  }

  /** Kop surat: gambar unggahan (utama) atau susunan teks. */
  function kopHtml(profil) {
    var p = profil || {};

    if (String(p.kopMode) === 'gambar' && p.kopGambar) {
      return '<div class="kopgambar' + (p.kopGaris ? ' bergaris' : '') + '">' +
        '<img src="' + dataUrl(p.kopGambar) + '" alt="Kop Surat">' +
        '</div>';
    }

    var baris = function (teks) {
      return String(teks || '').split('\n')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    };
    var atas = baris(p.kopBarisAtas);
    var bawah = baris(p.kopBarisBawah);

    return '<div class="kop">' +
      logoBox(p.logo, initials(p.namaSekolah)) +
      '<div class="kop-text">' +
      atas.map(function (l) { return '<div class="l1">' + esc(l) + '</div>'; }).join('') +
      '<div class="l2">' + esc(p.namaSekolah || '') + '</div>' +
      bawah.map(function (l) { return '<div class="l4">' + esc(l) + '</div>'; }).join('') +
      '</div>' +
      logoBox(p.logoKanan, '') +
      '</div>';
  }

  function renderLogos() {
    var kiri = state.profil.logo
      ? '<img src="' + esc(state.profil.logo) + '" alt="Logo" style="width:100%;height:100%;object-fit:contain">'
      : esc(initials(state.profil.namaSekolah));
    var brand = $('#brandLogo');
    if (brand) brand.innerHTML = kiri;
    var prev = $('#logoPreview');
    if (prev) prev.innerHTML = kiri;
    var prevKanan = $('#logoKananPreview');
    if (prevKanan) {
      prevKanan.innerHTML = state.profil.logoKanan
        ? '<img src="' + esc(state.profil.logoKanan) + '" alt="Logo kanan" style="width:100%;height:100%;object-fit:contain">'
        : '—';
    }
    renderKopMode();
  }

  function renderKopImage() {
    var el = $('#kopGambarPreview');
    if (!el) return;
    el.innerHTML = state.profil.kopGambar
      ? '<img src="' + dataUrl(state.profil.kopGambar) + '" alt="Kop surat">'
      : '<span>belum ada gambar</span>';
  }

  /** Menampilkan panel sesuai jenis kop yang dipilih. */
  function renderKopMode() {
    var mode = kopModeTerpilih();
    var g = $('#kopPanelGambar'), t = $('#kopPanelTeks');
    if (g) g.classList.toggle('hidden', mode !== 'gambar');
    if (t) t.classList.toggle('hidden', mode !== 'teks');
    renderKopImage();
    renderKopPreview();
  }

  function kopModeTerpilih() {
    var radio = $('#kopModeGambar');
    if (!radio) return 'teks';
    return radio.checked ? 'gambar' : 'teks';
  }

  /** Pratinjau kop memakai isi form (termasuk perubahan yang belum disimpan). */
  function renderKopPreview() {
    var el = $('#kopPreview');
    if (!el) return;
    var mode = kopModeTerpilih();

    if (mode === 'gambar' && !state.profil.kopGambar) {
      el.innerHTML = '<div class="kop-kosong">Belum ada gambar kop yang diunggah.<br>' +
        '<small>Pilih berkas PNG/JPG pada kolom di atas.</small></div>';
      return;
    }

    el.innerHTML = kopHtml({
      kopMode: mode,
      kopGambar: state.profil.kopGambar,
      kopGaris: $('#s_kopGaris') ? $('#s_kopGaris').checked : state.profil.kopGaris,
      namaSekolah: $('#s_namaSekolah') ? $('#s_namaSekolah').value : state.profil.namaSekolah,
      kopBarisAtas: $('#s_kopBarisAtas') ? $('#s_kopBarisAtas').value : state.profil.kopBarisAtas,
      kopBarisBawah: $('#s_kopBarisBawah') ? $('#s_kopBarisBawah').value : state.profil.kopBarisBawah,
      logo: state.profil.logo,
      logoKanan: state.profil.logoKanan
    });
  }

  function renderUserChip() {
    var u = state.user;
    if (!u) return;
    $('#userName').textContent = u.nama || u.username;
    $('#userRole').textContent = u.role === 'admin' ? 'Administrator' : 'Operator';
    $('#userPanelName').textContent = u.nama || u.username;
    $('#userPanelRole').textContent = '@' + u.username + ' · ' + (u.role === 'admin' ? 'Administrator' : 'Operator');
    $('#userAvatar').textContent = (u.nama || u.username || 'A').charAt(0);
    document.body.classList.toggle('role-operator', u.role !== 'admin');
  }

  function fillTAFilter() {
    var sel = $('#filterTA');
    var list = tahunAjaranList();
    var html = '<option value="ALL">Semua tahun ajaran</option>';
    list.forEach(function (t) { html += '<option value="' + esc(t) + '">' + esc(t) + '</option>'; });
    sel.innerHTML = html;
    if (list.indexOf(state.currentTA) === -1) state.currentTA = 'ALL';
    sel.value = state.currentTA;
  }

  function fillDatalists() {
    $('#listKelas').innerHTML = kelasRef().map(function (k) { return '<option value="' + esc(k) + '">'; }).join('');
    $('#listAlasan').innerHTML = alasanRef().map(function (k) { return '<option value="' + esc(k) + '">'; }).join('');
  }

  function fillFilterSelects() {
    [['#fKelasMasuk', kelasRef()], ['#fKelasKeluar', kelasRef()],
    ['#fAlasanMasuk', alasanRef()], ['#fAlasanKeluar', alasanRef()]].forEach(function (pair) {
      var sel = $(pair[0]);
      if (!sel) return;
      var cur = sel.value;
      var isAlasan = pair[0].indexOf('Alasan') > -1;
      var html = '<option value="">' + (isAlasan ? 'Semua alasan' : 'Semua kelas') + '</option>';
      pair[1].forEach(function (v) { html += '<option value="' + esc(v) + '">' + esc(v) + '</option>'; });
      sel.innerHTML = html;
      if (pair[1].indexOf(cur) > -1) sel.value = cur;
    });
  }

  function renderCounters() {
    $('#cntMasuk').textContent = recFiltered('masuk').length;
    $('#cntKeluar').textContent = recFiltered('keluar').length;
    $('#cntArsip').textContent = countArsip();
  }

  function renderAll() {
    renderHeaderInfo();
    fillTAFilter();
    fillDatalists();
    fillFilterSelects();
    renderCounters();
    renderDashboard();
    renderTable('masuk');
    renderTable('keluar');
    renderArsip();
    fillSettingsForm();
  }

  /* ------------------------------------------------------------------
     7. Dashboard
     ------------------------------------------------------------------ */
  function renderDashboard() {
    var masuk = recFiltered('masuk'), keluar = recFiltered('keluar');
    $('#statMasuk').textContent = masuk.length;
    $('#statKeluar').textContent = keluar.length;
    var net = masuk.length - keluar.length;
    $('#statNet').textContent = (net > 0 ? '+' : '') + net;
    $('#statArsip').textContent = countArsip();

    var nAlasan = {};
    masuk.concat(keluar).forEach(function (r) { var a = r.alasan || '(tidak diisi)'; nAlasan[a] = (nAlasan[a] || 0) + 1; });
    var top = Object.keys(nAlasan).sort(function (a, b) { return nAlasan[b] - nAlasan[a]; })[0];
    $('#statMasukHint').textContent = top ? 'Terbanyak: ' + top : 'Belum ada data';

    var kelasSet = {};
    masuk.concat(keluar).forEach(function (r) { if (r.kelas) kelasSet[r.kelas] = 1; });
    $('#statKeluarHint').textContent = Object.keys(kelasSet).length + ' kelas terdampak';

    renderChartBulan(masuk, keluar);
    renderBarList('#chartAlasan', countField(masuk.concat(keluar), 'alasan'));
    renderBarList('#chartKelas', countField(masuk.concat(keluar), 'kelas'));

    var recent = sortByTanggal(masuk.concat(keluar), true).slice(0, 8);
    var body = $('#recentBody');
    if (!recent.length) {
      body.innerHTML = '<tr><td colspan="3"><div class="empty">' + ICO.empty + '<h4>Belum ada data</h4><p>Tambahkan data mutasi atau impor dari Excel.</p></div></td></tr>';
    } else {
      body.innerHTML = recent.map(function (r) {
        return '<tr>' +
          '<td><span class="badge ' + (r.jenis === 'masuk' ? 'blue' : 'amber') + '">' + (r.jenis === 'masuk' ? 'Masuk' : 'Keluar') + '</span></td>' +
          '<td><div class="cell-name">' + esc(r.nama) + '</div><div class="cell-sub">' + esc(r.kelas || '-') + ' · ' + esc((r.jenis === 'masuk' ? r.asalSekolah : r.tujuan) || '-') + '</div></td>' +
          '<td class="nowrap">' + fmtTanggalSingkat(r.tanggal) + '</td>' +
          '</tr>';
      }).join('');
    }
  }

  function countField(list, field) {
    var n = {};
    list.forEach(function (r) { var v = r[field] || '(tidak diisi)'; n[v] = (n[v] || 0) + 1; });
    return Object.keys(n).map(function (k) { return { label: k, value: n[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  function renderBarList(sel, items) {
    var el = $(sel);
    if (!items.length) {
      el.innerHTML = '<div class="empty" style="padding:26px">' + ICO.empty + '<h4>Belum ada data</h4></div>';
      return;
    }
    var max = items[0].value || 1;
    el.innerHTML = items.slice(0, 7).map(function (it) {
      return '<div class="bar-item">' +
        '<div class="bar-top"><b>' + esc(it.label) + '</b><span>' + it.value + ' siswa</span></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(4, Math.round(it.value / max * 100)) + '%"></div></div>' +
        '</div>';
    }).join('');
  }

  function bulanLabel(key) {
    var p = key.split('-');
    return BULAN_SINGKAT[(+p[1]) - 1] + " '" + p[0].slice(2);
  }

  function monthKeys() {
    if (state.currentTA !== 'ALL') {
      var p = state.currentTA.split('/');
      var y1 = parseInt(p[0], 10), y2 = parseInt(p[1], 10);
      if (y1 && y2) {
        var out = [];
        for (var m = 7; m <= 12; m++) out.push(y1 + '-' + pad2(m));
        for (var m2 = 1; m2 <= 6; m2++) out.push(y2 + '-' + pad2(m2));
        return out;
      }
    }
    var set = {};
    state.records.filter(inTA).forEach(function (r) { if (r.tanggal) set[r.tanggal.slice(0, 7)] = 1; });
    var keys = Object.keys(set).sort();
    if (keys.length > 12) keys = keys.slice(-12);
    return keys;
  }

  function renderChartBulan(masuk, keluar) {
    var keys = monthKeys();
    var buckets = {};
    keys.forEach(function (k) { buckets[k] = { masuk: 0, keluar: 0, label: bulanLabel(k) }; });
    function push(list, prop) {
      list.forEach(function (r) {
        if (!r.tanggal) return;
        var k = r.tanggal.slice(0, 7);
        if (!buckets[k]) { buckets[k] = { masuk: 0, keluar: 0, label: bulanLabel(k) }; keys.push(k); }
        buckets[k][prop]++;
      });
    }
    push(masuk, 'masuk');
    push(keluar, 'keluar');
    keys.sort();
    if (!keys.length) {
      $('#chartBulan').innerHTML = '<div class="empty" style="width:100%">' + ICO.empty + '<h4>Belum ada data</h4><p>Grafik akan muncul setelah ada data mutasi.</p></div>';
      return;
    }
    var max = 1;
    keys.forEach(function (k) { max = Math.max(max, buckets[k].masuk, buckets[k].keluar); });
    $('#chartBulan').innerHTML = keys.map(function (k) {
      var b = buckets[k];
      return '<div class="chart-col">' +
        '<div class="chart-bars">' +
        '<div class="chart-bar in" style="height:' + (b.masuk ? Math.max(4, b.masuk / max * 100) : 0) + '%" title="Masuk: ' + b.masuk + '"></div>' +
        '<div class="chart-bar out" style="height:' + (b.keluar ? Math.max(4, b.keluar / max * 100) : 0) + '%" title="Keluar: ' + b.keluar + '"></div>' +
        '</div><span>' + esc(b.label) + '</span></div>';
    }).join('');
  }

  /* ------------------------------------------------------------------
     8. Tabel
     ------------------------------------------------------------------ */
  function tableRows(jenis) {
    var st = state.tableState[jenis];
    var list = recFiltered(jenis).filter(function (r) {
      if (st.kelas && r.kelas !== st.kelas) return false;
      if (st.alasan && r.alasan !== st.alasan) return false;
      if (st.q) {
        var hay = [r.nama, r.nisn, r.nis, r.nomorSurat, r.kelas, r.alasan,
          r.jenis === 'masuk' ? r.asalSekolah : r.tujuan, r.namaOrtu, r.keterangan]
          .join(' ').toLowerCase();
        if (hay.indexOf(st.q.toLowerCase()) === -1) return false;
      }
      return true;
    });
    return sortByTanggal(list, true);
  }

  function renderTable(jenis) {
    var rows = tableRows(jenis);
    var body = $(jenis === 'masuk' ? '#bodyMasuk' : '#bodyKeluar');
    var info = $(jenis === 'masuk' ? '#infoMasuk' : '#infoKeluar');
    info.textContent = rows.length + ' siswa' + (state.currentTA === 'ALL' ? '' : ' · TA ' + state.currentTA);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="10"><div class="empty">' + ICO.empty +
        '<h4>Belum ada data mutasi ' + (jenis === 'masuk' ? 'masuk' : 'keluar') + '</h4>' +
        '<p>Klik tombol tambah atau impor dari berkas Excel.</p></div></td></tr>';
      return;
    }

    body.innerHTML = rows.map(function (r, i) {
      var files = r.lampiran || [];
      var chips = files.slice(0, 2).map(function (f) {
        return '<a class="chip-file" href="/api/attachments/' + esc(f.id) + '/raw" target="_blank" rel="noopener" title="' +
          esc(f.name) + '">' + ICO.file + '<span>' + esc(f.name) + '</span></a>';
      }).join(' ');
      if (files.length > 2) chips += ' <span class="badge gray">+' + (files.length - 2) + '</span>';
      if (!files.length) chips = '<span style="color:var(--ink-300)">—</span>';

      return '<tr data-id="' + esc(r.id) + '">' +
        '<td class="mono">' + (i + 1) + '</td>' +
        '<td class="nowrap">' + fmtTanggalSingkat(r.tanggal) + '</td>' +
        '<td>' + (r.nomorSurat
          ? '<span class="mono">' + esc(r.nomorSurat) + '</span>'
          : '<span class="badge gray" title="Nomor surat belum diisi">belum</span>') + '</td>' +
        '<td><div class="cell-name">' + esc(r.nama) + '</div>' +
        '<div class="cell-sub mono">NISN ' + esc(r.nisn || '-') + ' · NIS ' + esc(r.nis || '-') + '</div></td>' +
        '<td><span class="badge gray">' + esc(r.jenisKelamin || '-') + '</span></td>' +
        '<td><span class="badge">' + esc(r.kelas || '-') + '</span></td>' +
        '<td>' + esc((jenis === 'masuk' ? r.asalSekolah : r.tujuan) || '—') + '</td>' +
        '<td>' + (r.alasan ? '<span class="badge gray">' + esc(r.alasan) + '</span>' : '—') + '</td>' +
        '<td>' + chips + '</td>' +
        '<td class="actions">' +
        '<button class="btn btn-icon" data-act="detail" title="Detail">' + ICO.eye + '</button>' +
        '<button class="btn btn-icon" data-act="edit" title="Edit">' + ICO.edit + '</button>' +
        '<button class="btn btn-icon" data-act="print" title="Cetak surat">' + ICO.print + '</button>' +
        '<button class="btn btn-icon" data-act="del" title="Hapus">' + ICO.trash + '</button>' +
        '</td></tr>';
    }).join('');
  }

  /* ------------------------------------------------------------------
     9. Arsip
     ------------------------------------------------------------------ */
  function renderArsip() {
    var q = ($('#qArsip').value || '').trim().toLowerCase();
    var rows = [];
    state.records.forEach(function (r) {
      (r.lampiran || []).forEach(function (f) {
        var hay = (f.name + ' ' + r.nama + ' ' + r.kelas + ' ' + ((r.jenis === 'masuk' ? r.asalSekolah : r.tujuan) || '')).toLowerCase();
        if (q && hay.indexOf(q) === -1) return;
        rows.push({ rec: r, file: f });
      });
    });
    rows.sort(function (a, b) { return String(b.rec.tanggal || '').localeCompare(String(a.rec.tanggal || '')); });
    $('#infoArsip').textContent = rows.length + ' berkas';

    if (!rows.length) {
      $('#arsipList').innerHTML = '<div class="empty">' + ICO.empty + '<h4>Belum ada berkas</h4><p>Unggah lampiran pada form data mutasi.</p></div>';
      return;
    }
    $('#arsipList').innerHTML = rows.map(function (x) {
      var f = x.file, r = x.rec;
      var ext = (f.name.split('.').pop() || '').toUpperCase().slice(0, 4);
      var isImg = /^image\//.test(f.type || '');
      return '<div class="arsip-row">' +
        '<div class="arsip-ico' + (isImg ? ' img' : '') + '">' + esc(ext) + '</div>' +
        '<div class="arsip-meta"><b>' + esc(f.name) + '</b>' +
        '<span>' + esc(r.nama) + ' · ' + esc(r.kelas || '-') + ' · ' +
        (r.jenis === 'masuk' ? 'Masuk dari ' : 'Keluar ke ') + esc((r.jenis === 'masuk' ? r.asalSekolah : r.tujuan) || '-') +
        ' · ' + fmtTanggalSingkat(r.tanggal) + (f.size ? ' · ' + fmtBerkas(f.size) : '') + '</span></div>' +
        '<a class="btn btn-ghost btn-sm" href="/api/attachments/' + esc(f.id) + '/raw" target="_blank" rel="noopener">' + ICO.eye + ' Buka</a>' +
        '<button class="btn btn-ghost btn-sm" data-goto-rec="' + esc(r.id) + '">Detail siswa</button>' +
        '</div>';
    }).join('');
  }

  /* ------------------------------------------------------------------
     10. Form data mutasi
     ------------------------------------------------------------------ */
  function setFieldInvalid(id, bad) {
    var el = $('#' + id);
    if (!el) return !bad;
    var f = el.closest('.field');
    if (f) f.classList.toggle('invalid', !!bad);
    return !bad;
  }

  function clearInvalid() {
    $$('#recordForm .field.invalid').forEach(function (f) { f.classList.remove('invalid'); });
  }

  function openForm(jenis, id) {
    var r = id ? state.records.filter(function (x) { return x.id === id; })[0] : null;
    state.form = { id: id || null, jenis: jenis, files: [], removed: [], kept: r && r.lampiran ? r.lampiran.slice() : [] };
    clearInvalid();
    $('#formFiles').innerHTML = '';

    $('#formTitle').textContent = (r ? 'Edit' : 'Tambah') + ' Mutasi ' + (jenis === 'masuk' ? 'Masuk' : 'Keluar');
    $('#formSub').textContent = r ? 'Perbarui data siswa lalu simpan' : 'Lengkapi data siswa yang berpindah';
    $('#btnFormDelete').style.display = r ? '' : 'none';
    $('#labelSekolahLawan').innerHTML = (jenis === 'masuk' ? 'Asal Sekolah' : 'Sekolah Tujuan') + ' <span class="req">*</span>';
    $('#f_sekolahLawan').placeholder = jenis === 'masuk' ? 'mis. SMA Negeri 1 Contoh' : 'mis. SMA Negeri 2 Contoh';

    var v = r || { jenis: jenis, tahunAjaran: state.profil.tahunAjaranAktif, tanggal: todayIso() };
    $('#f_nama').value = v.nama || '';
    $('#f_jenisKelamin').value = v.jenisKelamin || '';
    $('#f_nisn').value = v.nisn || '';
    $('#f_nis').value = v.nis || '';
    $('#f_tempatLahir').value = v.tempatLahir || '';
    $('#f_tanggalLahir').value = v.tanggalLahir || '';
    $('#f_namaOrtu').value = v.namaOrtu || '';
    $('#f_tanggal').value = v.tanggal || todayIso();
    $('#f_nomorSurat').value = v.nomorSurat || '';
    $('#f_kelas').value = v.kelas || '';
    $('#f_sekolahLawan').value = ((jenis === 'masuk' ? v.asalSekolah : v.tujuan) || '');
    $('#f_alasan').value = v.alasan || '';
    $('#f_tahunAjaran').value = v.tahunAjaran || state.profil.tahunAjaranAktif;
    $('#f_keterangan').value = v.keterangan || '';
    $('#f_files').value = '';
    renderFormFiles();
    openModal('modalForm');
    setTimeout(function () { $('#f_nama').focus(); }, 60);
  }

  function renderFormFiles() {
    var el = $('#formFiles');
    var kept = state.form.kept.map(function (f) {
      return '<div class="arsip-row" style="padding:9px 14px">' +
        '<div class="arsip-ico' + (/^image\//.test(f.type || '') ? ' img' : '') + '">' + esc((f.name.split('.').pop() || '').toUpperCase().slice(0, 4)) + '</div>' +
        '<div class="arsip-meta"><b>' + esc(f.name) + '</b><span>Tersimpan di server' + (f.size ? ' · ' + fmtBerkas(f.size) : '') + '</span></div>' +
        '<a class="btn btn-ghost btn-sm" href="/api/attachments/' + esc(f.id) + '/raw" target="_blank" rel="noopener">Buka</a>' +
        '<button type="button" class="btn btn-icon" data-rm-file="' + esc(f.id) + '" title="Hapus berkas">' + ICO.trash + '</button>' +
        '</div>';
    }).concat(state.form.files.map(function (f, i) {
      return '<div class="arsip-row" style="padding:9px 14px">' +
        '<div class="arsip-ico' + (/^image\//.test(f.type || '') ? ' img' : '') + '">' + esc((f.name.split('.').pop() || '').toUpperCase().slice(0, 4)) + '</div>' +
        '<div class="arsip-meta"><b>' + esc(f.name) + '</b><span>Berkas baru · ' + fmtBerkas(f.size) + '</span></div>' +
        '<button type="button" class="btn btn-icon" data-rm-pending="' + i + '" title="Batal">' + ICO.trash + '</button>' +
        '</div>';
    })).join('');
    el.innerHTML = kept || '<div style="padding:12px 14px;font-size:12.5px;color:var(--ink-500)">Belum ada lampiran.</div>';
  }

  function collectForm() {
    var rec = {
      jenis: state.form.jenis,
      nama: $('#f_nama').value.trim(),
      jenisKelamin: $('#f_jenisKelamin').value,
      nisn: $('#f_nisn').value.replace(/\D/g, ''),
      nis: $('#f_nis').value.replace(/\D/g, ''),
      tempatLahir: $('#f_tempatLahir').value.trim(),
      tanggalLahir: $('#f_tanggalLahir').value,
      namaOrtu: $('#f_namaOrtu').value.trim(),
      tanggal: $('#f_tanggal').value,
      nomorSurat: $('#f_nomorSurat').value.trim(),
      kelas: $('#f_kelas').value.trim(),
      alasan: $('#f_alasan').value.trim(),
      tahunAjaran: $('#f_tahunAjaran').value.trim() || state.profil.tahunAjaranAktif,
      keterangan: $('#f_keterangan').value.trim(),
      asalSekolah: '',
      tujuan: ''
    };
    var lawan = $('#f_sekolahLawan').value.trim();
    if (rec.jenis === 'masuk') rec.asalSekolah = lawan; else rec.tujuan = lawan;
    return rec;
  }

  function validateForm(rec) {
    clearInvalid();
    var ok = true;
    ok = setFieldInvalid('f_nama', !rec.nama) && ok;
    ok = setFieldInvalid('f_jenisKelamin', !rec.jenisKelamin) && ok;
    ok = setFieldInvalid('f_nisn', !/^\d{10}$/.test(rec.nisn)) && ok;
    ok = setFieldInvalid('f_nis', rec.nis && !/^\d+$/.test(rec.nis)) && ok;
    ok = setFieldInvalid('f_tanggal', !rec.tanggal) && ok;
    ok = setFieldInvalid('f_nomorSurat', rec.nomorSurat.length > 80) && ok;
    ok = setFieldInvalid('f_kelas', !rec.kelas) && ok;
    ok = setFieldInvalid('f_sekolahLawan', !(rec.asalSekolah || rec.tujuan)) && ok;
    ok = setFieldInvalid('f_alasan', !rec.alasan) && ok;
    ok = setFieldInvalid('f_tahunAjaran', !rec.tahunAjaran) && ok;
    return ok;
  }

  function applyServerErrors(fields) {
    if (!fields) return;
    var map = { asalSekolah: 'f_sekolahLawan', tujuan: 'f_sekolahLawan' };
    Object.keys(fields).forEach(function (key) {
      var id = map[key] || ('f_' + key);
      if (!setFieldInvalid(id, true)) return;
      var el = $('#' + id);
      if (el) {
        var f = el.closest('.field');
        var err = f && f.querySelector('.err');
        if (err) err.textContent = fields[key];
      }
    });
  }

  function setFormBusy(on) {
    state.busy = on;
    var btn = $('#btnFormSave');
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spin"></span> Menyimpan…' : 'Simpan';
  }

  function saveForm() {
    if (state.busy) return;
    var rec = collectForm();
    if (!validateForm(rec)) { toast('Periksa kembali kolom yang ditandai merah.', 'err'); return; }

    setFormBusy(true);
    var editingId = state.form.id;

    var request = editingId
      ? api('PUT', '/api/records/' + encodeURIComponent(editingId), rec)
      : api('POST', '/api/records', rec);

    var uploadResult = null;

    request.then(function (res) {
      var recordId = res.record.id;
      var tasks = state.form.removed.map(function (id) {
        return api('DELETE', '/api/attachments/' + encodeURIComponent(id));
      });

      if (state.form.files.length) {
        var fd = new FormData();
        state.form.files.forEach(function (f) { fd.append('files', f); });
        tasks.push(api('POST', '/api/records/' + encodeURIComponent(recordId) + '/attachments', fd)
          .then(function (r) { uploadResult = r; }));
      }
      return Promise.all(tasks).then(function () { return res.record; });
    }).then(function (rec2) {
      var rejected = (uploadResult && uploadResult.rejected) || [];
      return reloadRecords().then(function () {
        closeModal('modalForm');
        setFormBusy(false);
        if (rejected.length) {
          toast(rejected.length + ' berkas ditolak: ' + rejected.map(function (r) { return r.name + ' (' + r.reason + ')'; }).join('; '), 'warn');
        }
        toast(editingId ? 'Perubahan data disimpan.' : 'Data mutasi berhasil ditambahkan.');
      });
    }).catch(function (err) {
      setFormBusy(false);
      if (err.fields) {
        applyServerErrors(err.fields);
        toast('Periksa kembali kolom yang ditandai merah.', 'err');
        return;
      }
      if (err.status === 409) { setFieldInvalid('f_nisn', true); }
      toast(err.message, 'err');
    });
  }

  function deleteRecord(id) {
    var r = state.records.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    askConfirm('Hapus Data Mutasi', r.nama,
      'Data mutasi <b>' + esc(r.nama) + '</b> beserta <b>' + ((r.lampiran || []).length) + ' berkas</b> lampirannya akan dihapus permanen dari server.',
      function () {
        api('DELETE', '/api/records/' + encodeURIComponent(id)).then(function () {
          toast('Data mutasi dihapus.');
          return reloadRecords();
        }).catch(function (e) { toast(e.message, 'err'); });
      });
  }

  /* ------------------------------------------------------------------
     11. Detail
     ------------------------------------------------------------------ */
  function openDetail(id) {
    var r = state.records.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    state.detailId = id;
    var isMasuk = r.jenis === 'masuk';
    $('#detailTitle').textContent = r.nama;
    $('#detailSub').textContent = 'Mutasi ' + (isMasuk ? 'Masuk' : 'Keluar') + ' · TA ' + (r.tahunAjaran || '-');

    var rows = [
      ['Nomor Surat', r.nomorSurat],
      ['NISN', r.nisn], ['NIS', r.nis],
      ['Jenis Kelamin', r.jenisKelamin === 'L' ? 'Laki-laki' : r.jenisKelamin === 'P' ? 'Perempuan' : ''],
      ['Kelas', r.kelas], ['Tempat Lahir', r.tempatLahir],
      ['Tanggal Lahir', r.tanggalLahir ? fmtTanggal(r.tanggalLahir) : ''],
      ['Nama Orang Tua', r.namaOrtu],
      [isMasuk ? 'Asal Sekolah' : 'Sekolah Tujuan', isMasuk ? r.asalSekolah : r.tujuan],
      ['Tanggal Mutasi', r.tanggal ? fmtTanggal(r.tanggal) : ''],
      ['Alasan', r.alasan], ['Keterangan', r.keterangan]
    ];
    var dl = rows.map(function (x) {
      return '<dt>' + esc(x[0]) + '</dt><dd>' + (x[1] ? esc(x[1]) : '<span style="color:var(--ink-300)">—</span>') + '</dd>';
    }).join('');

    var files = r.lampiran || [];
    var fl = files.length ? '<div class="section-title">Lampiran (' + files.length + ')</div><div class="arsip-list" style="border:1px solid var(--line);border-radius:8px">' +
      files.map(function (f) {
        return '<div class="arsip-row" style="padding:10px 14px">' +
          '<div class="arsip-ico' + (/^image\//.test(f.type || '') ? ' img' : '') + '">' + esc((f.name.split('.').pop() || '').toUpperCase().slice(0, 4)) + '</div>' +
          '<div class="arsip-meta"><b>' + esc(f.name) + '</b><span>' + fmtBerkas(f.size) + '</span></div>' +
          '<a class="btn btn-ghost btn-sm" href="/api/attachments/' + esc(f.id) + '/raw" target="_blank" rel="noopener">Buka</a>' +
          '</div>';
      }).join('') + '</div>' : '';

    $('#detailBody').innerHTML = '<dl class="detail-list">' + dl + '</dl>' + fl;
    openModal('modalDetail');
  }

  /* ------------------------------------------------------------------
     12. Cetak
     ------------------------------------------------------------------ */
  var printToken = 0;
  function printHTML(html) {
    var area = $('#printArea');
    var token = ++printToken;
    area.innerHTML = html;
    document.body.classList.add('printing');
    setTimeout(function () {
      if (token !== printToken) return;
      window.print();
      setTimeout(function () {
        if (token !== printToken) return;
        document.body.classList.remove('printing');
        area.innerHTML = '';
      }, 400);
    }, 60);
  }

  function kopSurat() { return kopHtml(state.profil); }

  /** Nomor surat cadangan bila belum diisi manual. */
  function nomorOtomatis(r) {
    return '......./' + (r.jenis === 'masuk' ? 'MASUK' : 'KELUAR') + '/' +
      String(state.profil.namaSekolah || '').replace(/\s+/g, ' ').toUpperCase() + '/' +
      String(r.tahunAjaran || state.profil.tahunAjaranAktif || '').replace('/', '-');
  }

  function ttdSurat(tanggalIso) {
    return '<div class="ttd">' +
      '<div>' + esc(state.profil.kotaTandaTangan) + ', ' + fmtTanggal(tanggalIso || todayIso()) + '</div>' +
      '<div>Kepala ' + esc(state.profil.namaSekolah) + '</div>' +
      '<div class="ruang"></div>' +
      '<div class="nama">' + esc(state.profil.kepsek) + '</div>' +
      (state.profil.pangkatKepsek ? '<div>' + esc(state.profil.pangkatKepsek) + '</div>' : '') +
      '<div>NIP. ' + esc(state.profil.nipKepsek) + '</div>' +
      '</div>';
  }

  function cetakSurat(id) {
    var r = state.records.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var isMasuk = r.jenis === 'masuk';
    var judul = isMasuk ? 'SURAT KETERANGAN PENERIMAAN SISWA PINDAHAN' : 'SURAT KETERANGAN PINDAH SEKOLAH';
    var nomor = r.nomorSurat ? esc(r.nomorSurat) : esc(nomorOtomatis(r));

    var ident = '<table class="identitas">' +
      '<tr><td class="k">Nama</td><td class="s">:</td><td>' + esc(r.nama) + '</td></tr>' +
      '<tr><td class="k">Jenis Kelamin</td><td class="s">:</td><td>' + (r.jenisKelamin === 'L' ? 'Laki-laki' : r.jenisKelamin === 'P' ? 'Perempuan' : '-') + '</td></tr>' +
      '<tr><td class="k">NISN</td><td class="s">:</td><td>' + esc(r.nisn || '-') + '</td></tr>' +
      (r.nis ? '<tr><td class="k">NIS</td><td class="s">:</td><td>' + esc(r.nis) + '</td></tr>' : '') +
      '<tr><td class="k">Tempat / Tanggal Lahir</td><td class="s">:</td><td>' + esc(r.tempatLahir || '-') + ', ' + (r.tanggalLahir ? fmtTanggal(r.tanggalLahir) : '-') + '</td></tr>' +
      '<tr><td class="k">Kelas</td><td class="s">:</td><td>' + esc(r.kelas || '-') + '</td></tr>' +
      '<tr><td class="k">Nama Orang Tua/Wali</td><td class="s">:</td><td>' + esc(r.namaOrtu || '-') + '</td></tr>' +
      '<tr><td class="k">' + (isMasuk ? 'Asal Sekolah' : 'Sekolah Tujuan') + '</td><td class="s">:</td><td>' + esc((isMasuk ? r.asalSekolah : r.tujuan) || '-') + '</td></tr>' +
      '<tr><td class="k">Tanggal Mutasi</td><td class="s">:</td><td>' + fmtTanggal(r.tanggal) + '</td></tr>' +
      '<tr><td class="k">Alasan</td><td class="s">:</td><td>' + esc(r.alasan || '-') + '</td></tr>' +
      '</table>';

    var kalimat1 = isMasuk
      ? 'Yang bertanda tangan di bawah ini, Kepala ' + esc(state.profil.namaSekolah) + ', dengan ini menerangkan bahwa siswa tersebut di bawah ini telah diterima sebagai siswa pindahan pada ' + esc(state.profil.namaSekolah) + ' dengan data sebagai berikut:'
      : 'Yang bertanda tangan di bawah ini, Kepala ' + esc(state.profil.namaSekolah) + ', dengan ini menerangkan bahwa siswa tersebut di bawah ini telah mengajukan pindah sekolah dengan data sebagai berikut:';
    var kalimat2 = isMasuk
      ? 'Demikian surat keterangan ini dibuat berdasarkan berkas yang diterima, untuk dapat dipergunakan sebagaimana mestinya.'
      : 'Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya oleh sekolah yang bersangkutan.';

    printHTML('<div class="surat">' + kopSurat() +
      '<h2 class="judul">' + judul + '</h2>' +
      '<div class="nomor">Nomor : ' + nomor + '</div>' +
      '<p class="kalimat">' + kalimat1 + '</p>' + ident +
      '<p class="kalimat">' + kalimat2 + '</p>' +
      ttdSurat(r.tanggal) +
      '<div class="tembusan"><div>Tembusan disampaikan kepada :</div><ol>' +
      '<li>Kepala Dinas Pendidikan, Kepemudaan dan Olahraga Provinsi Bali;</li>' +
      '<li>Kepala ' + esc(isMasuk ? (r.asalSekolah || '-') : (r.tujuan || '-')) + ';</li>' +
      '<li>Arsip.</li>' +
      '</ol></div></div>');
  }

  function cetakRekap(jenis) {
    var rows = tableRows(jenis);
    if (!rows.length) { toast('Tidak ada data untuk dicetak.', 'warn'); return; }
    var isMasuk = jenis === 'masuk';
    var TH = '<th style="border:1px solid #000;padding:4px 5px;background:#eee;text-align:left">';
    var TD = '<td style="border:1px solid #000;padding:4px 5px;vertical-align:top">';
    var head = '<tr>' + TH + 'No</th>' + TH + 'Tanggal</th>' + TH + 'No. Surat</th>' + TH + 'NISN</th>' + TH + 'Nama</th>' +
      TH + 'L/P</th>' + TH + 'Kelas</th>' + TH + (isMasuk ? 'Asal Sekolah' : 'Sekolah Tujuan') + '</th>' + TH + 'Alasan</th></tr>';
    var body = rows.map(function (r, i) {
      return '<tr>' + TD + (i + 1) + '</td>' + TD + (r.tanggal ? fmtTanggalSingkat(r.tanggal) : '-') + '</td>' +
        TD + esc(r.nomorSurat || '-') + '</td>' +
        TD + esc(r.nisn || '-') + '</td>' + TD + esc(r.nama) + '</td>' + TD + esc(r.jenisKelamin || '-') + '</td>' +
        TD + esc(r.kelas || '-') + '</td>' + TD + esc((isMasuk ? r.asalSekolah : r.tujuan) || '-') + '</td>' +
        TD + esc(r.alasan || '-') + '</td></tr>';
    }).join('');

    printHTML('<div class="surat">' + kopSurat() +
      '<h2 class="judul">DAFTAR MUTASI SISWA ' + (isMasuk ? 'PINDAH MASUK' : 'PINDAH KELUAR') + '</h2>' +
      '<div class="nomor">Tahun Ajaran ' + esc(state.currentTA === 'ALL' ? 'Semua' : state.currentTA) + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:10.5pt">' +
      '<thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
      '<p style="margin-top:14px">Jumlah : ' + rows.length + ' siswa</p>' +
      ttdSurat(todayIso()) + '</div>');
  }

  /* ------------------------------------------------------------------
     13. Pengaturan
     ------------------------------------------------------------------ */
  var setTab = 'identitas';

  function setSetTab(tab) {
    setTab = tab;
    $$('.set-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.set === tab); });
    $$('.set-panel').forEach(function (p) {
      var match = p.id === 'set-' + tab;
      p.classList.toggle('hidden', !match || (p.classList.contains('admin-only') && !isAdmin()));
    });
    $('#saveBar').style.display = (tab === 'identitas' || tab === 'prosedur' || tab === 'referensi') ? '' : 'none';
    if (tab === 'pengguna') loadUsers();
    if (tab === 'log') loadAudit();
    if (tab === 'referensi') renderReferensiInfo();
  }

  function renderReferensiInfo() {
    var el = $('#referensiInfo');
    if (!el) return;
    el.innerHTML = 'Data saat ini di server: <b>' + state.records.length + '</b> data mutasi · ' +
      '<b>' + (state.referensi.tahunAjaran || []).length + '</b> tahun ajaran · ' +
      '<b>' + kelasRef().length + '</b> kelas · ' +
      '<b>' + alasanRef().length + '</b> alasan.';
  }

  function fillSettingsForm() {
    var p = state.profil;
    if (!$('#s_namaSekolah')) return;
    $('#s_namaSekolah').value = p.namaSekolah || '';
    $('#s_alamatSekolah').value = p.alamatSekolah || '';
    $('#s_telepon').value = p.telepon || '';
    $('#s_email').value = p.email || '';
    $('#s_website').value = p.website || '';
    $('#s_kotaTandaTangan').value = p.kotaTandaTangan || '';
    $('#s_kepsek').value = p.kepsek || '';
    $('#s_pangkatKepsek').value = p.pangkatKepsek || '';
    $('#s_nipKepsek').value = p.nipKepsek || '';
    $('#s_tahunAjaranAktif').value = p.tahunAjaranAktif || '';
    $('#s_daftarKelas').value = (p.daftarKelas || []).join('\n');
    $('#s_daftarAlasan').value = (p.daftarAlasan || []).join('\n');
    $('#s_kopBarisAtas').value = p.kopBarisAtas || '';
    $('#s_kopBarisBawah').value = p.kopBarisBawah || '';

    var mode = (p.kopMode === 'gambar' && p.kopGambar) ? 'gambar' : 'teks';
    if ($('#kopModeGambar')) $('#kopModeGambar').checked = mode === 'gambar';
    if ($('#kopModeTeks')) $('#kopModeTeks').checked = mode === 'teks';
    if ($('#s_kopGaris')) $('#s_kopGaris').checked = !!p.kopGaris;
    renderKopMode();

    var masuk = state.prosedur.masuk || {}, keluar = state.prosedur.keluar || {};
    $('#p_masuk_judul').value = masuk.judul || '';
    $('#p_masuk_ringkas').value = masuk.ringkas || '';
    $('#p_masuk_langkah').value = (masuk.langkah || []).map(function (s) {
      return s.judul + (s.isi ? ' | ' + s.isi : '');
    }).join('\n');
    $('#p_masuk_dokumen').value = (masuk.dokumen || []).join('\n');

    $('#p_keluar_judul').value = keluar.judul || '';
    $('#p_keluar_ringkas').value = keluar.ringkas || '';
    $('#p_keluar_langkah').value = (keluar.langkah || []).map(function (s) {
      return s.judul + (s.isi ? ' | ' + s.isi : '');
    }).join('\n');
    $('#p_keluar_dokumen').value = (keluar.dokumen || []).join('\n');

    // Operator hanya melihat (tidak mengubah)
    $$('#view-pengaturan input, #view-pengaturan textarea, #view-pengaturan select').forEach(function (el) {
      if (isAdmin()) el.removeAttribute('disabled');
      else el.setAttribute('disabled', 'disabled');
    });
    $('#identitasHint').textContent = isAdmin() ? 'Dipakai pada kop surat' : 'Hanya dapat dilihat';
    renderLogos();
    renderReferensiInfo();
  }

  function readLines(sel) {
    return ($(sel).value || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function readSteps(sel) {
    return readLines(sel).map(function (line) {
      var i = line.indexOf('|');
      if (i < 0) return { judul: line, isi: '' };
      return { judul: line.slice(0, i).trim(), isi: line.slice(i + 1).trim() };
    }).filter(function (s) { return s.judul || s.isi; });
  }

  function saveSettingsForm() {
    if (!isAdmin()) { toast('Hanya admin yang dapat mengubah pengaturan.', 'err'); return; }

    var logo = state.profil.logo || null;
    var profil = {
      namaSekolah: $('#s_namaSekolah').value.trim(),
      alamatSekolah: $('#s_alamatSekolah').value.trim(),
      telepon: $('#s_telepon').value.trim(),
      email: $('#s_email').value.trim(),
      website: $('#s_website').value.trim(),
      kotaTandaTangan: $('#s_kotaTandaTangan').value.trim(),
      kepsek: $('#s_kepsek').value.trim(),
      pangkatKepsek: $('#s_pangkatKepsek').value.trim(),
      nipKepsek: $('#s_nipKepsek').value.trim(),
      tahunAjaranAktif: $('#s_tahunAjaranAktif').value.trim(),
      logo: logo,
      logoKanan: state.profil.logoKanan || null,
      kopMode: kopModeTerpilih(),
      kopGambar: state.profil.kopGambar || null,
      kopGaris: $('#s_kopGaris') ? $('#s_kopGaris').checked : false,
      kopBarisAtas: $('#s_kopBarisAtas').value,
      kopBarisBawah: $('#s_kopBarisBawah').value,
      daftarKelas: readLines('#s_daftarKelas'),
      daftarAlasan: readLines('#s_daftarAlasan')
    };

    var prosedur = {
      masuk: {
        judul: $('#p_masuk_judul').value.trim(),
        ringkas: $('#p_masuk_ringkas').value.trim(),
        langkah: readSteps('#p_masuk_langkah'),
        dokumen: readLines('#p_masuk_dokumen')
      },
      keluar: {
        judul: $('#p_keluar_judul').value.trim(),
        ringkas: $('#p_keluar_ringkas').value.trim(),
        langkah: readSteps('#p_keluar_langkah'),
        dokumen: readLines('#p_keluar_dokumen')
      }
    };

    var btn = $('#btnSaveSettings');
    btn.disabled = true;
    api('PUT', '/api/settings', { profil: profil, prosedur: prosedur }).then(function (res) {
      state.profil = res.profil;
      state.prosedur = res.prosedur;
      btn.disabled = false;
      renderAll();
      toast('Pengaturan berhasil disimpan.');
    }).catch(function (err) {
      btn.disabled = false;
      toast(err.message, 'err');
    });
  }

  /* ------------------------------------------------------------------
     14. Pengguna
     ------------------------------------------------------------------ */
  function loadUsers() {
    api('GET', '/api/users').then(function (res) {
      state.users = res.users;
      renderUsers();
    }).catch(function (err) { toast(err.message, 'err'); });
  }

  function renderUsers() {
    var body = $('#bodyUsers');
    if (!body) return;
    if (!state.users.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty">' + ICO.empty + '<h4>Belum ada pengguna</h4></div></td></tr>';
      return;
    }
    body.innerHTML = state.users.map(function (u) {
      var isSelf = state.user && u.id === state.user.id;
      return '<tr>' +
        '<td><div style="display:flex;align-items:center;gap:9px">' +
        '<span class="avatar-sm">' + esc((u.nama || u.username).charAt(0)) + '</span>' +
        '<div><div class="cell-name">' + esc(u.username) + (isSelf ? ' <span class="badge gray">Anda</span>' : '') + '</div>' +
        '<div class="cell-sub">Dibuat ' + fmtWaktu(u.createdAt) + '</div></div></div></td>' +
        '<td>' + esc(u.nama || '—') + '</td>' +
        '<td><span class="badge role-' + (u.role === 'admin' ? 'admin' : 'operator') + '">' + (u.role === 'admin' ? 'Admin' : 'Operator') + '</span></td>' +
        '<td>' + (u.isActive ? '<span class="badge">Aktif</span>' : '<span class="badge inactive">Nonaktif</span>') + '</td>' +
        '<td class="nowrap">' + fmtWaktu(u.createdAt) + '</td>' +
        '<td class="actions"><button class="btn btn-icon" data-user-edit="' + u.id + '" title="Edit">' + ICO.edit + '</button></td>' +
        '</tr>';
    }).join('');
  }

  function openUserModal(id) {
    state.userEditId = id || null;
    var u = id ? state.users.filter(function (x) { return x.id === id; })[0] : null;
    $('#userModalTitle').textContent = u ? 'Edit Pengguna' : 'Tambah Pengguna';
    $('#userModalSub').textContent = u ? '@' + u.username : 'Buat akun untuk petugas sekolah';
    $('#u_username').value = u ? u.username : '';
    $('#u_nama').value = u ? u.nama : '';
    $('#u_role').value = u ? u.role : 'operator';
    $('#u_isActive').value = u ? (u.isActive ? '1' : '0') : '1';
    $('#u_password').value = '';
    $('#u_passReq').style.display = u ? 'none' : '';
    $('#u_passHint').textContent = u ? 'Kosongkan bila tidak ingin mengubah sandi.' : 'Minimal 8 karakter.';
    $('#btnUserDelete').style.display = u ? '' : 'none';
    $('#userForm').querySelectorAll('.field.invalid').forEach(function (f) { f.classList.remove('invalid'); });
    openModal('modalUser');
    setTimeout(function () { $('#u_username').focus(); }, 60);
  }

  function saveUser() {
    var id = state.userEditId;
    var payload = {
      username: $('#u_username').value.trim(),
      nama: $('#u_nama').value.trim(),
      role: $('#u_role').value,
      isActive: $('#u_isActive').value === '1'
    };
    var password = $('#u_password').value;
    if (password || !id) payload.password = password;

    $('#userForm').querySelectorAll('.field.invalid').forEach(function (f) { f.classList.remove('invalid'); });

    var request = id
      ? api('PUT', '/api/users/' + id, payload)
      : api('POST', '/api/users', payload);

    request.then(function () {
      closeModal('modalUser');
      toast(id ? 'Pengguna diperbarui.' : 'Pengguna baru ditambahkan.');
      loadUsers();
      if (id && state.user && id === state.user.id) {
        api('GET', '/api/auth/me').then(function (r) { state.user = r.user; renderUserChip(); });
      }
    }).catch(function (err) {
      if (err.fields) {
        Object.keys(err.fields).forEach(function (key) {
          var el = $('#u_' + key);
          if (!el) return;
          var f = el.closest('.field');
          if (!f) return;
          f.classList.add('invalid');
          var e = f.querySelector('.err');
          if (e) e.textContent = err.fields[key];
        });
      }
      toast(err.message, 'err');
    });
  }

  function deleteUser(id) {
    var u = state.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    askConfirm('Hapus Pengguna', '@' + u.username,
      'Akun <b>' + esc(u.nama || u.username) + '</b> akan dihapus dan tidak dapat masuk lagi.',
      function () {
        api('DELETE', '/api/users/' + id).then(function () {
          closeModal('modalUser');
          toast('Pengguna dihapus.');
          loadUsers();
        }).catch(function (e) { toast(e.message, 'err'); });
      });
  }

  function loadAudit() {
    api('GET', '/api/settings/audit?limit=150').then(function (res) {
      state.audit = res.audit;
      renderAudit();
    }).catch(function (err) { toast(err.message, 'err'); });
  }

  var ACTION_LABEL = {
    'login': 'Masuk', 'logout': 'Keluar', 'login.gagal': 'Percobaan masuk gagal', 'ganti-sandi': 'Ganti sandi',
    'tambah-data': 'Tambah data mutasi', 'ubah-data': 'Ubah data mutasi', 'hapus-data': 'Hapus data mutasi',
    'impor-data': 'Impor data', 'unggah-berkas': 'Unggah berkas', 'hapus-berkas': 'Hapus berkas',
    'ubah-pengaturan': 'Ubah pengaturan', 'tambah-pengguna': 'Tambah pengguna',
    'ubah-pengguna': 'Ubah pengguna', 'hapus-pengguna': 'Hapus pengguna', 'hapus-semua-data': 'Hapus semua data'
  };

  function renderAudit() {
    var body = $('#bodyAudit');
    if (!body) return;
    if (!state.audit.length) {
      body.innerHTML = '<tr><td colspan="4"><div class="empty">' + ICO.empty + '<h4>Belum ada aktivitas</h4></div></td></tr>';
      return;
    }
    body.innerHTML = state.audit.map(function (a) {
      var cls = /gagal|hapus/.test(a.action) ? 'red' : /tambah|impor|unggah/.test(a.action) ? 'blue' : 'gray';
      return '<tr>' +
        '<td class="nowrap">' + fmtWaktu(a.at) + '</td>' +
        '<td>' + esc(a.username || '—') + '</td>' +
        '<td><span class="badge ' + cls + '">' + esc(ACTION_LABEL[a.action] || a.action) + '</span></td>' +
        '<td>' + esc(a.detail || '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ------------------------------------------------------------------
     15. Import Excel
     ------------------------------------------------------------------ */
  var HEADER_MAP = {
    no: 'no', nomor: 'no',
    tanggal: 'tanggal',
    nomorsurat: 'nomorSurat', nosurat: 'nomorSurat', nomorberkas: 'nomorSurat',
    nis: 'nis', nisn: 'nisn', nama: 'nama',
    lp: 'gender', jeniskelamin: 'gender', jk: 'gender',
    kelas: 'kelas',
    kelahiran: 'kelahiran', tempatkelahiran: 'tempatLahir', tempat: 'tempatLahir', tempatlahir: 'tempatLahir',
    tanggallahir: 'tanggalLahir', tgllahir: 'tanggalLahir',
    namaorangtua: 'ortu', namaortu: 'ortu', namawali: 'ortu', orangtua: 'ortu', wali: 'ortu',
    asalsekolah: 'asal', sekolahasal: 'asal', asal: 'asal', dari: 'asal', darisekolah: 'asal',
    tujuan: 'tujuan', sekolahtujuan: 'tujuan', tujuansekolah: 'tujuan', pindahke: 'tujuan', mutasike: 'tujuan',
    alasan: 'alasan', alasanmutasi: 'alasan',
    ket: 'keterangan', keterangan: 'keterangan'
  };

  function normHeader(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function sheetText(ws) {
    try { return XLSX.utils.sheet_to_csv(ws).toUpperCase(); } catch (e) { return ''; }
  }

  function detectJenis(ws) {
    var t = sheetText(ws);
    var masuk = (t.match(/MASUK/g) || []).length;
    var keluar = (t.match(/KELUAR/g) || []).length;
    if (/TUJUAN|PINDAH\s*KELUAR|MUTASI\s*KELUAR/.test(t)) keluar += 2;
    if (/ASAL\s*SEKOLAH|PINDAH\s*MASUK|MUTASI\s*MASUK/.test(t)) masuk += 2;
    if (masuk === keluar) return 'masuk';
    return masuk > keluar ? 'masuk' : 'keluar';
  }

  function parseSheet(ws, jenis) {
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
    var headerRow = -1, map = {};
    for (var i = 0; i < Math.min(aoa.length, 25); i++) {
      var keys = (aoa[i] || []).map(function (c) { return HEADER_MAP[normHeader(c)] || ''; });
      if (keys.indexOf('nisn') > -1 && keys.indexOf('nama') > -1) {
        headerRow = i;
        keys.forEach(function (k, idx) { if (k && !(k in map)) map[k] = idx; });
        break;
      }
    }
    if (headerRow === -1) return { rows: [], headerFound: false };

    var dataStart = headerRow + 1;
    var map2 = {};
    (aoa[headerRow + 1] || []).forEach(function (c, idx) {
      var k = HEADER_MAP[normHeader(c)];
      if (k && !(k in map2)) map2[k] = idx;
    });
    if (map2.tempatLahir !== undefined || map2.tanggalLahir !== undefined) {
      if (map2.tempatLahir !== undefined) map.tempatLahir = map2.tempatLahir;
      if (map2.tanggalLahir !== undefined) map.tanggalLahir = map2.tanggalLahir;
      dataStart = headerRow + 2;
    }
    if (map.kelahiran !== undefined && map.tempatLahir === undefined) map.tempatLahir = map.kelahiran;

    var stopWords = /kepala sekolah|mengetahui|nip\.|pembina|tembusan|badung,|arsip/;
    var out = [];
    for (var r = dataStart; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var flat = row.join(' ').toLowerCase();
      if (!flat.trim()) continue;
      if (stopWords.test(flat)) continue;
      var cell = function (k) { return map[k] === undefined ? '' : row[map[k]]; };
      var nama = str(cell('nama'));
      if (!nama || /^no\.?$/i.test(nama)) continue;
      var g = str(cell('gender')).toUpperCase();
      var gender = g.charAt(0) === 'L' ? 'L' : g.charAt(0) === 'P' ? 'P' : '';
      var asal = str(cell('asal')), tujuan = str(cell('tujuan'));
      out.push({
        jenis: jenis,
        tanggal: parseAnyDate(cell('tanggal')),
        nomorSurat: str(cell('nomorSurat')),
        nis: str(cell('nis')).replace(/\D/g, ''),
        nisn: str(cell('nisn')).replace(/\D/g, ''),
        nama: nama,
        jenisKelamin: gender,
        kelas: str(cell('kelas')),
        tempatLahir: str(cell('tempatLahir')),
        tanggalLahir: parseAnyDate(cell('tanggalLahir')),
        namaOrtu: str(cell('ortu')),
        asalSekolah: jenis === 'masuk' ? (asal || tujuan) : '',
        tujuan: jenis === 'keluar' ? (tujuan || asal) : '',
        alasan: str(cell('alasan')),
        keterangan: str(cell('keterangan')),
        tahunAjaran: state.profil.tahunAjaranAktif || ''
      });
    }
    return { rows: out, headerFound: true };
  }

  function handleImportFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        state.importWb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      } catch (err) {
        toast('Gagal membaca berkas: ' + err.message, 'err');
        return;
      }
      buildImportPlan();
    };
    reader.onerror = function () { toast('Gagal membaca berkas.', 'err'); };
    reader.readAsArrayBuffer(file);
  }

  function buildImportPlan() {
    state.importPlan = state.importWb.SheetNames.map(function (name) {
      var ws = state.importWb.Sheets[name];
      var jenis = detectJenis(ws);
      var parsed = parseSheet(ws, jenis);
      if (!parsed.headerFound) return null;
      return { sheet: name, jenis: jenis, rows: parsed.rows };
    }).filter(Boolean);
    renderImportPreview();
  }

  function renderImportPreview() {
    var box = $('#importResult');
    if (!state.importPlan.length) {
      box.innerHTML = '<div class="empty">' + ICO.alert + '<h4>Struktur tabel tidak dikenali</h4>' +
        '<p>Pastikan berkas memiliki kolom <b>NISN</b> dan <b>Nama</b>. Data dapat diisi manual bila perlu.</p></div>';
      $('#btnDoImport').disabled = true;
      $('#importSummary').textContent = '';
      return;
    }
    box.innerHTML = state.importPlan.map(function (p, i) {
      var sample = p.rows.slice(0, 3).map(function (r) {
        return '<tr><td>' + esc(r.nama) + '</td><td class="mono">' + esc(r.nisn || '-') + '</td><td>' + esc(r.kelas || '-') + '</td>' +
          '<td>' + (r.tanggal ? fmtTanggalSingkat(r.tanggal) : '<span class="badge red">kosong</span>') + '</td></tr>';
      }).join('');
      return '<div class="card" style="margin-bottom:12px">' +
        '<div class="card-head"><h3>Sheet: ' + esc(p.sheet) + '</h3><div class="spacer"></div>' +
        '<select data-plan-jenis="' + i + '">' +
        '<option value="masuk"' + (p.jenis === 'masuk' ? ' selected' : '') + '>Mutasi Masuk</option>' +
        '<option value="keluar"' + (p.jenis === 'keluar' ? ' selected' : '') + '>Mutasi Keluar</option>' +
        '<option value="abaikan"' + (p.jenis === 'abaikan' ? ' selected' : '') + '>Abaikan</option>' +
        '</select></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>Nama</th><th>NISN</th><th>Kelas</th><th>Tanggal</th></tr></thead><tbody>' +
        (sample || '<tr><td colspan="4" style="color:var(--ink-500)">Tidak ada baris data terdeteksi.</td></tr>') +
        '</tbody></table></div>' +
        '<div style="padding:9px 18px;font-size:12px;color:var(--ink-500)">' + p.rows.length + ' baris terdeteksi</div>' +
        '</div>';
    }).join('');
    var total = state.importPlan.filter(function (p) { return p.jenis !== 'abaikan'; })
      .reduce(function (n, p) { return n + p.rows.length; }, 0);
    $('#importSummary').textContent = total + ' baris siap diimpor.';
    $('#btnDoImport').disabled = total === 0;
  }

  function doImport() {
    var payload = [];
    state.importPlan.forEach(function (p) {
      if (p.jenis === 'abaikan') return;
      p.rows.forEach(function (r) {
        payload.push(Object.assign({}, r, {
          tahunAjaran: r.tahunAjaran || state.profil.tahunAjaranAktif
        }));
      });
    });
    if (!payload.length) { toast('Tidak ada baris untuk diimpor.', 'warn'); return; }

    var btn = $('#btnDoImport');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Mengimpor…';

    api('POST', '/api/records/bulk', { records: payload }).then(function (res) {
      closeModal('modalImport');
      state.importPlan = [];
      state.importWb = null;
      $('#importFile').value = '';
      $('#importResult').innerHTML = '';
      btn.disabled = true;
      btn.textContent = 'Impor Sekarang';
      return reloadRecords().then(function () {
        var msg = res.added + ' data berhasil diimpor.';
        if (res.skipped) msg += ' ' + res.skipped + ' dilewati (duplikat).';
        if (res.invalid) msg += ' ' + res.invalid + ' tidak valid.';
        toast(msg, res.added ? undefined : 'warn');
        if (res.details && res.details.invalid && res.details.invalid.length) {
          var first = res.details.invalid[0];
          console.warn('Baris tidak valid:', res.details.invalid);
          toast('Baris ' + first.baris + ' (' + first.nama + ') tidak valid: ' + Object.keys(first.errors).join(', '), 'warn');
        }
      });
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Impor Sekarang';
      toast(err.message, 'err');
    });
  }

  /* ------------------------------------------------------------------
     16. Export & cadangan
     ------------------------------------------------------------------ */
  function exportExcel() {
    var masuk = sortByTanggal(recFiltered('masuk'), false);
    var keluar = sortByTanggal(recFiltered('keluar'), false);
    var ta = state.currentTA === 'ALL' ? 'Semua Tahun Ajaran' : 'Tahun Ajaran ' + state.currentTA;
    var wb = XLSX.utils.book_new();

    function sheetFor(jenis, list) {
      var isMasuk = jenis === 'masuk';
      var head = ['No', 'Tanggal', 'Nomor Surat', 'NIS', 'NISN', 'Nama', 'L/P', 'Kelas', 'Tempat Lahir', 'Tanggal Lahir',
        'Nama Orang Tua', isMasuk ? 'Asal Sekolah' : 'Sekolah Tujuan', 'Alasan', 'Keterangan', 'Jumlah Lampiran'];
      var aoa = [['DAFTAR MUTASI SISWA', '', '', '', ta], ['PINDAH ' + (isMasuk ? 'MASUK' : 'KELUAR')], [], head];
      list.forEach(function (r, i) {
        aoa.push([i + 1, r.tanggal || '', r.nomorSurat || '', r.nis || '', r.nisn || '', r.nama, r.jenisKelamin || '', r.kelas || '',
          r.tempatLahir || '', r.tanggalLahir || '', r.namaOrtu || '',
          (isMasuk ? r.asalSekolah : r.tujuan) || '', r.alasan || '', r.keterangan || '', (r.lampiran || []).length]);
      });
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 26 }, { wch: 8 }, { wch: 13 }, { wch: 34 }, { wch: 5 }, { wch: 9 },
        { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 8 }];
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
      return ws;
    }

    XLSX.utils.book_append_sheet(wb, sheetFor('masuk', masuk), 'PINDAH MASUK');
    XLSX.utils.book_append_sheet(wb, sheetFor('keluar', keluar), 'PINDAH KELUAR');

    var all = state.records.filter(inTA);
    var allAoa = [['No', 'Jenis', 'Tahun Ajaran', 'Tanggal', 'Nomor Surat', 'NISN', 'Nama', 'L/P', 'Kelas', 'Tempat Lahir', 'Tanggal Lahir', 'Nama Orang Tua', 'Asal/Tujuan', 'Alasan', 'Keterangan']];
    sortByTanggal(all, false).forEach(function (r, i) {
      allAoa.push([i + 1, r.jenis === 'masuk' ? 'Masuk' : 'Keluar', r.tahunAjaran || '', r.tanggal || '', r.nomorSurat || '', r.nisn || '', r.nama,
        r.jenisKelamin || '', r.kelas || '', r.tempatLahir || '', r.tanggalLahir || '', r.namaOrtu || '',
        (r.jenis === 'masuk' ? r.asalSekolah : r.tujuan) || '', r.alasan || '', r.keterangan || '']);
    });
    var wsAll = XLSX.utils.aoa_to_sheet(allAoa);
    wsAll['!cols'] = [{ wch: 5 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 26 }, { wch: 13 }, { wch: 34 }, { wch: 5 }, { wch: 9 },
      { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 28 }, { wch: 22 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsAll, 'DATA LENGKAP');

    var fname = 'MUTASI-SISWA-' + String(state.profil.namaSekolah || 'SEKOLAH').replace(/[^\w]+/g, '-').toUpperCase() +
      '-' + (state.currentTA === 'ALL' ? 'SEMUA' : state.currentTA.replace('/', '-')) + '.xlsx';
    XLSX.writeFile(wb, fname);
    toast('Berkas Excel berhasil dibuat.');
  }

  function dumpJson() {
    var payload = {
      app: 'SIMUTASI', version: 2, exportedAt: new Date().toISOString(),
      profil: state.profil, prosedur: state.prosedur,
      records: state.records.map(function (r) {
        return {
          jenis: r.jenis, tanggal: r.tanggal, nomorSurat: r.nomorSurat, nis: r.nis, nisn: r.nisn, nama: r.nama,
          jenisKelamin: r.jenisKelamin, kelas: r.kelas, tempatLahir: r.tempatLahir,
          tanggalLahir: r.tanggalLahir, namaOrtu: r.namaOrtu, asalSekolah: r.asalSekolah,
          tujuan: r.tujuan, alasan: r.alasan, keterangan: r.keterangan, tahunAjaran: r.tahunAjaran
        };
      })
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'simutasi-cadangan-' + todayIso() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Cadangan JSON berhasil diunduh.');
  }

  var restorePayload = null;

  function handleRestoreFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var info = $('#restoreInfo');
      try {
        var data = JSON.parse(e.target.result);
        if (!data || !Array.isArray(data.records)) throw new Error('Format berkas tidak sesuai.');
        restorePayload = data;
        var total = data.records.length;
        var usable = data.records.filter(function (r) { return r.nama && r.nisn; }).length;
        var dropped = total - usable;
        info.className = 'alert-box success';
        info.innerHTML = 'Berkas terbaca: <b>' + total + '</b> data' +
          (dropped ? ' · <b>' + dropped + ' tidak lengkap</b> (tanpa nama/NISN, akan dilewati)' : '') +
          (data.profil ? ' · pengaturan sekolah tersedia' : '');
        $('#btnRestoreGo').disabled = false;
      } catch (err) {
        restorePayload = null;
        info.className = 'alert-box error';
        info.textContent = 'Gagal membaca cadangan: ' + err.message;
        $('#btnRestoreGo').disabled = true;
      }
    };
    reader.readAsText(file);
  }

  function runRestore() {
    if (!restorePayload) return;
    var btn = $('#btnRestoreGo');
    var replace = !!($('#restoreReplace') && $('#restoreReplace').checked);
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Memulihkan…';

    var records = restorePayload.records.filter(function (r) { return r.nama && r.nisn; });
    var result = { added: 0, skipped: 0 };
    var chain = Promise.resolve();

    if (replace) chain = chain.then(function () { return api('DELETE', '/api/records/all'); });
    if (records.length) {
      chain = chain.then(function () { return api('POST', '/api/records/bulk', { records: records }); })
        .then(function (res) { result = res; });
    }
    chain.then(function () {
      if (restorePayload.profil && isAdmin()) {
        return api('PUT', '/api/settings', { profil: restorePayload.profil, prosedur: restorePayload.prosedur })
          .then(function (s) { state.profil = s.profil; state.prosedur = s.prosedur; });
      }
    }).then(function () {
      closeModal('modalRestore');
      restorePayload = null;
      $('#restoreFile').value = '';
      $('#restoreInfo').className = 'alert-box hidden';
      btn.disabled = true;
      btn.textContent = 'Pulihkan';
      return reloadRecords().then(function () {
        renderAll();
        var msg = (result.added || 0) + ' data dipulihkan';
        if (result.skipped) msg += ', ' + result.skipped + ' dilewati (duplikat)';
        if (result.invalid) msg += ', ' + result.invalid + ' tidak valid';
        toast(msg + '.');
      });
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Pulihkan';
      toast(err.message, 'err');
    });
  }

  function purgeAll() {
    askConfirm('Hapus Semua Data Mutasi', 'Tindakan ini tidak dapat dibatalkan',
      'Seluruh data mutasi beserta berkas lampirannya akan dihapus permanen dari server. Pengaturan sekolah dan pengguna tetap tersimpan.',
      function () {
        api('DELETE', '/api/records/all').then(function (res) {
          toast(res.deleted + ' data mutasi dihapus.');
          return reloadRecords();
        }).catch(function (e) { toast(e.message, 'err'); });
      });
  }

  /* ------------------------------------------------------------------
     17. Muat ulang data
     ------------------------------------------------------------------ */
  function reloadRecords() {
    return api('GET', '/api/records').then(function (res) {
      state.records = res.records;
      state.referensi = res.referensi || { tahunAjaran: [], kelas: [], alasan: [] };
      renderCounters();
      fillTAFilter();
      fillDatalists();
      fillFilterSelects();
      renderDashboard();
      renderTable('masuk');
      renderTable('keluar');
      renderArsip();
      renderReferensiInfo();
    });
  }

  /* ------------------------------------------------------------------
     18. Event
     ------------------------------------------------------------------ */
  function wire() {
    $$('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });
    $$('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.goto); });
    });
    $('#menuToggle').addEventListener('click', function () { document.body.classList.toggle('nav-open'); });

    // menu pengguna
    $('#userBtn').addEventListener('click', function (ev) {
      ev.stopPropagation();
      $('#userPanel').classList.toggle('hidden');
    });
    document.addEventListener('click', function (ev) {
      if (!ev.target.closest('.user-menu')) $('#userPanel').classList.add('hidden');
    });
    $$('#userPanel [data-menu]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#userPanel').classList.add('hidden');
        if (b.dataset.menu === 'password') {
          $('#passwordForm').reset();
          $('#passwordForm').querySelectorAll('.field.invalid').forEach(function (f) { f.classList.remove('invalid'); });
          openModal('modalPassword');
          setTimeout(function () { $('#pw_current').focus(); }, 60);
        }
        if (b.dataset.menu === 'logout') {
          api('POST', '/api/auth/logout').then(function () {
            window.location.replace('/login.html');
          }).catch(function () {
            window.location.replace('/login.html');
          });
        }
      });
    });

    $('#filterTA').addEventListener('change', function () {
      state.currentTA = this.value;
      renderCounters();
      renderDashboard();
      renderTable('masuk');
      renderTable('keluar');
    });

    $('#btnAdd').addEventListener('click', function () { openForm(this.dataset.jenis || 'masuk'); });
    $$('[data-add]').forEach(function (b) { b.addEventListener('click', function () { openForm(b.dataset.add); }); });
    $$('[data-print]').forEach(function (b) { b.addEventListener('click', function () { cetakRekap(b.dataset.print); }); });
    $('#btnExport').addEventListener('click', exportExcel);
    $('#btnImport').addEventListener('click', function () { openModal('modalImport'); });

    [['masuk', '#qMasuk', '#fKelasMasuk', '#fAlasanMasuk'],
    ['keluar', '#qKeluar', '#fKelasKeluar', '#fAlasanKeluar']].forEach(function (cfg) {
      var jenis = cfg[0];
      $(cfg[1]).addEventListener('input', function () { state.tableState[jenis].q = this.value; renderTable(jenis); });
      $(cfg[2]).addEventListener('change', function () { state.tableState[jenis].kelas = this.value; renderTable(jenis); });
      $(cfg[3]).addEventListener('change', function () { state.tableState[jenis].alasan = this.value; renderTable(jenis); });
    });
    $('#qArsip').addEventListener('input', renderArsip);

    // delegasi klik
    document.addEventListener('click', function (ev) {
      var gotoRec = ev.target.closest('[data-goto-rec]');
      if (gotoRec) { closeAllModals(); openDetail(gotoRec.dataset.gotoRec); return; }

      var rmFile = ev.target.closest('[data-rm-file]');
      if (rmFile) {
        var fid = rmFile.dataset.rmFile;
        var file = state.form.kept.filter(function (f) { return f.id === fid; })[0];
        state.form.kept = state.form.kept.filter(function (f) { return f.id !== fid; });
        if (file) state.form.removed.push(fid);
        renderFormFiles();
        return;
      }
      var rmPending = ev.target.closest('[data-rm-pending]');
      if (rmPending) {
        state.form.files.splice(+rmPending.dataset.rmPending, 1);
        renderFormFiles();
        return;
      }

      var userEdit = ev.target.closest('[data-user-edit]');
      if (userEdit) { openUserModal(parseInt(userEdit.dataset.userEdit, 10)); return; }

      var act = ev.target.closest('[data-act]');
      if (act) {
        var tr = act.closest('tr');
        var id = tr && tr.dataset.id;
        if (!id) return;
        if (act.dataset.act === 'detail') openDetail(id);
        if (act.dataset.act === 'edit') {
          var rec = state.records.filter(function (x) { return x.id === id; })[0];
          if (rec) openForm(rec.jenis, id);
        }
        if (act.dataset.act === 'print') cetakSurat(id);
        if (act.dataset.act === 'del') deleteRecord(id);
        return;
      }

      var closeBtn = ev.target.closest('[data-close]');
      if (closeBtn) {
        var modal = closeBtn.closest('.modal-backdrop');
        if (modal) modal.classList.add('hidden');
      }
    });

    $$('.modal-backdrop').forEach(function (bd) {
      bd.addEventListener('mousedown', function (ev) {
        if (ev.target === bd && bd.id !== 'modalConfirm') bd.classList.add('hidden');
      });
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        var open = $$('.modal-backdrop').filter(function (m) { return !m.classList.contains('hidden'); });
        if (open.length) open[open.length - 1].classList.add('hidden');
      }
    });

    // form data mutasi
    $('#recordForm').addEventListener('submit', function (ev) { ev.preventDefault(); saveForm(); });
    $('#btnFormDelete').addEventListener('click', function () {
      if (state.form.id) { closeModal('modalForm'); deleteRecord(state.form.id); }
    });
    $('#f_files').addEventListener('change', function () {
      var files = Array.prototype.slice.call(this.files || []);
      var big = files.filter(function (f) { return f.size > 15 * 1024 * 1024; });
      if (big.length) toast(big.length + ' berkas melebihi 15 MB dan tidak ditambahkan.', 'warn');
      state.form.files = state.form.files.concat(files.filter(function (f) { return f.size <= 15 * 1024 * 1024; }));
      this.value = '';
      renderFormFiles();
    });

    // detail
    $('#btnDetailEdit').addEventListener('click', function () {
      var r = state.records.filter(function (x) { return x.id === state.detailId; })[0];
      if (!r) return;
      closeModal('modalDetail');
      openForm(r.jenis, r.id);
    });
    $('#btnDetailPrint').addEventListener('click', function () { if (state.detailId) cetakSurat(state.detailId); });

    // konfirmasi
    $('#btnConfirmOk').addEventListener('click', function () {
      var cb = confirmCb;
      confirmCb = null;
      closeModal('modalConfirm');
      if (cb) cb();
    });

    // import
    $('#importFile').addEventListener('change', function () {
      if (this.files && this.files[0]) handleImportFile(this.files[0]);
    });
    $('#importResult').addEventListener('change', function (ev) {
      var sel = ev.target.closest('[data-plan-jenis]');
      if (!sel) return;
      var i = +sel.dataset.planJenis;
      var jenis = sel.value;
      state.importPlan[i].jenis = jenis;
      if (jenis !== 'abaikan' && state.importWb) {
        state.importPlan[i].rows = parseSheet(state.importWb.Sheets[state.importPlan[i].sheet], jenis).rows;
      } else if (jenis === 'abaikan') {
        state.importPlan[i].rows = [];
      }
      renderImportPreview();
    });
    $('#btnDoImport').addEventListener('click', doImport);

    // tab pengaturan
    $$('.set-tab').forEach(function (b) {
      b.addEventListener('click', function () { setSetTab(b.dataset.set); });
    });
    $('#btnSaveSettings').addEventListener('click', saveSettingsForm);

    // logo kop (kiri) dan logo kanan
    function pasangLogoUnggah(inputSel, field, label) {
      $(inputSel).addEventListener('change', function () {
        var f = this.files && this.files[0];
        this.value = '';
        if (!f) return;
        if (!isAdmin()) { toast('Hanya admin yang dapat mengubah logo.', 'err'); return; }
        if (f.size > 512 * 1024) { toast('Ukuran logo maksimal 500 KB.', 'warn'); return; }
        if (!/^image\//.test(f.type)) { toast('Berkas logo harus berupa gambar.', 'err'); return; }
        var reader = new FileReader();
        reader.onload = function (e) {
          state.profil[field] = e.target.result;
          renderLogos();
          toast(label + ' siap disimpan. Klik "Simpan Pengaturan" untuk menerapkan.', 'warn');
        };
        reader.readAsDataURL(f);
      });
    }
    pasangLogoUnggah('#s_logo', 'logo', 'Logo kiri');
    pasangLogoUnggah('#s_logoKanan', 'logoKanan', 'Logo kanan');

    function hapusLogo(field, label) {
      if (!isAdmin()) { toast('Hanya admin yang dapat mengubah logo.', 'err'); return; }
      state.profil[field] = null;
      renderLogos();
      toast(label + ' dihapus. Klik "Simpan Pengaturan" untuk menerapkan.', 'warn');
    }
    $('#btnLogoRemove').addEventListener('click', function () { hapusLogo('logo', 'Logo kiri'); });
    $('#btnLogoKananRemove').addEventListener('click', function () { hapusLogo('logoKanan', 'Logo kanan'); });

    // pratinjau kop mengikuti isi form
    ['#s_namaSekolah', '#s_kopBarisAtas', '#s_kopBarisBawah'].forEach(function (sel) {
      $(sel).addEventListener('input', renderKopPreview);
    });
    ['#kopModeGambar', '#kopModeTeks'].forEach(function (sel) {
      $(sel).addEventListener('change', renderKopMode);
    });
    $('#s_kopGaris').addEventListener('change', renderKopPreview);

    // gambar kop surat (unggahan)
    $('#s_kopGambar').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      if (!isAdmin()) { toast('Hanya admin yang dapat mengubah kop surat.', 'err'); return; }
      if (!/^image\//.test(f.type)) { toast('Berkas kop harus berupa gambar (PNG/JPG).', 'err'); return; }
      if (f.size > 3 * 1024 * 1024) {
        toast('Gambar kop maksimal 3 MB (' + fmtBerkas(f.size) + '). Silakan perbesar kompresi berkasnya.', 'warn');
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        state.profil.kopGambar = e.target.result;
        $('#kopModeGambar').checked = true;
        renderKopMode();
        toast('Gambar kop siap disimpan. Klik "Simpan Pengaturan" untuk menerapkan.', 'warn');
      };
      reader.onerror = function () { toast('Gagal membaca berkas gambar.', 'err'); };
      reader.readAsDataURL(f);
    });
    $('#btnKopGambarRemove').addEventListener('click', function () {
      if (!isAdmin()) { toast('Hanya admin yang dapat mengubah kop surat.', 'err'); return; }
      state.profil.kopGambar = null;
      $('#kopModeTeks').checked = true;
      renderKopMode();
      toast('Gambar kop dihapus. Klik "Simpan Pengaturan" untuk menerapkan.', 'warn');
    });

    // pengguna
    $('#btnAddUser').addEventListener('click', function () { openUserModal(null); });
    $('#userForm').addEventListener('submit', function (ev) { ev.preventDefault(); saveUser(); });
    $('#btnUserDelete').addEventListener('click', function () {
      if (state.userEditId) deleteUser(state.userEditId);
    });

    // ganti sandi
    $('#passwordForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var form = this;
      form.querySelectorAll('.field.invalid').forEach(function (f) { f.classList.remove('invalid'); });
      var current = $('#pw_current').value;
      var next = $('#pw_new').value;
      var confirm = $('#pw_confirm').value;

      var ok = true;
      if (!current) { $('#pw_current').closest('.field').classList.add('invalid'); ok = false; }
      if (next.length < 8) { $('#pw_new').closest('.field').classList.add('invalid'); ok = false; }
      if (next !== confirm) { $('#pw_confirm').closest('.field').classList.add('invalid'); ok = false; }
      if (!ok) return;

      api('POST', '/api/auth/password', { currentPassword: current, newPassword: next }).then(function () {
        closeModal('modalPassword');
        toast('Sandi berhasil diubah.');
      }).catch(function (err) {
        if (err.status === 400) {
          $('#pw_current').closest('.field').classList.add('invalid');
          var e = $('#pw_current').closest('.field').querySelector('.err');
          if (e) e.textContent = err.message;
        }
        toast(err.message, 'err');
      });
    });

    // audit
    $('#btnRefreshAudit').addEventListener('click', loadAudit);

    // data & cadangan
    $('#btnDump').addEventListener('click', dumpJson);
    $('#btnRestore').addEventListener('click', function () {
      restorePayload = null;
      $('#restoreFile').value = '';
      $('#btnRestoreGo').disabled = true;
      $('#restoreReplace').checked = true;
      var info = $('#restoreInfo');
      info.className = 'alert-box';
      info.innerHTML = state.records.length
        ? 'Server saat ini berisi <b>' + state.records.length + '</b> data mutasi. Data tersebut akan dikosongkan bila opsi di bawah tetap dicentang.'
        : 'Server saat ini belum memiliki data mutasi.';
      openModal('modalRestore');
    });
    $('#restoreFile').addEventListener('change', function () {
      if (this.files && this.files[0]) handleRestoreFile(this.files[0]);
    });
    $('#restoreForm').addEventListener('submit', function (ev) { ev.preventDefault(); runRestore(); });
    $('#btnPurge').addEventListener('click', purgeAll);
  }

  /* ------------------------------------------------------------------
     19. Mulai
     ------------------------------------------------------------------ */
  function fatal(message) {
    document.body.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;font-family:Segoe UI,Arial,sans-serif;padding:24px">' +
      '<div style="max-width:460px;text-align:center">' +
      '<h2 style="margin:0 0 10px;color:#c0392b">Gagal memuat aplikasi</h2>' +
      '<p style="color:#6b7d76;font-size:14px;margin:0 0 20px">' + esc(message) + '</p>' +
      '<a href="/login.html" style="display:inline-block;padding:10px 18px;background:#1c7c5a;color:#fff;' +
      'border-radius:9px;text-decoration:none;font-weight:600">Kembali ke halaman masuk</a></div></div>';
  }

  function boot() {
    api('GET', '/api/auth/me')
      .then(function (me) {
        state.user = me.user;
        return Promise.all([
          api('GET', '/api/settings'),
          api('GET', '/api/records')
        ]);
      })
      .then(function (results) {
        var settings = results[0], records = results[1];
        state.profil = settings.profil;
        state.prosedur = settings.prosedur || { masuk: {}, keluar: {} };
        state.records = records.records;
        state.referensi = records.referensi || { tahunAjaran: [], kelas: [], alasan: [] };

        wire();
        renderAll();
        setView('dashboard');
        setSetTab('identitas');
        if (!isAdmin()) {
          setSetTab('identitas');
        }
      })
      .catch(function (err) {
        if (/Sesi berakhir/.test(err.message)) return;
        fatal(err.message || 'Terjadi kesalahan.');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
