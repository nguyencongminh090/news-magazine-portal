import { rateLimit } from 'express-rate-limit';
import { HttpError } from './errors.js';

/** Build a per-IP limiter; 429 is rendered as problem+json with Retry-After. */
export function limiter({ windowMs, limit, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(keyGenerator && { keyGenerator }),
    handler: (_req, _res, next, opts) => {
      const retry = String(Math.ceil(opts.windowMs / 1000));
      next(new HttpError(429, 'Too Many Requests', { headers: { 'Retry-After': retry } }));
    },
  });
}

// Budgets for abuse-prone endpoints; each module applies the one it needs on its route.
export const limits = {
  login: () => limiter({ windowMs: 15 * 60_000, limit: 10 }),
  refresh: () => limiter({ windowMs: 15 * 60_000, limit: 30 }),
  // opts.keyGenerator lets signed-in write routes budget per user instead of per IP.
  comment: (opts) => limiter({ windowMs: 60_000, limit: 10, ...opts }),
  rating: (opts) => limiter({ windowMs: 60_000, limit: 20, ...opts }),
  report: (opts) => limiter({ windowMs: 60_000, limit: 5, ...opts }),
};
