/** SQL for the seeded lookup tables (instruments, genres) and the ZIP code cache. */
class LookupRepository {
  constructor(db) {
    this.db = db;
    this.instrumentsStmt = db.prepare('SELECT id, name FROM instruments ORDER BY id');
    this.genresStmt = db.prepare('SELECT id, name FROM genres ORDER BY id');
    this.insertInstrumentStmt = db.prepare('INSERT OR IGNORE INTO instruments (name) VALUES (?)');
    this.insertGenreStmt = db.prepare('INSERT OR IGNORE INTO genres (name) VALUES (?)');
    this.findZipStmt = db.prepare('SELECT zip, latitude, longitude, place FROM zip_codes WHERE zip = ?');
    this.saveZipStmt = db.prepare(
      'INSERT OR REPLACE INTO zip_codes (zip, latitude, longitude, place) VALUES (?, ?, ?, ?)',
    );
  }

  listInstruments() {
    return this.instrumentsStmt.all().map((r) => ({ id: r.id, name: r.name }));
  }

  listGenres() {
    return this.genresStmt.all().map((r) => ({ id: r.id, name: r.name }));
  }

  addInstrument(name) {
    this.insertInstrumentStmt.run(name);
  }

  addGenre(name) {
    this.insertGenreStmt.run(name);
  }

  findZip(zip) {
    const row = this.findZipStmt.get(zip);
    return row ? { zip: row.zip, latitude: row.latitude, longitude: row.longitude, place: row.place } : null;
  }

  saveZip({ zip, latitude, longitude, place = null }) {
    this.saveZipStmt.run(zip, latitude, longitude, place);
  }
}

module.exports = { LookupRepository };
