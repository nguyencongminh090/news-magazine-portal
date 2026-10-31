import { HttpError } from '../../http/errors.js';
import { verifyAccessClaims } from './tokens.js';

const challenge = { 'WWW-Authenticate': 'Bearer' };

/**
 * ADR-003 #8: a token minted before the last password change is dead. iat has 1 s resolution, so compare against the
 * change time floored to seconds; otherwise the fresh session issued right after the change would be rejected.
 */
const issuedBeforePasswordChange = (iat, changedAt) =>
  changedAt != null && iat < Math.floor(new Date(changedAt).getTime() / 1000);

/** Bearer JWT -> user row from the DB on every request (roles + is_active are never trusted from the token). Sets req.user. */
export function requireAuth({ repo, jwt }) {
  return async (req, _res, next) => {
    try {
      const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
      const claims = m && (await verifyAccessClaims(m[1], jwt));
      const user = claims && (await repo.findUserById(claims.sub));
      if (!user || !user.is_active || issuedBeforePasswordChange(claims.iat, user.password_changed_at)) throw new HttpError(401, 'Unauthorized', { headers: challenge });
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
