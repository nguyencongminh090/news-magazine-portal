import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app.js';
import { initPool, closePool, query } from '../../db.js';
import { migrate } from '../../../db/migrate.js';
import { signAccess } from '../auth/tokens.js';
import * as realRepo from './repo.js';
import { slugify } from './slug.js';

const testDb = process.env.TEST_DATABASE_URL;
const jwt = { secret: 's'.repeat(40), issuer: 'iss', audience: 'aud', accessTtl: '15m' };
const USERS = {
  1: { id: 1, display_name: 'Ed', is_active: true, roles: ['editor'] },
  2: { id: 2, display_name: 'Ad', is_active: true, roles: ['admin'] },
  3: { id: 3, display_name: 'Rea', is_active: true, roles: ['reader'] },
  4: { id: 4, display_name: 'Seo', is_active: true, roles: ['seo'] },
};
const auth = { findUserById: async (id) => USERS[id] ?? null };

async function withServer(app, fn) {
  const server = app.listen(0);
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
const as = async (uid) => ({ authorization: `Bearer ${await signAccess(uid, jwt)}`, 'content-type': 'application/json' });
const row = (o = {}) => ({
  id: 5, slug: 'a', title: 'A', summary: '', body: 'text', published_at: null, author_name: 'Ed', status: 'draft',
  views_count: '7', updated_at: '2026-01-01T00:00:00.000Z', category_slug: 'world', category_name: 'World', tags: [], ...o,
});
const valid = { title: 'Hello', body: 'text', categorySlug: 'world' };

function fakeApp(over = {}) {
  const calls = {};
  const repo = {
    list: async (a) => ((calls.list = a), { rows: [row()], total: 1 }),
    findById: async () => row(),
    create: async (d, who) => ((calls.create = { d, who }), row()),
    update: async (id, d, at) => ((calls.update = { id, d, at }), row()),
    remove: async (id) => ((calls.remove = id), true),
    ...over,
  };
  return { calls, app: createApp({ jwt, auth: { repo: auth }, adminArticles: { repo, auth } }) };
}

test('slugify: folds Vietnamese, strips symbols, never empty', () => {
  assert.equal(slugify('Đường ống dẫn dầu: 100% mới!'), 'duong-ong-dan-dau-100-moi');
  assert.equal(slugify('???'), 'article');
  assert.match(slugify('x'.repeat(300)), /^x{200}$/);
});

test('RBAC: anon 401; reader/seo 403; editor ok; only admin may DELETE', async () => {
  const { app } = fakeApp();
  await withServer(app, async (b) => {
    const url = `${b}/api/admin/articles`;
    assert.equal((await fetch(url)).status, 401);
    for (const uid of [3, 4]) assert.equal((await fetch(url, { headers: await as(uid) })).status, 403, `user ${uid}`);
    assert.equal((await fetch(url, { headers: await as(1) })).status, 200);
    assert.equal((await fetch(`${url}/5`, { method: 'DELETE', headers: await as(1) })).status, 403);
    assert.equal((await fetch(`${url}/5`, { method: 'DELETE', headers: await as(2) })).status, 204);
  });
});

test('list: filters passed through; payload has staff fields and numeric views', async () => {
  const { app, calls } = fakeApp();
  await withServer(app, async (b) => {
    const res = await fetch(`${b}/api/admin/articles?status=draft&q=oil&page=2&pageSize=5`, { headers: await as(1) });
    const body = await res.json();
    assert.deepEqual(calls.list, { page: 2, pageSize: 5, status: 'draft', q: 'oil' });
    assert.equal(body.items[0].status, 'draft');
    assert.equal(body.items[0].viewsCount, 7);
    assert.equal(body.items[0].updatedAt, '2026-01-01T00:00:00.000Z');
    assert.equal((await fetch(`${b}/api/admin/articles?status=bogus`, { headers: await as(1) })).status, 422);
  });
});

test('create: strict body, defaults, author from the caller; mass-assignment rejected', async () => {
  const { app, calls } = fakeApp();
  await withServer(app, async (b) => {
    const post = async (body) => fetch(`${b}/api/admin/articles`, { method: 'POST', headers: await as(1), body: JSON.stringify(body) });
    const ok = await post({ ...valid, tags: ['Oil', 'Oil'] });
    assert.equal(ok.status, 201);
    assert.match(ok.headers.get('location'), /\/api\/admin\/articles\/5$/);
    assert.deepEqual(calls.create.d, { ...valid, summary: '', tags: ['Oil'], status: 'draft' });
    assert.deepEqual(calls.create.who, { id: 1, name: 'Ed' });
    for (const bad of [{ ...valid, authorId: 9 }, { ...valid, viewsCount: 1 }, { ...valid, title: '' }, { ...valid, slug: 'Bad Slug' }, { ...valid, status: 'x' }]) {
      assert.equal((await post(bad)).status, 422, JSON.stringify(bad));
    }
  });
});

test('update: requires slug + updatedAt; 404 unknown; stale surfaces 409', async () => {
  const body = { ...valid, slug: 'hello', updatedAt: '2026-01-01T00:00:00.000Z' };
  const put = async (b, payload, id = 5) => fetch(`${b}/api/admin/articles/${id}`, { method: 'PUT', headers: await as(1), body: JSON.stringify(payload) });
  const { app, calls } = fakeApp();
  await withServer(app, async (b) => {
    assert.equal((await put(b, body)).status, 200);
    assert.equal(calls.update.at, body.updatedAt);
    assert.ok(!('updatedAt' in calls.update.d));
    assert.equal((await put(b, { ...valid, slug: 'hello' })).status, 422);
    assert.equal((await put(b, body, 'abc')).status, 422);
  });
  const { HttpError } = await import('../../http/errors.js');
  await withServer(fakeApp({ update: async () => { throw new HttpError(409, 'Conflict'); } }).app, async (b) => assert.equal((await put(b, body)).status, 409));
  await withServer(fakeApp({ update: async () => null }).app, async (b) => assert.equal((await put(b, body)).status, 404));
});

test('SQL against real DB: slug dedupe, publish timestamp, stale 409, tags, filters, delete', { skip: !testDb }, async () => {
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: testDb });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await c.end();
  await migrate(testDb);
  initPool({ databaseUrl: () => testDb, db: { max: 2, connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000, statementTimeoutMs: 5000 } });
  try {
    await query(`INSERT INTO categories (name, slug) VALUES ('World','world')`);
    await query(`INSERT INTO users (email, password_hash, display_name) VALUES ('e@x.io','h','Ed')`);
    const author = { id: 1, name: 'Ed' };
    const a = await realRepo.create({ ...valid, summary: '', tags: ['Oil', 'Gas'], status: 'draft' }, author);
    const b = await realRepo.create({ ...valid, summary: '', tags: [], status: 'draft' }, author);
    assert.deepEqual([a.slug, b.slug], ['hello', 'hello-2']);
    assert.deepEqual(a.tags, ['Gas', 'Oil']);
    assert.equal(a.published_at, null);
    await assert.rejects(realRepo.create({ ...valid, slug: 'hello', summary: '', tags: [], status: 'draft' }, author), { status: 409 });
    await assert.rejects(realRepo.create({ ...valid, categorySlug: 'nope', summary: '', tags: [], status: 'draft' }, author), { status: 422 });

    const edit = { ...valid, slug: 'hello', summary: 's', tags: ['Oil'], status: 'published' };
    const pub = await realRepo.update(a.id, edit, a.updated_at);
    assert.ok(pub.published_at);
    assert.deepEqual(pub.tags, ['Oil']);
    await assert.rejects(realRepo.update(a.id, edit, a.updated_at), { status: 409 }); // stale updatedAt
    const back = await realRepo.update(a.id, { ...edit, status: 'draft' }, pub.updated_at);
    assert.equal(new Date(back.published_at).getTime(), new Date(pub.published_at).getTime()); // kept
    await assert.rejects(realRepo.update(b.id, { ...edit, slug: 'hello' }, b.updated_at), { status: 409 }); // slug taken by a
    assert.equal(await realRepo.update(999, edit, a.updated_at), null);

    assert.equal((await realRepo.list({ page: 1, pageSize: 20 })).total, 2);
    assert.equal((await realRepo.list({ page: 1, pageSize: 20, status: 'draft', q: 'HELL' })).total, 2);
    assert.equal((await realRepo.list({ page: 1, pageSize: 20, status: 'published' })).total, 0);
    assert.equal(await realRepo.remove(a.id), true);
    assert.equal(await realRepo.remove(a.id), false);
    assert.equal((await query('SELECT count(*)::int n FROM document_tags')).rows[0].n, 0);
  } finally {
    await closePool();
  }
});
