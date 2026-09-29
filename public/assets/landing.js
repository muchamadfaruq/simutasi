/* Halaman publik: menampilkan identitas sekolah dan prosedur mutasi. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var current = 'masuk';
  var site = null;

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var ICON_IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>';
  var ICON_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';

  function initials(name) {
    var w = String(name || '').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    return ((w[0] || 'S')[0] + (w[1] || 'M')[0]).toUpperCase();
  }

  function applyProfil(profil) {
    var p = profil || {};
    $('#brandName').textContent = p.namaSekolah || 'Sekolah';
    $('#footerName').textContent = p.namaSekolah || 'Sekolah';
    $('#taBadge').textContent = p.tahunAjaranAktif || '—';
    $('#infoAlamat').textContent = p.alamatSekolah || '—';
    $('#infoTelepon').textContent = p.telepon || '—';
    $('#infoEmail').textContent = p.email || '—';
    document.title = 'Layanan Mutasi Siswa — ' + (p.namaSekolah || 'Sekolah');

    var logo = $('#brandLogo');
    if (p.logo) logo.innerHTML = '<img src="' + esc(p.logo) + '" alt="Logo sekolah">';
    else logo.textContent = initials(p.namaSekolah);
  }

  function renderTracks(prosedur) {
    var kinds = [['masuk', 'in'], ['keluar', 'out']];
    $('#trackGrid').innerHTML = kinds.map(function (k) {
      var jenis = k[0];
      var data = prosedur[jenis] || {};
      var langkah = data.langkah || [];
      var steps = langkah.slice(0, 5).map(function (s, i) {
        return '<div class="track-step"><i>' + (i + 1) + '</i><div><b>' + esc(s.judul) + '</b>' +
          (s.isi ? '<span>' + esc(s.isi.length > 110 ? s.isi.slice(0, 107) + '…' : s.isi) + '</span>' : '') +
          '</div></div>';
      }).join('');
      var more = langkah.length > 5
        ? '<div class="track-step"><i>+' + (langkah.length - 5) + '</i><div><b>' + (langkah.length - 5) + ' tahapan lainnya</b><span>Lihat prosedur lengkap di bawah</span></div></div>'
        : '';
      return '<div class="card track ' + (jenis === 'keluar' ? 'out' : '') + '">' +
        '<div class="track-head"><div class="track-icon">' + (jenis === 'masuk' ? ICON_IN : ICON_OUT) + '</div>' +
        '<h3>' + esc(data.judul || ('Prosedur Mutasi ' + jenis)) + '</h3></div>' +
        '<p class="desc">' + esc(data.ringkas || '') + '</p>' +
        '<div class="track-steps">' + steps + more + '</div>' +
        '</div>';
    }).join('');
  }

  function renderHeroFlow(prosedur) {
    var data = prosedur.masuk || {};
    var langkah = (data.langkah || []).slice(0, 4);
    $('#heroFlowTitle').textContent = 'Alur Singkat Mutasi Masuk';
    $('#heroFlow').innerHTML = langkah.length ? langkah.map(function (s, i) {
      return '<div class="flow-step"><div class="flow-num">' + (i + 1) + '</div>' +
        '<div><b>' + esc(s.judul) + '</b><span>' +
        esc(s.isi && s.isi.length > 78 ? s.isi.slice(0, 75) + '…' : (s.isi || '')) +
        '</span></div></div>';
    }).join('') : '<div class="flow-step"><div class="flow-num">–</div><div><b>Belum ada data prosedur</b></div></div>';
  }

  function renderProsedur(jenis) {
    if (!site) return;
    var data = (site.prosedur || {})[jenis] || {};
    var langkah = data.langkah || [];

    $('#prosedurRingkas').textContent = data.ringkas || 'Tahapan dan dokumen yang perlu disiapkan.';

    $('#timeline').innerHTML = langkah.length ? langkah.map(function (s, i) {
      return '<div class="tl-item"><div class="tl-num">' + (i + 1) + '</div>' +
        '<div class="tl-body"><h4>' + esc(s.judul) + '</h4>' +
        (s.isi ? '<p>' + esc(s.isi) + '</p>' : '') + '</div></div>';
    }).join('') : '<div class="tl-item"><div class="tl-num">–</div><div class="tl-body"><h4>Belum ada data prosedur</h4></div></div>';

    var dokumen = data.dokumen || [];
    $('#checklist').innerHTML = dokumen.length ? dokumen.map(function (d) {
      return '<li>' + ICON_CHECK + '<span>' + esc(d) + '</span></li>';
    }).join('') : '<li><span>Belum ada daftar dokumen.</span></li>';
  }

  function setJenis(jenis) {
    current = jenis === 'keluar' ? 'keluar' : 'masuk';
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.dataset.jenis === current);
    });
    renderProsedur(current);
  }

  function countSteps(prosedur) {
    var a = (prosedur.masuk && prosedur.masuk.langkah ? prosedur.masuk.langkah.length : 0);
    var b = (prosedur.keluar && prosedur.keluar.langkah ? prosedur.keluar.langkah.length : 0);
    return (a + b) || '—';
  }

  function boot() {
    $('#footerYear').textContent = new Date().getFullYear();
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () { setJenis(t.dataset.jenis); });
    });

    fetch('/api/public/site', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('Gagal memuat data (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        site = { profil: data.profil || {}, prosedur: data.prosedur || {} };
        applyProfil(site.profil);
        renderHeroFlow(site.prosedur);
        renderTracks(site.prosedur);
        $('#metaStepCount').textContent = countSteps(site.prosedur);
        setJenis('masuk');
      })
      .catch(function (err) {
        var box = $('#timeline');
        if (box) box.innerHTML = '<div class="tl-item"><div class="tl-num">!</div><div class="tl-body">' +
          '<h4>Gagal memuat prosedur</h4><p>' + esc(err.message) + '</p></div></div>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
