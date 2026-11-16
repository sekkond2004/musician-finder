const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { AuthService, hashToken, GENERIC_LOGIN_ERROR } = require('../../src/services/authService');
const {
  FakeClock,
  fakeHasher,
  FakeUserRepository,
  FakeSessionRepository,
  FakeLoginAttemptRepository,
} = require('../helpers/fakes');

const MINUTE = 60 * 1000;
const config = {
  sessionTtlMs: 7 * 24 * 60 * MINUTE,
  login: { maxFailures: 5, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE },
};

describe('AuthService', () => {
  let users;
  let sessions;
  let attempts;
  let clock;
  let auth;

  beforeEach(() => {
    users = new FakeUserRepository();
    sessions = new FakeSessionRepository();
    attempts = new FakeLoginAttemptRepository();
    clock = new FakeClock();
    auth = new AuthService({ users, sessions, loginAttempts: attempts, hasher: fakeHasher, clock, config });
  });

  describe('register (US-1)', () => {
    it('creates an account with a normalized email and signs the user in', async () => {
      const result = await auth.register({ email: '  Drummer@Example.COM ', password: 'longenough' });
      assert.equal(result.user.email, 'drummer@example.com');
      assert.ok(result.token);
      assert.equal(result.expiresAt, clock.now() + config.sessionTtlMs);
      assert.deepEqual(auth.authenticate(result.token), users.findById(result.user.id));
    });

    it('stores only a hash of the password', async () => {
      await auth.register({ email: 'a@b.co', password: 'longenough' });
      const stored = users.findByEmail('a@b.co');
      assert.notEqual(stored.passwordHash, 'longenough');
      assert.equal(stored.passwordHash, 'hashed:longenough');
    });

    it('rejects an email that is already in use, ignoring case', async () => {
      await auth.register({ email: 'a@b.co', password: 'longenough' });
      await assert.rejects(auth.register({ email: 'A@B.CO', password: 'different1' }), (err) => {
        assert.equal(err.status, 409);
        assert.ok(err.details.email);
        return true;
      });
      assert.equal(users.rows.length, 1, 'no second account is created');
    });

    it('rejects a password shorter than 8 characters', async () => {
      await assert.rejects(auth.register({ email: 'a@b.co', password: 'short7!' }), (err) => {
        assert.equal(err.status, 400);
        assert.match(err.details.password, /at least 8/);
        return true;
      });
    });

    it('accepts a password of exactly 8 characters', async () => {
      const result = await auth.register({ email: 'a@b.co', password: '12345678' });
      assert.ok(result.user.id);
    });

    it('rejects an invalid email and a missing body', async () => {
      await assert.rejects(auth.register({ email: 'not-an-email', password: 'longenough' }), /fix/);
      await assert.rejects(auth.register(), (err) => err.status === 400);
    });

    it('rejects an overly long password', async () => {
      await assert.rejects(auth.register({ email: 'a@b.co', password: 'x'.repeat(129) }), (err) =>
        /at most/.test(err.details.password),
      );
    });

    it('turns a UNIQUE constraint race into a 409', async () => {
      users.create = () => {
        throw new Error('UNIQUE constraint failed: users.email');
      };
      await assert.rejects(auth.register({ email: 'a@b.co', password: 'longenough' }), (err) => err.status === 409);
    });

    it('rethrows unexpected repository errors', async () => {
      users.create = () => {
        throw new Error('disk full');
      };
      await assert.rejects(auth.register({ email: 'a@b.co', password: 'longenough' }), /disk full/);
    });
  });

  describe('login and logout (US-2)', () => {
    beforeEach(async () => {
      await auth.register({ email: 'player@example.com', password: 'correct-horse' });
    });

    it('signs in with correct credentials for 7 days', async () => {
      const result = await auth.login({ email: 'Player@Example.com', password: 'correct-horse' });
      assert.equal(result.user.email, 'player@example.com');
      clock.advance(config.sessionTtlMs - 1);
      assert.ok(auth.authenticate(result.token), 'still valid just before 7 days');
      clock.advance(2);
      assert.equal(auth.authenticate(result.token), null, 'expired after 7 days');
    });

    it('gives the same generic error for a wrong password and an unknown email', async () => {
      const wrongPassword = await auth.login({ email: 'player@example.com', password: 'nope-nope' }).catch((e) => e);
      const unknownEmail = await auth.login({ email: 'ghost@example.com', password: 'correct-horse' }).catch((e) => e);
      assert.equal(wrongPassword.message, GENERIC_LOGIN_ERROR);
      assert.equal(unknownEmail.message, GENERIC_LOGIN_ERROR);
      assert.equal(wrongPassword.status, 401);
      assert.equal(unknownEmail.status, 401);
    });

    it('rejects empty credentials with the generic error', async () => {
      await assert.rejects(auth.login({ email: '', password: '' }), { message: GENERIC_LOGIN_ERROR });
      await assert.rejects(auth.login(), { message: GENERIC_LOGIN_ERROR });
    });

    it('blocks login for 15 minutes after 5 failures in 15 minutes', async () => {
      for (let i = 0; i < 5; i += 1) {
        await assert.rejects(auth.login({ email: 'player@example.com', password: 'wrong-pass' }));
        clock.advance(MINUTE);
      }
      // Even the correct password is refused while locked.
      await assert.rejects(auth.login({ email: 'player@example.com', password: 'correct-horse' }), (err) => {
        assert.equal(err.status, 429);
        assert.match(err.message, /Try again in 14 minutes/);
        return true;
      });
      clock.advance(14 * MINUTE);
      const ok = await auth.login({ email: 'player@example.com', password: 'correct-horse' });
      assert.ok(ok.token, 'unlocked 15 minutes after the 5th failure');
    });

    it('does not lock when failures are spread over more than 15 minutes', async () => {
      for (let i = 0; i < 5; i += 1) {
        await assert.rejects(auth.login({ email: 'player@example.com', password: 'wrong-pass' }));
        clock.advance(4 * MINUTE);
      }
      const ok = await auth.login({ email: 'player@example.com', password: 'correct-horse' });
      assert.ok(ok.token);
    });

    it('clears the failure count after a successful login', async () => {
      for (let i = 0; i < 4; i += 1) {
        await assert.rejects(auth.login({ email: 'player@example.com', password: 'wrong-pass' }));
      }
      await auth.login({ email: 'player@example.com', password: 'correct-horse' });
      assert.equal(attempts.rows.length, 0);
    });

    it('logout ends the session', async () => {
      const { token } = await auth.login({ email: 'player@example.com', password: 'correct-horse' });
      auth.logout(token);
      assert.equal(auth.authenticate(token), null);
    });

    it('stores session tokens hashed, never in plain text', async () => {
      const { token } = await auth.login({ email: 'player@example.com', password: 'correct-horse' });
      assert.ok(sessions.rows.has(hashToken(token)));
      assert.ok(!sessions.rows.has(token));
    });

    it('authenticate returns null for missing or unknown tokens', () => {
      assert.equal(auth.authenticate(undefined), null);
      assert.equal(auth.authenticate(42), null);
      assert.equal(auth.authenticate('not-a-real-token'), null);
      auth.logout(undefined); // does not throw
    });

    it('purges expired sessions', async () => {
      await auth.login({ email: 'player@example.com', password: 'correct-horse' });
      clock.advance(config.sessionTtlMs + 1);
      assert.equal(auth.purgeExpiredSessions(), 2); // the registration session + the login session
    });
  });
});
