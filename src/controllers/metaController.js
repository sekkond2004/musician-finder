/** Health check and the lookup lists the forms need. */
const { SKILL_LEVELS, AVAILABILITY_OPTIONS, DISTANCE_OPTIONS } = require('../lib/validation');

const AVAILABILITY_LABELS = {
  'weekday-daytime': 'Weekday daytime',
  'weekday-evenings': 'Weekday evenings',
  weekends: 'Weekends',
  flexible: 'Flexible',
};

function registerMetaRoutes(router, { db, lookups, startedAt }) {
  // NFR5: checked by an uptime monitor.
  router.get('/health', (req, res) => {
    let database = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      database = 'error';
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  router.get('/api/options', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      instruments: lookups.listInstruments(),
      genres: lookups.listGenres(),
      skillLevels: SKILL_LEVELS,
      availability: AVAILABILITY_OPTIONS.map((key) => ({ key, label: AVAILABILITY_LABELS[key] })),
      distances: DISTANCE_OPTIONS,
    });
  });
}

module.exports = { registerMetaRoutes };
