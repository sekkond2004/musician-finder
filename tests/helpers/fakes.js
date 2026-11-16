/**
 * In-memory fakes with the same methods as the real repositories. Unit tests
 * hand these to services so business rules can be tested without a database
 * — this is what the Repository pattern buys us.
 */
class FakeClock {
  constructor(start = Date.UTC(2026, 10, 15, 12, 0, 0)) {
    this.time = start;
  }
  now() {
    return this.time;
  }
  advance(ms) {
    this.time += ms;
  }
}

/** Fast, deterministic stand-in for scrypt: "hashed:<password>". */
const fakeHasher = {
  async hashPassword(password) {
    return `hashed:${password}`;
  },
  async verifyPassword(password, stored) {
    return stored === `hashed:${password}`;
  },
};

class FakeUserRepository {
  constructor() {
    this.rows = [];
  }
  create(email, passwordHash) {
    const user = { id: this.rows.length + 1, email, passwordHash, createdAt: '2026-11-15' };
    this.rows.push(user);
    return { id: user.id, email };
  }
  findByEmail(email) {
    return this.rows.find((u) => u.email === email) || null;
  }
  findById(id) {
    const u = this.rows.find((r) => r.id === id);
    return u ? { id: u.id, email: u.email, createdAt: u.createdAt } : null;
  }
}

class FakeSessionRepository {
  constructor() {
    this.rows = new Map();
  }
  create(tokenHash, userId, expiresAt, now) {
    this.rows.set(tokenHash, { userId, expiresAt, createdAt: now });
  }
  findValid(tokenHash, now) {
    const s = this.rows.get(tokenHash);
    return s && s.expiresAt > now ? { userId: s.userId, expiresAt: s.expiresAt } : null;
  }
  delete(tokenHash) {
    this.rows.delete(tokenHash);
  }
  deleteExpired(now) {
    let n = 0;
    for (const [k, v] of this.rows) {
      if (v.expiresAt <= now) {
        this.rows.delete(k);
        n += 1;
      }
    }
    return n;
  }
}

class FakeLoginAttemptRepository {
  constructor() {
    this.rows = [];
  }
  recordFailure(email, at) {
    this.rows.push({ email, at });
  }
  failuresSince(email, since) {
    return this.rows
      .filter((r) => r.email === email && r.at > since)
      .map((r) => r.at)
      .sort((a, b) => b - a);
  }
  clear(email) {
    this.rows = this.rows.filter((r) => r.email !== email);
  }
}

const INSTRUMENTS = [
  { id: 1, name: 'Drums' },
  { id: 2, name: 'Bass' },
  { id: 3, name: 'Vocals' },
];
const GENRES = [
  { id: 1, name: 'Blues' },
  { id: 2, name: 'Rock' },
  { id: 3, name: 'Jazz' },
];

class FakeLookupRepository {
  constructor(zips = {}) {
    this.zips = new Map(Object.entries(zips));
  }
  listInstruments() {
    return INSTRUMENTS;
  }
  listGenres() {
    return GENRES;
  }
  findZip(zip) {
    return this.zips.get(zip) || null;
  }
  saveZip(z) {
    this.zips.set(z.zip, z);
  }
}

class FakeProfileRepository {
  constructor() {
    this.rows = new Map();
  }
  findByUserId(userId) {
    const p = this.rows.get(userId);
    if (!p) return null;
    return {
      ...p,
      instruments: p.instruments.map((i) => ({
        id: i.id,
        name: INSTRUMENTS.find((x) => x.id === i.id).name,
        skillLevel: i.skillLevel,
      })),
      genres: p.genreIds.map((id) => GENRES.find((g) => g.id === id)),
    };
  }
  save(profile) {
    this.rows.set(profile.userId, { ...profile });
    return this.findByUserId(profile.userId);
  }
  count() {
    return this.rows.size;
  }
  findCandidates({ box, excludeUserId, instrumentId, genreId, skillLevel }) {
    return [...this.rows.values()]
      .filter(
        (p) =>
          p.userId !== excludeUserId &&
          p.latitude >= box.minLat &&
          p.latitude <= box.maxLat &&
          p.longitude >= box.minLon &&
          p.longitude <= box.maxLon &&
          (!instrumentId && !skillLevel
            ? true
            : p.instruments.some(
                (i) => (!instrumentId || i.id === instrumentId) && (!skillLevel || i.skillLevel === skillLevel),
              )) &&
          (!genreId || p.genreIds.includes(genreId)),
      )
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        latitude: p.latitude,
        longitude: p.longitude,
        availability: p.availability,
      }));
  }
  findTagsForProfiles(ids) {
    return new Map(
      ids.map((id) => {
        const p = this.findByUserId(id);
        return [id, { instruments: p.instruments, genres: p.genres }];
      }),
    );
  }
}

/** A Response-like object for faking fetch(). */
function fakeResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

module.exports = {
  FakeClock,
  fakeHasher,
  FakeUserRepository,
  FakeSessionRepository,
  FakeLoginAttemptRepository,
  FakeLookupRepository,
  FakeProfileRepository,
  fakeResponse,
  INSTRUMENTS,
  GENRES,
};
