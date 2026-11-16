/**
 * Application factory.
 *
 * Design pattern: Factory + dependency injection. createApp() builds the whole
 * object graph in one place — database -> repositories -> services ->
 * controllers — and returns a request handler. Tests call it with an in-memory
 * database and a fake fetch; server.js calls it with the real ones.
 *
 * Layers (MVC + Repository):
 *   public/          View        static pages + browser JS that renders JSON
 *   controllers/     Controller  HTTP <-> service calls, no rules or SQL
 *   services/        Model       business rules (validation, distance, sessions)
 *   repositories/    Model       every SQL query, parameterized
 */
const { Router } = require('./lib/router');
const { staticFiles } = require('./lib/http');
const { openDatabase } = require('./db/database');
const { seedReferenceData } = require('./db/seed');

const { LookupRepository } = require('./repositories/lookupRepository');

const { registerMetaRoutes } = require('./controllers/metaController');
const { registerPageRoutes } = require('./controllers/pageController');

const mw = require('./middleware');

const silentLogger = { info() {}, warn() {}, error() {} };

/**
 * @param {object} options
 * @param {ReturnType<import('./config').loadConfig>} options.config
 * @param {import('node:sqlite').DatabaseSync} [options.db] an open database (defaults to config.databasePath)
 * @param {{info:Function, warn:Function, error:Function}} [options.logger]
 */
function createApp({ config, db = openDatabase(config.databasePath), logger = silentLogger }) {
  seedReferenceData(db);

  // Repositories (data layer)
  const lookups = new LookupRepository(db);

  const deps = { config, db, lookups, startedAt: Date.now() };

  // HTTP pipeline (controllers + middleware)
  const router = new Router();
  router.use(mw.requestContext());
  router.use(mw.securityHeaders(config));
  router.use(mw.requestLogger(logger));
  router.use(staticFiles(config.publicDir));
  router.use('/api', mw.jsonBody());

  registerMetaRoutes(router, deps);
  registerPageRoutes(router, deps);

  router.use(mw.errorHandler(logger));
  const notFound = mw.notFound(config.publicDir);

  const handler = (req, res) => router.handle(req, res, notFound);
  return { handler, db, services: {}, repositories: { lookups } };
}

module.exports = { createApp };
