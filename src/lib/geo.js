/**
 * Distance helpers. Search narrows candidates with a cheap latitude/longitude
 * bounding box in SQL, then computes exact great-circle distance with the
 * Haversine formula here.
 */
const EARTH_RADIUS_MILES = 3958.8;
const toRadians = (deg) => (deg * Math.PI) / 180;

function haversineMiles(a, b) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Smallest lat/lng box that contains every point within `miles` of `center`. */
function boundingBox(center, miles) {
  const latDelta = miles / 69.0; // ~69 miles per degree of latitude
  const lonDelta = miles / (69.0 * Math.max(Math.cos(toRadians(center.latitude)), 0.01));
  return {
    minLat: center.latitude - latDelta,
    maxLat: center.latitude + latDelta,
    minLon: center.longitude - lonDelta,
    maxLon: center.longitude + lonDelta,
  };
}

/** NFR3: distances are shown rounded to the nearest mile. */
function roundMiles(miles) {
  return Math.round(miles);
}

module.exports = { haversineMiles, boundingBox, roundMiles, EARTH_RADIUS_MILES };
