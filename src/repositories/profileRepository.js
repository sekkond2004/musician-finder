/**
 * SQL for profiles and their instruments and genres. Every query is
 * parameterized (NFR2). Search returns candidates inside a bounding box;
 * the SearchService computes exact distances and sorts them.
 */
const { transaction } = require('../db/database');

class ProfileRepository {
  constructor(db) {
    this.db = db;
    this.findStmt = db.prepare(
      `SELECT user_id, display_name, bio, zip, latitude, longitude, availability, links, updated_at
         FROM profiles WHERE user_id = ?`,
    );
    this.instrumentsStmt = db.prepare(
      `SELECT pi.instrument_id AS id, i.name, pi.skill_level
         FROM profile_instruments pi JOIN instruments i ON i.id = pi.instrument_id
        WHERE pi.profile_id = ? ORDER BY i.name`,
    );
    this.genresStmt = db.prepare(
      `SELECT g.id, g.name FROM profile_genres pg JOIN genres g ON g.id = pg.genre_id
        WHERE pg.profile_id = ? ORDER BY g.name`,
    );
    this.upsertStmt = db.prepare(
      `INSERT INTO profiles (user_id, display_name, bio, zip, latitude, longitude, availability, links, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name, bio = excluded.bio, zip = excluded.zip,
         latitude = excluded.latitude, longitude = excluded.longitude,
         availability = excluded.availability, links = excluded.links, updated_at = excluded.updated_at`,
    );
    this.clearInstrumentsStmt = db.prepare('DELETE FROM profile_instruments WHERE profile_id = ?');
    this.clearGenresStmt = db.prepare('DELETE FROM profile_genres WHERE profile_id = ?');
    this.addInstrumentStmt = db.prepare(
      'INSERT INTO profile_instruments (profile_id, instrument_id, skill_level) VALUES (?, ?, ?)',
    );
    this.addGenreStmt = db.prepare('INSERT INTO profile_genres (profile_id, genre_id) VALUES (?, ?)');
    this.countStmt = db.prepare('SELECT COUNT(*) AS n FROM profiles');
  }

  findByUserId(userId) {
    const row = this.findStmt.get(userId);
    if (!row) return null;
    return {
      userId: row.user_id,
      displayName: row.display_name,
      bio: row.bio,
      zip: row.zip,
      latitude: row.latitude,
      longitude: row.longitude,
      availability: JSON.parse(row.availability),
      links: JSON.parse(row.links),
      updatedAt: row.updated_at,
      instruments: this.instrumentsStmt
        .all(userId)
        .map((r) => ({ id: r.id, name: r.name, skillLevel: r.skill_level })),
      genres: this.genresStmt.all(userId).map((r) => ({ id: r.id, name: r.name })),
    };
  }

  /** Create or replace a profile and its instrument/genre rows in one transaction. */
  save(profile) {
    transaction(this.db, () => {
      this.upsertStmt.run(
        profile.userId,
        profile.displayName,
        profile.bio,
        profile.zip,
        profile.latitude,
        profile.longitude,
        JSON.stringify(profile.availability),
        JSON.stringify(profile.links),
      );
      this.clearInstrumentsStmt.run(profile.userId);
      this.clearGenresStmt.run(profile.userId);
      for (const inst of profile.instruments) {
        this.addInstrumentStmt.run(profile.userId, inst.id, inst.skillLevel);
      }
      for (const genreId of profile.genreIds) {
        this.addGenreStmt.run(profile.userId, genreId);
      }
    });
    return this.findByUserId(profile.userId);
  }

  count() {
    return Number(this.countStmt.get().n);
  }

  /**
   * Profiles inside a lat/lng box that match every filter given.
   * @param {{box:{minLat,maxLat,minLon,maxLon}, excludeUserId:number,
   *          instrumentId?:number, genreId?:number, skillLevel?:string}} criteria
   */
  findCandidates({ box, excludeUserId, instrumentId, genreId, skillLevel }) {
    const where = ['p.latitude BETWEEN ? AND ?', 'p.longitude BETWEEN ? AND ?', 'p.user_id <> ?'];
    const params = [box.minLat, box.maxLat, box.minLon, box.maxLon, excludeUserId];

    if (instrumentId || skillLevel) {
      const sub = ['pi.profile_id = p.user_id'];
      if (instrumentId) {
        sub.push('pi.instrument_id = ?');
        params.push(instrumentId);
      }
      if (skillLevel) {
        sub.push('pi.skill_level = ?');
        params.push(skillLevel);
      }
      where.push(`EXISTS (SELECT 1 FROM profile_instruments pi WHERE ${sub.join(' AND ')})`);
    }
    if (genreId) {
      where.push('EXISTS (SELECT 1 FROM profile_genres pg WHERE pg.profile_id = p.user_id AND pg.genre_id = ?)');
      params.push(genreId);
    }

    const rows = this.db
      .prepare(
        `SELECT p.user_id, p.display_name, p.latitude, p.longitude, p.availability
           FROM profiles p WHERE ${where.join(' AND ')}`,
      )
      .all(...params);

    return rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      latitude: r.latitude,
      longitude: r.longitude,
      availability: JSON.parse(r.availability),
    }));
  }

  /** Instruments and genres for many profiles at once (avoids N+1 queries on a results page). */
  findTagsForProfiles(userIds) {
    const tags = new Map(userIds.map((id) => [id, { instruments: [], genres: [] }]));
    if (userIds.length === 0) return tags;
    const placeholders = userIds.map(() => '?').join(',');
    const instRows = this.db
      .prepare(
        `SELECT pi.profile_id, i.id, i.name, pi.skill_level FROM profile_instruments pi
           JOIN instruments i ON i.id = pi.instrument_id
          WHERE pi.profile_id IN (${placeholders}) ORDER BY i.name`,
      )
      .all(...userIds);
    for (const r of instRows) {
      tags.get(r.profile_id).instruments.push({ id: r.id, name: r.name, skillLevel: r.skill_level });
    }
    const genreRows = this.db
      .prepare(
        `SELECT pg.profile_id, g.id, g.name FROM profile_genres pg JOIN genres g ON g.id = pg.genre_id
          WHERE pg.profile_id IN (${placeholders}) ORDER BY g.name`,
      )
      .all(...userIds);
    for (const r of genreRows) tags.get(r.profile_id).genres.push({ id: r.id, name: r.name });
    return tags;
  }
}

module.exports = { ProfileRepository };
