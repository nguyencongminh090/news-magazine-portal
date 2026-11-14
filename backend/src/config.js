import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MAIL_TRANSPORTS } from './mail/mailer.js';

// Load the repo-root .env when present (--env-file would make --watch crash on a missing file).
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const ENVS = ['development', 'test', 'production'];
// ADR-002 §6 (A16): a replay this soon after rotation is treated as a lost response, not theft.
const DEFAULT_REFRESH_GRACE_SECONDS = 30;
const MAX_REFRESH_GRACE_SECONDS = 300;

/** Parse + validate env. Throws one aggregated Error listing every problem (fail fast at boot). */
export function loadConfig(env = process.env) {
  const problems = [];
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!ENVS.includes(nodeEnv)) problems.push(`NODE_ENV must be one of ${ENVS.join('|')}`);
  const isProd = nodeEnv === 'production';

  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) problems.push('PORT must be an integer 0-65535');

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) problems.push('DATABASE_URL is required');

  const jwtSecret = env.JWT_SECRET ?? '';
  if ((isProd || jwtSecret) && jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 chars (required in production)');
  }

  const cookieSecure = env.COOKIE_SECURE === undefined ? isProd : env.COOKIE_SECURE === 'true';
  if (isProd && !cookieSecure) problems.push('COOKIE_SECURE must be true in production');

  let trustProxy = false; // set only when behind a reverse proxy: hop count or true
  if (env.TRUST_PROXY !== undefined) trustProxy = /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY === 'true';

  // `PUBLIC_BASE_URL=` (empty, as in .env.example) means unset: '' would defeat `??` fallbacks downstream.
  let publicBaseUrl = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') || undefined;
  if (publicBaseUrl) {
    try {
      const u = new URL(publicBaseUrl);
      if (!/^https?:$/.test(u.protocol) || u.pathname !== '/' || u.search || u.hash) throw new Error('bad');
      publicBaseUrl = u.origin;
    } catch {
      problems.push('PUBLIC_BASE_URL must be an absolute http(s) origin, e.g. https://news.example.com');
    }
  } else if (isProd) {
    problems.push('PUBLIC_BASE_URL is required in production (canonical + og:url)');
  }

  const adminEmail = env.ADMIN_EMAIL?.trim();
  const adminPassword = env.ADMIN_PASSWORD;
  if (Boolean(adminEmail) !== Boolean(adminPassword)) problems.push('ADMIN_EMAIL and ADMIN_PASSWORD must be set together');

  const refreshReuseGraceSeconds = Number(env.REFRESH_REUSE_GRACE_SECONDS ?? DEFAULT_REFRESH_GRACE_SECONDS);
  if (!Number.isInteger(refreshReuseGraceSeconds) || refreshReuseGraceSeconds < 0 || refreshReuseGraceSeconds > MAX_REFRESH_GRACE_SECONDS) {
    problems.push(`REFRESH_REUSE_GRACE_SECONDS must be an integer 0-${MAX_REFRESH_GRACE_SECONDS}`);
  }

  // ADR-003 #1: production must really send mail; the log transport would print reset links to stdout.
  const mailTransport = env.MAIL_TRANSPORT ?? (isProd ? undefined : 'log');
  if (!MAIL_TRANSPORTS.includes(mailTransport)) problems.push(`MAIL_TRANSPORT must be one of ${MAIL_TRANSPORTS.join('|')} (required in production)`);
  else if (isProd && mailTransport !== 'smtp') problems.push('MAIL_TRANSPORT must be smtp in production');
  if (mailTransport === 'smtp' && !/^smtps?:\/\//.test(env.SMTP_URL ?? '')) problems.push('SMTP_URL must be an smtp:// or smtps:// URL when MAIL_TRANSPORT=smtp');
  if (mailTransport === 'smtp' && !env.MAIL_FROM?.trim()) problems.push('MAIL_FROM is required when MAIL_TRANSPORT=smtp');

  if (problems.length) throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);

  return {
    nodeEnv,
    isProd,
    port,
    publicBaseUrl,
    frontendDist: env.FRONTEND_DIST ?? fileURLToPath(new URL('../../frontend/dist', import.meta.url)),
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    trustProxy,
    jwt: {
      // Dev/test without a secret: ephemeral key (tokens die on restart). Production requires JWT_SECRET (checked above).
      secret: jwtSecret || randomBytes(48).toString('hex'),
      issuer: env.JWT_ISSUER ?? 'news-portal',
      audience: env.JWT_AUDIENCE ?? 'news-portal-web',
      accessTtl: env.JWT_ACCESS_TTL ?? '15m',
    },
    bootstrapAdmin: adminEmail ? { email: adminEmail, password: adminPassword } : null,
    refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 14),
    refreshReuseGraceSeconds,
    cookieSecure,
    mail: { transport: mailTransport, smtpUrl: env.SMTP_URL, from: env.MAIL_FROM?.trim() || undefined },
    db: {
      max: Number(env.DB_POOL_MAX ?? 10),
      connectionTimeoutMillis: Number(env.DB_CONNECT_TIMEOUT_MS ?? 5000),
      idleTimeoutMillis: Number(env.DB_IDLE_TIMEOUT_MS ?? 30000),
      statementTimeoutMs: Number(env.DB_STATEMENT_TIMEOUT_MS ?? 10000),
    },
    databaseUrl: () => databaseUrl,
  };
}

// Back-compat for the migration CLI (backend/db/migrate.js), which only needs the URL.
// The server itself uses loadConfig() eagerly in index.js.
export const config = {
  databaseUrl: () => {
    if (!process.env.DATABASE_URL) throw new Error('Missing required env var DATABASE_URL');
    return process.env.DATABASE_URL;
  },
};
