const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { haversineMiles, boundingBox, roundMiles } = require('../../src/lib/geo');
const { hashPassword, verifyPassword } = require('../../src/lib/password');
const v = require('../../src/lib/validation');
const { parseCookies, serializeCookie } = require('../../src/lib/http');
const { loadConfig } = require('../../src/config');

const CHICAGO = { latitude: 41.8858, longitude: -87.6181 };
const EVANSTON = { latitude: 42.0546, longitude: -87.6942 };

describe('geo', () => {
  it('computes great-circle distance in miles', () => {
    assert.equal(haversineMiles(CHICAGO, CHICAGO), 0);
    const d = haversineMiles(CHICAGO, EVANSTON);
    assert.ok(d > 12 && d < 13, `Loop to Evanston is ~12.3 miles, got ${d}`);
    assert.equal(haversineMiles(CHICAGO, EVANSTON).toFixed(6), haversineMiles(EVANSTON, CHICAGO).toFixed(6));
  });

  it('builds a bounding box that contains every point within the radius', () => {
    const box = boundingBox(CHICAGO, 25);
    assert.ok(box.minLat < CHICAGO.latitude && box.maxLat > CHICAGO.latitude);
    assert.ok(box.minLon < CHICAGO.longitude && box.maxLon > CHICAGO.longitude);
    // A point 24.9 miles due north and due east must fall inside the box.
    const north = { latitude: CHICAGO.latitude + 24.9 / 69, longitude: CHICAGO.longitude };
    assert.ok(north.latitude <= box.maxLat);
    const eastLon = CHICAGO.longitude + 24.9 / (69 * Math.cos((CHICAGO.latitude * Math.PI) / 180));
    assert.ok(eastLon <= box.maxLon);
  });

  it('rounds to the nearest mile', () => {
    assert.equal(roundMiles(0.4), 0);
    assert.equal(roundMiles(9.5), 10);
    assert.equal(roundMiles(9.49), 9);
  });
});

describe('password hashing', () => {
  const fast = { N: 1024, r: 8, p: 1 };

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery', fast);
    assert.match(hash, /^scrypt\$1024\$8\$1\$/);
    assert.equal(await verifyPassword('correct horse battery', hash), true);
    assert.equal(await verifyPassword('wrong horse battery', hash), false);
  });

  it('salts each hash so equal passwords produce different hashes', async () => {
    const a = await hashPassword('same-password', fast);
    const b = await hashPassword('same-password', fast);
    assert.notEqual(a, b);
  });

  it('rejects malformed stored hashes', async () => {
    assert.equal(await verifyPassword('x', null), false);
    assert.equal(await verifyPassword('x', 'bcrypt$whatever'), false);
    assert.equal(await verifyPassword('x', 'scrypt$1$2$3'), false);
  });
});

describe('validation helpers', () => {
  it('validates emails', () => {
    assert.equal(v.isValidEmail('a@b.co'), true);
    assert.equal(v.isValidEmail('a@b'), false);
    assert.equal(v.isValidEmail('a b@c.com'), false);
    assert.equal(v.isValidEmail(null), false);
    assert.equal(v.normalizeEmail('  A@B.CO '), 'a@b.co');
    assert.equal(v.normalizeEmail(undefined), '');
  });

  it('validates ZIP codes and URLs', () => {
    assert.equal(v.isValidZip('60614'), true);
    assert.equal(v.isValidZip('6061a'), false);
    assert.equal(v.isValidUrl('https://soundcloud.com/x'), true);
    assert.equal(v.isValidUrl('ftp://x.com'), false);
    assert.equal(v.isValidUrl('not a url'), false);
    assert.equal(v.isValidUrl('https://x.com/' + 'a'.repeat(300)), false);
  });

  it('parses ids', () => {
    assert.equal(v.toId('5'), 5);
    assert.equal(v.toId('0'), null);
    assert.equal(v.toId('1.5'), null);
    assert.equal(v.toId('abc'), null);
  });
});

describe('cookies', () => {
  it('parses and serializes cookies', () => {
    assert.deepEqual(parseCookies('a=1; mf_session=abc%20def; bad; =x'), { a: '1', mf_session: 'abc def' });
    assert.deepEqual(parseCookies(undefined), {});
    const cookie = serializeCookie('mf_session', 'tok', { httpOnly: true, secure: true, maxAge: 7000 });
    assert.equal(cookie, 'mf_session=tok; Path=/; Max-Age=7; HttpOnly; Secure; SameSite=Lax');
  });
});

describe('config', () => {
  it('has safe defaults and reads environment variables', () => {
    const dev = loadConfig({});
    assert.equal(dev.port, 3000);
    assert.equal(dev.isProduction, false);
    assert.equal(dev.seedCount, 60);
    assert.equal(dev.sessionTtlMs, 7 * 24 * 60 * 60 * 1000);
    const prod = loadConfig({ NODE_ENV: 'production', PORT: '8080', SEED_COUNT: '0', ZIP_LOOKUP_ENABLED: 'false' });
    assert.equal(prod.isProduction, true);
    assert.equal(prod.port, 8080);
    assert.equal(prod.seedCount, 0);
    assert.equal(prod.zipLookupEnabled, false);
  });
});
