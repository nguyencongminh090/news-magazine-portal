import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { pagination, validate } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import { toAdminArticlePayload } from '../articles/payload.js';
import { recordAudit } from '../audit/repo.js';
import { defaultSearchService } from '../searchEngine/service.js';
import * as defaultRepo from './repo.js';

const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(200);
const STATUS = z.enum(['draft', 'published', 'archived']);
const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const listQuery = pagination.extend({ status: STATUS.optional(), q: z.string().trim().min(1).max(100).optional() });
const httpsUrl = z.string().trim().url().max(500).refine((u) => /^https:\/\/\S+$/.test(u), 'Must be an https:// URL');
const fields = {
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(1000).default(''),
  body: z.string().min(1).max(100_000),
  categorySlug: SLUG,
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]).transform((t) => [...new Set(t)]),
  status: STATUS.default('draft'),
  ogImageUrl: z.union([httpsUrl, z.literal(''), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  imageAlt: z.union([z.string().trim().max(250), z.null()]).optional().transform((v) => (v === '' ? null : v)),
};
const createBody = z.object({ ...fields, slug: SLUG.optional() }).strict();
const updateBody = z.object({ ...fields, slug: SLUG, updatedAt: z.string().datetime() }).strict();

/** /api/admin/articles — staff only (admin, editor); only admin may delete. Server-side RBAC is the real gate. */
export function adminArticlesRouter({
  repo = defaultRepo, auth = authRepo, jwt, limit = limiter({ windowMs: 60_000, limit: 120 }), audit = recordAudit,
} = {}) {
  const router = Router();
  router.use(limit, requireAuth({ repo: auth, jwt }), requireRole('admin', 'editor'));

  router.get('/', validate({ query: listQuery }), async (req, res, next) => {
    try {
      const { page, pageSize } = req.validated.query;
      const { rows, total } = await repo.list(req.validated.query);
      res.json({ items: rows.map(toAdminArticlePayload), page, pageSize, total });
    } catch (err) { next(err); }
  });

  router.get('/:id', validate({ params: idParams }), async (req, res, next) => {
    try {
      const row = await repo.findById(req.validated.params.id);
      if (!row) throw new HttpError(404, 'Not Found');
      res.json(toAdminArticlePayload(row));
    } catch (err) { next(err); }
  });

  router.post('/', validate({ body: createBody }), async (req, res, next) => {
    try {
      const row = await repo.create(req.validated.body, { id: req.user.id, name: req.user.display_name });
      defaultSearchService.invalidate();
      await audit({ actorId: req.user.id, action: 'article.create', entityType: 'document', entityId: row.id, details: { slug: row.slug, status: row.status } }).catch(() => {});
      res.status(201).location(`/api/admin/articles/${row.id}`).json(toAdminArticlePayload(row));
    } catch (err) { next(err); }
  });

  router.put('/:id', validate({ params: idParams, body: updateBody }), async (req, res, next) => {
    try {
      const { updatedAt, ...data } = req.validated.body;
      const row = await repo.update(req.validated.params.id, data, updatedAt);
      if (!row) throw new HttpError(404, 'Not Found');
      defaultSearchService.invalidate();
      await audit({ actorId: req.user.id, action: 'article.update', entityType: 'document', entityId: row.id, details: { slug: row.slug, status: row.status } }).catch(() => {});
      res.json(toAdminArticlePayload(row));
    } catch (err) { next(err); }
  });

  router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res, next) => {
    try {
      if (!(await repo.remove(req.validated.params.id))) throw new HttpError(404, 'Not Found');
      defaultSearchService.invalidate();
      await audit({ actorId: req.user.id, action: 'article.delete', entityType: 'document', entityId: req.validated.params.id }).catch(() => {});
      res.status(204).end();
    } catch (err) { next(err); }
  });
  return router;
}
