import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { validate } from '../../http/validate.js';
import { optionalAuth } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import * as defaultRepo from './repo.js';

const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(200);
const clickBody = z.object({
  queryString: z.string().trim().min(1).max(500),
  slug: SLUG.optional(),
  documentId: z.coerce.number().int().positive().optional(),
  queryLogId: z.coerce.number().int().positive().optional(),
  rankPosition: z.coerce.number().int().min(1).max(1000).optional(),
  retrievalModel: z.enum(['bm25', 'tfidf', 'ql', 'boolean', 'hybrid', 'ilike']).optional(),
}).strict().refine((d) => d.slug !== undefined || d.documentId !== undefined, {
  message: 'Either slug or documentId is required',
});

/** POST /api/search-clicks — logs search result clicks into search_click_log (Phase 2 prep). */
export function searchClicksRouter({
  repo = defaultRepo,
  auth = authRepo,
  jwt,
  writeLimit = limiter({ windowMs: 60_000, limit: 60 }),
} = {}) {
  const router = Router();
  const identify = jwt ? optionalAuth({ repo: auth, jwt }) : (_req, _res, next) => next();

  router.post('/', writeLimit, identify, validate({ body: clickBody }), async (req, res, next) => {
    try {
      const { queryString, slug, documentId, queryLogId, rankPosition, retrievalModel } = req.validated.body;
      const docId = await repo.findPublishedDocId({ slug, documentId });
      if (docId == null) return next(new HttpError(404, 'Not Found'));
      const row = await repo.insertSearchClick({
        userId: req.user?.id ?? null,
        queryString,
        clickedDocId: docId,
        ...(queryLogId !== undefined && { queryLogId }),
        ...(rankPosition !== undefined && { rankPosition }),
        ...(retrievalModel !== undefined && { retrievalModel }),
      });
      res.status(201).json({
        id: Number(row.id),
        userId: row.user_id != null ? Number(row.user_id) : null,
        queryString: row.query_string,
        clickedDocId: Number(row.clicked_doc_id),
        createdAt: row.created_at,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
