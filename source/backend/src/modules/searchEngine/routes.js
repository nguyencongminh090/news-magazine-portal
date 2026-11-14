import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { pagination, validate } from '../../http/validate.js';
import { optionalAuth, requireAuth, requireRole } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import { defaultSearchService } from './service.js';

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

const searchQuery = pagination.extend({
  q: z.string().trim().min(1).max(200).optional(),
  category: SLUG.optional(),
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

const suggestQuery = z.object({ q: z.string().trim().min(1).max(100) }).strict();
const inspectQuery = z.object({ term: z.string().trim().min(1).max(80) }).strict();
const slugParams = z.object({ slug: SLUG }).strict();
const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();

export function toSearchArticlePayload(row) {
  const payload = {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? null,
    publishedAt: row.published_at ?? null,
    authorName: row.author_name ?? null,
    category: row.category_slug ? { slug: row.category_slug, name: row.category_name } : null,
    tags: row.tags ?? [],
  };
  if (row.views_count !== undefined) payload.viewsCount = Number(row.views_count ?? 0);
  if (row.og_image_url !== undefined) payload.ogImageUrl = row.og_image_url ?? null;
  if (row.image_alt !== undefined) payload.imageAlt = row.image_alt ?? null;
  if (row.search_score != null) payload.searchScore = row.search_score;
  if (row.snippet_segments != null) payload.snippetSegments = row.snippet_segments;
  if (row.matched_terms?.length) payload.matchedTerms = row.matched_terms;
  if (row.score_breakdown !== undefined) payload.scoreBreakdown = row.score_breakdown;
  if (row.similarity !== undefined) payload.similarity = row.similarity;
  if (row.recommendationReason !== undefined) payload.recommendationReason = row.recommendationReason;
  return payload;
}

/**
 * Public Search Engine routes (/api/search/*, /api/articles/:slug/related, /api/articles/:slug/suggested-tags)
 * and Staff Search Engine Lab routes (/api/admin/search-engine/*, /api/admin/seo/audit/:id).
 */
export function searchEngineRouter({
  service = defaultSearchService,
  auth = authRepo,
  jwt,
  readLimit = limiter({ windowMs: 60_000, limit: 120 }),
} = {}) {
  const router = Router();
  const identify = jwt ? optionalAuth({ repo: auth, jwt }) : (_req, _res, next) => next();

  router.get('/search', readLimit, identify, validate({ query: searchQuery }), async (req, res, next) => {
    try {
      const f = req.validated.query;
      const result = await service.search({
        ...f,
        model: f.model ?? 'bm25',
        sort: f.sort ?? (f.q ? 'relevance' : 'latest'),
        prf: f.prf === '1',
        cluster: f.cluster !== '0',
        explain: f.explain === '1',
        userId: req.user?.id ?? null,
      });
      res.json({
        items: result.rows.map(toSearchArticlePayload),
        page: f.page,
        pageSize: f.pageSize,
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
    } catch (err) { next(err); }
  });

  router.get('/search/suggest', readLimit, validate({ query: suggestQuery }), async (req, res, next) => {
    try {
      res.json(await service.suggest(req.validated.query.q));
    } catch (err) { next(err); }
  });

  router.get('/search/tag-cloud', readLimit, async (_req, res, next) => {
    try {
      res.json({ items: await service.getTagCloud(40) });
    } catch (err) { next(err); }
  });

  router.get('/search/recommendations', readLimit, identify, async (req, res, next) => {
    try {
      const items = await service.getRecommendations(req.user?.id ?? null, 6);
      res.json({ items: items.map(toSearchArticlePayload) });
    } catch (err) { next(err); }
  });

  router.get('/articles/:slug/related', readLimit, validate({ params: slugParams }), async (req, res, next) => {
    try {
      const items = await service.getRelatedArticles(req.validated.params.slug, 4);
      if (items === null) return next(new HttpError(404, 'Not Found'));
      res.json({ items: items.map(toSearchArticlePayload) });
    } catch (err) { next(err); }
  });

  router.get('/articles/:slug/suggested-tags', readLimit, validate({ params: slugParams }), async (req, res, next) => {
    try {
      const out = await service.getSuggestedTags({ slug: req.validated.params.slug }, 6);
      if (out === null) return next(new HttpError(404, 'Not Found'));
      res.json(out);
    } catch (err) { next(err); }
  });

  if (jwt) {
    const labGuard = [readLimit, requireAuth({ repo: auth, jwt }), requireRole('admin', 'seo')];
    const editorGuard = [readLimit, requireAuth({ repo: auth, jwt }), requireRole('admin', 'editor', 'seo')];

    router.get('/admin/search-engine/stats', ...labGuard, async (_req, res, next) => {
      try {
        res.json(await service.getStats());
      } catch (err) { next(err); }
    });

    router.get('/admin/search-engine/evaluate', ...labGuard, async (_req, res, next) => {
      try {
        res.json(await service.evaluate());
      } catch (err) { next(err); }
    });

    router.get('/admin/search-engine/inspect', ...labGuard, validate({ query: inspectQuery }), async (req, res, next) => {
      try {
        res.json(await service.inspectTerm(req.validated.query.term));
      } catch (err) { next(err); }
    });

    router.post('/admin/search-engine/rebuild', ...labGuard, async (_req, res, next) => {
      try {
        await service.ensureIndex(true);
        res.json(await service.getStats());
      } catch (err) { next(err); }
    });

    router.get('/admin/seo/audit/:id', ...editorGuard, validate({ params: idParams }), async (req, res, next) => {
      try {
        const audit = await service.auditSeo(req.validated.params.id);
        if (!audit) return next(new HttpError(404, 'Not Found'));
        res.json(audit);
      } catch (err) { next(err); }
    });
  }

  return router;
}
