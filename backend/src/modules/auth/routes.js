import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { limiter } from '../../http/rateLimit.js';
import { validate } from '../../http/validate.js';
import { requireAuth } from './middleware.js';
import { passwordSchema } from './password.js';
import * as defaultRepo from './repo.js';
import { createAuthService, toUserPayload } from './service.js';

const COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/auth';

const email = z.string().trim().toLowerCase().email().max(254);
const registerBody = z.object({ email, displayName: z.string().trim().min(1).max(100), password: passwordSchema }).strict();
// Login must not leak policy: any non-empty string is accepted here and checked against the hash.
const loginBody = z.object({ email, password: z.string().min(1).max(128) }).strict();

const readCookie = (req, name) => {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
};

const ip = (req) => ipKeyGenerator(req.ip ?? '');
/** Same normalisation as the schema (trim + lower-case), so case/whitespace variants share one bucket. */
export const loginKey = (req) => `${ip(req)}|${String(req.body?.email ?? '').trim().toLowerCase()}`;
const defaultLimits = () => ({
  // Two buckets: per IP+account (slows guessing one account) and per IP alone (caps spraying many accounts).
  // No IP-less per-account bucket: it would let anyone lock a victim out (DoS lever).
  login: [limiter({ windowMs: 15 * 60_000, limit: 10, keyGenerator: loginKey }), limiter({ windowMs: 15 * 60_000, limit: 40 })],
  register: limiter({ windowMs: 60 * 60_000, limit: 5 }),
  refresh: limiter({ windowMs: 60_000, limit: 60 }),
});

/**
 * CSRF guard for the cookie-authenticated endpoints (refresh/logout): SameSite=Strict cookie is the first layer;
 * here a custom header (forces a CORS preflight cross-site) plus an Origin allow-list.
 */
function csrfGuard(allowedOrigins) {
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (req.headers['x-requested-with'] !== 'fetch' || (origin && !allowedOrigins.includes(origin))) {
      return next(new HttpError(403, 'Forbidden', { detail: 'Cross-site request rejected' }));
    }
    next();
  };
}

/** POST /api/auth/{register,login,refresh,logout}, GET /api/auth/me */
export function authRouter({
  repo = defaultRepo, jwt, refreshTtlDays = 14, refreshGraceSeconds = 0, cookieSecure = false, allowedOrigins = [],
  limits = defaultLimits(),
} = {}) {
  const router = Router();
  const service = createAuthService({ repo, jwt, refreshTtlDays, refreshGraceSeconds });
  const csrf = csrfGuard(allowedOrigins);
  const cookieOpts = { httpOnly: true, secure: cookieSecure, sameSite: 'strict', path: COOKIE_PATH };

  const sendSession = (res, status, s) => {
    res.cookie(COOKIE, s.refreshToken, { ...cookieOpts, maxAge: refreshTtlDays * 86_400_000 });
    res.set('Cache-Control', 'no-store').status(status).json({ accessToken: s.accessToken, user: s.user });
  };
  const wrap = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };

  router.post('/register', limits.register, validate({ body: registerBody }),
    wrap(async (req, res) => sendSession(res, 201, await service.register(req.validated.body))));

  router.post('/login', limits.login, validate({ body: loginBody }),
    wrap(async (req, res) => sendSession(res, 200, await service.login(req.validated.body))));

  router.post('/refresh', limits.refresh, csrf, wrap(async (req, res) => {
    try {
      sendSession(res, 200, await service.refresh(readCookie(req, COOKIE)));
    } catch (err) {
      res.clearCookie(COOKIE, cookieOpts); // a dead cookie must not be retried forever
      throw err;
    }
  }));

  router.post('/logout', limits.refresh, csrf, wrap(async (req, res) => {
    await service.logout(readCookie(req, COOKIE));
    res.clearCookie(COOKIE, cookieOpts);
    res.set('Cache-Control', 'no-store').status(204).end();
  }));

  router.get('/me', requireAuth({ repo, jwt }), (req, res) => {
    res.set('Cache-Control', 'no-store').json({ user: toUserPayload(req.user) });
  });

  return router;
}
