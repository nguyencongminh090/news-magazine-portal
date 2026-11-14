import { Router } from 'express';
import { findPublishedMetaBySlug } from './repo.js';
import { buildMetaTags, injectMeta, stripMarker } from './seo.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** GET /articles/:slug -> built index.html with per-article head meta. Production only (see ADR-002). */
export function articleShellRouter({ shell, baseUrl, findBySlug = findPublishedMetaBySlug }) {
  const fallback = stripMarker(shell);
  const router = Router();
  router.get('/articles/:slug', async (req, res, next) => {
    try {
      const row = SLUG.test(req.params.slug) ? await findBySlug(req.params.slug) : null;
      res.type('html');
      if (!row) return res.status(404).set('Cache-Control', 'no-store').send(fallback);
      res.set('Cache-Control', 'public, max-age=60').send(injectMeta(shell, buildMetaTags(row, baseUrl)));
    } catch (err) {
      next(err);
    }
  });
  return router;
}
