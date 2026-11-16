/**
 * HTTP helpers shared by middleware and controllers: JSON bodies, cookies,
 * response shortcuts and static file serving.
 */
const fs = require('node:fs');
const path = require('node:path');
const { AppError } = require('./errors');

const MAX_BODY_BYTES = 100 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      cookies[name] = part.slice(eq + 1).trim();
    }
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.round(options.maxAge / 1000)}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  return parts.join('; ');
}

/** Read and parse a JSON request body (only for POST/PUT/PATCH/DELETE). */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(new AppError(400, 'BAD_JSON', 'Request body must be a JSON object.'));
        }
        return resolve(parsed);
      } catch {
        return reject(new AppError(400, 'BAD_JSON', 'Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/** Adds Express-like helpers (res.json, res.redirect, res.cookie) to the response. */
function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    const body = JSON.stringify(data);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
  };
  res.redirect = (location, code = 302) => {
    res.statusCode = code;
    res.setHeader('Location', location);
    res.end();
  };
  res.cookie = (name, value, options) => {
    const existing = res.getHeader('Set-Cookie');
    const list = existing ? [].concat(existing) : [];
    list.push(serializeCookie(name, value, options));
    res.setHeader('Set-Cookie', list);
  };
  res.sendFile = (filePath, { noStore = false } = {}) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
      // HTML pages are never cached so the back button can't show a logged-out user a stale page (US-2).
      res.setHeader('Cache-Control', noStore ? 'no-store' : 'public, max-age=300');
      res.end(data);
    });
  };
  return res;
}

/** Serve files from `root` for GET requests whose path has a file extension. */
function staticFiles(root) {
  const resolvedRoot = path.resolve(root);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // Pages go through their routes (so sign-in guards apply), not straight off disk.
    if (!path.extname(req.path) || path.extname(req.path) === '.html') return next();
    const filePath = path.resolve(resolvedRoot, '.' + req.path);
    // Block path traversal (e.g. /../src/config.js).
    if (!filePath.startsWith(resolvedRoot + path.sep)) return next();
    return fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) return next();
      return res.sendFile(filePath);
    });
  };
}

module.exports = { parseCookies, serializeCookie, readJsonBody, decorateResponse, staticFiles, MIME_TYPES };
