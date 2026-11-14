import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { pagination, validate } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import { recordAudit } from '../audit/repo.js';
import * as defaultRepo from './repo.js';

const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const reportsQuery = pagination.extend({ status: z.enum(['open', 'resolved', 'dismissed']).optional() });
const resolveBody = z.object({
  status: z.enum(['resolved', 'dismissed']),
  hideTarget: z.boolean().optional(),
}).strict();
const commentsQuery = pagination.extend({
  status: z.enum(['visible', 'hidden']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
const spamBody = z.object({ action: z.enum(['hide_comments', 'suspend']) }).strict();

const toReportPayload = (r) => ({
  id: Number(r.id),
  reason: r.reason,
  status: r.status,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
  reporter: r.reporter_name ? { displayName: r.reporter_name, email: r.reporter_email } : null,
  resolver: r.resolver_name ? { displayName: r.resolver_name } : null,
  targetType: r.comment_id ? 'comment' : 'article',
  article: r.document_id
    ? { id: Number(r.document_id), slug: r.article_slug, title: r.article_title, status: r.article_status }
    : r.comment_article_slug
      ? { slug: r.comment_article_slug, title: r.comment_article_title }
      : null,
  comment: r.comment_id
    ? {
        id: Number(r.comment_id),
        body: r.comment_body,
        status: r.comment_status,
        authorId: r.comment_author_id ? Number(r.comment_author_id) : null,
        authorName: r.comment_author_name,
      }
    : null,
});

const toModCommentPayload = (r) => ({
  id: Number(r.id),
  body: r.body,
  status: r.status,
  createdAt: r.created_at,
  openReports: Number(r.open_reports ?? 0),
  author: r.user_id ? { id: Number(r.user_id), displayName: r.author_name, email: r.author_email, isActive: Boolean(r.author_active) } : null,
  article: { id: Number(r.document_id), slug: r.article_slug, title: r.article_title },
});

/** Moderator & Super Admin APIs: reports queue, comments moderation, spam control. */
export function adminModerationRouter({
  repo = defaultRepo, auth = authRepo, jwt, limit = limiter({ windowMs: 60_000, limit: 120 }), audit = recordAudit,
} = {}) {
  const router = Router();
  router.use(limit, requireAuth({ repo: auth, jwt }), requireRole('admin', 'moderator'));

  router.get('/reports', validate({ query: reportsQuery }), async (req, res, next) => {
    try {
      const { page, pageSize } = req.validated.query;
      const { rows, total } = await repo.listReports(req.validated.query);
      res.json({ items: rows.map(toReportPayload), page, pageSize, total });
    } catch (err) { next(err); }
  });

  router.patch('/reports/:id', validate({ params: idParams, body: resolveBody }), async (req, res, next) => {
    try {
      const report = await repo.resolveReport(req.validated.params.id, { ...req.validated.body, resolvedBy: req.user.id });
      if (!report) throw new HttpError(404, 'Not Found');
      await audit({
        actorId: req.user.id,
        action: `report.${req.validated.body.status}`,
        entityType: 'report',
        entityId: report.id,
        details: { hideTarget: Boolean(req.validated.body.hideTarget) },
      }).catch(() => {});
      res.json({ id: Number(report.id), status: report.status, resolvedAt: report.resolved_at });
    } catch (err) { next(err); }
  });

  router.get('/comments', validate({ query: commentsQuery }), async (req, res, next) => {
    try {
      const { page, pageSize } = req.validated.query;
      const { rows, total } = await repo.listComments(req.validated.query);
      res.json({ items: rows.map(toModCommentPayload), page, pageSize, total });
    } catch (err) { next(err); }
  });

  router.post('/users/:id/spam-action', validate({ params: idParams, body: spamBody }), async (req, res, next) => {
    try {
      const result = await repo.spamAction(req.validated.params.id, req.validated.body.action);
      if (!result) throw new HttpError(404, 'Not Found');
      await audit({
        actorId: req.user.id,
        action: `moderation.${req.validated.body.action}`,
        entityType: 'user',
        entityId: result.userId,
        details: { hiddenComments: result.hiddenComments, suspended: result.suspended },
      }).catch(() => {});
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}
