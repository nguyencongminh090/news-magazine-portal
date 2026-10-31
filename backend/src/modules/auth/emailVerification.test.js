import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app.js';
import { limiter } from '../../http/rateLimit.js';
import { bootstrapAdmin } from './bootstrap.js';
import { hashToken } from './tokens.js';
import { ORIGIN, fakeMail, fakeRepo, jwt, makeApp, open, post, reg, withServer } from './testkit.js';

const verifyToken = (msg) => /\/verify-email#token=([A-Za-z0-9_-]+)$/m.exec(msg.text)?.[1];
const resetToken = (msg) => /\/reset-password#token=([A-Za-z0-9_-]+)$/m.exec(msg.text)?.[1];
const bearer = (accessToken) => ({ authorization: `Bearer ${accessToken}` });
const request = (base, accessToken) => post(base, '/api/auth/email-verification/request', null, bearer(accessToken));
const confirm = (base, body) => post(base, '/api/auth/email-verification/confirm', body);
const me = async (base, accessToken) => (await (await fetch(`${base}/api/auth/me`, { headers: bearer(accessToken) })).json()).user;

function setup(limits = open()) {
  const mail = fakeMail();
  const { app, repo } = makeApp(fakeRepo(), limits, { mailer: mail.mailer, background: mail.background, appBaseUrl: ORIGIN });
  return { app, repo, mail };
}

test('user payload carries emailVerified: false after register, true after confirm; token is single-use', async () => {
  const { app, repo, mail } = setup();
  await withServer(app, async (base) => {
    const registered = await (await post(base, '/api/auth/register', reg)).json();
    assert.equal(registered.user.emailVerified, false);
    const { accessToken } = registered;

    const r = await request(base, accessToken);
    assert.equal(r.status, 202);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    await mail.settle();
    assert.equal(mail.sent.length, 1);
    assert.equal(mail.sent[0].to, 'reader@example.com');
    const token = verifyToken(mail.sent[0]);
    assert.ok(token, 'mail carries a verify link in the URL fragment');
    assert.ok(mail.sent[0].text.includes(`${ORIGIN}/verify-email#token=${token}`));
    assert.deepEqual(repo.userTokens.map((t) => [t.purpose, t.hash]), [['verify', hashToken(token)]]); // digest only

    assert.equal((await confirm(base, { token, extra: 1 })).status, 422);
    assert.equal((await confirm(base, {})).status, 422);
    const ok = await confirm(base, { token });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.equal((await me(base, accessToken)).emailVerified, true);
    assert.equal((await post(base, '/api/auth/login', { email: reg.email, password: reg.password }).then((x) => x.json())).user.emailVerified, true);

    const again = await confirm(base, { token });
    assert.equal(again.status, 400);
    assert.equal((await again.json()).detail, 'Invalid or expired verification link');
  });
});

test('verify request needs a Bearer token; an already verified user gets 202 and no mail', async () => {
  const { app, mail } = setup();
  await withServer(app, async (base) => {
    assert.equal((await post(base, '/api/auth/email-verification/request', null)).status, 401);
    const { accessToken } = await (await post(base, '/api/auth/register', reg)).json();
    await request(base, accessToken);
    await mail.settle();
    assert.equal((await confirm(base, { token: verifyToken(mail.sent[0]) })).status, 204);

    assert.equal((await request(base, accessToken)).status, 202);
    await mail.settle();
    assert.equal(mail.sent.length, 1);
  });
});

test('verify confirm: superseded, expired, unknown, reset-purpose and deactivated-user tokens get one generic 400', async () => {
  const { app, repo, mail } = setup();
  await withServer(app, async (base) => {
    const { accessToken } = await (await post(base, '/api/auth/register', reg)).json();
    await request(base, accessToken);
    await request(base, accessToken);
    await mail.settle();
    const [first, second] = mail.sent.map(verifyToken);
    const details = new Set();
    const expectBad = async (token) => {
      const r = await confirm(base, { token });
      assert.equal(r.status, 400);
      details.add((await r.json()).detail);
    };
    await expectBad(first); // a newer request replaced it
    await expectBad('not-a-real-token');
    repo.userTokens.find((t) => t.purpose === 'verify').expiresAt = new Date(Date.now() - 1000);
    await expectBad(second);

    // Purposes do not cross: a reset link cannot verify, a verify link cannot reset.
    await post(base, '/api/auth/password-reset/request', { email: reg.email });
    await request(base, accessToken);
    await mail.settle();
    await expectBad(resetToken(mail.sent[2]));
    const reset = await post(base, '/api/auth/password-reset/confirm', { token: verifyToken(mail.sent[3]), newPassword: 'a brand new passphrase' });
    assert.equal(reset.status, 400);

    repo.users[0].is_active = false;
    await expectBad(verifyToken(mail.sent[3]));
    assert.deepEqual([...details], ['Invalid or expired verification link']);
    assert.equal(repo.users[0].email_verified_at ?? null, null);
  });
});

test('bootstrap admin is created verified', async () => {
  const repo = { ...fakeRepo(), anyAdminExists: async () => false };
  assert.equal(await bootstrapAdmin({ email: 'boss@x.io', password: 'correct horse battery' }, repo), 'created');
  assert.ok(repo.users[0].email_verified_at instanceof Date);
});

test('verify request is rate limited 3/h per user, not per IP (default limits)', async () => {
  const mail = fakeMail();
  const app = createApp({ jwt, corsOrigin: ORIGIN, auth: { repo: fakeRepo(), mailer: mail.mailer, background: mail.background } });
  await withServer(app, async (base) => {
    const a = (await (await post(base, '/api/auth/register', reg)).json()).accessToken;
    const b = (await (await post(base, '/api/auth/register', { ...reg, email: 'other@example.com' })).json()).accessToken;
    for (let i = 0; i < 3; i++) assert.equal((await request(base, a)).status, 202);
    assert.equal((await request(base, a)).status, 429);
    assert.equal((await request(base, b)).status, 202); // same IP, other user: own bucket
    await mail.settle();
  });
});

test('verify confirm is rate limited per IP', async () => {
  const { app } = setup({ ...open(), verifyConfirm: limiter({ windowMs: 60_000, limit: 2 }) });
  await withServer(app, async (base) => {
    assert.equal((await confirm(base, { token: 'x' })).status, 400);
    assert.equal((await confirm(base, { token: 'y' })).status, 400);
    assert.equal((await confirm(base, { token: 'z' })).status, 429);
  });
});
