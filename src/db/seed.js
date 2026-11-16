/**
 * Seed script.
 *
 *   npm run seed                 # add demo data to an empty database
 *   npm run seed -- --reset      # wipe users/profiles first
 *   npm run seed -- --count 1000 # number of demo musicians (default 60)
 *
 * Reference data (instruments, genres, ZIP coordinates) is added on every start
 * and is safe to run repeatedly.
 */
const { INSTRUMENTS, GENRES, ZIP_CODES } = require('./referenceData');
const { transaction } = require('./database');
const { hashPassword } = require('../lib/password');
const { SKILL_LEVELS, AVAILABILITY_OPTIONS } = require('../lib/validation');

const DEMO_ACCOUNT = { email: 'demo@musicianfinder.test', password: 'DemoPass123', name: 'Demo Drummer' };

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Sam', 'Taylor', 'Riley', 'Casey', 'Morgan', 'Jamie', 'Avery', 'Quinn',
  'Dana', 'Rowan', 'Elliot', 'Harper', 'Reese', 'Skyler', 'Frankie', 'Jesse', 'Logan', 'Parker',
  'Marisol', 'Dev', 'Kenji', 'Amara', 'Luis', 'Priya', 'Mateo', 'Nia', 'Oscar', 'Yuki',
];
const LAST_INITIALS = 'ABCDEFGHJKLMNOPRSTVWZ'.split('');
const BIO_SNIPPETS = [
  'Looking for a band that rehearses weekly and wants to gig.',
  'Played in cover bands for years, now want to write originals.',
  'Happy to fill in for shows on short notice.',
  'Into tight grooves and long jams.',
  'Have my own gear and a car for gigs.',
  'Just moved here and want to meet other musicians.',
  'Studio experience; can read charts.',
  'Weekend warrior looking for a fun project.',
];

/** Small deterministic PRNG so every seed run creates the same demo data. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedReferenceData(db) {
  transaction(db, () => {
    const addInstrument = db.prepare('INSERT OR IGNORE INTO instruments (name) VALUES (?)');
    const addGenre = db.prepare('INSERT OR IGNORE INTO genres (name) VALUES (?)');
    const addZip = db.prepare('INSERT OR IGNORE INTO zip_codes (zip, latitude, longitude, place) VALUES (?, ?, ?, ?)');
    INSTRUMENTS.forEach((name) => addInstrument.run(name));
    GENRES.forEach((name) => addGenre.run(name));
    ZIP_CODES.forEach((z) => addZip.run(z.zip, z.latitude, z.longitude, z.place));
  });
}

function resetUserData(db) {
  db.exec('DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM profile_genres; DELETE FROM profile_instruments; DELETE FROM profiles; DELETE FROM users;');
}

/**
 * Creates `count` demo musicians spread across the seeded ZIP codes, plus a demo
 * account graders can log in with. All demo users share one password hash so
 * seeding 1,000 profiles stays fast.
 */
async function seedDemoMusicians(db, { count = 60, seed = 42 } = {}) {
  seedReferenceData(db);
  const rand = mulberry32(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const pickSome = (list, min, max) => {
    const n = min + Math.floor(rand() * (max - min + 1));
    const copy = [...list];
    const out = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
    return out;
  };

  const instruments = db.prepare('SELECT id, name FROM instruments').all();
  const genres = db.prepare('SELECT id FROM genres').all().map((g) => g.id);
  const zips = db.prepare('SELECT zip, latitude, longitude FROM zip_codes').all();
  const sharedHash = await hashPassword(DEMO_ACCOUNT.password);

  const insertUser = db.prepare('INSERT OR IGNORE INTO users (email, password_hash) VALUES (?, ?)');
  const findUser = db.prepare('SELECT id FROM users WHERE email = ?');
  const insertProfile = db.prepare(
    `INSERT OR REPLACE INTO profiles (user_id, display_name, bio, zip, latitude, longitude, availability, links)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertInstrument = db.prepare(
    'INSERT OR IGNORE INTO profile_instruments (profile_id, instrument_id, skill_level) VALUES (?, ?, ?)',
  );
  const insertGenre = db.prepare('INSERT OR IGNORE INTO profile_genres (profile_id, genre_id) VALUES (?, ?)');

  const createMusician = ({ email, name, zip, bio, insts, genreIds, availability, links }) => {
    insertUser.run(email, sharedHash);
    const userId = findUser.get(email).id;
    insertProfile.run(userId, name, bio, zip.zip, zip.latitude, zip.longitude, JSON.stringify(availability), JSON.stringify(links));
    insts.forEach((i) => insertInstrument.run(userId, i.id, i.skillLevel));
    genreIds.forEach((g) => insertGenre.run(userId, g));
  };

  transaction(db, () => {
    const loop = zips.find((z) => z.zip === '60601') || zips[0];
    const drums = instruments.find((i) => i.name === 'Drums') || instruments[0];
    createMusician({
      email: DEMO_ACCOUNT.email,
      name: DEMO_ACCOUNT.name,
      zip: loop,
      bio: 'Demo account for trying out Musician Finder. Blues and rock drummer.',
      insts: [{ id: drums.id, skillLevel: 'advanced' }],
      genreIds: genres.slice(0, 2),
      availability: ['weekends'],
      links: [],
    });

    for (let n = 1; n <= count; n += 1) {
      const name = `${pick(FIRST_NAMES)} ${pick(LAST_INITIALS)}.`;
      const insts = pickSome(instruments, 1, 3).map((i) => ({ id: i.id, skillLevel: pick(SKILL_LEVELS) }));
      createMusician({
        email: `musician${n}@seed.musicianfinder.test`,
        name,
        zip: pick(zips),
        bio: `${pick(BIO_SNIPPETS)} ${pick(BIO_SNIPPETS)}`,
        insts,
        genreIds: pickSome(genres, 1, 4),
        availability: pickSome(AVAILABILITY_OPTIONS, 1, 2),
        links: rand() < 0.4 ? [`https://soundcloud.com/demo-musician-${n}`] : [],
      });
    }
  });

  return count + 1;
}

module.exports = { seedReferenceData, seedDemoMusicians, resetUserData, DEMO_ACCOUNT };

// Run as a script: node src/db/seed.js [--reset] [--count N]
if (require.main === module) {
  const { loadConfig } = require('../config');
  const { openDatabase } = require('./database');
  const args = process.argv.slice(2);
  const countIndex = args.indexOf('--count');
  const count = countIndex >= 0 ? Number(args[countIndex + 1]) : 60;
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  if (args.includes('--reset')) resetUserData(db);
  seedDemoMusicians(db, { count })
    .then((created) => {
      console.log(`Seeded ${created} musicians into ${config.databasePath}`);
      console.log(`Demo login: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`);
      db.close();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
