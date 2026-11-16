/**
 * Musician search (US-4): filter by instrument, genre, skill level and
 * distance from the searcher's ZIP code, nearest first, 20 per page.
 */
const { ValidationError, AppError } = require('../lib/errors');
const { SKILL_LEVELS, DISTANCE_OPTIONS, toId } = require('../lib/validation');
const { haversineMiles, boundingBox } = require('../lib/geo');
const { toPublicProfile } = require('./profileService');

const PAGE_SIZE = 20;
const DEFAULT_DISTANCE = 25;

class SearchService {
  /** @param {{profiles: import('../repositories/profileRepository').ProfileRepository}} deps */
  constructor({ profiles }) {
    this.profiles = profiles;
  }

  /** Validate raw query-string values into typed filters. */
  parseFilters(query = {}) {
    const errors = {};
    const filters = { distance: DEFAULT_DISTANCE, page: 1 };

    if (query.instrument) {
      filters.instrumentId = toId(query.instrument);
      if (!filters.instrumentId) errors.instrument = 'Unknown instrument.';
    }
    if (query.genre) {
      filters.genreId = toId(query.genre);
      if (!filters.genreId) errors.genre = 'Unknown genre.';
    }
    if (query.skill) {
      if (SKILL_LEVELS.includes(query.skill)) filters.skillLevel = query.skill;
      else errors.skill = 'Unknown skill level.';
    }
    if (query.distance) {
      const d = Number(query.distance);
      if (DISTANCE_OPTIONS.includes(d)) filters.distance = d;
      else errors.distance = `Distance must be one of ${DISTANCE_OPTIONS.join(', ')} miles.`;
    }
    if (query.page) {
      const p = Number(query.page);
      if (Number.isInteger(p) && p >= 1 && p <= 1000) filters.page = p;
      else errors.page = 'Page must be a positive whole number.';
    }

    if (Object.keys(errors).length) throw new ValidationError(errors, 'Some search filters are invalid.');
    return filters;
  }

  search(viewerId, query) {
    const filters = this.parseFilters(query);
    const viewer = this.profiles.findByUserId(viewerId);
    if (!viewer) {
      throw new AppError(409, 'PROFILE_REQUIRED', 'Create your profile first so we know where to search from.');
    }

    const candidates = this.profiles.findCandidates({
      box: boundingBox(viewer, filters.distance),
      excludeUserId: viewerId,
      instrumentId: filters.instrumentId,
      genreId: filters.genreId,
      skillLevel: filters.skillLevel,
    });

    // Exact distance, keep only those inside the radius, nearest first (ties by name for a stable order).
    const inRange = candidates
      .map((c) => ({ ...c, distance: haversineMiles(viewer, c) }))
      .filter((c) => c.distance <= filters.distance)
      .sort((a, b) => a.distance - b.distance || a.displayName.localeCompare(b.displayName));

    const total = inRange.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageItems = inRange.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);
    const tags = this.profiles.findTagsForProfiles(pageItems.map((c) => c.userId));

    const results = pageItems.map((c) => {
      const { instruments, genres } = tags.get(c.userId);
      const pub = toPublicProfile({ ...c, bio: '', links: [], instruments, genres }, c.distance);
      delete pub.bio;
      delete pub.links;
      return pub;
    });

    const widerDistance = DISTANCE_OPTIONS.find((d) => d > filters.distance) || null;
    return {
      filters,
      total,
      page: filters.page,
      pageSize: PAGE_SIZE,
      totalPages,
      results,
      // US-4: an empty search suggests a wider distance.
      suggestion:
        total === 0
          ? widerDistance
            ? `No musicians match those filters within ${filters.distance} miles. Try searching within ${widerDistance} miles.`
            : 'No musicians match those filters within 50 miles. Try removing a filter.'
          : null,
      widerDistance: total === 0 ? widerDistance : null,
    };
  }
}

module.exports = { SearchService, PAGE_SIZE, DEFAULT_DISTANCE };
