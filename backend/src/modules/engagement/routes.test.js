import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app.js';
import { initPool, closePool, query } from '../../db.js';
import { migrate } from '../../../db/migrate.js';
import { limiter } from '../../http/rateLimit.js';
import { signAccess } from '../auth/tokens.js';
import { toArticlePayload } from '../articles/payload.js';
import * as realRepo from './repo.js';
import * as articlesRepo from '../articles/repo.js';
import { toCommentPayload, toEngagementSummary } from './summary.js';

const testDb = process.env.TEST_DATABASE_URL;
const jwt = { secret: 's'.repeat(40), issuer: 'iss', audience: 'aud', accessTtl: '15m' };
const V = new Date('2026-01-01');
const USERS = {
  1: { id: 1, display_name: 'Ed', is_active: true, roles: ['editor'], email_verified_at: V },
  2: { id: 2, display_name: 'Ad', is_active: true, roles: ['admin'], email_verified_at: V },
  3: { id: 3, display_name: 'Rea', is_active: true, roles: ['reader'], email_verified_at: V },
  4: { id: 4, display_name: 'Unv', is_active: true, roles: ['reader'], email_verified_at: null },
};
const auth = { findUserById: async (id) => USERS[id] ?? null };
const as = async (uid) => ({ authorization: `Bearer ${await signAccess(uid, jwt)}`, 'content-type': 'application/json' });
async function withServer(app, fn) {
  const server = app.listen(0);
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
const summaryRow = { rating_avg: '4.5', rating_count: '2', comment_count: '3', my_rating: 4 };

function fakeApp(over = {}, limits) {
  const calls = {};
  const repo = {
    findPublishedId: async (slug) => (slug === 'live' ? 9 : null),
    findReportableCommentId: async (id) => (id === 7 ? 7 : null),
    listVisibleComments: async (doc, p) => ((calls.list = { doc, p }), { rows: [{ id: '1', body: 'hi', created_at: 't', author_name: null, user_id: 3, email: 'x@y' }], total: 1 }),
    insertComment: async (a) => ((calls.insert = a), { id: '2', body: a.body, created_at: 't' }),
    upsertRating: async (a) => (calls.rate = a),
    deleteRating: async (a) => (calls.unrate = a),
    getSummaryRow: async () => summaryRow,
    insertReport: async (a) => (calls.report = a),
    setCommentStatus: async (id, s) => ((calls.status = { id, s }), id === 7 ? { id: 7, body: 'b', status: s, created_at: 't', author_name: 'Rea' } : null),
    deleteComment: async (id) => ((calls.del = id), id === 7),
    ...over,
  };
  return { calls, app: createApp({ jwt, auth: { repo: auth }, engagement: { repo, auth, ...(limits && { limits }) } }) };
}
const send = async (b, method, path, uid, body) =>
  fetch(`${b}/api${path}`, { method, headers: uid ? await as(uid) : { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });

test('summary + comment builders: numeric, no PII, deleted author -> null', () => {
  assert.deepEqual(toEngagementSummary(summaryRow), { ratingAvg: 4.5, ratingCount: 2, commentCount: 3, myRating: 4 });
  assert.deepEqual(toEngagementSummary({}), { ratingAvg: null, ratingCount: 0, commentCount: 0, myRating: null });
  const c = toCommentPayload({ id: '1', body: 'b', created_at: 't', author_name: null, user_id: 3, email: 'x' });
  assert.deepEqual(c, { id: 1, body: 'b', createdAt: 't', author: null });
  assert.equal(toArticlePayload({ id: 1, slug: 's', title: 't' }).engagement, undefined, 'rows without counts omit the block');
  assert.equal(toArticlePayload({ id: 1, slug: 's', title: 't', ...summaryRow }).engagement.ratingAvg, 4.5);
});

test('public read: anyone lists comments; unknown/unpublished article 404', async () => {
  const { app, calls } = fakeApp();
  await withServer(app, async (b) => {
    const res = await send(b, 'GET', '/articles/live/comments?page=2&pageSize=5');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(calls.list, { doc: 9, p: { page: 2, pageSize: 5 } });
    assert.deepEqual(body.items, [{ id: 1, body: 'hi', createdAt: 't', author: null }]);
    assert.equal(body.total, 1);
    assert.equal((await send(b, 'GET', '/articles/nope/comments')).status, 404);
    assert.equal((await send(b, 'GET', '/articles/live/comments?pageSize=999')).status, 422);
  });
});

test('write RBAC: anon 401, unverified 403, verified ok; validation strict', async () => {
  const { app, calls } = fakeApp();
  await withServer(app, async (b) => {
    const post = (uid, body) => send(b, 'POST', '/articles/live/comments', uid, body);
    assert.equal((await post(null, { body: 'x' })).status, 401);
    assert.equal((await post(4, { body: 'x' })).status, 403);
    const ok = await post(3, { body: '  <script>alert(1)</script>  ' });
    assert.equal(ok.status, 201);
    assert.deepEqual(await ok.json(), { id: 2, body: '<script>alert(1)</script>', createdAt: 't', author: { displayName: 'Rea' } });
    assert.deepEqual(calls.insert, { documentId: 9, userId: 3, body: '<script>alert(1)</script>' });
    for (const bad of [{}, { body: '   ' }, { body: 'x'.repeat(2001) }, { body: 'x', userId: 9 }, { body: 'x', status: 'hidden' }]) {
      assert.equal((await post(3, bad)).status, 422, JSON.stringify(bad));
    }
    assert.equal((await send(b, 'POST', '/articles/nope/comments', 3, { body: 'x' })).status, 404);
  });
});

test('rating: 1..5 integer upsert returns summary; delete own; anon/unverified blocked', async () => {
  const { app, calls } = fakeApp();
  await withServer(app, async (b) => {
    const put = (uid, body) => send(b, 'PUT', '/articles/live/rating', uid, body);
    assert.equal((await put(null, { score: 3 })).status, 401);
    assert.equal((await put(4, { score: 3 })).status, 403);
    const ok = await put(3, { score: 5 });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ratingAvg: 4.5, ratingCount: 2, commentCount: 3, myRating: 4 });
    assert.deepEqual(calls.rate, { documentId: 9, userId: 3, score: 5 });
    for (const bad of [{ score: 0 }, { score: 6 }, { score: 2.5 }, { score: '3' }, {}, { score: 3, userId: 1 }]) {
      assert.equal((await put(3, bad)).status, 422, JSON.stringify(bad));
    }
    assert.equal((await send(b, 'DELETE', '/articles/live/rating', 3)).status, 200);
    assert.deepEqual(calls.unrate, { documentId: 9, userId: 3 });
    assert.equal((await send(b, 'DELETE', '/articles/live/rating', null)).status, 401);
  });
});

const roomy = Object.fromEntries(['comment', 'rating', 'report'].map((n) => [n, (o) => limiter({ windowMs: 60_000, limit: 100, ...o })]));

test('reports: article + comment targets; hidden/unknown comment 404; duplicate surfaces 409', async () => {
  const { app, calls } = fakeApp({}, roomy);
  await withServer(app, async (b) => {
    assert.equal((await send(b, 'POST', '/articles/live/reports', null, { reason: 'x' })).status, 401);
    assert.equal((await send(b, 'POST', '/articles/live/reports', 3, { reason: 'spam' })).status, 201);
    assert.deepEqual(calls.report, { reporterId: 3, documentId: 9, reason: 'spam' });
    assert.equal((await send(b, 'POST', '/comments/7/reports', 3, { reason: 'abuse' })).status, 201);
    assert.deepEqual(calls.report, { reporterId: 3, commentId: 7, reason: 'abuse' });
    assert.equal((await send(b, 'POST', '/comments/8/reports', 3, { reason: 'abuse' })).status, 404);
    assert.equal((await send(b, 'POST', '/comments/abc/reports', 3, { reason: 'abuse' })).status, 422);
    assert.equal((await send(b, 'POST', '/articles/live/reports', 3, { reason: '' })).status, 422);
    assert.equal((await send(b, 'POST', '/articles/live/reports', 3, { reason: 'x', documentId: 1 })).status, 422);
  });
  const dup = Object.assign(new Error('dup'), { code: '23505' });
  await withServer(fakeApp({ insertReport: async () => { throw dup; } }, roomy).app, async (b) =>
    assert.equal((await send(b, 'POST', '/articles/live/reports', 3, { reason: 'x' })).status, 409));
  await withServer(fakeApp({ insertComment: async () => { throw dup; } }).app, async (b) =>
    assert.equal((await send(b, 'POST', '/articles/live/comments', 3, { body: 'x' })).status, 409));
});

test('moderation: reader 403, editor hides, only admin deletes', async () => {
  const { app, calls } = fakeApp();
  await withServer(app, async (b) => {
    assert.equal((await send(b, 'PATCH', '/admin/comments/7', null, { status: 'hidden' })).status, 401);
    assert.equal((await send(b, 'PATCH', '/admin/comments/7', 3, { status: 'hidden' })).status, 403);
    const ok = await send(b, 'PATCH', '/admin/comments/7', 1, { status: 'hidden' });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).status, 'hidden');
    assert.deepEqual(calls.status, { id: 7, s: 'hidden' });
    assert.equal((await send(b, 'PATCH', '/admin/comments/7', 1, { status: 'deleted' })).status, 422);
    assert.equal((await send(b, 'PATCH', '/admin/comments/8', 1, { status: 'visible' })).status, 404);
    assert.equal((await send(b, 'DELETE', '/admin/comments/7', 1)).status, 403);
    assert.equal((await send(b, 'DELETE', '/admin/comments/7', 2)).status, 204);
    assert.equal((await send(b, 'DELETE', '/admin/comments/8', 2)).status, 404);
  });
});

test('rate limits are per user and return 429 + Retry-After', async () => {
  const small = { comment: (o) => limiter({ windowMs: 60_000, limit: 2, ...o }), rating: (o) => limiter({ windowMs: 60_000, limit: 2, ...o }), report: (o) => limiter({ windowMs: 60_000, limit: 2, ...o }) };
  const { app } = fakeApp({}, small);
  await withServer(app, async (b) => {
    const post = (uid) => send(b, 'POST', '/articles/live/comments', uid, { body: 'x' });
    assert.equal((await post(3)).status, 201);
    assert.equal((await post(3)).status, 201);
    const blocked = await post(3);
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
    assert.equal((await post(1)).status, 201, 'another user on the same IP has their own budget');
  });
});

test('article detail: optional bearer passes caller id; bad token stays anonymous', async () => {
  const seen = [];
  const repo = { findPublishedBySlug: async (slug, uid) => (seen.push(uid), { id: 1, slug, title: 't', ...summaryRow }) };
  const app = createApp({ jwt, auth: { repo: auth }, articles: { repo } });
  await withServer(app, async (b) => {
    const get = async (h) => (await fetch(`${b}/api/articles/live`, { headers: h })).json();
    assert.equal((await get(await as(3))).engagement.commentCount, 3);
    await get({});
    await get({ authorization: 'Bearer garbage' });
    assert.deepEqual(seen, [3, null, null]);
  });
});

test('SQL against real DB: counts, uniqueness, hidden exclusion, reports, cascade, shared summary', { skip: !testDb }, async () => {
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: testDb });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await c.end();
  await migrate(testDb);
  initPool({ databaseUrl: () => testDb, db: { max: 2, connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000, statementTimeoutMs: 5000 } });
  try {
    await query(`INSERT INTO categories (name, slug) VALUES ('World','world')`);
    await query(`INSERT INTO users (email, password_hash, display_name) VALUES ('a@x.io','h','A'),('b@x.io','h','B')`);
    await query(`INSERT INTO documents (title, slug, content, category_id, author_name, status, published_at)
                 VALUES ('Live','live','t',1,'Au','published',now()), ('Draft','draft','t',1,'Au','draft',null)`);
    assert.equal(await realRepo.findPublishedId('live'), 1);
    assert.equal(await realRepo.findPublishedId('draft'), null);

    await realRepo.upsertRating({ documentId: 1, userId: 1, score: 5 });
    await realRepo.upsertRating({ documentId: 1, userId: 2, score: 2 });
    await realRepo.upsertRating({ documentId: 1, userId: 2, score: 3 }); // change, not a second row
    const s = toEngagementSummary(await realRepo.getSummaryRow(1, 2));
    assert.deepEqual(s, { ratingAvg: 4, ratingCount: 2, commentCount: 0, myRating: 3 });
    assert.equal(toEngagementSummary(await realRepo.getSummaryRow(1, null)).myRating, null);

    const first = await realRepo.insertComment({ documentId: 1, userId: 1, body: 'hello' });
    await assert.rejects(realRepo.insertComment({ documentId: 1, userId: 1, body: 'hello' }), { code: '23505' });
    await realRepo.insertComment({ documentId: 1, userId: 2, body: 'hello' }); // other user may say the same
    assert.equal((await realRepo.listVisibleComments(1, { page: 1, pageSize: 10 })).total, 2);

    const hidden = await realRepo.setCommentStatus(Number(first.id), 'hidden');
    assert.equal(hidden.status, 'hidden');
    const list = await realRepo.listVisibleComments(1, { page: 1, pageSize: 10 });
    assert.equal(list.total, 1);
    assert.equal(list.rows[0].author_name, 'B');
    assert.equal(await realRepo.findReportableCommentId(Number(first.id)), null, 'hidden comment cannot be reported');

    // list + detail serialise the same counts through the same builder
    const detail = toArticlePayload(await articlesRepo.findPublishedBySlug('live', 1));
    const listed = toArticlePayload((await articlesRepo.listPublished({ page: 1, pageSize: 5 })).rows[0]);
    assert.deepEqual({ ...detail.engagement, myRating: null }, listed.engagement);
    assert.equal(detail.engagement.myRating, 5);
    assert.equal(detail.engagement.commentCount, 1);

    await realRepo.insertReport({ reporterId: 1, documentId: 1, reason: 'r' });
    await assert.rejects(realRepo.insertReport({ reporterId: 1, documentId: 1, reason: 'r' }), { code: '23505' });
    const cid = (await realRepo.listVisibleComments(1, { page: 1, pageSize: 1 })).rows[0].id;
    await realRepo.insertReport({ reporterId: 1, commentId: Number(cid), reason: 'r' });
    await assert.rejects(realRepo.insertReport({ reporterId: 1, commentId: Number(cid), reason: 'r' }), { code: '23505' });

    await realRepo.deleteRating({ documentId: 1, userId: 1 });
    assert.equal((await realRepo.getSummaryRow(1, null)).rating_count, '1');
    assert.equal(await realRepo.deleteComment(Number(cid)), true);
    assert.equal((await query('SELECT count(*) FROM reports WHERE comment_id IS NOT NULL')).rows[0].count, '0', 'reports cascade with the comment');
    assert.equal(await realRepo.deleteComment(Number(cid)), false);
  } finally {
    await closePool();
  }
});
