const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { SearchService, PAGE_SIZE } = require('../../src/services/searchService');
const { haversineMiles } = require('../../src/lib/geo');
const { FakeProfileRepository } = require('../helpers/fakes');

// Searcher in Lincoln Park, Chicago.
const ORIGIN = { latitude: 41.9227, longitude: -87.6533 };

function addProfile(repo, userId, { name, lat, lon, instruments = [{ id: 1, skillLevel: 'advanced' }], genreIds = [1] }) {
  repo.save({
    userId,
    displayName: name,
    bio: 'secret bio',
    zip: '60614',
    latitude: lat,
    longitude: lon,
    availability: ['weekends'],
    links: [],
    instruments,
    genreIds,
  });
}

describe('SearchService (US-4)', () => {
  let profiles;
  let search;

  beforeEach(() => {
    profiles = new FakeProfileRepository();
    search = new SearchService({ profiles });
    addProfile(profiles, 1, { name: 'Me', lat: ORIGIN.latitude, lon: ORIGIN.longitude });
    // ~2.2 mi, drums advanced, blues
    addProfile(profiles, 2, { name: 'Near Drummer', lat: 41.9543, lon: -87.6575 });
    // ~9.3 mi (Evanston), drums beginner, rock
    addProfile(profiles, 3, {
      name: 'Evanston Drummer',
      lat: 42.0546,
      lon: -87.6942,
      instruments: [{ id: 1, skillLevel: 'beginner' }],
      genreIds: [2],
    });
    // ~27 mi (Naperville), bass advanced, blues
    addProfile(profiles, 4, {
      name: 'Naperville Bassist',
      lat: 41.7662,
      lon: -88.1411,
      instruments: [{ id: 2, skillLevel: 'advanced' }],
    });
    // ~1.7 mi, vocals intermediate, jazz
    addProfile(profiles, 5, {
      name: 'Old Town Singer',
      lat: 41.9033,
      lon: -87.6336,
      instruments: [{ id: 3, skillLevel: 'intermediate' }],
      genreIds: [3],
    });
  });

  it('sorts results nearest first and excludes the searcher', () => {
    const res = search.search(1, { distance: '50' });
    assert.deepEqual(res.results.map((r) => r.id), [5, 2, 3, 4]);
    for (let i = 1; i < res.results.length; i += 1) {
      assert.ok(res.results[i - 1].distanceMiles <= res.results[i].distanceMiles);
    }
  });

  it('only returns musicians within the chosen distance', () => {
    const res = search.search(1, { distance: '10' });
    assert.deepEqual(res.results.map((r) => r.id), [5, 2, 3]);
    res.results.forEach((r) => assert.ok(r.distanceMiles <= 10));
  });

  it('defaults to 25 miles', () => {
    const res = search.search(1, {});
    assert.equal(res.filters.distance, 25);
    assert.ok(!res.results.some((r) => r.id === 4), 'Naperville (~27 mi) is outside 25 miles');
  });

  it('every result matches all selected filters', () => {
    const res = search.search(1, { instrument: '1', skill: 'advanced', genre: '1', distance: '50' });
    assert.deepEqual(res.results.map((r) => r.id), [2]);
    const r = res.results[0];
    assert.ok(r.instruments.some((i) => i.id === 1 && i.skillLevel === 'advanced'));
    assert.ok(r.genres.some((g) => g.id === 1));
  });

  it('filters by skill level alone across any instrument', () => {
    const res = search.search(1, { skill: 'intermediate', distance: '50' });
    assert.deepEqual(res.results.map((r) => r.id), [5]);
  });

  it('suggests a wider distance when nothing matches', () => {
    const res = search.search(1, { instrument: '2', distance: '10' });
    assert.equal(res.total, 0);
    assert.equal(res.widerDistance, 25);
    assert.match(res.suggestion, /Try searching within 25 miles/);
  });

  it('suggests removing a filter when nothing matches at 50 miles', () => {
    const res = search.search(1, { genre: '3', instrument: '1', distance: '50' });
    assert.equal(res.total, 0);
    assert.equal(res.widerDistance, null);
    assert.match(res.suggestion, /removing a filter/);
  });

  it('returns 20 results per page', () => {
    for (let i = 0; i < 45; i += 1) {
      addProfile(profiles, 100 + i, { name: `Player ${String(i).padStart(2, '0')}`, lat: 41.9 + i * 0.001, lon: -87.65 });
    }
    const page1 = search.search(1, { distance: '50' });
    const page3 = search.search(1, { distance: '50', page: '3' });
    assert.equal(page1.results.length, PAGE_SIZE);
    assert.equal(page1.total, 49);
    assert.equal(page1.totalPages, 3);
    assert.equal(page3.results.length, 9);
    const all = [1, 2, 3].flatMap((p) => search.search(1, { distance: '50', page: String(p) }).results.map((r) => r.id));
    assert.equal(new Set(all).size, 49, 'pages do not overlap');
  });

  it('never exposes bio, links, ZIP code or exact coordinates in results', () => {
    const json = JSON.stringify(search.search(1, { distance: '50' }));
    assert.doesNotMatch(json, /secret bio|60614|latitude|longitude/);
  });

  it('rounds distances to whole miles that match the true distance', () => {
    const res = search.search(1, { distance: '10' });
    const evanston = res.results.find((r) => r.id === 3);
    const exact = haversineMiles(ORIGIN, { latitude: 42.0546, longitude: -87.6942 });
    assert.equal(evanston.distanceMiles, Math.round(exact));
  });

  it('requires the searcher to have a profile', () => {
    assert.throws(() => search.search(999, {}), (err) => err.status === 409 && err.code === 'PROFILE_REQUIRED');
  });

  it('rejects invalid filters', () => {
    assert.throws(() => search.search(1, { distance: '7' }), (err) => err.status === 400 && Boolean(err.details.distance));
    assert.throws(() => search.search(1, { skill: 'godlike' }), (err) => Boolean(err.details.skill));
    assert.throws(() => search.search(1, { instrument: 'drums' }), (err) => Boolean(err.details.instrument));
    assert.throws(() => search.search(1, { genre: '-1' }), (err) => Boolean(err.details.genre));
    assert.throws(() => search.search(1, { page: '0' }), (err) => Boolean(err.details.page));
  });
});
