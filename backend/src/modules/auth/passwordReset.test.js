import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app.js';
import { limiter } from '../../http/rateLimit.js';
import { verifyPassword } from './password.js';
import { hashToken } from './tokens.js';
import { ORIGIN, csrf, fakeMail, fakeRepo, jwt, makeApp, open, post, refreshCookie, reg, withServer } from './testkit.js';

const newPassword = 'a brand new passphrase';
const tokenFrom = (msg) => /\/reset-password#token=([A-Za-z0-9_-]+)$/m.exec(msg.text)?.[1];
const request = (base, email) => post(base, '/api/auth/password-reset/request', { email });
const confirm = (base, body) => post(base, '/api/auth/password-reset/confirm', body);

function setup(limits = open()) {
  const mail = fakeMail();
  const { app, repo } = makeApp(fakeRepo(), limits, { mailer: mail.mailer, background: mail.background, appBaseUrl: ORIGIN });
  return { app, repo, mail };
}

test('reset request: same 202 for known, unknown and inactive emails; mail only to an active account', async () => {
  const { app, repo, mail } = setup();
  await withServer(app, async (base) => {
    await post(base, '/api/auth/register', reg);
    await post(base, '/api/auth/register', { ...reg, email: 'off@example.com' });
    repo.users[1].is_active = false;

    const responses = [await request(base, ' READER@example.com '), await request(base, 'nobody@example.com'), await request(base, 'off@example.com')];
    await mail.settle();
    const bodies = [];
    for (const r of responses) {
      assert.equal(r.status, 202);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      bodies.push(await r.text());
    }
    assert.equal(new Set(bodies).size, 1);

    assert.equal(mail.sent.length, 1);
    assert.equal(mail.sent[0].to, 'reader@example.com');
    const token = tokenFrom(mail.sent[0]);
    assert.ok(token, 'mail carries a reset link in the URL fragment');
    assert.ok(mail.sent[0].text.startsWith(`Someone asked`));
    assert.ok(mail.sent[0].text.includes(`${ORIGIN}/reset-password#token=${token}`));
    assert.deepEqual(repo.userTokens.map((t) => [t.purpose, t.hash]), [['reset', hashToken(token)]]); // digest only
    assert.equal((await request(base, 'not-an-email')).status, 422);
  });
});

test('reset request answers before the account lookup finishes (no timing oracle)', async () => {
  const mail = fakeMail();
  const repo = fakeRepo();
  repo.findUserByEmail = () => new Promise(() => {}); // never resolves
  const { app } = makeApp(repo, open(), { mailer: mail.mailer, background: mail.background, appBaseUrl: ORIGIN });
  await withServer(app, async (base) => {
    assert.equal((await request(base, 'reader@example.com')).status, 202);
  });
});

test('reset confirm: sets the password, kills every session, marks email verified; token is single-use', async () => {
  const { app, repo, mail } = setup();
  await withServer(app, async (base) => {
    const session = refreshCookie(await post(base, '/api/auth/register', reg));
    await request(base, reg.email);
    await mail.settle();
    const token = tokenFrom(mail.sent[0]);

    assert.equal((await confirm(base, { token, newPassword: 'short' })).status, 422);
    assert.equal((await confirm(base, { token, newPassword, extra: 1 })).status, 422);
    const ok = await confirm(base, { token, newPassword });
    assert.equal(ok.status, 204);
    assert.equal(refreshCookie(ok), undefined); // no auto-login
    assert.ok(await verifyPassword(repo.users[0].password_hash, newPassword));
    assert.ok(repo.users[0].password_changed_at instanceof Date);
    assert.ok(repo.users[0].email_verified_at instanceof Date);
    assert.equal((await post(base, '/api/auth/refresh', null, { ...csrf, cookie: `refresh_token=${session}` })).status, 401);

    const again = await confirm(base, { token, newPassword: 'yet another passphrase' });
    assert.equal(again.status, 400);
    assert.equal((await again.json()).detail, 'Invalid or expired reset link');
    assert.equal((await post(base, '/api/auth/login', { email: reg.email, password: newPassword })).status, 200);
  });
});

test('reset confirm: superseded, expired, unknown and deactivated-user tokens get one generic 400', async () => {
  const { app, repo, mail } = setup();
  await withServer(app, async (base) => {
    await post(base, '/api/auth/register', reg);
    await request(base, reg.email);
    await request(base, reg.email);
    await mail.settle();
    const [first, second] = mail.sent.map(tokenFrom);
    const details = new Set();
    const expectBad = async (body) => {
      const r = await confirm(base, body);
      assert.equal(r.status, 400);
      details.add((await r.json()).detail);
    };
    await expectBad({ token: first, newPassword }); // a newer request replaced it
    await expectBad({ token: 'not-a-real-token', newPassword });
    repo.userTokens[0].expiresAt = new Date(Date.now() - 1000);
    await expectBad({ token: second, newPassword });

    await request(base, reg.email);
    await mail.settle();
    repo.users[0].is_active = false;
    await expectBad({ token: tokenFrom(mail.sent[2]), newPassword });
    assert.deepEqual([...details], ['Invalid or expired reset link']);
    assert.equal((await confirm(base, { newPassword })).status, 422);
  });
});

test('reset request is rate limited per IP+email; case variants share a bucket (default limits)', async () => {
  const mail = fakeMail();
  const app = createApp({ jwt, corsOrigin: ORIGIN, auth: { repo: fakeRepo(), mailer: mail.mailer, background: mail.background } });
  await withServer(app, async (base) => {
    for (const email of ['a@example.com', 'A@Example.com', ' a@EXAMPLE.com']) assert.equal((await request(base, email)).status, 202);
    assert.equal((await request(base, 'a@example.com')).status, 429);
    assert.equal((await request(base, 'b@example.com')).status, 202); // other accounts are not locked out
  });
});

test('reset confirm is rate limited per IP', async () => {
  const { app } = setup({ ...open(), resetConfirm: limiter({ windowMs: 60_000, limit: 2 }) });
  await withServer(app, async (base) => {
    assert.equal((await confirm(base, { token: 'x', newPassword })).status, 400);
    assert.equal((await confirm(base, { token: 'y', newPassword })).status, 400);
    assert.equal((await confirm(base, { token: 'z', newPassword })).status, 429);
  });
});
