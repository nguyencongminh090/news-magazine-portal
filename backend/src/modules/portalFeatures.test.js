import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { initPool, closePool, query } from '../db.js';
import { migrate } from '../../db/migrate.js';
import { signAccess } from './auth/tokens.js';
import { flushViews, pendingViews, recordView, resetViewBuffer } from './articles/views.js';
import { buildMetaTags } from './articles/seo.js';
import * as articlesRepo from './articles/repo.js';
import * as tagsRepo from './tags/repo.js';
import * as searchClicksRepo from './searchClicks/repo.js';
import * as engagementRepo from './engagement/repo.js';
import * as usersRepo from './users/repo.js';
import * as adminSystemRepo from './adminSystem/repo.js';
import * as adminTaxonomyRepo from './adminTaxonomy/repo.js';
import * as adminModerationRepo from './adminModeration/repo.js';
import * as adminSeoRepo from './adminSeo/repo.js';

const testDb = process.env.TEST_DATABASE_URL;

const jwt = { secret: 's'.repeat(40), issuer: 'iss', audience: 'aud', accessTtl: '15m' };
const V = new Date('2026-01-01');
const USERS = {
  1: { id: 1, email: 'ad@x.test', display_name: 'Ad', is_active: true, roles: ['admin'], email_verified_at: V },
  2: { id: 2, email: 'ed@x.test', display_name: 'Ed', is_active: true, roles: ['editor'], email_verified_at: V },
  3: { id: 3, email: 'mo@x.test', display_name: 'Mo', is_active: true, roles: ['moderator'], email_verified_at: V },
  4: { id: 4, email: 'se@x.test', display_name: 'Se', is_active: true, roles: ['seo'], email_verified_at: V },
  5: { id: 5, email: 're@x.test', display_name: 'Re', is_active: true, roles: ['reader'], email_verified_at: V },
  6: { id: 6, email: 'un@x.test', display_name: 'Un', is_active: true, roles: ['reader'], email_verified_at: null },
};
const auth = { findUserById: async (id) => USERS[id] ?? null, setRoles: async () => true };
const as = async (uid) => ({ authorization: `Bearer ${await signAccess(uid, jwt)}`, 'content-type': 'application/json' });

async function withServer(app, fn) {
  const server = app.listen(0);
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

const send = async (b, method, path, uid, body) =>
  fetch(`${b}/api${path}`, {
    method,
    headers: uid ? await as(uid) : { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

test('articles search filters: tag, from, to, sort passed through; invalid range -> 422', async () => {
  const calls = {};
  const app = createApp({
    articles: {
      repo: {
        listPublished: async (q) => ((calls.list = q), { rows: [], total: 0 }),
        findPublishedBySlug: async () => null,
      },
    },
  });
  await withServer(app, async (b) => {
    const res = await fetch(`${b}/api/articles?tag=climate&from=2026-01-01&to=2026-01-31&sort=views`);
    assert.equal(res.status, 200);
    assert.deepEqual(calls.list, { page: 1, pageSize: 20, tag: 'climate', from: '2026-01-01', to: '2026-01-31', sort: 'views' });

    assert.equal((await fetch(`${b}/api/articles?from=not-a-date`)).status, 422);
    assert.equal((await fetch(`${b}/api/articles?from=1`)).status, 422);
    assert.equal((await fetch(`${b}/api/articles?from=2026-02-30`)).status, 422);
    assert.equal((await fetch(`${b}/api/articles?from=2026-02-01&to=2026-01-01`)).status, 422);
    assert.equal((await fetch(`${b}/api/articles?sort=random`)).status, 422);
  });
});

test('global site_settings: public GET, default pageSize, allow_registration, allow_comments enforcement', async () => {
  const calls = {};
  const settings = {
    site_name: 'Daily Pulse',
    site_tagline: 'Fast news',
    allow_registration: false,
    allow_comments: false,
    articles_per_page: 12,
    maintenance_mode: true,
  };
  const app = createApp({
    jwt,
    auth: { repo: auth },
    settings: { getSettings: async () => settings },
    articles: {
      repo: {
        listPublished: async (q) => ((calls.list = q), { rows: [], total: 0 }),
        findPublishedBySlug: async () => null,
      },
    },
    engagement: {
      repo: {
        findPublishedId: async () => 1,
        insertComment: async () => ({ id: 1, body: 'hi', created_at: 't' }),
      },
    },
  });
  await withServer(app, async (b) => {
    const pub = await fetch(`${b}/api/settings`);
    assert.equal(pub.status, 200);
    assert.deepEqual((await pub.json()).settings, settings);

    const list = await fetch(`${b}/api/articles`);
    assert.equal(list.status, 200);
    assert.equal(calls.list.pageSize, 12);

    const reg = await send(b, 'POST', '/auth/register', null, { email: 'new@x.test', displayName: 'New', password: 'StrongPassword123!' });
    assert.equal(reg.status, 403);

    const cmt = await send(b, 'POST', '/articles/live/comments', 5, { body: 'Hello' });
    assert.equal(cmt.status, 403);
  });
});

test('views buffer: increments on detail view, skips on view=0, flushes and retries on error', async () => {
  resetViewBuffer();
  const app = createApp({
    articles: {
      repo: {
        listPublished: async () => ({ rows: [], total: 0 }),
        findPublishedBySlug: async (slug) => ({
          id: 42, slug, title: 'T', summary: 'S', body: 'B', views_count: '10',
          og_image_url: 'https://cdn.x/i.jpg', image_alt: 'Alt', tags: ['News'],
        }),
      },
    },
  });
  await withServer(app, async (b) => {
    const r1 = await (await fetch(`${b}/api/articles/story`)).json();
    assert.equal(r1.viewsCount, 11);
    assert.equal(r1.ogImageUrl, 'https://cdn.x/i.jpg');
    assert.equal(r1.imageAlt, 'Alt');

    const r2 = await (await fetch(`${b}/api/articles/story?view=0`)).json();
    assert.equal(r2.viewsCount, 11);
  });
  assert.equal(pendingViews(42), 1);

  await assert.rejects(flushViews(async () => { throw new Error('db down'); }), /db down/);
  assert.equal(pendingViews(42), 1, 're-queued on failure');

  let flushed;
  await flushViews(async (_sql, params) => { flushed = params; });
  assert.deepEqual(flushed, [[42], [1]]);
  assert.equal(pendingViews(42), 0);
  resetViewBuffer();
});

test('seo: emits keywords and og:image:alt when present', () => {
  const tags = buildMetaTags({
    slug: 's', title: 'T', summary: 'S', meta_title: null, meta_description: null,
    og_image_url: 'https://cdn.x/pic.png', image_alt: 'Solar panels', seo_keywords: 'energy, solar',
  }, 'https://news.example');
  assert.match(tags, /name="keywords" content="energy, solar"/);
  assert.match(tags, /property="og:image:alt" content="Solar panels"/);
});

test('GET /api/tags and POST /api/search-clicks', async () => {
  const clicks = [];
  const app = createApp({
    jwt,
    auth: { repo: auth },
    tags: { repo: { listWithCounts: async () => [{ id: 1, slug: 'oil', name: 'Oil', article_count: '4' }] } },
    searchClicks: {
      repo: {
        findPublishedDocId: async ({ slug }) => (slug === 'live' ? 99 : null),
        insertSearchClick: async (entry) => (clicks.push(entry), { id: 7, user_id: entry.userId, query_string: entry.queryString, clicked_doc_id: entry.clickedDocId, created_at: '2026-01-01T00:00:00Z' }),
      },
    },
  });
  await withServer(app, async (b) => {
    const tagsRes = await fetch(`${b}/api/tags`);
    assert.equal(tagsRes.status, 200);
    assert.deepEqual((await tagsRes.json()).items, [{ id: 1, slug: 'oil', name: 'Oil', articleCount: 4 }]);

    assert.equal((await send(b, 'POST', '/search-clicks', null, { queryString: 'oil', slug: 'live' })).status, 201);
    assert.equal((await send(b, 'POST', '/search-clicks', 5, { queryString: 'oil', slug: 'live' })).status, 201);
    assert.equal(clicks[0].userId, null);
    assert.equal(clicks[1].userId, 5);
    assert.equal((await send(b, 'POST', '/search-clicks', null, { queryString: 'oil', slug: 'missing' })).status, 404);
    assert.equal((await send(b, 'POST', '/search-clicks', null, { queryString: 'oil' })).status, 422);
  });
});

test('likes and user tagging on articles require verified email', async () => {
  const app = createApp({
    jwt,
    auth: { repo: auth },
    engagement: {
      repo: {
        findPublishedId: async (slug) => (slug === 'live' ? 10 : null),
        getLikeSummary: async () => ({ likeCount: 3, likedByMe: false }),
        upsertLike: async () => ({ likeCount: 4, likedByMe: true }),
        deleteLike: async () => ({ likeCount: 3, likedByMe: false }),
        addUserTag: async ({ tagName }) => ({ tags: ['News', tagName], myUserTags: [tagName] }),
        removeUserTag: async ({ tagNameOrSlug }) => ({ removed: tagNameOrSlug === 'energy', tags: ['News'], myUserTags: [] }),
      },
    },
  });
  await withServer(app, async (b) => {
    assert.equal((await send(b, 'GET', '/articles/live/like', null)).status, 200);
    assert.equal((await send(b, 'PUT', '/articles/live/like', null)).status, 401);
    assert.equal((await send(b, 'PUT', '/articles/live/like', 6)).status, 403);
    const liked = await send(b, 'PUT', '/articles/live/like', 5);
    assert.equal(liked.status, 200);
    assert.deepEqual(await liked.json(), { likeCount: 4, likedByMe: true });

    assert.equal((await send(b, 'POST', '/articles/live/tags', 6, { tag: 'Energy' })).status, 403);
    const tagged = await send(b, 'POST', '/articles/live/tags', 5, { tag: 'Energy' });
    assert.equal(tagged.status, 201);
    assert.deepEqual((await tagged.json()).myUserTags, ['Energy']);

    assert.equal((await send(b, 'DELETE', '/articles/live/tags/energy', 5)).status, 200);
    assert.equal((await send(b, 'DELETE', '/articles/live/tags/unknown', 5)).status, 404);
  });
});

test('user profile GET/PATCH /api/users/me', async () => {
  let saved = null;
  const app = createApp({
    jwt,
    auth: { repo: auth },
    users: {
      profileRepo: {
        getProfile: async (id) => ({ user: { id, email: 're@x.test', displayName: 'Re', bio: '', avatarUrl: null, roles: ['reader'], emailVerified: true }, tags: [], stats: { commentsCount: 1, ratingsCount: 2, likesCount: 3 } }),
        updateProfile: async (id, data) => ((saved = { id, data }), { user: { id, email: 're@x.test', displayName: data.displayName ?? 'Re', bio: data.bio ?? '', avatarUrl: data.avatarUrl ?? null, roles: ['reader'], emailVerified: true }, tags: (data.tags ?? []).map((n, i) => ({ id: i + 1, slug: n.toLowerCase(), name: n })), stats: { commentsCount: 1, ratingsCount: 2, likesCount: 3 } }),
      },
    },
  });
  await withServer(app, async (b) => {
    assert.equal((await send(b, 'GET', '/users/me', null)).status, 401);
    assert.equal((await send(b, 'GET', '/users/me', 5)).status, 200);
    assert.equal((await send(b, 'PATCH', '/users/me', 5, { avatarUrl: 'http://insecure.test/a.png' })).status, 422);
    const res = await send(b, 'PATCH', '/users/me', 5, { displayName: 'Reader One', bio: 'Hello', tags: ['Science', 'Science'] });
    assert.equal(res.status, 200);
    assert.deepEqual(saved.data.tags, ['Science']);
  });
});

test('RBAC matrix for all 4 admin roles across system, taxonomy, moderation, and seo/analytics', async () => {
  const app = createApp({
    jwt,
    auth: { repo: auth },
    adminSystem: {
      repo: {
        listUsers: async () => ({ rows: [], total: 0 }),
        setUserActive: async (id, isActive) => ({ id, is_active: isActive }),
        listLogs: async () => ({ rows: [], total: 0 }),
        getSettings: async () => ({ settings: {}, items: [] }),
        updateSettings: async (s) => ({ settings: s, items: [] }),
      },
    },
    adminTaxonomy: {
      repo: {
        listCategories: async () => [],
        createCategory: async (d) => ({ id: 1, name: d.name, slug: d.slug ?? 'x', article_count: 0 }),
        updateCategory: async () => null,
        deleteCategory: async () => true,
        listTags: async () => [],
        createTag: async (d) => ({ id: 1, name: d.name, slug: d.slug ?? 'x', article_count: 0 }),
        updateTag: async () => null,
        deleteTag: async () => true,
      },
    },
    adminModeration: {
      repo: {
        listReports: async () => ({ rows: [], total: 0 }),
        resolveReport: async (id, d) => ({ id, status: d.status, resolved_at: '2026-01-01T00:00:00Z' }),
        listComments: async () => ({ rows: [], total: 0 }),
        spamAction: async (id, action) => ({ userId: id, hiddenComments: 2, suspended: action === 'suspend' }),
      },
    },
    adminSeo: {
      repo: {
        listSeoArticles: async () => ({ rows: [], total: 0 }),
        updateSeoArticle: async (id) => ({ id, title: 'T', slug: 't', status: 'published', summary: '', category_name: 'World', views_count: 0, updated_at: '2026-01-01T00:00:00Z' }),
        getAnalytics: async () => ({ overview: {}, topArticles: [], topQueries: [], topClickedArticles: [], categoryStats: [], recentSearchClicks: [] }),
      },
    },
  });

  await withServer(app, async (b) => {
    // Super Admin only: /admin/users, /admin/logs, /admin/settings
    assert.equal((await send(b, 'GET', '/admin/users', 1)).status, 200);
    for (const uid of [2, 3, 4, 5]) assert.equal((await send(b, 'GET', '/admin/users', uid)).status, 403);
    assert.equal((await send(b, 'PATCH', '/admin/users/1/status', 1, { isActive: false })).status, 409);
    assert.equal((await send(b, 'PATCH', '/admin/users/5/status', 1, { isActive: false })).status, 200);
    assert.equal((await send(b, 'GET', '/admin/logs', 1)).status, 200);
    assert.equal((await send(b, 'GET', '/admin/settings', 3)).status, 403);
    assert.equal((await send(b, 'PUT', '/admin/settings', 1, { site_name: 'Portal' })).status, 200);

    // Content Manager (admin, editor): /admin/taxonomy
    assert.equal((await send(b, 'GET', '/admin/taxonomy/categories', 1)).status, 200);
    assert.equal((await send(b, 'GET', '/admin/taxonomy/categories', 2)).status, 200);
    for (const uid of [3, 4, 5]) assert.equal((await send(b, 'GET', '/admin/taxonomy/categories', uid)).status, 403);

    // Moderator (admin, moderator): /admin/moderation
    assert.equal((await send(b, 'GET', '/admin/moderation/reports', 1)).status, 200);
    assert.equal((await send(b, 'GET', '/admin/moderation/reports', 3)).status, 200);
    for (const uid of [2, 4, 5]) assert.equal((await send(b, 'GET', '/admin/moderation/reports', uid)).status, 403);
    assert.equal((await send(b, 'PATCH', '/admin/moderation/reports/1', 3, { status: 'resolved', hideTarget: true })).status, 200);
    assert.equal((await send(b, 'POST', '/admin/moderation/users/5/spam-action', 3, { action: 'suspend' })).status, 200);

    // Data & SEO Specialist (admin, seo): /admin/seo, /admin/analytics
    assert.equal((await send(b, 'GET', '/admin/seo/articles', 1)).status, 200);
    assert.equal((await send(b, 'GET', '/admin/seo/articles', 4)).status, 200);
    for (const uid of [2, 3, 5]) assert.equal((await send(b, 'GET', '/admin/seo/articles', uid)).status, 403);
    assert.equal((await send(b, 'GET', '/admin/analytics', 4)).status, 200);
    assert.equal((await send(b, 'PATCH', '/admin/seo/articles/1', 4, { ogImageUrl: 'http://bad.test/a.png' })).status, 422);
    assert.equal((await send(b, 'PATCH', '/admin/seo/articles/1', 4, { metaTitle: 'SEO Title', seoKeywords: 'news, world' })).status, 200);
  });
});

test('SQL against real DB: filters, search_click_log, likes, user tags, profile, and all 4 admin repos', { skip: !testDb }, async () => {
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: testDb });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await c.end();
  await migrate(testDb);
  initPool({ databaseUrl: () => testDb, db: { max: 2, connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000, statementTimeoutMs: 5000 } });
  try {
    await query(`INSERT INTO categories (name, slug) VALUES ('Science', 'science'), ('World', 'world')`);
    await query(`INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('u1@x.io', 'h', 'Reader One', now()), ('mod@x.io', 'h', 'Mod', now())`);
    await query(`INSERT INTO user_roles (user_id, role_id) SELECT 1, id FROM roles WHERE name = 'reader'`);
    await query(`INSERT INTO user_roles (user_id, role_id) SELECT 2, id FROM roles WHERE name = 'moderator'`);
    await query(
      `INSERT INTO documents (title, slug, summary, content, category_id, author_name, status, views_count, published_at) VALUES
       ('Solar Breakthrough', 'solar-breakthrough', 'Clean energy', 'Solar panels reach record efficiency.', 1, 'Alice', 'published', 120, '2026-05-10T10:00:00Z'),
       ('Global Summit', 'global-summit', 'Diplomacy talks', 'Leaders meet in Geneva.', 2, 'Bob', 'published', 45, '2026-05-01T10:00:00Z')`,
    );

    // User tagging on article + tag filter + date filter + sort
    await assert.rejects(engagementRepo.addUserTag({ documentId: 1, userId: 1, tagName: '!!!' }), { status: 422 });
    const added = await engagementRepo.addUserTag({ documentId: 1, userId: 1, tagName: 'Solar' });
    assert.deepEqual(added.tags, ['Solar']);
    assert.deepEqual(added.myUserTags, ['Solar']);
    assert.equal((await tagsRepo.listWithCounts()).length, 1);

    const byTag = await articlesRepo.listPublished({ page: 1, pageSize: 20, tag: 'solar' });
    assert.equal(byTag.total, 1);
    assert.equal(byTag.rows[0].slug, 'solar-breakthrough');

    const byDate = await articlesRepo.listPublished({ page: 1, pageSize: 20, from: '2026-05-05', to: '2026-05-10' });
    assert.equal(byDate.total, 1);

    const byViews = await articlesRepo.listPublished({ page: 1, pageSize: 20, sort: 'views' });
    assert.equal(byViews.rows[0].slug, 'solar-breakthrough');

    // Likes
    assert.deepEqual(await engagementRepo.upsertLike({ documentId: 1, userId: 1 }), { likeCount: 1, likedByMe: true });
    assert.deepEqual(await engagementRepo.deleteLike({ documentId: 1, userId: 1 }), { likeCount: 0, likedByMe: false });

    // Search click log
    const docId = await searchClicksRepo.findPublishedDocId({ slug: 'solar-breakthrough' });
    const click = await searchClicksRepo.insertSearchClick({ userId: 1, queryString: 'solar', clickedDocId: docId });
    assert.equal(Number(click.clicked_doc_id), 1);

    // Profile management + user_tags
    const prof = await usersRepo.updateProfile(1, { displayName: 'Reader Updated', bio: 'Science fan', tags: ['Solar', 'Climate'] });
    assert.equal(prof.user.displayName, 'Reader Updated');
    assert.equal(prof.user.bio, 'Science fan');
    assert.equal(prof.tags.length, 2);

    // Admin repos
    assert.equal((await adminSystemRepo.listUsers({ page: 1, pageSize: 20 })).total, 2);
    assert.equal((await adminSystemRepo.getSettings()).settings.site_name, 'News Portal');
    const cat = await adminTaxonomyRepo.createCategory({ name: 'Tech' });
    assert.equal(cat.slug, 'tech');
    assert.equal(await adminTaxonomyRepo.deleteCategory(cat.id), true);

    await engagementRepo.insertComment({ documentId: 1, userId: 1, body: 'Spam comment' });
    await engagementRepo.insertReport({ reporterId: 2, commentId: 1, reason: 'spam' });
    assert.equal((await adminModerationRepo.listReports({ page: 1, pageSize: 20, status: 'open' })).total, 1);
    await adminModerationRepo.resolveReport(1, { status: 'resolved', hideTarget: true, resolvedBy: 2 });
    assert.equal((await adminModerationRepo.listComments({ page: 1, pageSize: 20, status: 'hidden' })).total, 1);

    const updatedSeo = await adminSeoRepo.updateSeoArticle(1, { metaTitle: 'Solar SEO', seoKeywords: 'solar, clean energy', imageAlt: 'Solar farm' });
    assert.equal(updatedSeo.category_name, 'Science');
    const analytics = await adminSeoRepo.getAnalytics();
    assert.equal(analytics.overview.totalSearchClicks, 1);
    assert.equal(analytics.topQueries[0].queryString, 'solar');
  } finally {
    await closePool();
  }
});
