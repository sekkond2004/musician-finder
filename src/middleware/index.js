/**
 * Cross-cutting middleware: request context, security headers, JSON bodies,
 * session lookup, auth guards, logging and error handling.
 */
const crypto = require('node:crypto');
const { parseCookies, decorateResponse, readJsonBody } = require('../lib/http');
const { AppError, AuthError } = require('../lib/errors');

const SESSION_COOKIE = 'mf_session';

/** Adds req.id, req.path, req.query, req.cookies and response helpers. */
function requestContext() {
  return (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    req.id = crypto.randomUUID();
    req.path = url.pathname;
    req.query = Object.fromEntries(url.searchParams);
    req.cookies = parseCookies(req.headers.cookie);
    decorateResponse(res);
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}

function securityHeaders({ isProduction }) {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    next();
  };
}

/** One log line per request: method, path, status, duration and request id. */
function requestLogger(logger) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms id=${req.id}`);
    });
    next();
  };
}

/**
 * Parse JSON bodies for state-changing API requests. Requiring the
 * application/json content type (plus SameSite=Lax session cookies) blocks
 * cross-site form posts (CSRF): browsers can't send that type cross-origin
 * without a CORS preflight, which this server never approves.
 */
function jsonBody() {
  return async (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const type = req.headers['content-type'] || '';
    const length = Number(req.headers['content-length'] || 0);
    const hasBody = length > 0 || Boolean(req.headers['transfer-encoding']);
    if (!hasBody) {
      req.body = {};
      return next();
    }
    if (!type.startsWith('application/json')) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request body as JSON.');
    }
    req.body = await readJsonBody(req);
    return next();
  };
}

/** Looks up the session cookie and sets req.user (or null). */
function loadSession(authService) {
  return (req, res, next) => {
    req.sessionToken = req.cookies[SESSION_COOKIE] || null;
    req.user = authService.authenticate(req.sessionToken);
    next();
  };
}

/** API guard: 401 JSON when not signed in. */
function requireAuth(req, res, next) {
  if (!req.user) throw new AuthError();
  next();
}

/** Page guard: redirect to the login page when not signed in. */
function requirePageAuth(req, res, next) {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.path)}`);
  return next();
}

function setSessionCookie(res, token, expiresAt, { isProduction }) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    maxAge: Math.max(0, expiresAt - Date.now()),
  });
}

function clearSessionCookie(res, { isProduction }) {
  res.cookie(SESSION_COOKIE, '', { httpOnly: true, secure: isProduction, sameSite: 'Lax', maxAge: 0 });
}

/** Unknown /api route -> JSON 404; anything else -> the friendly 404 page. */
function notFound(publicDir) {
  return (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
      return;
    }
    res.statusCode = 404;
    res.sendFile(`${publicDir}/404.html`, { noStore: true });
  };
}

/**
 * NFR5: server errors are logged with the request id; the user gets a plain
 * message (never a stack trace).
 */
function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (err instanceof AppError) {
      if (err.status === 429 && err.details && err.details.retryAfterSeconds) {
        res.setHeader('Retry-After', String(err.details.retryAfterSeconds));
      }
      res.status(err.status).json({
        error: { code: err.code, message: err.message, fields: err.details || undefined },
      });
      return;
    }
    logger.error(`Unhandled error id=${req.id} ${req.method} ${req.path}: ${err && err.stack ? err.stack : err}`);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side. Please try again.',
        requestId: req.id,
      },
    });
  };
}

module.exports = {
  SESSION_COOKIE,
  requestContext,
  securityHeaders,
  requestLogger,
  jsonBody,
  loadSession,
  requireAuth,
  requirePageAuth,
  setSessionCookie,
  clearSessionCookie,
  notFound,
  errorHandler,
};
