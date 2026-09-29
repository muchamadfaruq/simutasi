/* Halaman login petugas sekolah. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showError(message) {
    $('#alertText').textContent = message;
    $('#alertBox').classList.add('show');
  }

  function hideError() { $('#alertBox').classList.remove('show'); }

  function setLoading(on) {
    var btn = $('#btnLogin');
    btn.disabled = on;
    $('#btnLoginText').textContent = on ? 'Memproses…' : 'Masuk';
    var spinner = btn.querySelector('.spinner');
    if (on && !spinner) btn.insertAdjacentHTML('afterbegin', '<span class="spinner"></span>');
    if (!on && spinner) spinner.remove();
  }

  function nextTarget() {
    var params = new URLSearchParams(window.location.search);
    var next = params.get('next');
    if (next && next.charAt(0) === '/' && next.charAt(1) !== '/') return next;
    return '/admin';
  }

  // Identitas sekolah pada panel kiri
  fetch('/api/public/site', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.profil) return;
      var p = data.profil;
      $('#brandName').textContent = p.namaSekolah || 'Sekolah';
      var logo = $('#brandLogo');
      if (p.logo) logo.innerHTML = '<img src="' + esc(p.logo) + '" alt="Logo sekolah">';
      else {
        var w = String(p.namaSekolah || 'S M').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean);
        logo.textContent = ((w[0] || 'S')[0] + (w[1] || 'M')[0]).toUpperCase();
      }
    })
    .catch(function () { /* abaikan */ });

  $('#loginForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideError();

    var username = $('#username').value.trim();
    var password = $('#password').value;
    if (!username || !password) {
      showError('Nama pengguna dan sandi wajib diisi.');
      return;
    }

    setLoading(true);
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Gagal masuk.');
          return data;
        });
      })
      .then(function () { window.location.replace(nextTarget()); })
      .catch(function (err) {
        var pesan = /fetch|network|load failed/i.test(err.message)
          ? 'Tidak dapat menghubungi server. Periksa jaringan lalu coba lagi.'
          : err.message;
        showError(pesan);
        setLoading(false);
        $('#password').select();
      });
  });
})();
