const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ProfileService, toPublicProfile } = require('../../src/services/profileService');
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

describe('Public musician profile (US-5)', () => {
  let profiles;
  let lookups;
  let service;

  beforeEach(() => {
    profiles = new FakeProfileRepository();
    lookups = new FakeLookupRepository(ZIPS);
    const geocoder = new GeocodingService({ lookups, enabled: false });
    service = new ProfileService({ profiles, lookups, geocoder });
  });

  it('edits replace the old values immediately', async () => {
    await service.saveProfile(7, validInput());
    const edit = validInput();
    edit.displayName = 'Jo the Drummer';
    edit.instruments = [{ instrumentId: 2, skillLevel: 'beginner' }];
    await service.saveProfile(7, edit);
    const pub = service.getPublicProfile(8, 7);
    assert.equal(pub.displayName, 'Jo the Drummer');
    assert.deepEqual(pub.instruments.map((i) => i.name), ['Bass']);
  });

  describe('public profile (US-5)', () => {
    beforeEach(async () => {
      await service.saveProfile(7, validInput());
      const viewer = validInput();
      viewer.zip = '60201';
      await service.saveProfile(8, viewer);
    });

    it('never includes email or ZIP code', () => {
      const pub = service.getPublicProfile(8, 7);
      assert.equal('zip' in pub, false);
      assert.equal('email' in pub, false);
      assert.equal('latitude' in pub, false);
      assert.doesNotMatch(JSON.stringify(pub), /60614/);
    });

    it('shows distance from the viewer rounded to the nearest mile', () => {
      const pub = service.getPublicProfile(8, 7);
      assert.equal(pub.distanceMiles, 9); // Lincoln Park <-> Evanston ≈ 9.3 miles
      assert.equal(Number.isInteger(pub.distanceMiles), true);
      assert.equal(pub.isOwnProfile, false);
    });

    it('marks your own profile', () => {
      assert.equal(service.getPublicProfile(7, 7).isOwnProfile, true);
    });

    it('returns null distance when the viewer has no profile yet', () => {
      assert.equal(service.getPublicProfile(99, 7).distanceMiles, null);
    });

    it('404s for a missing or invalid id', () => {
      assert.throws(() => service.getPublicProfile(8, 12345), { status: 404 });
      assert.throws(() => service.getPublicProfile(8, 'abc'), { status: 404 });
    });
  });

  it('toPublicProfile rounds and strips private fields', () => {
    const pub = toPublicProfile(
      { userId: 1, displayName: 'A', bio: '', availability: [], links: [], instruments: [], genres: [], zip: '60614' },
      2.5,
    );
    assert.equal(pub.distanceMiles, 3);
    assert.equal(pub.zip, undefined);
  });
});
