import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { pagination, validate } from '../../http/validate.js';
import { toArticlePayload } from './payload.js';
import * as defaultRepo from './repo.js';

const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(200);
const listQuery = pagination.extend({ category: SLUG.optional(), q: z.string().trim().min(1).max(100).optional() });
const slugParams = z.object({ slug: SLUG }).strict();

/** GET /api/articles, GET /api/articles/:slug — public, published only. */
export function articlesRouter({ repo = defaultRepo, readLimit = limiter({ windowMs: 60_000, limit: 120 }) } = {}) {
  const router = Router();
  router.use(readLimit);

  router.get('/', validate({ query: listQuery }), async (req, res, next) => {
    try {
      const { page, pageSize } = req.validated.query;
      const { rows, total } = await repo.listPublished(req.validated.query);
      res.json({ items: rows.map(toArticlePayload), page, pageSize, total });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:slug', validate({ params: slugParams }), async (req, res, next) => {
    try {
      const row = await repo.findPublishedBySlug(req.validated.params.slug);
      if (!row) return next(new HttpError(404, 'Not Found'));
      res.json(toArticlePayload(row));
    } catch (err) {
      next(err);
    }
  });
  return router;
}
