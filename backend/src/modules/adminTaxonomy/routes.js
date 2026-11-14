import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { validate } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import { recordAudit } from '../audit/repo.js';
import { defaultSearchService } from '../searchEngine/service.js';
import * as defaultRepo from './repo.js';

const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100);
const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const createCategoryBody = z.object({ name: z.string().trim().min(1).max(100), slug: SLUG.optional() }).strict();
const updateCategoryBody = z.object({ name: z.string().trim().min(1).max(100).optional(), slug: SLUG.optional() }).strict();
const createTagBody = z.object({ name: z.string().trim().min(1).max(50), slug: SLUG.max(50).optional() }).strict();
const updateTagBody = z.object({ name: z.string().trim().min(1).max(50).optional(), slug: SLUG.max(50).optional() }).strict();

const toPayload = (r) => ({ id: Number(r.id), name: r.name, slug: r.slug, articleCount: Number(r.article_count ?? 0) });

/** Content Manager & Super Admin: categories and tags CRUD. */
export function adminTaxonomyRouter({
  repo = defaultRepo, auth = authRepo, jwt, limit = limiter({ windowMs: 60_000, limit: 120 }), audit = recordAudit,
} = {}) {
  const router = Router();
  router.use(limit, requireAuth({ repo: auth, jwt }), requireRole('admin', 'editor'));

  router.get('/categories', async (_req, res, next) => {
    try { res.json({ items: (await repo.listCategories()).map(toPayload) }); } catch (err) { next(err); }
  });

  router.post('/categories', validate({ body: createCategoryBody }), async (req, res, next) => {
    try {
      const row = await repo.createCategory(req.validated.body);
      await audit({ actorId: req.user.id, action: 'category.create', entityType: 'category', entityId: row.id, details: { slug: row.slug } }).catch(() => {});
      res.status(201).json(toPayload(row));
    } catch (err) { next(err); }
  });

  router.patch('/categories/:id', validate({ params: idParams, body: updateCategoryBody }), async (req, res, next) => {
    try {
      const row = await repo.updateCategory(req.validated.params.id, req.validated.body);
      if (!row) throw new HttpError(404, 'Not Found');
      defaultSearchService.invalidate();
      await audit({ actorId: req.user.id, action: 'category.update', entityType: 'category', entityId: row.id }).catch(() => {});
      res.json(toPayload(row));
    } catch (err) { next(err); }
  });

  router.delete('/categories/:id', validate({ params: idParams }), async (req, res, next) => {
    try {
      if (!(await repo.deleteCategory(req.validated.params.id))) throw new HttpError(404, 'Not Found');
      defaultSearchService.invalidate();
      await audit({ actorId: req.user.id, action: 'category.delete', entityType: 'category', entityId: req.validated.params.id }).catch(() => {});
      res.status(204).end();
    } catch (err) { next(err); }
  });

  router.get('/tags', async (_req, res, next) => {
    try { res.json({ items: (await repo.listTags()).map(toPayload) }); } catch (err) { next(err); }
  });

  router.post('/tags', validate({ body: createTagBody }), async (req, res, next) => {
    try {
      const row = await repo.createTag(req.validated.body);
      await audit({ actorId: req.user.id, action: 'tag.create', entityType: 'tag', entityId: row.id, details: { slug: row.slug } }).catch(() => {});
      res.status(201).json(toPayload(row));
    } catch (err) { next(err); }
  });

  router.patch('/tags/:id', validate({ params: idParams, body: updateTagBody }), async (req, res, next) => {
    try {
      const row = await repo.updateTag(req.validated.params.id, req.validated.body);
      if (!row) throw new HttpError(404, 'Not Found');
      defaultSearchService.invalidate();
      await audit({ actorId: req.user.id, action: 'tag.update', entityType: 'tag', entityId: row.id }).catch(() => {});
      res.json(toPayload(row));
    } catch (err) { next(err); }
  });

  router.delete('/tags/:id', validate({ params: idParams }), async (req, res, next) => {
    try {
      if (!(await repo.deleteTag(req.validated.params.id))) throw new HttpError(404, 'Not Found');
      defaultSearchService.invalidate();
      await audit({ actorId: req.user.id, action: 'tag.delete', entityType: 'tag', entityId: req.validated.params.id }).catch(() => {});
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
