import { Router } from 'express';
import { limiter } from '../../http/rateLimit.js';
import * as defaultRepo from './repo.js';

const toPayload = (r) => ({ id: Number(r.id), slug: r.slug, name: r.name, articleCount: Number(r.article_count) });

/** GET /api/tags — public tag directory with published counts. */
export function tagsRouter({ repo = defaultRepo, readLimit = limiter({ windowMs: 60_000, limit: 120 }) } = {}) {
  const router = Router();
  router.use(readLimit);
  router.get('/', async (_req, res, next) => {
    try {
      res.json({ items: (await repo.listWithCounts()).map(toPayload) });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
