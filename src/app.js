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
const password = require('./lib/password');
const { openDatabase } = require('./db/database');
const { seedReferenceData } = require('./db/seed');

const { UserRepository } = require('./repositories/userRepository');
const { SessionRepository } = require('./repositories/sessionRepository');
const { LoginAttemptRepository } = require('./repositories/loginAttemptRepository');
const { LookupRepository } = require('./repositories/lookupRepository');
const { ProfileRepository } = require('./repositories/profileRepository');

const { AuthService } = require('./services/authService');
const { GeocodingService } = require('./services/geocodingService');
const { ProfileService } = require('./services/profileService');
const { SearchService } = require('./services/searchService');

const { registerMetaRoutes } = require('./controllers/metaController');
const { registerAuthRoutes } = require('./controllers/authController');
const { registerProfileRoutes } = require('./controllers/profileController');
const { registerSearchRoutes } = require('./controllers/searchController');
const { registerPageRoutes } = require('./controllers/pageController');

const mw = require('./middleware');

const silentLogger = { info() {}, warn() {}, error() {} };

/**
 * @param {object} options
 * @param {ReturnType<import('./config').loadConfig>} options.config
 * @param {import('node:sqlite').DatabaseSync} [options.db] an open database (defaults to config.databasePath)
 * @param {typeof fetch} [options.fetchFn] used for ZIP lookups
 * @param {{now:() => number}} [options.clock]
 * @param {{hashPassword:Function, verifyPassword:Function}} [options.hasher]
 * @param {{info:Function, warn:Function, error:Function}} [options.logger]
 */
function createApp({
  config,
  db = openDatabase(config.databasePath),
  fetchFn = globalThis.fetch,
  clock = { now: () => Date.now() },
  hasher = password,
  logger = silentLogger,
}) {
  seedReferenceData(db);

  // Repositories (data layer)
  const users = new UserRepository(db);
  const sessions = new SessionRepository(db);
  const loginAttempts = new LoginAttemptRepository(db);
  const lookups = new LookupRepository(db);
  const profiles = new ProfileRepository(db);

  // Services (business logic)
  const authService = new AuthService({ users, sessions, loginAttempts, hasher, clock, config });
  const geocoder = new GeocodingService({ lookups, fetchFn, enabled: config.zipLookupEnabled });
  const profileService = new ProfileService({ profiles, lookups, geocoder });
  const searchService = new SearchService({ profiles });

  const deps = { config, db, lookups, authService, profileService, searchService, startedAt: Date.now() };

  // HTTP pipeline (controllers + middleware)
  const router = new Router();
  router.use(mw.requestContext());
  router.use(mw.securityHeaders(config));
  router.use(mw.requestLogger(logger));
  router.use(staticFiles(config.publicDir));
  router.use('/api', mw.jsonBody());
  router.use(mw.loadSession(authService));

  registerMetaRoutes(router, deps);
  registerAuthRoutes(router, deps);
  registerProfileRoutes(router, deps);
  registerSearchRoutes(router, deps);
  registerPageRoutes(router, deps);

  router.use(mw.errorHandler(logger));
  const notFound = mw.notFound(config.publicDir);

  const handler = (req, res) => router.handle(req, res, notFound);
  return { handler, db, services: { authService, profileService, searchService }, repositories: { users, profiles, lookups } };
}

module.exports = { createApp };
