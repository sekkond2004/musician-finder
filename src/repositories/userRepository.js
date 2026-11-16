/**
 * Repository pattern: every SQL query for the users table lives here. Services
 * receive this object through their constructor, so unit tests can pass an
 * in-memory fake with the same methods instead of a real database.
 */
class UserRepository {
  constructor(db) {
    this.db = db;
    this.insertStmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    this.byEmailStmt = db.prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?');
    this.byIdStmt = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?');
  }

  create(email, passwordHash) {
    const result = this.insertStmt.run(email, passwordHash);
    return { id: Number(result.lastInsertRowid), email };
  }

  findByEmail(email) {
    const row = this.byEmailStmt.get(email);
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at } : null;
  }

  findById(id) {
    const row = this.byIdStmt.get(id);
    return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
  }
}

module.exports = { UserRepository };
