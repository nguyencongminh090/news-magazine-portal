import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app.js';
import { closePool, initPool, query } from '../../db.js';
import { migrate } from '../../../db/migrate.js';
import * as repo from './repo.js';
import { bootstrapAdmin } from './bootstrap.js';
import { hashToken, newRefreshToken } from './tokens.js';

const testDb = process.env.TEST_DATABASE_URL;
const jwt = { secret: 's'.repeat(40), issuer: 'iss', audience: 'aud', accessTtl: '15m' };

test('SQL against real DB: users, rotation + reuse detection, role change revokes, bootstrap, full HTTP flow', { skip: !testDb }, async () => {
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: testDb });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await c.end();
  await migrate(testDb);
  initPool({ databaseUrl: () => testDb, db: { max: 4, connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000, statementTimeoutMs: 5000 } });
  try {
    // Case-insensitive uniqueness through the unique index on lower(email).
    const id = await repo.createUser({ email: 'A@x.io', passwordHash: 'h', displayName: 'A', roles: ['reader'] });
    await assert.rejects(repo.createUser({ email: 'a@X.io', passwordHash: 'h', displayName: 'B', roles: ['reader'] }), { code: '23505' });
    assert.deepEqual((await repo.findUserByEmail('A@X.IO')).roles, ['reader']);
    assert.equal(await repo.anyAdminExists(), false);

    // Rotation: old token consumed once; replay revokes the whole family incl. the successor.
    const future = new Date(Date.now() + 60_000);
    const t1 = newRefreshToken();
    await repo.insertRefreshToken({ userId: id, hash: t1.hash, expiresAt: future });
    const t2 = newRefreshToken();
    assert.deepEqual(await repo.rotateRefreshToken({ oldHash: t1.hash, newHash: t2.hash, expiresAt: future }), { status: 'ok', userId: String(id) });
    const t3 = newRefreshToken();
    assert.deepEqual(await repo.rotateRefreshToken({ oldHash: t1.hash, newHash: t3.hash, expiresAt: future }), { status: 'reuse' });
    assert.deepEqual(await repo.rotateRefreshToken({ oldHash: t2.hash, newHash: t3.hash, expiresAt: future }), { status: 'reuse' });
    assert.equal((await query('SELECT count(*)::int n FROM refresh_tokens WHERE revoked_at IS NULL')).rows[0].n, 0);
    assert.deepEqual(await repo.rotateRefreshToken({ oldHash: hashToken('nope'), newHash: t3.hash, expiresAt: future }), { status: 'invalid' });

    // Expired token is invalid and not rotated.
    const old = newRefreshToken();
    await repo.insertRefreshToken({ userId: id, hash: old.hash, expiresAt: new Date(Date.now() - 1000) });
    assert.deepEqual(await repo.rotateRefreshToken({ oldHash: old.hash, newHash: t3.hash, expiresAt: future }), { status: 'invalid' });

    // Logout revokes the family; role change revokes every token of the user.
    const a = newRefreshToken();
    const famId = await repo.insertRefreshToken({ userId: id, hash: a.hash, expiresAt: future });
    await repo.insertRefreshToken({ userId: id, hash: newRefreshToken().hash, expiresAt: future, familyId: famId });
    await repo.revokeFamilyByHash(a.hash);
    assert.equal((await query('SELECT count(*)::int n FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL', [famId])).rows[0].n, 0);
    await repo.insertRefreshToken({ userId: id, hash: newRefreshToken().hash, expiresAt: future });
    assert.equal(await repo.setRoles(id, ['editor', 'seo']), true);
    assert.deepEqual((await repo.findUserById(id)).roles, ['editor', 'seo']);
    assert.equal((await query('SELECT count(*)::int n FROM refresh_tokens WHERE revoked_at IS NULL')).rows[0].n, 0);
    assert.equal(await repo.setRoles(9999, ['reader']), false);

    // A15: password change stores hash + app-clock change time and revokes every token of the user (all families).
    for (let i = 0; i < 2; i++) await repo.insertRefreshToken({ userId: id, hash: newRefreshToken().hash, expiresAt: future });
    const changedAt = new Date(Date.now() - 1234);
    await repo.updatePassword(id, 'h2', changedAt);
    const changed = await repo.findUserById(id);
    assert.equal(changed.password_hash, 'h2');
    assert.equal(changed.password_changed_at.getTime(), changedAt.getTime());
    assert.equal((await query('SELECT count(*)::int n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [id])).rows[0].n, 0);

    // A16: a lost refresh response (navigation abort, two tabs) must not look like token theft.
    const grace = { expiresAt: future, graceMs: 30_000 };
    const rotate = (oldT, newT, opts = grace) => repo.rotateRefreshToken({ oldHash: oldT.hash, newHash: newT.hash, ...opts });
    const liveIn = async (fam) => (await query('SELECT count(*)::int n FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL', [fam])).rows[0].n;
    const g1 = newRefreshToken();
    const gFam = await repo.insertRefreshToken({ userId: id, hash: g1.hash, expiresAt: future });
    const [g2, g3, g4, g5] = [newRefreshToken(), newRefreshToken(), newRefreshToken(), newRefreshToken()];
    assert.equal((await rotate(g1, g2)).status, 'ok');
    assert.equal((await rotate(g1, g3)).status, 'ok', 'replay of a just-rotated token within grace re-mints');
    assert.equal(await liveIn(gFam), 1, 'the unused successor was revoked: one live token per family');
    const usedAt = async (t) => (await query('SELECT used_at FROM refresh_tokens WHERE token_hash = $1', [t.hash])).rows[0].used_at.getTime();
    assert.equal(await usedAt(g2), await usedAt(g1), 'the sibling inherits the original rotation time: the chain window never restarts');
    assert.equal((await rotate(g2, g4)).status, 'ok', 'out-of-order cookie: the revoked sibling also gets grace');
    assert.equal((await rotate(g4, g5)).status, 'ok');
    assert.equal(await liveIn(gFam), 1);
    // Concurrent replays of one token: both succeed, still one live token.
    const c1 = newRefreshToken();
    const cFam = await repo.insertRefreshToken({ userId: id, hash: c1.hash, expiresAt: future });
    const results = await Promise.all([rotate(c1, newRefreshToken()), rotate(c1, newRefreshToken())]);
    assert.deepEqual(results.map((r) => r.status), ['ok', 'ok']);
    assert.equal(await liveIn(cFam), 1);
    // Outside the window a replay is still theft: whole family revoked.
    await query("UPDATE refresh_tokens SET used_at = now() - interval '31 seconds' WHERE token_hash = $1", [g1.hash]);
    assert.equal((await rotate(g1, newRefreshToken())).status, 'reuse');
    assert.equal(await liveIn(gFam), 0);
    // Logout (family revoke) is never undone by grace.
    const l1 = newRefreshToken();
    const lFam = await repo.insertRefreshToken({ userId: id, hash: l1.hash, expiresAt: future });
    const l2 = newRefreshToken();
    assert.equal((await rotate(l1, l2)).status, 'ok');
    await repo.revokeFamilyByHash(l2.hash);
    assert.equal((await rotate(l1, newRefreshToken())).status, 'reuse');
    assert.equal(await liveIn(lFam), 0);

    // A15 race: a rotation in flight when the password changes must not leave its successor live. Under READ
    // COMMITTED the revoking UPDATE never sees a row inserted after its snapshot, so the two must serialise.
    const blocker = new pg.Client({ connectionString: testDb });
    await blocker.connect();
    try {
      const r = newRefreshToken();
      await repo.insertRefreshToken({ userId: id, hash: r.hash, expiresAt: future });
      await blocker.query('BEGIN');
      await blocker.query('SELECT 1 FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE', [r.hash]);
      const waiting = async (n) => {
        for (let i = 0; i < 200; i++) {
          const q = await blocker.query('SELECT count(*)::int n FROM pg_locks WHERE NOT granted');
          if (q.rows[0].n >= n) return;
          await new Promise((ok) => setTimeout(ok, 10));
        }
        throw new Error('lock wait never happened');
      };
      const rotation = repo.rotateRefreshToken({ oldHash: r.hash, newHash: newRefreshToken().hash, expiresAt: future });
      await waiting(1); // rotation is mid-flight, queued on the token row
      const change = repo.updatePassword(id, 'h3', new Date());
      await new Promise((ok) => setTimeout(ok, 100)); // let the change reach its first lock wait
      await blocker.query('COMMIT');
      await Promise.all([rotation, change]);
      assert.equal((await query('SELECT count(*)::int n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [id])).rows[0].n, 0);
    } finally {
      await blocker.end();
    }

    // Bootstrap: creates once, then is a no-op.
    assert.equal(await bootstrapAdmin({ email: ' Boss@X.io ', password: 'correct horse battery' }), 'created');
    assert.equal(await bootstrapAdmin({ email: 'other@x.io', password: 'correct horse battery' }), 'exists');
    assert.deepEqual((await repo.findUserByEmail('boss@x.io')).roles, ['admin']);

    // Full HTTP flow on the real repo.
    const server = createApp({ jwt, corsOrigin: 'http://localhost:5173' }).listen(0);
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const j = { 'content-type': 'application/json' };
      const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: j, body: JSON.stringify({ email: 'BOSS@x.io', password: 'correct horse battery' }) });
      assert.equal(login.status, 200);
      const { accessToken, user } = await login.json();
      assert.deepEqual(user.roles, ['admin']);
      const cookie = /refresh_token=([^;]+)/.exec(login.headers.get('set-cookie'))[1];
      const refreshed = await fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { 'x-requested-with': 'fetch', cookie: `refresh_token=${cookie}` } });
      assert.equal(refreshed.status, 200);
      const me = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${accessToken}` } });
      assert.equal((await me.json()).user.email, 'boss@x.io');
    } finally {
      server.close();
    }
  } finally {
    await closePool();
  }
});
