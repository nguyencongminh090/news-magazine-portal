import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { pagination, validate } from '../../http/validate.js';
import { toArticlePayload } from './payload.js';
import { pendingViews, recordView } from './views.js';
import { optionalAuth } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import { getPublicSettings } from '../settings/repo.js';
import { defaultSearchService } from '../searchEngine/service.js';
import * as defaultRepo from './repo.js';

const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(200);
function isValidDateFilter(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) {
    const [, y, mo, d] = m.map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));
}
const DATE_FILTER = z.string().trim().refine(isValidDateFilter, 'Invalid date (use YYYY-MM-DD or ISO 8601)');
const listQuery = pagination.extend({
  category: SLUG.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  from: DATE_FILTER.optional(),
  to: DATE_FILTER.optional(),
  sort: z.enum(['relevance', 'latest', 'views', 'oldest']).optional(),
  model: z.enum(['bm25', 'tfidf', 'ql', 'boolean', 'hybrid']).optional(),
  prf: z.enum(['0', '1']).optional(),
  cluster: z.enum(['0', '1']).optional(),
  explain: z.enum(['0', '1']).optional(),
}).refine(
  (d) => !(d.from && d.to && Date.parse(d.from) > Date.parse(d.to)),
  { message: '`from` must be on or before `to`', path: ['from'] },
);
const slugParams = z.object({ slug: SLUG }).strict();
const detailQuery = z.object({ view: z.enum(['0', '1']).optional() }).strict();

/** GET /api/articles, GET /api/articles/:slug — public, published only. */
export function articlesRouter({
  repo = defaultRepo,
  searchService = defaultSearchService,
  readLimit = limiter({ windowMs: 60_000, limit: 120 }),
  jwt,
  auth = authRepo,
  getSettings = getPublicSettings,
} = {}) {
  const router = Router();
  router.use(readLimit);

  // With a signing key, a valid bearer token adds the caller's own rating (engagement.myRating); otherwise anonymous.
  const identify = jwt ? optionalAuth({ repo: auth, jwt }) : (_req, _res, next) => next();

  router.get('/', identify, validate({ query: listQuery }), async (req, res, next) => {
    try {
      const filters = { ...req.validated.query };
      if (req.query.pageSize === undefined) {
        const configured = Number((await getSettings()).articles_per_page);
        if (Number.isInteger(configured) && configured >= 5 && configured <= 50) {
          filters.pageSize = configured;
        }
      }
      const { page, pageSize } = filters;

      const useSearchEngine =
        repo === defaultRepo &&
        ((filters.q && searchService.hasNonStopwordToken(filters.q)) || filters.sort === 'relevance');

      if (useSearchEngine) {
        const result = await searchService.search({
          ...filters,
          model: filters.model ?? 'bm25',
          sort: filters.sort ?? (filters.q ? 'relevance' : 'latest'),
          prf: filters.prf === '1',
          cluster: filters.cluster !== '0',
          explain: filters.explain === '1',
          userId: req.user?.id ?? null,
        });
        res.json({
          items: result.rows.map(toArticlePayload),
          page,
          pageSize,
          total: result.total,
          searchMeta: {
            latencyMs: result.latencyMs,
            model: result.model,
            sort: result.sort,
            suggestion: result.suggestion,
            expansions: result.expansions,
            prfTerms: result.prfTerms,
            clusters: result.clusters,
            queryLogId: result.queryLogId,
          },
        });
        return;
      }

      const { rows, total } = await repo.listPublished(filters);
      res.json({ items: rows.map(toArticlePayload), page, pageSize, total });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:slug', identify, validate({ params: slugParams, query: detailQuery }), async (req, res, next) => {
    try {
      const row = await repo.findPublishedBySlug(req.validated.params.slug, req.user?.id ?? null);
      if (!row) return next(new HttpError(404, 'Not Found'));
      if (req.validated.query.view !== '0' && row.id != null) {
        recordView(row.id);
      }
      const enriched = row.views_count !== undefined
        ? { ...row, views_count: Number(row.views_count) + pendingViews(row.id) }
        : row;
      res.json(toArticlePayload(enriched));
    } catch (err) {
      next(err);
    }
  });
  return router;
}
