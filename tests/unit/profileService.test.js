const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ProfileService } = require('../../src/services/profileService');
const { GeocodingService } = require('../../src/services/geocodingService');
const { FakeLookupRepository, FakeProfileRepository } = require('../helpers/fakes');

const ZIPS = {
  60614: { zip: '60614', latitude: 41.9227, longitude: -87.6533 },
  60201: { zip: '60201', latitude: 42.0546, longitude: -87.6942 },
};

const validInput = () => ({
  displayName: '  Jo Drums ',
  instruments: [{ instrumentId: 1, skillLevel: 'advanced' }],
  genreIds: [1, 2, 2],
  zip: '60614',
  availability: ['weekends', 'weekends'],
  bio: '  Blues drummer. ',
  links: ['https://soundcloud.com/jo', '  '],
});

describe('ProfileService (US-3)', () => {
  let profiles;
  let lookups;
  let service;

  beforeEach(() => {
    profiles = new FakeProfileRepository();
    lookups = new FakeLookupRepository(ZIPS);
    const geocoder = new GeocodingService({ lookups, enabled: false });
    service = new ProfileService({ profiles, lookups, geocoder });
  });

  it('saves a valid profile with cleaned values and coordinates from the ZIP', async () => {
    const saved = await service.saveProfile(7, validInput());
    assert.equal(saved.displayName, 'Jo Drums');
    assert.equal(saved.bio, 'Blues drummer.');
    assert.deepEqual(saved.genres.map((g) => g.id), [1, 2], 'duplicate genres removed');
    assert.deepEqual(saved.availability, ['weekends']);
    assert.deepEqual(saved.links, ['https://soundcloud.com/jo'], 'blank links dropped');
    assert.equal(saved.latitude, 41.9227);
    assert.deepEqual(saved.instruments, [{ id: 1, name: 'Drums', skillLevel: 'advanced' }]);
  });

  it('requires a display name, at least one instrument and a ZIP code', async () => {
    await assert.rejects(service.saveProfile(7, {}), (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.details.displayName);
      assert.ok(err.details.instruments);
      assert.ok(err.details.zip);
      return true;
    });
  });

  it('rejects an instrument without a valid skill level', async () => {
    const input = validInput();
    input.instruments = [{ instrumentId: 1, skillLevel: 'rockstar' }];
    await assert.rejects(service.saveProfile(7, input), (err) => /skill level/.test(err.details.instruments));
  });

  it('rejects unknown and duplicate instruments', async () => {
    const unknown = validInput();
    unknown.instruments = [{ instrumentId: 99, skillLevel: 'beginner' }];
    await assert.rejects(service.saveProfile(7, unknown), (err) => /from the list/.test(err.details.instruments));

    const dup = validInput();
    dup.instruments = [
      { instrumentId: 1, skillLevel: 'beginner' },
      { instrumentId: 1, skillLevel: 'advanced' },
    ];
    await assert.rejects(service.saveProfile(7, dup), (err) => /only be listed once/.test(err.details.instruments));
  });

  it('rejects a badly formatted ZIP code without saving', async () => {
    const input = validInput();
    input.zip = '6061';
    await assert.rejects(service.saveProfile(7, input), (err) => /5-digit/.test(err.details.zip));
    assert.equal(profiles.count(), 0);
  });

  it('rejects a well-formed ZIP code that does not exist', async () => {
    const input = validInput();
    input.zip = '00000';
    await assert.rejects(service.saveProfile(7, input), (err) => /couldn't find/.test(err.details.zip));
    assert.equal(profiles.count(), 0);
  });

  it('allows at most 3 recording links, each an http(s) URL', async () => {
    const tooMany = validInput();
    tooMany.links = ['https://a.co', 'https://b.co', 'https://c.co', 'https://d.co'];
    await assert.rejects(service.saveProfile(7, tooMany), (err) => /at most 3/.test(err.details.links));

    const badScheme = validInput();
    badScheme.links = ['javascript:alert(1)'];
    await assert.rejects(service.saveProfile(7, badScheme), (err) => /http/.test(err.details.links));
  });

  it('validates bio length, genres and availability', async () => {
    const input = validInput();
    input.bio = 'x'.repeat(1001);
    input.genreIds = [42];
    input.availability = ['midnight'];
    input.displayName = 'x'.repeat(61);
    await assert.rejects(service.saveProfile(7, input), (err) => {
      assert.ok(err.details.bio);
      assert.ok(err.details.genreIds);
      assert.ok(err.details.availability);
      assert.ok(err.details.displayName);
      return true;
    });
  });

  it('rejects malformed field types', async () => {
    const input = validInput();
    input.instruments = 'drums';
    input.genreIds = 'blues';
    input.links = 'https://a.co';
    input.bio = 5;
    await assert.rejects(service.saveProfile(7, input), (err) => {
      assert.ok(err.details.instruments && err.details.genreIds && err.details.links && err.details.bio);
      return true;
    });
  });

});
