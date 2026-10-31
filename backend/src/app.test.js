import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { z } from 'zod';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { HttpError, errorHandler, notFound, toProblem } from './http/errors.js';
import { limiter } from './http/rateLimit.js';
import { pagination, requireJson, validate } from './http/validate.js';

async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

// Test app: real middleware stack + routes exercising each layer.
function testApp() {
  const app = express();
  app.use(requireJson);
  app.use(express.json());
  const create = z.object({ title: z.string().min(1) }).strict();
  app.post('/items', validate({ body: create }), (req, res) => res.status(201).json(req.validated.body));
  app.get('/items', validate({ query: pagination }), (req, res) => res.json(req.validated.query));
  app.get('/limited', limiter({ windowMs: 60_000, limit: 2 }), (_req, res) => res.json({ ok: true }));
  app.get('/teapot', () => { throw new HttpError(418, 'Teapot'); });
  app.get('/dup', () => { throw Object.assign(new Error('secret sql'), { code: '23505' }); });
  app.get('/boom', () => { throw new Error('db password leaked'); });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('GET /api/health returns ok', async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
  });
});

test('unknown /api route returns problem+json 404', async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /application\/problem\+json/);
    assert.deepEqual(await res.json(), { type: 'about:blank', title: 'Not Found', status: 404 });
  });
});

test('error mapping: HttpError status, pg codes, unknown -> 500 without leaking', async () => {
  assert.equal(toProblem(new HttpError(403, 'Forbidden')).status, 403);
  assert.equal(toProblem({ code: '23505' }).status, 409);
  assert.equal(toProblem({ code: '23503' }).status, 409);
  assert.equal(toProblem({ code: '23514' }).status, 422);
  await withServer(testApp(), async (base) => {
    assert.equal((await fetch(`${base}/teapot`)).status, 418);
    assert.equal((await fetch(`${base}/dup`)).status, 409);
    const res = await fetch(`${base}/boom`);
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!text.includes('password') && !text.includes('secret sql'));
  });
});

test('malformed JSON -> 400 problem', async () => {
  await withServer(testApp(), async (base) => {
    const res = await fetch(`${base}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(res.status, 400);
  });
});

test('validation rejects: wrong type, missing field, mass-assignment field, page-size cap', async () => {
  await withServer(testApp(), async (base) => {
    assert.equal((await fetch(`${base}/items`, json({ title: 'ok' }))).status, 201);
    assert.equal((await fetch(`${base}/items`, json({ title: 5 }))).status, 422);
    assert.equal((await fetch(`${base}/items`, json({}))).status, 422);
    const mass = await fetch(`${base}/items`, json({ title: 'x', role: 'admin' }));
    assert.equal(mass.status, 422);
    assert.equal((await mass.json()).errors[0].in, 'body');
    assert.equal((await fetch(`${base}/items?pageSize=51`)).status, 422);
    assert.equal((await fetch(`${base}/items?pageSize=50&page=2`)).status, 200);
  });
});

test('wrong Content-Type on a body request -> 415', async () => {
  await withServer(testApp(), async (base) => {
    const res = await fetch(`${base}/items`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' });
    assert.equal(res.status, 415);
  });
});

test('rate limit: third request in window -> 429 problem with Retry-After', async () => {
  await withServer(testApp(), async (base) => {
    assert.equal((await fetch(`${base}/limited`)).status, 200);
    assert.equal((await fetch(`${base}/limited`)).status, 200);
    const res = await fetch(`${base}/limited`);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('retry-after'), '60');
    assert.match(res.headers.get('content-type'), /problem\+json/);
  });
});

test('loadConfig fails eagerly listing all problems', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), (e) =>
    /DATABASE_URL/.test(e.message) && /JWT_SECRET/.test(e.message));
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'x', JWT_SECRET: 'a'.repeat(32), COOKIE_SECURE: 'false' }),
    /COOKIE_SECURE/);
  const ok = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(32), PUBLIC_BASE_URL: 'https://news.example', MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://relay.example:587', MAIL_FROM: 'News <no-reply@n.example.com>' });
  assert.equal(ok.cookieSecure, true);
  assert.equal(ok.jwt.issuer, 'news-portal');
  assert.equal(loadConfig({ DATABASE_URL: 'x' }).nodeEnv, 'development');
  assert.equal(loadConfig({ DATABASE_URL: 'x' }).refreshReuseGraceSeconds, 30);
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', REFRESH_REUSE_GRACE_SECONDS: '1.5' }), /REFRESH_REUSE_GRACE_SECONDS/);
});

test('loadConfig mail (ADR-003): log in dev, smtp with URL + sender required in production', () => {
  const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(32), PUBLIC_BASE_URL: 'https://news.example' };
  assert.deepEqual(loadConfig({ DATABASE_URL: 'x' }).mail, { transport: 'log', smtpUrl: undefined, from: undefined });
  assert.throws(() => loadConfig(prod), /MAIL_TRANSPORT must be one of/);
  assert.throws(() => loadConfig({ ...prod, MAIL_TRANSPORT: 'log' }), /MAIL_TRANSPORT must be smtp in production/);
  assert.throws(() => loadConfig({ ...prod, MAIL_TRANSPORT: 'smtp' }), (e) => /SMTP_URL/.test(e.message) && /MAIL_FROM/.test(e.message));
  assert.throws(() => loadConfig({ ...prod, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'http://x', MAIL_FROM: 'a@b.c' }), /SMTP_URL/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', MAIL_TRANSPORT: 'sendgrid' }), /MAIL_TRANSPORT/);
  const ok = loadConfig({ ...prod, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://relay.example:587', MAIL_FROM: 'News <no-reply@n.example.com>' });
  assert.deepEqual(ok.mail, { transport: 'smtp', smtpUrl: 'smtp://relay.example:587', from: 'News <no-reply@n.example.com>' });
});
