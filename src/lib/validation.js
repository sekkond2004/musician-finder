/**
 * Small validation helpers. All user input is validated on the server (NFR2),
 * even when the browser form already checks it.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP_PATTERN = /^\d{5}$/;

const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'professional'];
const AVAILABILITY_OPTIONS = ['weekday-daytime', 'weekday-evenings', 'weekends', 'flexible'];
const DISTANCE_OPTIONS = [5, 10, 25, 50];
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email);
}

function isValidZip(zip) {
  return typeof zip === 'string' && ZIP_PATTERN.test(zip.trim());
}

function isValidUrl(value) {
  if (typeof value !== 'string' || value.length > 300) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Parse a positive integer id; returns null if the value isn't one. */
function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = {
  SKILL_LEVELS,
  AVAILABILITY_OPTIONS,
  DISTANCE_OPTIONS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  isNonEmptyString,
  normalizeEmail,
  isValidEmail,
  isValidZip,
  isValidUrl,
  toId,
};
