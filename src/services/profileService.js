/**
 * Business rules for musician profiles (US-3, US-5).
 */
const { ValidationError, NotFoundError } = require('../lib/errors');
const {
  SKILL_LEVELS,
  AVAILABILITY_OPTIONS,
  isNonEmptyString,
  isValidUrl,
  toId,
} = require('../lib/validation');
const { haversineMiles, roundMiles } = require('../lib/geo');

const LIMITS = {
  displayName: 60,
  bio: 1000,
  links: 3,
  instruments: 10,
  genres: 10,
};

/**
 * Shape a profile for other users to see. NFR3 / US-5: email and ZIP code are
 * never included, and distance is rounded to the nearest mile.
 */
function toPublicProfile(profile, distanceMiles = null) {
  return {
    id: profile.userId,
    displayName: profile.displayName,
    bio: profile.bio,
    availability: profile.availability,
    links: profile.links,
    instruments: profile.instruments,
    genres: profile.genres,
    distanceMiles: distanceMiles === null ? null : roundMiles(distanceMiles),
  };
}

class ProfileService {
  /**
   * @param {object} deps
   * @param {import('../repositories/profileRepository').ProfileRepository} deps.profiles
   * @param {import('../repositories/lookupRepository').LookupRepository} deps.lookups
   * @param {import('./geocodingService').GeocodingService} deps.geocoder
   */
  constructor({ profiles, lookups, geocoder }) {
    this.profiles = profiles;
    this.lookups = lookups;
    this.geocoder = geocoder;
  }

  getOwnProfile(userId) {
    return this.profiles.findByUserId(userId);
  }

  /** Validate everything except the ZIP lookup; returns cleaned values. */
  validate(input = {}) {
    const errors = {};
    const instrumentIds = new Set(this.lookups.listInstruments().map((i) => i.id));
    const genreIds = new Set(this.lookups.listGenres().map((g) => g.id));

    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    if (!displayName) errors.displayName = 'Display name is required.';
    else if (displayName.length > LIMITS.displayName) {
      errors.displayName = `Display name must be ${LIMITS.displayName} characters or fewer.`;
    }

    const instruments = [];
    if (!Array.isArray(input.instruments) || input.instruments.length === 0) {
      errors.instruments = 'Add at least one instrument with a skill level.';
    } else if (input.instruments.length > LIMITS.instruments) {
      errors.instruments = `Add at most ${LIMITS.instruments} instruments.`;
    } else {
      const seen = new Set();
      for (const item of input.instruments) {
        const id = toId(item && item.instrumentId);
        const level = item && item.skillLevel;
        if (!id || !instrumentIds.has(id)) {
          errors.instruments = 'Choose an instrument from the list.';
          break;
        }
        if (!SKILL_LEVELS.includes(level)) {
          errors.instruments = 'Choose a skill level for every instrument.';
          break;
        }
        if (seen.has(id)) {
          errors.instruments = 'Each instrument can only be listed once.';
          break;
        }
        seen.add(id);
        instruments.push({ id, skillLevel: level });
      }
    }

    const genreList = input.genreIds === undefined ? [] : input.genreIds;
    const cleanGenres = [];
    if (!Array.isArray(genreList) || genreList.length > LIMITS.genres) {
      errors.genreIds = `Choose up to ${LIMITS.genres} genres.`;
    } else {
      for (const raw of genreList) {
        const id = toId(raw);
        if (!id || !genreIds.has(id)) {
          errors.genreIds = 'Choose genres from the list.';
          break;
        }
        if (!cleanGenres.includes(id)) cleanGenres.push(id);
      }
    }

    const availabilityList = input.availability === undefined ? [] : input.availability;
    if (!Array.isArray(availabilityList) || availabilityList.some((a) => !AVAILABILITY_OPTIONS.includes(a))) {
      errors.availability = 'Choose availability from the list.';
    }

    const bio = typeof input.bio === 'string' ? input.bio.trim() : '';
    if (input.bio !== undefined && typeof input.bio !== 'string') errors.bio = 'Bio must be text.';
    else if (bio.length > LIMITS.bio) errors.bio = `Bio must be ${LIMITS.bio} characters or fewer.`;

    const linkList = input.links === undefined ? [] : input.links;
    let links = [];
    if (!Array.isArray(linkList)) {
      errors.links = 'Links must be a list.';
    } else {
      links = linkList.filter(isNonEmptyString).map((l) => l.trim());
      if (links.length > LIMITS.links) errors.links = `Add at most ${LIMITS.links} recording links.`;
      else if (links.some((l) => !isValidUrl(l))) errors.links = 'Links must start with http:// or https://.';
    }

    if (!isNonEmptyString(input.zip)) errors.zip = 'ZIP code is required.';
    else if (!/^\d{5}$/.test(input.zip.trim())) errors.zip = 'Enter a 5-digit US ZIP code.';

    if (Object.keys(errors).length) throw new ValidationError(errors);

    return {
      displayName,
      instruments,
      genreIds: cleanGenres,
      availability: [...new Set(availabilityList)],
      bio,
      links,
      zip: input.zip.trim(),
    };
  }

  /** US-3: create or update the signed-in user's profile. */
  async saveProfile(userId, input) {
    const clean = this.validate(input);
    const location = await this.geocoder.resolve(clean.zip);
    return this.profiles.save({
      userId,
      ...clean,
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }

  /** US-5: another musician's profile, with distance from the viewer. */
  getPublicProfile(viewerId, targetUserId) {
    const id = toId(targetUserId);
    const target = id ? this.profiles.findByUserId(id) : null;
    if (!target) throw new NotFoundError('That musician could not be found.');
    const viewer = this.profiles.findByUserId(viewerId);
    const distance = viewer ? haversineMiles(viewer, target) : null;
    return { ...toPublicProfile(target, distance), isOwnProfile: viewerId === target.userId };
  }
}

module.exports = { ProfileService, toPublicProfile, LIMITS };
