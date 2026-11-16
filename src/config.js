/**
 * Central configuration. Every setting comes from an environment variable with
 * a safe default, so the app runs locally with no setup and on Render with only
 * NODE_ENV=production set.
 */
const path = require('node:path');

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number(env.PORT) || 3000,
    databasePath:
      env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'musician-finder.db'),
    seedCount: env.SEED_COUNT === undefined ? 60 : Number(env.SEED_COUNT),
    zipLookupEnabled: env.ZIP_LOOKUP_ENABLED !== 'false',
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000, // FR2: a session lasts 7 days
    login: {
      maxFailures: 5, // US-2: 5 failed attempts...
      windowMs: 15 * 60 * 1000, // ...within 15 minutes...
      lockMs: 15 * 60 * 1000, // ...blocks login for 15 minutes
    },
    publicDir: path.join(__dirname, '..', 'public'),
  };
}

module.exports = { loadConfig };
