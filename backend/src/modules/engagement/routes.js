import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter, limits as defaultLimits } from '../../http/rateLimit.js';
import { pagination, validate } from '../../http/validate.js';
import { optionalAuth, requireAuth, requireRole, requireVerified } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import { recordAudit } from '../audit/repo.js';
import { getPublicSettings } from '../settings/repo.js';
import { defaultSearchService } from '../searchEngine/service.js';
import { toCommentPayload, toEngagementSummary } from './summary.js';
import * as defaultRepo from './repo.js';

const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(200);
const slugParams = z.object({ slug: SLUG }).strict();
const tagDeleteParams = z.object({ slug: SLUG, tag: z.string().trim().min(1).max(50) }).strict();
const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const text = (max) => z.string().trim().min(1).max(max);
const commentBody = z.object({ body: text(2000) }).strict();
const ratingBody = z.object({ score: z.number().int().min(1).max(5) }).strict();
const reportBody = z.object({ reason: text(1000) }).strict();
const tagBody = z.object({ tag: z.string().trim().min(1).max(50) }).strict();
const moderateBody = z.object({ status: z.enum(['visible', 'hidden']) }).strict();

/**
 * Comments / ratings / likes / user-tagging / reports under /api (mounted once):
 *   public read · verified-email users write · staff (admin, editor, moderator) hide, admin/moderator delete.
 * Bearer auth, no cookie -> not CSRF-prone. Write order: auth -> verified -> per-user limiter -> validate.
 */
export function engagementRouter({
  repo = defaultRepo, auth = authRepo, jwt, limits = defaultLimits,
  readLimit = limiter({ windowMs: 60_000, limit: 120 }),
  audit = recordAudit,
  getSettings = getPublicSettings,
} = {}) {
  const router = Router();
  const authenticate = requireAuth({ repo: auth, jwt });
  const identify = optionalAuth({ repo: auth, jwt });
  const byUser = { keyGenerator: (req) => `u${req.user.id}` };
  const write = (name) => [authenticate, requireVerified, limits[name](byUser)];
  const [commentGuard, ratingGuard, reportGuard] = ['comment', 'rating', 'report'].map(write);

  /** Resolve the published article once; unknown/unpublished -> 404. */
  const article = async (req) => {
    const id = await repo.findPublishedId(req.validated.params.slug);
    if (id == null) throw new HttpError(404, 'Not Found');
    return id;
  };
  const summaryFor = async (documentId, userId) => toEngagementSummary(await repo.getSummaryRow(documentId, userId));
  const h = (fn) => (req, res, next) => fn(req, res).catch(next);

  router.get('/articles/:slug/comments', readLimit, validate({ params: slugParams, query: pagination }), h(async (req, res) => {
    const { page, pageSize } = req.validated.query;
    const { rows, total } = await repo.listVisibleComments(await article(req), req.validated.query);
    res.json({ items: rows.map(toCommentPayload), page, pageSize, total });
  }));

  router.post('/articles/:slug/comments', ...commentGuard, validate({ params: slugParams, body: commentBody }), h(async (req, res) => {
    if ((await getSettings()).allow_comments === false) {
      throw new HttpError(403, 'Forbidden', { detail: 'Commenting is currently disabled' });
    }
    const row = await repo.insertComment({ documentId: await article(req), userId: req.user.id, body: req.validated.body.body });
    res.status(201).json(toCommentPayload({ ...row, author_name: req.user.display_name }));
  }));

  router.put('/articles/:slug/rating', ...ratingGuard, validate({ params: slugParams, body: ratingBody }), h(async (req, res) => {
    const documentId = await article(req);
    await repo.upsertRating({ documentId, userId: req.user.id, score: req.validated.body.score });
    res.json(await summaryFor(documentId, req.user.id));
  }));

  router.delete('/articles/:slug/rating', ...ratingGuard, validate({ params: slugParams }), h(async (req, res) => {
    const documentId = await article(req);
    await repo.deleteRating({ documentId, userId: req.user.id });
    res.json(await summaryFor(documentId, req.user.id));
  }));

  router.get('/articles/:slug/like', readLimit, identify, validate({ params: slugParams }), h(async (req, res) => {
    res.json(await repo.getLikeSummary(await article(req), req.user?.id ?? null));
  }));

  router.put('/articles/:slug/like', ...ratingGuard, validate({ params: slugParams }), h(async (req, res) => {
    res.json(await repo.upsertLike({ documentId: await article(req), userId: req.user.id }));
  }));

  router.delete('/articles/:slug/like', ...ratingGuard, validate({ params: slugParams }), h(async (req, res) => {
    res.json(await repo.deleteLike({ documentId: await article(req), userId: req.user.id }));
  }));

  router.post('/articles/:slug/tags', ...commentGuard, validate({ params: slugParams, body: tagBody }), h(async (req, res) => {
    const result = await repo.addUserTag({ documentId: await article(req), userId: req.user.id, tagName: req.validated.body.tag });
    defaultSearchService.invalidate();
    res.status(201).json(result);
  }));

  router.delete('/articles/:slug/tags/:tag', ...commentGuard, validate({ params: tagDeleteParams }), h(async (req, res) => {
    const result = await repo.removeUserTag({ documentId: await article(req), userId: req.user.id, tagNameOrSlug: req.validated.params.tag });
    if (!result.removed) throw new HttpError(404, 'Not Found');
    defaultSearchService.invalidate();
    res.json({ tags: result.tags, myUserTags: result.myUserTags });
  }));

  router.post('/articles/:slug/reports', ...reportGuard, validate({ params: slugParams, body: reportBody }), h(async (req, res) => {
    await repo.insertReport({ reporterId: req.user.id, documentId: await article(req), reason: req.validated.body.reason });
    res.status(201).end();
  }));

  router.post('/comments/:id/reports', ...reportGuard, validate({ params: idParams, body: reportBody }), h(async (req, res) => {
    const commentId = await repo.findReportableCommentId(req.validated.params.id);
    if (commentId == null) throw new HttpError(404, 'Not Found');
    await repo.insertReport({ reporterId: req.user.id, commentId, reason: req.validated.body.reason });
    res.status(201).end();
  }));

  // Staff moderation. Server-side RBAC is the real gate.
  const staff = [readLimit, authenticate, requireRole('admin', 'editor', 'moderator')];
  router.patch('/admin/comments/:id', ...staff, validate({ params: idParams, body: moderateBody }), h(async (req, res) => {
    const row = await repo.setCommentStatus(req.validated.params.id, req.validated.body.status);
    if (!row) throw new HttpError(404, 'Not Found');
    await audit({ actorId: req.user.id, action: `comment.${req.validated.body.status}`, entityType: 'comment', entityId: req.validated.params.id }).catch(() => {});
    res.json(toCommentPayload(row));
  }));

  router.delete('/admin/comments/:id', readLimit, authenticate, requireRole('admin', 'moderator'), validate({ params: idParams }), h(async (req, res) => {
    if (!(await repo.deleteComment(req.validated.params.id))) throw new HttpError(404, 'Not Found');
    await audit({ actorId: req.user.id, action: 'comment.delete', entityType: 'comment', entityId: req.validated.params.id }).catch(() => {});
    res.status(204).end();
  }));

  return router;
}
