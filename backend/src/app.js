import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { healthRouter } from './modules/health/routes.js';
import { errorHandler, notFound } from './http/errors.js';
import { requireJson } from './http/validate.js';

/** cfg: { corsOrigin, trustProxy }. Routers needing the DB import their own repo. */
export function createApp(cfg = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy ?? false);
  app.use(helmet());
  app.use(cors({ origin: cfg.corsOrigin ?? 'http://localhost:5173', credentials: true }));
  app.use('/api', requireJson);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
