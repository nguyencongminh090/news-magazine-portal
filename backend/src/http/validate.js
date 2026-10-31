import { z } from 'zod';
import { HttpError } from './errors.js';

export const MAX_PAGE_SIZE = 50;

/** Reusable pagination schema: page size capped at MAX_PAGE_SIZE. */
export const pagination = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  })
  .strict();

/** 415 unless a request that carries a body is JSON. */
export function requireJson(req, _res, next) {
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'];
  if (hasBody && !req.is('application/json')) {
    return next(new HttpError(415, 'Unsupported Media Type', { detail: 'Content-Type must be application/json' }));
  }
  next();
}

/**
 * validate({ params, query, body }) with zod schemas. Use .strict() object schemas so unknown
 * fields (mass assignment, e.g. role/isAdmin) are rejected rather than silently dropped.
 * Parsed values land in req.validated.{params,query,body}.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const errors = [];
    req.validated = {};
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const r = schemas[part].safeParse(req[part] ?? {});
      if (r.success) req.validated[part] = r.data;
      else for (const i of r.error.issues) errors.push({ in: part, path: i.path.join('.'), message: i.message });
    }
    if (errors.length) return next(new HttpError(422, 'Validation failed', { errors }));
    next();
  };
}
