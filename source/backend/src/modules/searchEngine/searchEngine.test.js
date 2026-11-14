import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../../app.js';
import { closePool, initPool, query } from '../../db.js';
import { migrate } from '../../../db/migrate.js';
import { signAccess } from '../auth/tokens.js';
import * as searchEngineRepo from './repo.js';
import * as searchClicksRepo from '../searchClicks/repo.js';
import {
  computeHeapsLaw,
  computeZipfStats,
  extractEntities,
  jaccardSimilarity,
  porterStem,
  processText,
  shingleFingerprint,
} from './tokenizer.js';
import {
  InvertedIndex,
  buildSkipPointers,
  decodeDeltaVByte,
  encodeDeltaVByte,
  intersectWithSkips,
} from './invertedIndex.js';
import {
  clusterResults,
  damerauLevenshtein,
  expandQueryDice,
  generateSnippet,
  parseQuery,
  suggestSpelling,
} from './queryProcessor.js';
import {
  hasExactPhrase,
  runRetrievalModel,
} from './retrievalModels.js';
import {
  averagePrecision,
  dcgAtK,
  evaluateCorpusModels,
  evaluateLiveLogs,
  f1Score,
  kendallTau,
  ndcgAtK,
  pairedSignTestPValue,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from './evaluation.js';
import {
  analyzeArticleSeo,
  buildTagCloud,
  findRelatedArticles,
  inferMissingTags,
  recommendArticles,
} from './socialAndMl.js';
import { createSearchService } from './service.js';

const seedArticles = JSON.parse(
  readFileSync(new URL('../../../db/seed/articles.json', import.meta.url), 'utf8'),
);

function buildSeedDocs() {
  return seedArticles.map((a, i) => ({
    id: i + 1,
    slug: `article-${i + 1}`,
    title: a.title,
    summary: a.content.slice(0, 220),
    content: a.content,
    category_slug: a.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    category_name: a.category,
    tags: a.tags ?? [],
    seo_keywords: (a.tags ?? []).slice(0, 3).join(', '),
    meta_title: a.title.slice(0, 65),
    meta_description: a.content.slice(0, 150),
    og_image_url: null,
    image_alt: null,
    author_name: a.author,
    published_at: a.publishedAt,
    views_count: (i * 17) % 500,
    rating_count: 1,
    rating_avg: ((i % 5) + 1).toString(),
    comment_count: i % 4,
    like_count: i % 10,
  }));
}

test('Chapter 4: Porter stemmer, stopword removal, entity extraction, and shingling', () => {
  assert.equal(porterStem('caresses'), 'caress');
  assert.equal(porterStem('ponies'), 'poni');
  assert.equal(porterStem('agreed'), 'agre');
  assert.equal(porterStem('fished'), 'fish');
  assert.equal(porterStem('elections'), porterStem('election'));
  assert.equal(porterStem('voting'), porterStem('vote'));

  const proc = processText('The Green Party won the elections in Manchester! <script>x</script>');
  assert.ok(!proc.terms.includes('the'));
  assert.ok(!proc.terms.includes('in'));
  assert.ok(!proc.terms.includes('script'));
  assert.ok(proc.terms.includes(porterStem('elections')));
  assert.ok(proc.bigrams.length >= 2);

  const entities = extractEntities('Barack Obama met President Joe Biden in New York City.');
  assert.ok(entities.some((e) => e.name.includes('Barack Obama')));

  const s1 = shingleFingerprint('solar panels reach record efficiency today', 3);
  const s2 = shingleFingerprint('solar panels reach record efficiency now', 3);
  const s3 = shingleFingerprint('completely different football tournament news', 3);
  assert.ok(jaccardSimilarity(s1, s2) > 0.5);
  assert.equal(jaccardSimilarity(s1, s3), 0);
});

test('Chapter 5: Delta + V-Byte round-trip compression and skip-pointer intersection', () => {
  const ids = [1, 5, 9, 18, 23, 128, 300, 1024, 50000];
  const encoded = encodeDeltaVByte(ids);
  assert.ok(encoded.byteLength < ids.length * 4);
  assert.deepEqual(decodeDeltaVByte(encoded), ids);
  assert.deepEqual(decodeDeltaVByte(encodeDeltaVByte([])), []);

  const listA = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 25, 40].map((docId) => ({ docId }));
  const listB = [2, 3, 8, 11, 16, 19, 25, 30, 40, 50].map((docId) => ({ docId }));
  const inter = intersectWithSkips(listA, listB, buildSkipPointers(listA), buildSkipPointers(listB));
  assert.deepEqual(inter.map((x) => x.docId), [3, 11, 19, 25, 40]);
});

test('Chapter 4 & 5: InvertedIndex over 104 Wikinews articles builds Zipf, Heap, V-Byte stats, and term inspection', () => {
  const docs = buildSeedDocs();
  const index = new InvertedIndex().build(docs);
  assert.equal(index.docCount, 104);
  assert.ok(index.vocabSize > 1000);

  const stats = index.getStats();
  assert.ok(stats.compression.compressionRatio > 1.5);
  assert.ok(stats.compression.spaceSavingsPct > 30);
  assert.equal(stats.zipf.topTerms.length, 25);
  assert.ok(stats.zipf.topTerms[0].frequency >= stats.zipf.topTerms[1].frequency);
  assert.ok(stats.heaps.fittedBeta > 0.2 && stats.heaps.fittedBeta < 0.9);

  const inspected = index.inspectTerm('elections');
  assert.equal(inspected.stemmedTerm, porterStem('elections'));
  assert.ok(inspected.df > 0);
  assert.ok(inspected.postings.length > 0);
  assert.ok(inspected.compression.vbyteHex.length > 0);
});

test('Chapter 6 & 7 & 12: Query parsing, spell correction, Dice expansion, snippets, clustering & 5 retrieval models', () => {
  const docs = buildSeedDocs();
  const index = new InvertedIndex().build(docs);

  // Spell checking (Damerau-Levenshtein + Noisy Channel)
  assert.equal(damerauLevenshtein('brimingham', 'birmingham'), 1);
  assert.equal(damerauLevenshtein('extenssions', 'extensions'), 1);
  const typo = suggestSpelling('manchesterr electon', index);
  assert.ok(typo);
  assert.equal(typo.correctedQuery, 'manchester election');

  // Retrieval accuracy on real Wikinews stories
  const qPope = parseQuery('Pope Leo Africa');
  const bm25Pope = runRetrievalModel({ model: 'bm25', parsedQuery: qPope, index });
  assert.ok(bm25Pope.results.length > 0);
  assert.match(bm25Pope.results[0].doc.title, /Pope Leo XIV/);

  const qPhrase = parseQuery('"World Passport"');
  assert.ok(hasExactPhrase(bm25Pope.results[0].docId, qPhrase.phrases[0], index) === false);
  const bm25Phrase = runRetrievalModel({ model: 'bm25', parsedQuery: qPhrase, index });
  assert.ok(bm25Phrase.results.length >= 1);
  assert.match(bm25Phrase.results[0].doc.title, /World Passports/);

  // Compare TF-IDF, Query Likelihood, Boolean, Hybrid, and PRF
  const qGreen = parseQuery('Green Party Manchester');
  for (const model of ['bm25', 'tfidf', 'ql', 'boolean', 'hybrid']) {
    const res = runRetrievalModel({ model, parsedQuery: qGreen, index });
    assert.ok(res.results.length > 0, `${model} returned results`);
    assert.match(res.results[0].doc.title, /Manchester/i, `${model} ranked Manchester #1`);
  }

  const prfOut = runRetrievalModel({ model: 'bm25', parsedQuery: qGreen, index, usePrf: true });
  assert.ok(prfOut.prfTerms.length > 0);

  // Boolean NOT exclusion
  const qNot = parseQuery('Obama NOT Biden');
  const boolNot = runRetrievalModel({ model: 'boolean', parsedQuery: qNot, index });
  for (const r of boolNot.results) {
    assert.ok(!r.doc.termTf.has(porterStem('biden')));
  }

  // Dice expansion, highlighted snippet segments, and K-Means clustering
  const expansions = expandQueryDice(qGreen.positiveTerms, index, 5);
  assert.ok(expansions.length > 0);

  const topDoc = bm25Pope.results[0].doc;
  const snippet = generateSnippet(topDoc, qPope.rawWords, qPope.positiveTerms);
  assert.ok(snippet.segments.some((s) => s.match));

  const qBroad = parseQuery('government');
  const broadRes = runRetrievalModel({ model: 'bm25', parsedQuery: qBroad, index }).results;
  const clusters = clusterResults(broadRes, index, 4);
  assert.ok(clusters.length >= 2);
});

test('Chapter 9: Evaluation metrics (P@K, R@K, F1, MAP, MRR, NDCG, Kendall tau, Sign test) & benchmark', () => {
  const relevant = new Set([1, 3, 6]);
  const grades = new Map([[1, 2], [3, 1], [6, 2]]);
  const ranked = [1, 2, 3, 4, 5];

  assert.equal(precisionAtK(ranked, relevant, 5), 0.4);
  assert.equal(recallAtK(ranked, relevant, 5), 2 / 3);
  assert.ok(Math.abs(f1Score(0.4, 2 / 3) - 0.5) < 1e-9);
  assert.equal(reciprocalRank([2, 3, 1], relevant), 0.5);
  assert.ok(Math.abs(averagePrecision([1, 2, 3, 6], relevant) - (1 + 2 / 3 + 3 / 4) / 3) < 1e-9);
  assert.equal(ndcgAtK([1, 6, 3], grades, 3), 1);
  assert.ok(dcgAtK([3, 1, 6], grades, 3) < dcgAtK([1, 6, 3], grades, 3));
  assert.equal(kendallTau([1, 2, 3], [1, 2, 3]), 1);
  assert.equal(kendallTau([1, 2, 3], [3, 2, 1]), -1);
  assert.ok(pairedSignTestPValue([0.1, 0.2, 0.1, 0.2, 0.1, 0.2], [0.8, 0.9, 0.8, 0.9, 0.8, 0.9]) < 0.05);

  const index = new InvertedIndex().build(buildSeedDocs());
  const bench = evaluateCorpusModels(index);
  assert.ok(bench.queryCount >= 5);
  assert.equal(bench.models.length, 5);
  for (const m of bench.models) {
    assert.ok(m.map >= 0 && m.map <= 1);
    assert.ok(m.ndcgAt10 >= 0 && m.ndcgAt10 <= 1);
  }

  const live = evaluateLiveLogs({
    queryLogs: [
      { id: 1, total_results: 5, latency_ms: 2.5 },
      { id: 2, total_results: 0, latency_ms: 1.5 },
    ],
    clickLogs: [
      { id: 1, query_log_id: 1, rank_position: 2 },
    ],
  });
  assert.equal(live.ctr, 0.5);
  assert.equal(live.zeroHitRate, 0.5);
  assert.equal(live.clickMrr, 0.5);
});

test('Chapter 8, 10, 11: Inferring missing tags, tag cloud, related articles, collaborative filtering & SEO audit', () => {
  const docs = buildSeedDocs();
  const index = new InvertedIndex().build(docs);

  const inferred = inferMissingTags(docs[0], index, 5);
  assert.equal(inferred.length, 5);

  const cloud = buildTagCloud([
    { id: 1, slug: 'africa', name: 'Africa', article_count: 10 },
    { id: 2, slug: 'solar', name: 'Solar', article_count: 2 },
  ]);
  assert.equal(cloud[0].weight, 5);
  assert.equal(cloud[1].weight, 1);

  const related = findRelatedArticles(1, index, 4);
  assert.ok(related.length > 0);

  const recs = recommendArticles({
    userId: 10,
    userTagNames: ['Africa'],
    allRatings: [
      { user_id: 10, document_id: 1, score: 5 },
      { user_id: 10, document_id: 2, score: 2 },
      { user_id: 20, document_id: 1, score: 5 },
      { user_id: 20, document_id: 2, score: 2 },
      { user_id: 20, document_id: 3, score: 5 },
    ],
    index,
    limit: 5,
  });
  assert.equal(recs.length, 5);

  const seo = analyzeArticleSeo({
    title: 'Solar Breakthrough in Europe',
    meta_title: 'Solar Breakthrough in Europe Reaches Record Grid Output',
    meta_description: 'European solar engineers have achieved a major grid milestone using next-generation photovoltaic panels across southern power stations.',
    seo_keywords: 'solar, energy',
    og_image_url: 'https://cdn.example.com/solar.jpg',
    image_alt: 'Solar panels array',
    content: 'solar energy '.repeat(100),
  });
  assert.equal(seo.score, 100);
  assert.equal(seo.grade, 'A');
  const weakSeo = analyzeArticleSeo({ title: 'Short', content: 'tiny' });
  assert.ok(weakSeo.score < 50);
});

test('HTTP routes: /api/search, suggest, tag-cloud, recommendations, related, admin lab RBAC & feeds', async () => {
  const docs = buildSeedDocs().slice(0, 20);
  const service = createSearchService({
    loadPublishedDocuments: async () => docs,
    insertSearchQueryLog: async () => ({ id: 42 }),
    loadEvaluationLogs: async () => ({ queryLogs: [], clickLogs: [] }),
    loadRecommendationContext: async () => ({ userTagNames: ['Africa'], likedDocIds: [], allRatings: [] }),
    loadTagsWithCounts: async () => [{ id: 1, slug: 'africa', name: 'Africa', article_count: 3 }],
  });

  const jwt = { secret: 's'.repeat(40), issuer: 'iss', audience: 'aud', accessTtl: '15m' };
  const V = new Date('2026-01-01');
  const users = {
    1: { id: 1, email: 'ad@x.test', display_name: 'Ad', is_active: true, roles: ['admin'], email_verified_at: V },
    2: { id: 2, email: 'ed@x.test', display_name: 'Ed', is_active: true, roles: ['editor'], email_verified_at: V },
    4: { id: 4, email: 'se@x.test', display_name: 'Se', is_active: true, roles: ['seo'], email_verified_at: V },
    5: { id: 5, email: 're@x.test', display_name: 'Re', is_active: true, roles: ['reader'], email_verified_at: V },
  };
  const auth = { findUserById: async (id) => users[id] ?? null };
  const app = createApp({
    jwt,
    auth: { repo: auth },
    searchEngine: { service },
    feeds: { loadFeedDocs: async () => ({ docs: docs.slice(0, 3), categories: [{ slug: 'politics' }] }) },
  });

  const server = app.listen(0);
  try {
    const b = `http://127.0.0.1:${server.address().port}`;
    const hdr = async (uid) => ({ authorization: `Bearer ${await signAccess(uid, jwt)}` });

    const sRes = await fetch(`${b}/api/search?q=pope+africa&model=bm25&explain=1`);
    assert.equal(sRes.status, 200);
    const sJson = await sRes.json();
    assert.ok(sJson.items.length > 0);
    assert.equal(sJson.searchMeta.queryLogId, 42);
    assert.ok(sJson.items[0].scoreBreakdown);

    assert.equal((await fetch(`${b}/api/search/suggest?q=pope`)).status, 200);
    assert.equal((await fetch(`${b}/api/search/tag-cloud`)).status, 200);
    assert.equal((await fetch(`${b}/api/search/recommendations`)).status, 200);
    assert.equal((await fetch(`${b}/api/articles/article-1/related`)).status, 200);
    assert.equal((await fetch(`${b}/api/articles/article-1/suggested-tags`)).status, 200);

    // RBAC on admin Search Engine Lab
    assert.equal((await fetch(`${b}/api/admin/search-engine/stats`)).status, 401);
    assert.equal((await fetch(`${b}/api/admin/search-engine/stats`, { headers: await hdr(5) })).status, 403);
    assert.equal((await fetch(`${b}/api/admin/search-engine/stats`, { headers: await hdr(2) })).status, 403);
    assert.equal((await fetch(`${b}/api/admin/search-engine/stats`, { headers: await hdr(4) })).status, 200);
    assert.equal((await fetch(`${b}/api/admin/search-engine/evaluate`, { headers: await hdr(1) })).status, 200);
    assert.equal((await fetch(`${b}/api/admin/search-engine/inspect?term=pope`, { headers: await hdr(4) })).status, 200);
    assert.equal((await fetch(`${b}/api/admin/seo/audit/1`, { headers: await hdr(2) })).status, 200);

    // Technical SEO endpoints
    const robots = await fetch(`${b}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Sitemap:/);
    const sitemap = await fetch(`${b}/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    assert.match(await sitemap.text(), /<urlset/);
    const feed = await fetch(`${b}/api/feed.xml`);
    assert.equal(feed.status, 200);
    assert.match(await feed.text(), /<rss version="2.0">/);

    // Rebuild index endpoint (admin/seo only)
    const rebuild = await fetch(`${b}/api/admin/search-engine/rebuild`, { method: 'POST', headers: await hdr(4) });
    assert.equal(rebuild.status, 200);
    assert.equal((await rebuild.json()).docCount, 20);
  } finally {
    server.close();
  }
});

test('Regression: pure Boolean negation, HTML/late-match snippets, TF-IDF cosine bounds & PRF, and strict live CTR', () => {
  // 1. parseQuery must not treat negated term as positive term
  const neg1 = parseQuery('NOT obama');
  assert.deepEqual(neg1.positiveTerms, []);
  assert.deepEqual(neg1.excludedTerms, [porterStem('obama')]);

  const neg2 = parseQuery('-obama');
  assert.deepEqual(neg2.positiveTerms, []);
  assert.deepEqual(neg2.excludedTerms, [porterStem('obama')]);

  // Stopword-only lowercase query still falls back cleanly
  const stopOnly = parseQuery('to be or not');
  assert.equal(stopOnly.positiveTerms.length, 4);

  const syntheticDocs = [
    {
      id: 1,
      slug: 'd1',
      title: 'Manchester',
      summary: 'Summary',
      content: '<p>Breaking news from <b>Manchester</b> today.</p>',
      tags: [],
    },
    {
      id: 2,
      slug: 'd2',
      title: 'Background',
      summary: 'Summary',
      content: 'Introductory administrative discussion covering historical municipal procedures and committees across districts before mentioning manchester results.',
      tags: [],
    },
    {
      id: 3,
      slug: 'd3',
      title: 'Obama speech',
      summary: 'Summary',
      content: 'Barack Obama spoke about Manchester infrastructure investments and election turnout.',
      tags: [],
    },
  ];
  const idx = new InvertedIndex().build(syntheticDocs);

  // 2. Pure negation returns non-excluded docs
  const notObama = runRetrievalModel({ model: 'boolean', parsedQuery: neg1, index: idx });
  assert.deepEqual(notObama.results.map((r) => r.docId).sort(), [1, 2]);

  // 3. suggestSpelling preserves Boolean AND/OR/NOT and -negation
  const spell = suggestSpelling('Manchesterr AND -obamaa', idx);
  assert.ok(spell);
  assert.equal(spell.correctedQuery, 'manchester AND -obama');

  // 4. generateSnippet strips HTML before offsetting and anchors late matches inside maxLen
  const htmlSnip = generateSnippet(idx.documents.get(1), ['manchester'], [porterStem('manchester')]);
  assert.ok(!htmlSnip.text.includes('<b>'));
  assert.equal(htmlSnip.segments.find((s) => s.match)?.text, 'Manchester');

  const lateSnip = generateSnippet(idx.documents.get(2), ['manchester'], [porterStem('manchester')], 100);
  assert.ok(lateSnip.segments.some((s) => s.match), 'late match must not be clipped out');

  // 5. TF-IDF cosine score is strictly in (0, 1] and PRF influences QL & TF-IDF
  const tfidfRes = runRetrievalModel({ model: 'tfidf', parsedQuery: parseQuery('Manchester'), index: idx });
  for (const r of tfidfRes.results) {
    assert.ok(r.score > 0 && r.score <= 1, `TF-IDF cosine out of bounds: ${r.score}`);
  }

  const seedIdx = new InvertedIndex().build(buildSeedDocs());
  const qlNoPrf = runRetrievalModel({ model: 'ql', parsedQuery: parseQuery('Manchester'), index: seedIdx, usePrf: false });
  const qlPrf = runRetrievalModel({ model: 'ql', parsedQuery: parseQuery('Manchester'), index: seedIdx, usePrf: true });
  assert.ok(qlPrf.prfTerms.length > 0);
  assert.notEqual(qlNoPrf.results[0].score, qlPrf.results[0].score);

  const tfidfNoPrf = runRetrievalModel({ model: 'tfidf', parsedQuery: parseQuery('Manchester'), index: seedIdx, usePrf: false });
  const tfidfPrf = runRetrievalModel({ model: 'tfidf', parsedQuery: parseQuery('Manchester'), index: seedIdx, usePrf: true });
  assert.notEqual(tfidfNoPrf.results[0].score, tfidfPrf.results[0].score);

  // 6. Live CTR must be 0 when none of the evaluated queries were clicked
  const liveNoMatch = evaluateLiveLogs({
    queryLogs: [
      { id: 10, total_results: 4, latency_ms: 1.2 },
      { id: 11, total_results: 2, latency_ms: 0.8 },
    ],
    clickLogs: [
      { id: 1, query_log_id: 1, rank_position: 1 },
      { id: 2, query_log_id: null, rank_position: null },
    ],
  });
  assert.equal(liveNoMatch.ctr, 0);
});

const testDb = process.env.TEST_DATABASE_URL;
test('SQL against real DB: migration 011, search_query_log, rank-aware search_click_log & repo loaders', { skip: !testDb }, async () => {
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: testDb });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await c.end();
  await migrate(testDb);
  initPool({ databaseUrl: () => testDb, db: { max: 2, connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000, statementTimeoutMs: 5000 } });
  try {
    await query(`INSERT INTO categories (name, slug) VALUES ('World', 'world')`);
    await query(`INSERT INTO tags (name, slug) VALUES ('Election', 'election')`);
    await query(
      `INSERT INTO documents (title, slug, summary, content, category_id, author_name, status, published_at) VALUES
       ('Manchester Election', 'manchester-election', 'By-election summary', 'Green Party wins Manchester by-election.', 1, 'Alice', 'published', now())`,
    );
    await query(`INSERT INTO document_tags (document_id, tag_id) VALUES (1, 1)`);

    const docs = await searchEngineRepo.loadPublishedDocuments();
    assert.equal(docs.length, 1);
    assert.deepEqual(docs[0].tags, ['Election']);

    const qLog = await searchEngineRepo.insertSearchQueryLog({
      queryString: 'manchester',
      model: 'bm25',
      filters: { category: 'world' },
      resultDocIds: [1],
      totalResults: 1,
      latencyMs: 1.5,
    });
    assert.ok(qLog.id);

    const click = await searchClicksRepo.insertSearchClick({
      queryString: 'manchester',
      clickedDocId: 1,
      queryLogId: Number(qLog.id),
      rankPosition: 1,
      retrievalModel: 'bm25',
    });
    assert.equal(Number(click.query_log_id), Number(qLog.id));
    assert.equal(Number(click.rank_position), 1);

    const logs = await searchEngineRepo.loadEvaluationLogs(50);
    const live = evaluateLiveLogs(logs);
    assert.equal(live.ctr, 1);
    assert.equal(live.clickMrr, 1);
  } finally {
    await closePool();
  }
});
