import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { validate } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as defaultRepo from '../auth/repo.js';

export const ROLES = ['admin', 'editor', 'seo', 'reader'];
const params = z.object({ id: z.coerce.number().int().positive() }).strict();
const body = z.object({ roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length) }).strict();

/** PUT /api/users/:id/roles — admin only; replaces the role set and revokes the user's refresh tokens. */
export function usersRouter({ repo = defaultRepo, jwt } = {}) {
  const router = Router();
  router.put('/:id/roles', requireAuth({ repo, jwt }), requireRole('admin'), validate({ params, body }), async (req, res, next) => {
    try {
      const { id } = req.validated.params;
      const roles = [...new Set(req.validated.body.roles)];
      if (id === Number(req.user.id) && !roles.includes('admin')) {
        throw new HttpError(409, 'Conflict', { detail: 'You cannot remove your own admin role' });
      }
      if (!(await repo.setRoles(id, roles))) throw new HttpError(404, 'Not Found');
      res.json({ id, roles: roles.sort() });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
