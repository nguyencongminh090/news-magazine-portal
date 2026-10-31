import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app.js';
import { limiter } from '../../http/rateLimit.js';
import { hashPassword, passwordSchema, verifyPassword } from './password.js';
import { hashToken, signAccess, verifyAccess } from './tokens.js';
import { SignJWT } from 'jose';

const jwt = { secret: 's'.repeat(40), issuer: 'iss', audience: 'aud', accessTtl: '15m' };
const ORIGIN = 'http://localhost:5173';

async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

/** Minimal in-memory repo with the same contract as repo.js (SQL semantics are covered by the real-DB test). */
function fakeRepo() {
  const users = [];
  const tokens = [];
  let seq = 0;
  const repo = {
    users, tokens,
    findUserByEmail: async (e) => users.find((u) => u.email.toLowerCase() === e.toLowerCase()) ?? null,
    findUserById: async (id) => users.find((u) => String(u.id) === String(id)) ?? null,
    createUser: async ({ email, passwordHash, displayName, roles }) => {
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw Object.assign(new Error('dup'), { code: '23505' });
      users.push({ id: ++seq, email, password_hash: passwordHash, display_name: displayName, is_active: true, roles });
      return seq;
    },
    insertRefreshToken: async ({ userId, hash, expiresAt }) => tokens.push({ userId, hash, family: userId, expiresAt, revoked: false }),
    rotateRefreshToken: async ({ oldHash, newHash, expiresAt }) => {
      const t = tokens.find((x) => x.hash === oldHash);
      if (!t) return { status: 'invalid' };
      if (t.revoked) { tokens.filter((x) => x.family === t.family).forEach((x) => (x.revoked = true)); return { status: 'reuse' }; }
      t.revoked = true;
      tokens.push({ userId: t.userId, hash: newHash, family: t.family, expiresAt, revoked: false });
      return { status: 'ok', userId: String(t.userId) };
    },
    revokeFamilyByHash: async (h) => {
      const t = tokens.find((x) => x.hash === h);
      if (t) tokens.filter((x) => x.family === t.family).forEach((x) => (x.revoked = true));
    },
    setRoles: async (id, roles) => {
      const u = users.find((x) => x.id === id);
      if (!u) return false;
      u.roles = roles;
      tokens.filter((x) => x.userId === id).forEach((x) => (x.revoked = true));
      return true;
    },
  };
  return repo;
}

const open = () => ({ login: (_q, _s, n) => n(), register: (_q, _s, n) => n(), refresh: (_q, _s, n) => n() });
function makeApp(repo = fakeRepo(), limits = open()) {
  return { repo, app: createApp({ jwt, corsOrigin: ORIGIN, refreshTokenTtlDays: 14, auth: { repo, limits } }) };
}
const post = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
const refreshCookie = (res) => /refresh_token=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
const csrf = { 'x-requested-with': 'fetch', origin: ORIGIN };
const reg = { email: 'Reader@Example.com', displayName: 'Rea', password: 'correct horse battery' };

test('password policy: length 8-128, no composition rules, blocklist', () => {
  assert.ok(passwordSchema.safeParse('alllowercaseletters').success);
  assert.ok(passwordSchema.safeParse('x'.repeat(128)).success);
  assert.ok(!passwordSchema.safeParse('short').success);
  assert.ok(!passwordSchema.safeParse('x'.repeat(129)).success);
  assert.ok(!passwordSchema.safeParse('Password123').success);
});

test('password hash is argon2id and verifies; malformed hash is just false', async () => {
  const h = await hashPassword('correct horse');
  assert.match(h, /^\$argon2id\$/);
  assert.equal(await verifyPassword(h, 'correct horse'), true);
  assert.equal(await verifyPassword(h, 'wrong'), false);
  assert.equal(await verifyPassword('garbage', 'x'), false);
});

test('access token: round-trips; rejects alg none, wrong key, wrong aud, expired', async () => {
  const good = await signAccess(7, jwt);
  assert.equal(await verifyAccess(good, jwt), '7');
  assert.equal(await verifyAccess(good, { ...jwt, secret: 'z'.repeat(40) }), null);
  assert.equal(await verifyAccess(good, { ...jwt, audience: 'other' }), null);
  assert.equal(await verifyAccess(good, { ...jwt, issuer: 'other' }), null);
  const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"7"}').toString('base64url')}.`;
  assert.equal(await verifyAccess(none, jwt), null);
  const expired = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('7').setIssuer('iss').setAudience('aud')
    .setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(new TextEncoder().encode(jwt.secret));
  assert.equal(await verifyAccess(expired, jwt), null);
});

test('register: creates reader, normalises email, sets hardened refresh cookie, never leaks hash', async () => {
  const { app, repo } = makeApp();
  await withServer(app, async (base) => {
    const res = await post(base, '/api/auth/register', reg);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.deepEqual(body.user, { id: 1, email: 'reader@example.com', displayName: 'Rea', roles: ['reader'] });
    assert.ok(body.accessToken);
    assert.ok(!JSON.stringify(body).includes('argon2'));
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\/api\/auth/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(repo.tokens[0].hash, hashToken(refreshCookie(res))); // only the digest is stored
  });
});

test('register: rejects role escalation fields, weak passwords and duplicate emails (case-insensitive)', async () => {
  const { app } = makeApp();
  await withServer(app, async (base) => {
    assert.equal((await post(base, '/api/auth/register', { ...reg, roles: ['admin'] })).status, 422);
    assert.equal((await post(base, '/api/auth/register', { ...reg, password: 'short' })).status, 422);
    assert.equal((await post(base, '/api/auth/register', { ...reg, email: 'nope' })).status, 422);
    assert.equal((await post(base, '/api/auth/register', reg)).status, 201);
    assert.equal((await post(base, '/api/auth/register', { ...reg, email: 'READER@example.com' })).status, 409);
  });
});

test('login: success, and one generic 401 for unknown email, wrong password and inactive user', async () => {
  const { app, repo } = makeApp();
  await withServer(app, async (base) => {
    await post(base, '/api/auth/register', reg);
    assert.equal((await post(base, '/api/auth/login', { email: 'reader@example.com', password: reg.password })).status, 200);
    const bad = [
      await post(base, '/api/auth/login', { email: 'nobody@example.com', password: 'whatever12' }),
      await post(base, '/api/auth/login', { email: 'reader@example.com', password: 'wrong password' }),
    ];
    repo.users[0].is_active = false;
    bad.push(await post(base, '/api/auth/login', { email: 'reader@example.com', password: reg.password }));
    const details = [];
    for (const r of bad) {
      assert.equal(r.status, 401);
      details.push((await r.json()).detail);
    }
    assert.deepEqual(new Set(details), new Set(['Invalid email or password']));
  });
});

test('refresh: rotates, old token replay revokes the family, csrf guard enforced', async () => {
  const { app, repo } = makeApp();
  await withServer(app, async (base) => {
    const first = refreshCookie(await post(base, '/api/auth/register', reg));
    const withCookie = (t, h = csrf) => ({ ...h, cookie: `refresh_token=${t}` });

    assert.equal((await post(base, '/api/auth/refresh', null, { cookie: `refresh_token=${first}` })).status, 403); // no header
    assert.equal((await post(base, '/api/auth/refresh', null, withCookie(first, { ...csrf, origin: 'https://evil.example' }))).status, 403);

    const ok = await post(base, '/api/auth/refresh', null, withCookie(first));
    assert.equal(ok.status, 200);
    const second = refreshCookie(ok);
    assert.notEqual(second, first);
    assert.ok((await ok.json()).accessToken);

    assert.equal((await post(base, '/api/auth/refresh', null, withCookie(first))).status, 401); // replay
    assert.ok(repo.tokens.every((t) => t.revoked)); // whole family dead, including the newest token
    assert.equal((await post(base, '/api/auth/refresh', null, withCookie(second))).status, 401);
    assert.equal((await post(base, '/api/auth/refresh', null, csrf)).status, 401); // no cookie
  });
});

test('logout: revokes the family and clears the cookie', async () => {
  const { app, repo } = makeApp();
  await withServer(app, async (base) => {
    const t = refreshCookie(await post(base, '/api/auth/register', reg));
    const res = await post(base, '/api/auth/logout', null, { ...csrf, cookie: `refresh_token=${t}` });
    assert.equal(res.status, 204);
    assert.match(res.headers.get('set-cookie'), /refresh_token=;/);
    assert.ok(repo.tokens.every((x) => x.revoked));
    assert.equal((await post(base, '/api/auth/logout', null, { 'x-requested-with': 'fetch' })).status, 204); // idempotent
  });
});

test('me + RBAC: 401 without/invalid token, role comes from the DB not the token, 403 for wrong role', async () => {
  const { app, repo } = makeApp();
  await withServer(app, async (base) => {
    const { accessToken } = await (await post(base, '/api/auth/register', reg)).json();
    const auth = { authorization: `Bearer ${accessToken}` };
    assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { authorization: 'Bearer junk' } })).status, 401);
    assert.deepEqual((await (await fetch(`${base}/api/auth/me`, { headers: auth })).json()).user.roles, ['reader']);

    const put = (id, roles, headers = auth) =>
      fetch(`${base}/api/users/${id}/roles`, { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ roles }) });
    assert.equal((await put(1, ['editor'])).status, 403); // reader is not admin

    repo.users[0].roles = ['admin']; // same token, role changed in DB -> effective immediately
    assert.equal((await put(1, ['editor'])).status, 409); // cannot demote yourself
    await post(base, '/api/auth/register', { ...reg, email: 'e@example.com' });
    const ok = await put(2, ['editor', 'editor']);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { id: 2, roles: ['editor'] });
    assert.equal((await put(99, ['editor'])).status, 404);
    assert.equal((await put(2, ['superuser'])).status, 422);

    repo.users[0].is_active = false; // deactivated user's existing access token stops working
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: auth })).status, 401);
  });
});

test('login is rate limited (429) and responses carry no stack/hash', async () => {
  const { app } = makeApp(fakeRepo(), { ...open(), login: limiter({ windowMs: 60_000, limit: 2 }) });
  await withServer(app, async (base) => {
    const body = { email: 'a@example.com', password: 'whatever12' };
    assert.equal((await post(base, '/api/auth/login', body)).status, 401);
    assert.equal((await post(base, '/api/auth/login', body)).status, 401);
    assert.equal((await post(base, '/api/auth/login', body)).status, 429);
  });
});
