/**
 * Business rules for accounts and sessions (US-1, US-2).
 *
 * Dependencies are injected (repositories, password hasher, clock) so the
 * rules can be unit-tested with in-memory fakes and a fake clock.
 */
const crypto = require('node:crypto');
const { ValidationError, ConflictError, AppError, RateLimitError } = require('../lib/errors');
const {
  normalizeEmail,
  isValidEmail,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} = require('../lib/validation');

const GENERIC_LOGIN_ERROR = 'Incorrect email or password.';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

class AuthService {
  /**
   * @param {object} deps
   * @param {import('../repositories/userRepository').UserRepository} deps.users
   * @param {import('../repositories/sessionRepository').SessionRepository} deps.sessions
   * @param {import('../repositories/loginAttemptRepository').LoginAttemptRepository} deps.loginAttempts
   * @param {{hashPassword:Function, verifyPassword:Function}} deps.hasher
   * @param {{now:() => number}} deps.clock
   * @param {{sessionTtlMs:number, login:{maxFailures:number, windowMs:number, lockMs:number}}} deps.config
   */
  constructor({ users, sessions, loginAttempts, hasher, clock, config }) {
    this.users = users;
    this.sessions = sessions;
    this.loginAttempts = loginAttempts;
    this.hasher = hasher;
    this.clock = clock;
    this.config = config;
  }

  validateCredentials(email, password) {
    const errors = {};
    if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
      errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    } else if (password.length > PASSWORD_MAX_LENGTH) {
      errors.password = `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  /** US-1: create an account and sign the new user in. */
  async register({ email, password } = {}) {
    const normalized = normalizeEmail(email);
    this.validateCredentials(normalized, password);

    if (this.users.findByEmail(normalized)) {
      throw new ConflictError('An account with this email already exists.', {
        email: 'An account with this email already exists.',
      });
    }

    const passwordHash = await this.hasher.hashPassword(password);
    let user;
    try {
      user = this.users.create(normalized, passwordHash);
    } catch (err) {
      // Two sign-ups with the same email at the same moment: the UNIQUE constraint wins.
      if (String(err.message).includes('UNIQUE')) {
        throw new ConflictError('An account with this email already exists.', {
          email: 'An account with this email already exists.',
        });
      }
      throw err;
    }
    const session = this.createSession(user.id);
    return { user: { id: user.id, email: user.email }, ...session };
  }

  /** Returns the time (ms) until which login is blocked for this email, or 0. */
  lockedUntil(email) {
    const { maxFailures, windowMs, lockMs } = this.config.login;
    const now = this.clock.now();
    const recent = this.loginAttempts.failuresSince(email, now - windowMs - lockMs);
    if (recent.length < maxFailures) return 0;
    const latest = recent[0];
    if (now - latest >= lockMs) return 0;
    // Locked if `maxFailures` failures happened within `windowMs` ending at the latest one.
    const inWindow = recent.filter((t) => latest - t < windowMs);
    return inWindow.length >= maxFailures ? latest + lockMs : 0;
  }

  /** US-2: sign in with a generic error that never says which field was wrong. */
  async login({ email, password } = {}) {
    const normalized = normalizeEmail(email);
    if (!normalized || typeof password !== 'string' || password.length === 0) {
      throw new AppError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
    }

    const lockedUntil = this.lockedUntil(normalized);
    if (lockedUntil) {
      const minutes = Math.ceil((lockedUntil - this.clock.now()) / 60000);
      throw new RateLimitError(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        Math.ceil((lockedUntil - this.clock.now()) / 1000),
      );
    }

    const user = this.users.findByEmail(normalized);
    const ok = user ? await this.hasher.verifyPassword(password, user.passwordHash) : false;
    if (!ok) {
      this.loginAttempts.recordFailure(normalized, this.clock.now());
      throw new AppError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
    }

    this.loginAttempts.clear(normalized);
    const session = this.createSession(user.id);
    return { user: { id: user.id, email: user.email }, ...session };
  }

  createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const expiresAt = now + this.config.sessionTtlMs;
    this.sessions.create(hashToken(token), userId, expiresAt, now);
    return { token, expiresAt };
  }

  /** Returns the signed-in user for a session token, or null. */
  authenticate(token) {
    if (!token || typeof token !== 'string') return null;
    const session = this.sessions.findValid(hashToken(token), this.clock.now());
    if (!session) return null;
    return this.users.findById(session.userId);
  }

  logout(token) {
    if (token && typeof token === 'string') this.sessions.delete(hashToken(token));
  }

  purgeExpiredSessions() {
    return this.sessions.deleteExpired(this.clock.now());
  }
}

module.exports = { AuthService, hashToken, GENERIC_LOGIN_ERROR };
