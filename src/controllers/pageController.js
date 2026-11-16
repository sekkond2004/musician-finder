/**
 * Serves the HTML pages (the V in MVC). Pages are static; their JavaScript
 * calls the JSON API and renders the result. Signed-in pages are guarded on the
 * server and sent with Cache-Control: no-store, so after logout the back button
 * can't show them again (US-2).
 */
const path = require('node:path');
const { requirePageAuth } = require('../middleware');

function registerPageRoutes(router, { config }) {
  const page = (name) => (req, res) => res.sendFile(path.join(config.publicDir, name), { noStore: true });
  const guestOnly = (name) => (req, res) =>
    req.user ? res.redirect('/dashboard') : page(name)(req, res);

  router.get('/', page('index.html'));
  router.get('/register', guestOnly('register.html'));
  router.get('/login', guestOnly('login.html'));
  router.get('/dashboard', requirePageAuth, page('dashboard.html'));
  router.get('/profile/edit', requirePageAuth, page('profile-edit.html'));
  router.get('/search', requirePageAuth, page('search.html'));
}

module.exports = { registerPageRoutes };
