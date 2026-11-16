/**
 * Entry point: load config, open the database, add demo data if it's empty,
 * and start the HTTP server.
 */
const http = require('node:http');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { openDatabase } = require('./db/database');
const { seedDemoMusicians } = require('./db/seed');

const logger = {
  info: (msg) => console.log(`[info] ${new Date().toISOString()} ${msg}`),
  warn: (msg) => console.warn(`[warn] ${new Date().toISOString()} ${msg}`),
  error: (msg) => console.error(`[error] ${new Date().toISOString()} ${msg}`),
};

async function main() {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const app = createApp({ config, db, logger });

  const profileCount = db.prepare('SELECT COUNT(*) AS n FROM profiles').get().n;
  if (config.seedCount > 0 && profileCount === 0) {
    const created = await seedDemoMusicians(db, { count: config.seedCount });
    logger.info(`Database was empty: added ${created} demo musicians.`);
  }

  const server = http.createServer(app.handler);
  server.listen(config.port, () => {
    logger.info(`Musician Finder listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  const shutdown = () => {
    logger.info('Shutting down...');
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error(err.stack || String(err));
  process.exit(1);
});
