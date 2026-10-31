import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { healthRouter } from './modules/health/routes.js';
import { errorHandler, notFound } from './http/errors.js';
import { articleShellRouter } from './modules/articles/shellRoute.js';
import { articlesRouter } from './modules/articles/routes.js';
import { categoriesRouter } from './modules/categories/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { createMailer } from './mail/mailer.js';
import { usersRouter } from './modules/users/routes.js';
import { adminArticlesRouter } from './modules/adminArticles/routes.js';
import { engagementRouter } from './modules/engagement/routes.js';
import { requireJson } from './http/validate.js';

/** cfg: { corsOrigin, trustProxy, isProd, publicBaseUrl, frontendDist, shell?, articles?, categories? }. Routers needing the DB import their own repo. */
export function createApp(cfg = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy ?? false);
  app.use(helmet());
  app.use(cors({ origin: cfg.corsOrigin ?? 'http://localhost:5173', credentials: true }));
  app.use('/api', requireJson);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/articles', articlesRouter({ jwt: cfg.jwt?.secret ? cfg.jwt : undefined, auth: cfg.auth?.repo, ...cfg.articles }));
  app.use('/api/categories', categoriesRouter(cfg.categories));
  // Auth needs a signing key; bare createApp() (health/articles tests) simply has no auth routes.
  if (cfg.jwt?.secret) {
    const origins = [cfg.corsOrigin ?? 'http://localhost:5173', cfg.publicBaseUrl].filter(Boolean);
    app.use('/api/auth', authRouter({
      jwt: cfg.jwt, refreshTtlDays: cfg.refreshTokenTtlDays, refreshGraceSeconds: cfg.refreshReuseGraceSeconds,
      cookieSecure: cfg.cookieSecure, allowedOrigins: origins,
      // Links in emails point at the SPA: the public origin in prod, the Vite origin in dev.
      appBaseUrl: cfg.publicBaseUrl ?? origins[0], mailer: createMailer(cfg.mail), ...cfg.auth,
    }));
    app.use('/api/users', usersRouter({ jwt: cfg.jwt, repo: cfg.auth?.repo }));
    app.use('/api', engagementRouter({ jwt: cfg.jwt, auth: cfg.auth?.repo, ...cfg.engagement }));
    app.use('/api/admin/articles', adminArticlesRouter({ jwt: cfg.jwt, auth: cfg.auth?.repo, ...cfg.adminArticles }));
  }

  app.use('/api', notFound);

  // Production only: dev serves the shell from Vite. `cfg.shell` lets tests inject the HTML.
  const shell = cfg.shell ?? (cfg.isProd ? readFileSync(join(cfg.frontendDist, 'index.html'), 'utf8') : null);
  if (shell) app.use(articleShellRouter({ shell, baseUrl: cfg.publicBaseUrl }));

  app.use(errorHandler);
  return app;
}
