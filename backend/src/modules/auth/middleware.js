import { HttpError } from '../../http/errors.js';
import { verifyAccess } from './tokens.js';

const challenge = { 'WWW-Authenticate': 'Bearer' };

/** Bearer JWT -> user row from the DB on every request (roles + is_active are never trusted from the token). Sets req.user. */
export function requireAuth({ repo, jwt }) {
  return async (req, _res, next) => {
    try {
      const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
      const userId = m && (await verifyAccess(m[1], jwt));
      const user = userId && (await repo.findUserById(userId));
      if (!user || !user.is_active) throw new HttpError(401, 'Unauthorized', { headers: challenge });
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Run after requireAuth: 403 unless the user holds at least one of the roles. UI hints never replace this. */
export const requireRole = (...roles) => (req, _res, next) =>
  next(req.user?.roles.some((r) => roles.includes(r)) ? undefined : new HttpError(403, 'Forbidden'));
