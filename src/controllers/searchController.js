/** Controller for musician search. */
const { requireAuth } = require('../middleware');

function registerSearchRoutes(router, { searchService }) {
  router.get('/api/musicians', requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(searchService.search(req.user.id, req.query));
  });
}

module.exports = { registerSearchRoutes };
