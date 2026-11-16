/** Controller for the signed-in user's own profile. */
const { requireAuth } = require('../middleware');

function registerProfileRoutes(router, { profileService }) {
  // The owner's view includes their ZIP code so the edit form can show it.
  router.get('/api/profile', requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ profile: profileService.getOwnProfile(req.user.id) });
  });

  router.put('/api/profile', requireAuth, async (req, res) => {
    const profile = await profileService.saveProfile(req.user.id, req.body);
    res.json({ profile, redirectTo: `/musicians/${profile.userId}` });
  });
}

module.exports = { registerProfileRoutes };
