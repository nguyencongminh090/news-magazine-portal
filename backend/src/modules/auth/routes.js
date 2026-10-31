import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../../http/errors.js';
import { createMailer } from '../../mail/mailer.js';
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
const resetRequestBody = z.object({ email }).strict();
const resetConfirmBody = z.object({ token: z.string().min(1).max(200), newPassword: passwordSchema }).strict();
const verifyConfirmBody = z.object({ token: z.string().min(1).max(200) }).strict();
const changePasswordBody =z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict();

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
  // Runs after requireAuth: per user, so a stolen access token cannot brute-force the current password.
  // Same IP+account / IP-only pair as login (loginKey normalises req.body.email): caps mail-bombing one inbox and spraying.
  resetRequest: [limiter({ windowMs: 60 * 60_000, limit: 3, keyGenerator: loginKey }), limiter({ windowMs: 60 * 60_000, limit: 10 })],
  resetConfirm: limiter({ windowMs: 15 * 60_000, limit: 10 }),
  changePassword: limiter({ windowMs: 15 * 60_000, limit: 5, keyGenerator: (req) => `user:${req.user.id}` }),
  // Also after requireAuth: caps mail to one's own inbox; per user, so a shared IP does not lock others out.
  verifyRequest: limiter({ windowMs: 60 * 60_000, limit: 3, keyGenerator: (req) => `user:${req.user.id}` }),
  verifyConfirm: limiter({ windowMs: 15 * 60_000, limit: 10 }),
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

/** Fire-and-forget work after the response. Logs only the error class: SMTP errors can carry addresses. */
const logBackgroundFailure = (p) => {
  p.catch((err) => console.error(`auth background task failed: ${err?.code ?? err?.name ?? 'Error'}`));
};

/**
 * POST /api/auth/{register,login,refresh,logout,change-password,password-reset/request,password-reset/confirm,
 * email-verification/request,email-verification/confirm}, GET /api/auth/me
 */
export function authRouter({
  repo = defaultRepo, jwt, refreshTtlDays = 14, refreshGraceSeconds = 0, cookieSecure = false, allowedOrigins = [],
  limits = defaultLimits(), mailer = createMailer(), appBaseUrl = allowedOrigins[0], background = logBackgroundFailure,
} = {}) {
  const router = Router();
  const service = createAuthService({ repo, jwt, refreshTtlDays, refreshGraceSeconds, mailer, appBaseUrl });
  const csrf = csrfGuard(allowedOrigins);
  const authenticated = requireAuth({ repo, jwt });
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

  // Bearer-authenticated (no cookie), so not CSRF-prone; limiter before validate so every attempt counts.
  router.post('/change-password', authenticated, limits.changePassword, validate({ body: changePasswordBody }),
    wrap(async (req, res) => sendSession(res, 200, await service.changePassword(req.user, req.validated.body))));

  // ADR-003 #5-6: answer first, then look up + mail, so the response never depends on whether the account exists.
  router.post('/password-reset/request', limits.resetRequest, validate({ body: resetRequestBody }), (req, res) => {
    res.set('Cache-Control', 'no-store').status(202).json({ status: 'accepted' });
    background(service.requestPasswordReset(req.validated.body.email));
  });

  // Token in the JSON body, no cookie: not CSRF-prone.
  router.post('/password-reset/confirm', limits.resetConfirm, validate({ body: resetConfirmBody }), wrap(async (req, res) => {
    await service.confirmPasswordReset(req.validated.body);
    res.set('Cache-Control', 'no-store').status(204).end();
  }));

  // Bearer (no cookie): the address on the account; mail goes out after the 202 like the reset request.
  router.post('/email-verification/request', authenticated, limits.verifyRequest, (req, res) => {
    res.set('Cache-Control', 'no-store').status(202).json({ status: 'accepted' });
    background(service.requestEmailVerification(req.user));
  });

  // No auth: the link may be opened on another device. Token in the JSON body, no cookie: not CSRF-prone.
  router.post('/email-verification/confirm', limits.verifyConfirm, validate({ body: verifyConfirmBody }), wrap(async (req, res) => {
    await service.confirmEmailVerification(req.validated.body);
    res.set('Cache-Control', 'no-store').status(204).end();
  }));

  router.get('/me', authenticated,(req, res) => {
    res.set('Cache-Control', 'no-store').json({ user: toUserPayload(req.user) });
  });

  return router;
}
