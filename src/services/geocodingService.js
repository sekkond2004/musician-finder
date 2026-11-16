/**
 * Converts a ZIP code to coordinates. Looks in the local zip_codes cache first
 * and falls back to the Zippopotam.us API, caching what it finds. Search never
 * calls the API: coordinates are stored with the profile when it is saved.
 */
const { ValidationError, AppError } = require('../lib/errors');
const { isValidZip } = require('../lib/validation');

const API_BASE = 'https://api.zippopotam.us/us/';
const TIMEOUT_MS = 5000;

class GeocodingService {
  /**
   * @param {object} deps
   * @param {import('../repositories/lookupRepository').LookupRepository} deps.lookups
   * @param {typeof fetch} [deps.fetchFn]
   * @param {boolean} [deps.enabled] whether the external API may be called
   */
  constructor({ lookups, fetchFn = globalThis.fetch, enabled = true }) {
    this.lookups = lookups;
    this.fetchFn = fetchFn;
    this.enabled = enabled;
  }

  async resolve(rawZip) {
    const zip = typeof rawZip === 'string' ? rawZip.trim() : '';
    if (!isValidZip(zip)) {
      throw new ValidationError({ zip: 'Enter a 5-digit US ZIP code.' });
    }

    const cached = this.lookups.findZip(zip);
    if (cached) return cached;

    if (!this.enabled || !this.fetchFn) {
      throw new ValidationError({ zip: "We couldn't find that ZIP code." });
    }

    let response;
    try {
      response = await this.fetchFn(API_BASE + zip, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new AppError(503, 'ZIP_LOOKUP_UNAVAILABLE', "We couldn't check that ZIP code right now. Please try again.");
    }
    if (response.status === 404) {
      throw new ValidationError({ zip: "We couldn't find that ZIP code." });
    }
    if (!response.ok) {
      throw new AppError(503, 'ZIP_LOOKUP_UNAVAILABLE', "We couldn't check that ZIP code right now. Please try again.");
    }

    const data = await response.json();
    const place = data && Array.isArray(data.places) ? data.places[0] : null;
    const latitude = place ? Number(place.latitude) : NaN;
    const longitude = place ? Number(place.longitude) : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new ValidationError({ zip: "We couldn't find that ZIP code." });
    }
    const result = {
      zip,
      latitude,
      longitude,
      place: `${place['place name']}, ${place['state abbreviation']}`,
    };
    this.lookups.saveZip(result);
    return result;
  }
}

module.exports = { GeocodingService };
