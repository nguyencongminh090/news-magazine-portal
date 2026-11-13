import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { pagination, validate } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as authRepo from '../auth/repo.js';
import { recordAudit } from '../audit/repo.js';
import { ROLES } from '../users/routes.js';
import * as defaultRepo from './repo.js';

const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const usersQuery = pagination.extend({
  q: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
});
const statusBody = z.object({ isActive: z.boolean() }).strict();
const logsQuery = pagination.extend({
  action: z.string().trim().min(1).max(100).optional(),
  entityType: z.string().trim().min(1).max(50).optional(),
});
const settingsBody = z.object({
  site_name: z.string().trim().min(1).max(100).optional(),
  site_tagline: z.string().trim().max(300).optional(),
  allow_registration: z.boolean().optional(),
  allow_comments: z.boolean().optional(),
  articles_per_page: z.number().int().min(5).max(50).optional(),
  maintenance_mode: z.boolean().optional(),
}).strict();

const toUserRow = (r) => ({
  id: Number(r.id),
  email: r.email,
  displayName: r.display_name,
  isActive: Boolean(r.is_active),
  emailVerified: r.email_verified_at != null,
  roles: r.roles ?? [],
  createdAt: r.created_at,
});

const toLogRow = (r) => ({
  id: Number(r.id),
  actor: r.actor_id ? { id: Number(r.actor_id), displayName: r.actor_name, email: r.actor_email } : null,
  action: r.action,
  entityType: r.entity_type,
  entityId: r.entity_id,
  details: r.details ?? null,
  createdAt: r.created_at,
});

/** Super Admin APIs: user accounts, system audit logs, global settings. */
export function adminSystemRouter({
  repo = defaultRepo, auth = authRepo, jwt, limit = limiter({ windowMs: 60_000, limit: 120 }), audit = recordAudit,
} = {}) {
  const router = Router();
  const guard = [limit, requireAuth({ repo: auth, jwt }), requireRole('admin')];

  router.get('/users', ...guard, validate({ query: usersQuery }), async (req, res, next) => {
    try {
      const { page, pageSize } = req.validated.query;
      const { rows, total } = await repo.listUsers(req.validated.query);
      res.json({ items: rows.map(toUserRow), page, pageSize, total });
    } catch (err) { next(err); }
  });

  router.patch('/users/:id/status', ...guard, validate({ params: idParams, body: statusBody }), async (req, res, next) => {
    try {
      const { id } = req.validated.params;
      const { isActive } = req.validated.body;
      if (id === Number(req.user.id) && !isActive) {
        throw new HttpError(409, 'Conflict', { detail: 'You cannot deactivate your own account' });
      }
      const updated = await repo.setUserActive(id, isActive);
      if (!updated) throw new HttpError(404, 'Not Found');
      await audit({
        actorId: req.user.id,
        action: isActive ? 'user.activate' : 'user.deactivate',
        entityType: 'user',
        entityId: id,
      }).catch(() => {});
      res.json({ id: Number(updated.id), isActive: Boolean(updated.is_active) });
    } catch (err) { next(err); }
  });

  router.get('/logs', ...guard, validate({ query: logsQuery }), async (req, res, next) => {
    try {
      const { page, pageSize } = req.validated.query;
      const { rows, total } = await repo.listLogs(req.validated.query);
      res.json({ items: rows.map(toLogRow), page, pageSize, total });
    } catch (err) { next(err); }
  });

  router.get('/settings', ...guard, async (_req, res, next) => {
    try {
      res.json(await repo.getSettings());
    } catch (err) { next(err); }
  });

  router.put('/settings', ...guard, validate({ body: settingsBody }), async (req, res, next) => {
    try {
      const result = await repo.updateSettings(req.validated.body, req.user.id);
      await audit({
        actorId: req.user.id,
        action: 'settings.update',
        entityType: 'site_settings',
        details: { keys: Object.keys(req.validated.body) },
      }).catch(() => {});
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}
