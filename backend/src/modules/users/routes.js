import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { validate } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as defaultRepo from '../auth/repo.js';
import { recordAudit } from '../audit/repo.js';
import * as defaultProfileRepo from './repo.js';

export const ROLES = ['admin', 'editor', 'moderator', 'seo', 'reader'];
const params = z.object({ id: z.coerce.number().int().positive() }).strict();
const body = z.object({ roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length) }).strict();
const httpsUrl = z.string().trim().url().max(500).refine((u) => /^https:\/\/\S+$/.test(u), 'Must be an https:// URL');
const profileBody = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  bio: z.string().trim().max(500).optional(),
  avatarUrl: z.union([httpsUrl, z.literal(''), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional().transform((t) => (t ? [...new Set(t)] : undefined)),
}).strict();

/** /api/users: profile self-service (/me) and admin role assignment (/:id/roles). */
export function usersRouter({ repo = defaultRepo, profileRepo = defaultProfileRepo, jwt, audit = recordAudit } = {}) {
  const router = Router();
  const authenticate = requireAuth({ repo, jwt });

  router.get('/me', authenticate, async (req, res, next) => {
    try {
      const profile = await profileRepo.getProfile(req.user.id);
      if (!profile) throw new HttpError(404, 'Not Found');
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/me', authenticate, validate({ body: profileBody }), async (req, res, next) => {
    try {
      const profile = await profileRepo.updateProfile(req.user.id, req.validated.body);
      if (!profile) throw new HttpError(404, 'Not Found');
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id/roles', authenticate, requireRole('admin'), validate({ params, body }), async (req, res, next) => {
    try {
      const { id } = req.validated.params;
      const roles = [...new Set(req.validated.body.roles)];
      if (id === Number(req.user.id) && !roles.includes('admin')) {
        throw new HttpError(409, 'Conflict', { detail: 'You cannot remove your own admin role' });
      }
      if (!(await repo.setRoles(id, roles))) throw new HttpError(404, 'Not Found');
      await audit({
        actorId: req.user.id,
        action: 'user.roles.update',
        entityType: 'user',
        entityId: id,
        details: { roles: [...roles].sort() },
      }).catch(() => {});
      res.json({ id, roles: roles.sort() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
