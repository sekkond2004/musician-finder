-- Musician Finder schema (Sprint 1).
-- Mirrors the database design in the project plan. Sprint 2 adds listings,
-- conversations and messages; Sprint 3 adds blocks and reports.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Session tokens are stored hashed (SHA-256) so a leaked database can't be used to hijack sessions.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Failed login attempts, used for the 5-in-15-minutes lockout (US-2).
CREATE TABLE IF NOT EXISTS login_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    NOT NULL COLLATE NOCASE,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, attempted_at);

-- Cache of ZIP code -> coordinates. Filled by the seed and by Zippopotam.us lookups.
CREATE TABLE IF NOT EXISTS zip_codes (
  zip       TEXT PRIMARY KEY,
  latitude  REAL NOT NULL,
  longitude REAL NOT NULL,
  place     TEXT
);

CREATE TABLE IF NOT EXISTS instruments (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS genres (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT    NOT NULL,
  bio          TEXT    NOT NULL DEFAULT '',
  zip          TEXT    NOT NULL,
  latitude     REAL    NOT NULL,
  longitude    REAL    NOT NULL,
  availability TEXT    NOT NULL DEFAULT '[]', -- JSON array of availability keys
  links        TEXT    NOT NULL DEFAULT '[]', -- JSON array of up to 3 recording URLs
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(latitude, longitude);

CREATE TABLE IF NOT EXISTS profile_instruments (
  profile_id    INTEGER NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  skill_level   TEXT    NOT NULL CHECK (skill_level IN ('beginner','intermediate','advanced','professional')),
  PRIMARY KEY (profile_id, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_instruments_instrument ON profile_instruments(instrument_id, skill_level);

CREATE TABLE IF NOT EXISTS profile_genres (
  profile_id INTEGER NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  genre_id   INTEGER NOT NULL REFERENCES genres(id),
  PRIMARY KEY (profile_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_genres_genre ON profile_genres(genre_id);
