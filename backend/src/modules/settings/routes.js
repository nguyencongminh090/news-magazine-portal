import { Router } from 'express';
import { limiter } from '../../http/rateLimit.js';
import { getPublicSettings } from './repo.js';

/** GET /api/settings — public read-only site configuration. */
export function settingsRouter({
  getSettings = getPublicSettings,
  readLimit = limiter({ windowMs: 60_000, limit: 120 }),
} = {}) {
  const router = Router();
  router.use(readLimit);
  router.get('/', async (_req, res, next) => {
    try {
      res.json({ settings: await getSettings() });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
