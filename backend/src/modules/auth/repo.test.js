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
