/** SQL for failed login attempts (used by the lockout rule in AuthService). */
class LoginAttemptRepository {
  constructor(db) {
    this.insertStmt = db.prepare('INSERT INTO login_attempts (email, attempted_at) VALUES (?, ?)');
    this.sinceStmt = db.prepare(
      'SELECT attempted_at FROM login_attempts WHERE email = ? AND attempted_at > ? ORDER BY attempted_at DESC',
    );
    this.clearStmt = db.prepare('DELETE FROM login_attempts WHERE email = ?');
  }

  recordFailure(email, at) {
    this.insertStmt.run(email, at);
  }

  /** Timestamps of failures after `since`, newest first. */
  failuresSince(email, since) {
    return this.sinceStmt.all(email, since).map((row) => row.attempted_at);
  }

  clear(email) {
    this.clearStmt.run(email);
  }
}

module.exports = { LoginAttemptRepository };
