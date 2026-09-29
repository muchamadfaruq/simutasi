'use strict';

const crypto = require('crypto');
const config = require('./config');
const store = require('./db');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/* --------------------------------------------------------------- password */

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const opts = { N: +parts[1], r: +parts[2], p: +parts[3], keylen: 64 };
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    const actual = crypto.scryptSync(String(password), salt, expected.length, opts);
    return crypto.timingSafeEqual(expected, actual);
  } catch (e) {
    return false;
  }
}

function randomPassword(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length || 14);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/* --------------------------------------------------------------- sessions */

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function wantSecureCookie(req) {
  if (config.cookieSecure === 'always') return true;
  if (config.cookieSecure === 'never') return false;
  if (req && req.secure) return true;
  const proto = req && req.headers['x-forwarded-proto'];
  return String(proto || '').split(',')[0].trim() === 'https';
}

function startSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + config.sessionHours * 3600 * 1000;
  store.sessions.cleanExpired();
  store.sessions.create(sha256(token), userId, expiresAt);
  const attrs = [
    config.cookieName + '=' + token,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.floor(config.sessionHours * 3600)
  ];
  if (wantSecureCookie(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
  return token;
}

function endSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[config.cookieName];
  if (token) store.sessions.remove(sha256(token));
  const attrs = [config.cookieName + '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (wantSecureCookie(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

/** Menempelkan req.user bila cookie sesi valid. */
function attachUser(req, res, next) {
  req.user = null;
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[config.cookieName];
  if (token) {
    const session = store.sessions.get(sha256(token));
    if (session) req.user = session.user;
  }
  next();
}

/** Alamat lengkap permintaan, aman dipakai walau router dipasang di sub-jalur. */
function isApiRequest(req) {
  return String(req.originalUrl || req.url || '').split('?')[0].indexOf('/api/') === 0;
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (isApiRequest(req)) {
    return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' });
  }
  return res.redirect('/login.html');
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Belum masuk.' });
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Hanya ' + role + ' yang dapat melakukan tindakan ini.' });
    }
    next();
  };
}

/* ------------------------------------------------------------ rate limit */

const attempts = new Map();

function loginAllowed(ip) {
  const now = Date.now();
  const windowMs = config.loginWindowMinutes * 60 * 1000;
  const rec = attempts.get(ip);
  if (!rec || now - rec.firstAt > windowMs) {
    attempts.set(ip, { firstAt: now, count: 0 });
    return true;
  }
  return rec.count < config.loginMaxAttempts;
}

function loginFailed(ip) {
  const rec = attempts.get(ip) || { firstAt: Date.now(), count: 0 };
  rec.count++;
  attempts.set(ip, rec);
}

function loginSucceeded(ip) {
  attempts.delete(ip);
}

setInterval(() => store.sessions.cleanExpired(), 60 * 60 * 1000).unref();

module.exports = {
  hashPassword,
  verifyPassword,
  randomPassword,
  parseCookies,
  startSession,
  endSession,
  attachUser,
  requireAuth,
  requireRole,
  isApiRequest,
  loginAllowed,
  loginFailed,
  loginSucceeded
};
