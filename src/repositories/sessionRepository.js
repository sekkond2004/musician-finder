/** SQL for the sessions table. Tokens arrive here already hashed. */
class SessionRepository {
  constructor(db) {
    this.insertStmt = db.prepare(
      'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    );
    this.findStmt = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?');
    this.deleteStmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
    this.deleteExpiredStmt = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  }

  create(tokenHash, userId, expiresAt, now) {
    this.insertStmt.run(tokenHash, userId, expiresAt, now);
  }

  findValid(tokenHash, now) {
    const row = this.findStmt.get(tokenHash, now);
    return row ? { userId: row.user_id, expiresAt: row.expires_at } : null;
  }

  delete(tokenHash) {
    this.deleteStmt.run(tokenHash);
  }

  deleteExpired(now) {
    return Number(this.deleteExpiredStmt.run(now).changes);
  }
}

module.exports = { SessionRepository };
