/**
 * Controller (the C in MVC) for accounts: turns HTTP requests into AuthService
 * calls and returns JSON. No business rules or SQL live here.
 */
const { requireAuth, setSessionCookie, clearSessionCookie } = require('../middleware');

function registerAuthRoutes(router, { authService, profileService, config }) {
  router.post('/api/auth/register', async (req, res) => {
    const { user, token, expiresAt } = await authService.register(req.body);
    setSessionCookie(res, token, expiresAt, config);
    // US-1: a new user goes straight to profile setup.
    res.status(201).json({ user, redirectTo: '/profile/edit' });
  });

  router.post('/api/auth/login', async (req, res) => {
    const { user, token, expiresAt } = await authService.login(req.body);
    setSessionCookie(res, token, expiresAt, config);
    const hasProfile = Boolean(profileService.getOwnProfile(user.id));
    res.json({ user, redirectTo: hasProfile ? '/dashboard' : '/profile/edit' });
  });

  router.post('/api/auth/logout', (req, res) => {
    authService.logout(req.sessionToken);
    clearSessionCookie(res, config);
    res.json({ ok: true, redirectTo: '/login' });
  });

  router.get('/api/auth/me', requireAuth, (req, res) => {
    const profile = profileService.getOwnProfile(req.user.id);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      user: { id: req.user.id, email: req.user.email, createdAt: req.user.createdAt },
      hasProfile: Boolean(profile),
      displayName: profile ? profile.displayName : null,
    });
  });
}

module.exports = { registerAuthRoutes };
