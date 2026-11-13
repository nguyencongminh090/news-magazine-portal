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
import { tagsRouter } from './modules/tags/routes.js';
import { settingsRouter } from './modules/settings/routes.js';
import { searchClicksRouter } from './modules/searchClicks/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { createMailer } from './mail/mailer.js';
import { usersRouter } from './modules/users/routes.js';
import { adminArticlesRouter } from './modules/adminArticles/routes.js';
import { adminSystemRouter } from './modules/adminSystem/routes.js';
import { adminTaxonomyRouter } from './modules/adminTaxonomy/routes.js';
import { adminModerationRouter } from './modules/adminModeration/routes.js';
import { adminSeoRouter } from './modules/adminSeo/routes.js';
import { engagementRouter } from './modules/engagement/routes.js';
import { searchEngineRouter } from './modules/searchEngine/routes.js';
import { feedsAndSeoRouter } from './modules/searchEngine/feedsAndSeo.js';
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

  const jwtCfg = cfg.jwt?.secret ? cfg.jwt : undefined;
  const getSettings = cfg.settings?.getSettings;
  app.use('/api/health', healthRouter);
  app.use('/api/settings', settingsRouter(cfg.settings));
  app.use('/api/articles', articlesRouter({ jwt: jwtCfg, auth: cfg.auth?.repo, ...(getSettings && { getSettings }), ...cfg.articles }));
  app.use('/api/categories', categoriesRouter(cfg.categories));
  app.use('/api/tags', tagsRouter(cfg.tags));
  app.use('/api/search-clicks', searchClicksRouter({ jwt: jwtCfg, auth: cfg.auth?.repo, ...cfg.searchClicks }));
  app.use('/api', searchEngineRouter({ jwt: jwtCfg, auth: cfg.auth?.repo, ...cfg.searchEngine }));
  app.use(feedsAndSeoRouter({ baseUrl: cfg.publicBaseUrl ?? cfg.corsOrigin ?? 'http://localhost:5173', ...cfg.feeds }));

  // Auth needs a signing key; bare createApp() (health/articles tests) simply has no auth routes.
  if (jwtCfg) {
    const origins = [cfg.corsOrigin ?? 'http://localhost:5173', cfg.publicBaseUrl].filter(Boolean);
    app.use('/api/auth', authRouter({
      jwt: cfg.jwt, refreshTtlDays: cfg.refreshTokenTtlDays, refreshGraceSeconds: cfg.refreshReuseGraceSeconds,
      cookieSecure: cfg.cookieSecure, allowedOrigins: origins,
      // Links in emails point at the SPA: the public origin in prod, the Vite origin in dev.
      appBaseUrl: cfg.publicBaseUrl ?? origins[0], mailer: createMailer(cfg.mail), ...(getSettings && { getSettings }), ...cfg.auth,
    }));
    app.use('/api/users', usersRouter({ jwt: cfg.jwt, repo: cfg.auth?.repo, ...cfg.users }));
    app.use('/api', engagementRouter({ jwt: cfg.jwt, auth: cfg.auth?.repo, ...(getSettings && { getSettings }), ...cfg.engagement }));
    app.use('/api/admin/articles', adminArticlesRouter({ jwt: cfg.jwt, auth: cfg.auth?.repo, ...cfg.adminArticles }));
    app.use('/api/admin/taxonomy', adminTaxonomyRouter({ jwt: cfg.jwt, auth: cfg.auth?.repo, ...cfg.adminTaxonomy }));
    app.use('/api/admin/moderation', adminModerationRouter({ jwt: cfg.jwt, auth: cfg.auth?.repo, ...cfg.adminModeration }));
    app.use('/api/admin', adminSystemRouter({ jwt: cfg.jwt, auth: cfg.auth?.repo, ...cfg.adminSystem }));
    app.use('/api/admin', adminSeoRouter({ jwt: cfg.jwt, auth: cfg.auth?.repo, ...cfg.adminSeo }));
  }

  app.use('/api', notFound);

  // Production only: dev serves the shell from Vite. `cfg.shell` lets tests inject the HTML.
  const shell = cfg.shell ?? (cfg.isProd ? readFileSync(join(cfg.frontendDist, 'index.html'), 'utf8') : null);
  if (shell) app.use(articleShellRouter({ shell, baseUrl: cfg.publicBaseUrl }));

  app.use(errorHandler);
  return app;
}
