import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter, limits as defaultLimits } from '../../http/rateLimit.js';
import { pagination, validate } from '../../http/validate.js';
import { requireAuth, requireRole, requireVerified } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import { toCommentPayload, toEngagementSummary } from './summary.js';
import * as defaultRepo from './repo.js';

const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(200);
const slugParams = z.object({ slug: SLUG }).strict();
const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const text = (max) => z.string().trim().min(1).max(max);
const commentBody = z.object({ body: text(2000) }).strict();
const ratingBody = z.object({ score: z.number().int().min(1).max(5) }).strict();
const reportBody = z.object({ reason: text(1000) }).strict();
const moderateBody = z.object({ status: z.enum(['visible', 'hidden']) }).strict();

/**
 * Comments / ratings / reports under /api (mounted once):
 *   public read · verified-email users write · staff (admin, editor) hide, admin deletes.
 * Bearer auth, no cookie -> not CSRF-prone. Write order: auth -> verified -> per-user limiter -> validate.
 */
export function engagementRouter({
  repo = defaultRepo, auth = authRepo, jwt, limits = defaultLimits,
  readLimit = limiter({ windowMs: 60_000, limit: 120 }),
} = {}) {
  const router = Router();
  const authenticate = requireAuth({ repo: auth, jwt });
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
  const staff = [readLimit, authenticate, requireRole('admin', 'editor')];
  router.patch('/admin/comments/:id', ...staff, validate({ params: idParams, body: moderateBody }), h(async (req, res) => {
    const row = await repo.setCommentStatus(req.validated.params.id, req.validated.body.status);
    if (!row) throw new HttpError(404, 'Not Found');
    res.json(toCommentPayload(row));
  }));

  router.delete('/admin/comments/:id', readLimit, authenticate, requireRole('admin'), validate({ params: idParams }), h(async (req, res) => {
    if (!(await repo.deleteComment(req.validated.params.id))) throw new HttpError(404, 'Not Found');
    res.status(204).end();
  }));

  return router;
}
