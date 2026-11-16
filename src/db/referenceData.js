/**
 * Seeded lookup lists and a starter set of ZIP code coordinates.
 *
 * The ZIP table covers the Chicago area so the demo data and a local install
 * work without calling the Zippopotam.us API. Any other ZIP is looked up from
 * the API the first time it is used and cached in the zip_codes table.
 * Coordinates are approximate ZIP centroids.
 */
const INSTRUMENTS = [
  'Vocals', 'Electric Guitar', 'Acoustic Guitar', 'Bass', 'Drums', 'Keyboard / Piano',
  'Saxophone', 'Trumpet', 'Trombone', 'Violin', 'Cello', 'Flute', 'Percussion',
  'DJ / Production', 'Banjo', 'Harmonica',
];

const GENRES = [
  'Rock', 'Blues', 'Jazz', 'Pop', 'Metal', 'Punk', 'Funk', 'R&B / Soul', 'Hip-Hop',
  'Country', 'Folk', 'Indie', 'Electronic', 'Classical', 'Latin', 'Reggae', 'Gospel',
];

const ZIP_CODES = [
  { zip: '60601', latitude: 41.8858, longitude: -87.6181, place: 'Chicago (Loop), IL' },
  { zip: '60605', latitude: 41.8676, longitude: -87.6176, place: 'Chicago (South Loop), IL' },
  { zip: '60607', latitude: 41.8721, longitude: -87.6578, place: 'Chicago (West Loop), IL' },
  { zip: '60608', latitude: 41.8515, longitude: -87.6694, place: 'Chicago (Pilsen), IL' },
  { zip: '60610', latitude: 41.9033, longitude: -87.6336, place: 'Chicago (Old Town), IL' },
  { zip: '60613', latitude: 41.9543, longitude: -87.6575, place: 'Chicago (Lakeview), IL' },
  { zip: '60614', latitude: 41.9227, longitude: -87.6533, place: 'Chicago (Lincoln Park), IL' },
  { zip: '60615', latitude: 41.8026, longitude: -87.6026, place: 'Chicago (Hyde Park), IL' },
  { zip: '60618', latitude: 41.9464, longitude: -87.7042, place: 'Chicago (Avondale), IL' },
  { zip: '60622', latitude: 41.9024, longitude: -87.6764, place: 'Chicago (Wicker Park), IL' },
  { zip: '60625', latitude: 41.9703, longitude: -87.7042, place: 'Chicago (Albany Park), IL' },
  { zip: '60626', latitude: 42.0090, longitude: -87.6690, place: 'Chicago (Rogers Park), IL' },
  { zip: '60640', latitude: 41.9719, longitude: -87.6624, place: 'Chicago (Uptown), IL' },
  { zip: '60647', latitude: 41.9208, longitude: -87.7017, place: 'Chicago (Logan Square), IL' },
  { zip: '60201', latitude: 42.0546, longitude: -87.6942, place: 'Evanston, IL' },
  { zip: '60302', latitude: 41.8945, longitude: -87.7896, place: 'Oak Park, IL' },
  { zip: '60148', latitude: 41.8742, longitude: -88.0189, place: 'Lombard, IL' },
  { zip: '60540', latitude: 41.7662, longitude: -88.1411, place: 'Naperville, IL' },
  { zip: '60004', latitude: 42.1124, longitude: -87.9796, place: 'Arlington Heights, IL' },
  { zip: '60453', latitude: 41.7146, longitude: -87.7525, place: 'Oak Lawn, IL' },
  { zip: '60016', latitude: 42.0492, longitude: -87.8917, place: 'Des Plaines, IL' },
  { zip: '60030', latitude: 42.3445, longitude: -88.0425, place: 'Grayslake, IL' },
  { zip: '60120', latitude: 42.0333, longitude: -88.2522, place: 'Elgin, IL' },
  { zip: '60431', latitude: 41.5288, longitude: -88.1981, place: 'Joliet, IL' },
  { zip: '46320', latitude: 41.6164, longitude: -87.4931, place: 'Hammond, IN' },
];

module.exports = { INSTRUMENTS, GENRES, ZIP_CODES };
