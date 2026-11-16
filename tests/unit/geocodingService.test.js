const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { GeocodingService } = require('../../src/services/geocodingService');
const { FakeLookupRepository, fakeResponse } = require('../helpers/fakes');

const ZIPPOPOTAM_10001 = {
  'post code': '10001',
  places: [{ 'place name': 'New York City', 'state abbreviation': 'NY', latitude: '40.7484', longitude: '-73.9967' }],
};

describe('GeocodingService', () => {
  it('uses the local cache without calling the API', async () => {
    let calls = 0;
    const lookups = new FakeLookupRepository({ 60614: { zip: '60614', latitude: 41.92, longitude: -87.65 } });
    const geo = new GeocodingService({ lookups, fetchFn: async () => { calls += 1; } });
    const result = await geo.resolve(' 60614 ');
    assert.equal(result.latitude, 41.92);
    assert.equal(calls, 0);
  });

  it('looks up unknown ZIPs from Zippopotam.us and caches them', async () => {
    const urls = [];
    const lookups = new FakeLookupRepository();
    const geo = new GeocodingService({
      lookups,
      fetchFn: async (url) => {
        urls.push(url);
        return fakeResponse(200, ZIPPOPOTAM_10001);
      },
    });
    const result = await geo.resolve('10001');
    assert.deepEqual(result, { zip: '10001', latitude: 40.7484, longitude: -73.9967, place: 'New York City, NY' });
    assert.equal(urls[0], 'https://api.zippopotam.us/us/10001');
    assert.deepEqual(lookups.findZip('10001'), result, 'cached for next time');
  });

  it('rejects badly formatted ZIP codes before any lookup', async () => {
    const geo = new GeocodingService({ lookups: new FakeLookupRepository(), fetchFn: async () => assert.fail('no fetch') });
    for (const bad of ['', '1234', '123456', 'abcde', null, 12345]) {
      await assert.rejects(geo.resolve(bad), (err) => err.status === 400 && /5-digit/.test(err.details.zip));
    }
  });

  it('reports a ZIP the API does not know as a validation error', async () => {
    const geo = new GeocodingService({ lookups: new FakeLookupRepository(), fetchFn: async () => fakeResponse(404, {}) });
    await assert.rejects(geo.resolve('00000'), (err) => err.status === 400 && /couldn't find/.test(err.details.zip));
  });

  it('reports API outages as a 503 with a friendly message', async () => {
    const down = new GeocodingService({
      lookups: new FakeLookupRepository(),
      fetchFn: async () => {
        throw new Error('ECONNRESET');
      },
    });
    await assert.rejects(down.resolve('10001'), (err) => err.status === 503);

    const erroring = new GeocodingService({ lookups: new FakeLookupRepository(), fetchFn: async () => fakeResponse(500, {}) });
    await assert.rejects(erroring.resolve('10001'), (err) => err.status === 503);
  });

  it('treats a malformed API response as not found', async () => {
    const geo = new GeocodingService({ lookups: new FakeLookupRepository(), fetchFn: async () => fakeResponse(200, { places: [] }) });
    await assert.rejects(geo.resolve('10001'), (err) => err.status === 400);
  });

  it('does not call the API when lookups are disabled', async () => {
    const geo = new GeocodingService({ lookups: new FakeLookupRepository(), enabled: false, fetchFn: async () => assert.fail('no fetch') });
    await assert.rejects(geo.resolve('10001'), (err) => err.status === 400);
  });
});
