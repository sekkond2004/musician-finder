/**
 * Password hashing with Node's built-in scrypt (a memory-hard KDF in the same
 * family as bcrypt). Hashes are stored as "scrypt$N$r$p$salt$hash" so the cost
 * parameters can be raised later without breaking existing accounts.
 */
const crypto = require('node:crypto');

const KEY_LENGTH = 64;
const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 };

function scryptAsync(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

async function hashPassword(password, params = DEFAULT_PARAMS) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, params);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  // Constant-time comparison so response timing doesn't leak how close a guess was.
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { hashPassword, verifyPassword };
