import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { pagination, validate } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import { recordAudit } from '../audit/repo.js';
import { defaultSearchService } from '../searchEngine/service.js';
import * as defaultRepo from './repo.js';

const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const listQuery = pagination.extend({
  q: z.string().trim().min(1).max(100).optional(),
  missingMeta: z.enum(['0', '1']).optional(),
});
const httpsUrl = z.string().trim().url().max(500).refine((u) => /^https:\/\/\S+$/.test(u), 'Must be an https:// URL');
const seoBody = z.object({
  metaTitle: z.union([z.string().trim().max(70), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  metaDescription: z.union([z.string().trim().max(320), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  ogImageUrl: z.union([httpsUrl, z.literal(''), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  imageAlt: z.union([z.string().trim().max(250), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  seoKeywords: z.string().trim().max(300).optional(),
}).strict();

const toSeoPayload = (r) => ({
  id: Number(r.id),
  title: r.title,
  slug: r.slug,
  status: r.status,
  summary: r.summary,
  categoryName: r.category_name,
  metaTitle: r.meta_title ?? '',
  metaDescription: r.meta_description ?? '',
  ogImageUrl: r.og_image_url ?? '',
  imageAlt: r.image_alt ?? '',
  seoKeywords: r.seo_keywords ?? '',
  viewsCount: Number(r.views_count ?? 0),
  updatedAt: r.updated_at,
});

/** Data & SEO Specialist & Super Admin APIs: SEO metadata management and analytics dashboard. */
export function adminSeoRouter({
  repo = defaultRepo, auth = authRepo, jwt, limit = limiter({ windowMs: 60_000, limit: 120 }), audit = recordAudit,
} = {}) {
  const router = Router();
  const guard = [limit, requireAuth({ repo: auth, jwt }), requireRole('admin', 'seo')];

  router.get('/seo/articles', ...guard, validate({ query: listQuery }), async (req, res, next) => {
    try {
      const { page, pageSize, q, missingMeta } = req.validated.query;
      const { rows, total } = await repo.listSeoArticles({ page, pageSize, q, missingMeta: missingMeta === '1' });
      res.json({ items: rows.map(toSeoPayload), page, pageSize, total });
    } catch (err) { next(err); }
  });

  router.patch('/seo/articles/:id', ...guard, validate({ params: idParams, body: seoBody }), async (req, res, next) => {
    try {
      const row = await repo.updateSeoArticle(req.validated.params.id, req.validated.body);
      if (!row) throw new HttpError(404, 'Not Found');
      defaultSearchService.invalidate();
      await audit({
        actorId: req.user.id,
        action: 'seo.update',
        entityType: 'document',
        entityId: row.id,
        details: { slug: row.slug },
      }).catch(() => {});
      res.json(toSeoPayload(row));
    } catch (err) { next(err); }
  });

  router.get('/analytics', ...guard, async (_req, res, next) => {
    try {
      res.json(await repo.getAnalytics());
    } catch (err) { next(err); }
  });

  return router;
}
