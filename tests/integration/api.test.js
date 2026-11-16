/**
 * Integration tests: the real app (router, middleware, controllers, services,
 * repositories) against a fresh in-memory SQLite database, over real HTTP.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../../src/app');
const { loadConfig } = require('../../src/config');
const { openDatabase } = require('../../src/db/database');
const { hashPassword, verifyPassword } = require('../../src/lib/password');

const fastHasher = {
  hashPassword: (pw) => hashPassword(pw, { N: 1024, r: 8, p: 1 }),
  verifyPassword,
};

let server;
let baseUrl;
let db;

/** Minimal cookie-jar client. */
function client() {
  let cookie = '';
  return {
    async request(path, { method = 'GET', body, headers = {}, redirect = 'manual' } = {}) {
      const res = await fetch(baseUrl + path, {
        method,
        redirect,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        const [pair] = setCookie.split(';');
        cookie = pair.endsWith('=') ? '' : pair;
      }
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      return { status: res.status, headers: res.headers, json, text, setCookie };
    },
  };
}

const profileBody = (overrides = {}) => ({
  displayName: 'Test Bassist',
  instruments: [{ instrumentId: 4, skillLevel: 'intermediate' }], // Bass
  genreIds: [1, 2],
  zip: '60614',
  availability: ['weekends'],
  bio: 'Testing.',
  links: ['https://soundcloud.com/test'],
  ...overrides,
});

before(async () => {
  db = openDatabase(':memory:');
  const config = { ...loadConfig({}), databasePath: ':memory:', zipLookupEnabled: false };
  const app = createApp({ config, db, hasher: fastHasher });
  server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

describe('health and static files', () => {
  it('GET /health reports ok', async () => {
    const res = await client().request('/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
    assert.equal(res.json.database, 'ok');
  });

  it('serves the home page and CSS with security headers', async () => {
    const page = await client().request('/');
    assert.equal(page.status, 200);
    assert.match(page.text, /Musician Finder/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(page.headers.get('x-request-id'));
    const css = await client().request('/css/styles.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
  });

  it('blocks path traversal and direct .html access', async () => {
    const traversal = await client().request('/../src/config.js');
    assert.equal(traversal.status, 404);
    const direct = await client().request('/dashboard.html');
    assert.equal(direct.status, 404);
  });

  it('returns a friendly 404 page and JSON 404 for unknown API routes', async () => {
    const page = await client().request('/no-such-page');
    assert.equal(page.status, 404);
    assert.match(page.text, /wrong note/);
    const api = await client().request('/api/nope');
    assert.equal(api.status, 404);
    assert.equal(api.json.error.code, 'NOT_FOUND');
  });

  it('lists the form options', async () => {
    const res = await client().request('/api/options');
    assert.ok(res.json.instruments.length >= 10);
    assert.ok(res.json.genres.length >= 10);
    assert.deepEqual(res.json.distances, [5, 10, 25, 50]);
    assert.deepEqual(res.json.skillLevels, ['beginner', 'intermediate', 'advanced', 'professional']);
  });
});

describe('full Sprint 1 flow over HTTP', () => {
  const alice = client();
  const bob = client();

  it('US-1: registers and lands on profile setup with a secure session cookie', async () => {
    const res = await alice.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'alice-password' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.redirectTo, '/profile/edit');
    assert.match(res.setCookie, /mf_session=/);
    assert.match(res.setCookie, /HttpOnly/);
    assert.match(res.setCookie, /SameSite=Lax/);
    assert.match(res.setCookie, /Max-Age=604800/);

    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('alice@example.com');
    assert.match(row.password_hash, /^scrypt\$/);
    assert.doesNotMatch(row.password_hash, /alice-password/);
  });

  it('US-1: duplicate email and short password are rejected', async () => {
    const dup = await client().request('/api/auth/register', {
      method: 'POST',
      body: { email: 'ALICE@example.com', password: 'another-pass' },
    });
    assert.equal(dup.status, 409);
    const short = await client().request('/api/auth/register', {
      method: 'POST',
      body: { email: 'new@example.com', password: 'short' },
    });
    assert.equal(short.status, 400);
    assert.ok(short.json.error.fields.password);
    const count = db.prepare("SELECT COUNT(*) n FROM users WHERE email IN ('alice@example.com','new@example.com')").get();
    assert.equal(count.n, 1);
  });

  it('rejects malformed requests cleanly', async () => {
    const badJson = await client().request('/api/auth/register', { method: 'POST', body: '{nope' });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.json.error.code, 'BAD_JSON');
    const arrayBody = await client().request('/api/auth/register', { method: 'POST', body: '[1,2]' });
    assert.equal(arrayBody.status, 400);
    const form = await client().request('/api/auth/login', {
      method: 'POST',
      body: 'email=a&password=b',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(form.status, 415);
  });

  it('US-3: saves a profile; invalid ZIP is rejected and nothing is saved', async () => {
    const bad = await alice.request('/api/profile', { method: 'PUT', body: profileBody({ zip: '99999' }) });
    assert.equal(bad.status, 400);
    assert.ok(bad.json.error.fields.zip);
    const empty = await alice.request('/api/profile');
    assert.equal(empty.json.profile, null);

    const missing = await alice.request('/api/profile', { method: 'PUT', body: { zip: '60614' } });
    assert.equal(missing.status, 400);
    assert.ok(missing.json.error.fields.displayName && missing.json.error.fields.instruments);

    const ok = await alice.request('/api/profile', { method: 'PUT', body: profileBody() });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.profile.displayName, 'Test Bassist');
    assert.equal(ok.json.profile.zip, '60614');
  });

  it('US-4: search filters, distance and ordering', async () => {
    await bob.request('/api/auth/register', { method: 'POST', body: { email: 'bob@example.com', password: 'bob-password' } });
    await bob.request('/api/profile', {
      method: 'PUT',
      body: profileBody({ displayName: 'Bob Drums', zip: '60201', instruments: [{ instrumentId: 5, skillLevel: 'advanced' }] }),
    });

    const drums = await alice.request('/api/musicians?instrument=5&distance=10');
    assert.equal(drums.status, 200);
    assert.deepEqual(drums.json.results.map((r) => r.displayName), ['Bob Drums']);
    assert.equal(drums.json.results[0].distanceMiles, 9);

    const tooFar = await alice.request('/api/musicians?instrument=5&distance=5');
    assert.equal(tooFar.json.total, 0);
    assert.equal(tooFar.json.widerDistance, 10);

    const bad = await alice.request('/api/musicians?distance=3');
    assert.equal(bad.status, 400);
  });

  it('US-4: search needs a profile first', async () => {
    const carol = client();
    await carol.request('/api/auth/register', { method: 'POST', body: { email: 'carol@example.com', password: 'carol-password' } });
    const res = await carol.request('/api/musicians');
    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, 'PROFILE_REQUIRED');
  });

  it('US-5: public profile hides email and ZIP code and shows distance', async () => {
    const bobId = db.prepare("SELECT id FROM users WHERE email = 'bob@example.com'").get().id;
    const res = await alice.request(`/api/musicians/${bobId}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.musician.displayName, 'Bob Drums');
    assert.equal(res.json.musician.distanceMiles, 9);
    assert.doesNotMatch(res.text, /bob@example\.com|60201|latitude/);

    const missing = await alice.request('/api/musicians/99999');
    assert.equal(missing.status, 404);
  });

  it('US-3: edits show on the public profile immediately', async () => {
    await bob.request('/api/profile', {
      method: 'PUT',
      body: profileBody({ displayName: 'Bob the Drummer', zip: '60201', instruments: [{ instrumentId: 5, skillLevel: 'professional' }] }),
    });
    const bobId = db.prepare("SELECT id FROM users WHERE email = 'bob@example.com'").get().id;
    const res = await alice.request(`/api/musicians/${bobId}`);
    assert.equal(res.json.musician.displayName, 'Bob the Drummer');
    assert.equal(res.json.musician.instruments[0].skillLevel, 'professional');
  });

  it('US-2: logout ends the session and protected pages redirect to login', async () => {
    const dash = await alice.request('/dashboard');
    assert.equal(dash.status, 200);
    assert.equal(dash.headers.get('cache-control'), 'no-store');

    const out = await alice.request('/api/auth/logout', { method: 'POST' });
    assert.equal(out.status, 200);
    assert.match(out.setCookie, /Max-Age=0/);

    const me = await alice.request('/api/auth/me');
    assert.equal(me.status, 401);
    const page = await alice.request('/dashboard');
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), '/login?next=%2Fdashboard');
  });

  it('US-2: an old session token stops working after logout', async () => {
    const dave = client();
    const reg = await dave.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'dave@example.com', password: 'dave-password' },
    });
    const stolenCookie = reg.setCookie.split(';')[0];
    await dave.request('/api/auth/logout', { method: 'POST' });
    const replay = await client().request('/api/auth/me', { headers: { Cookie: stolenCookie } });
    assert.equal(replay.status, 401);
  });

  it('US-2: login works, uses one generic error, and locks after 5 failures', async () => {
    const ok = await alice.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'alice-password' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.redirectTo, '/dashboard');

    const wrongPw = await client().request('/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'nope-nope' },
    });
    const noUser = await client().request('/api/auth/login', {
      method: 'POST',
      body: { email: 'nobody@example.com', password: 'nope-nope' },
    });
    assert.equal(wrongPw.status, 401);
    assert.equal(wrongPw.json.error.message, noUser.json.error.message);

    for (let i = 0; i < 4; i += 1) {
      await client().request('/api/auth/login', {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'nope-nope' },
      });
    }
    const locked = await client().request('/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'alice-password' },
    });
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get('retry-after')) > 0);
  });

  it('signed-in users visiting /login are sent to the dashboard', async () => {
    const res = await alice.request('/login');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');
  });

  it('API routes require a session', async () => {
    for (const path of ['/api/profile', '/api/musicians', '/api/musicians/1', '/api/auth/me']) {
      const res = await client().request(path);
      assert.equal(res.status, 401, path);
    }
  });
});

describe('error handling', () => {
  it('hides internal errors behind a generic message with a request id', async () => {
    const config = { ...loadConfig({}), databasePath: ':memory:' };
    const brokenDb = openDatabase(':memory:');
    const errors = [];
    const app = createApp({ config, db: brokenDb, hasher: fastHasher, logger: { info() {}, warn() {}, error: (m) => errors.push(m) } });
    const c = client();
    const local = http.createServer(app.handler);
    await new Promise((r) => local.listen(0, r));
    const url = `http://127.0.0.1:${local.address().port}`;
    const prevBase = baseUrl;
    baseUrl = url;
    try {
      await c.request('/api/auth/register', { method: 'POST', body: { email: 'e@example.com', password: 'e-password' } });
      brokenDb.exec('DROP TABLE profile_genres');
      const res = await c.request('/api/profile', { method: 'PUT', body: profileBody() });
      assert.equal(res.status, 500);
      assert.equal(res.json.error.code, 'INTERNAL_ERROR');
      assert.ok(res.json.error.requestId);
      assert.doesNotMatch(res.text, /profile_genres|stack|at /);
      assert.equal(errors.length, 1);
      assert.match(errors[0], new RegExp(res.json.error.requestId));
    } finally {
      baseUrl = prevBase;
      local.close();
    }
  });
});
