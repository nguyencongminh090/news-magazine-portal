import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from './render.jsx';
import { article, mockFetch } from './mockFetch.js';
import { SearchPage } from '../pages/SearchPage.jsx';
import { ArticlePage } from '../pages/ArticlePage.jsx';
import { AdminSearchEnginePage } from '../pages/AdminSearchEnginePage.jsx';
import { AdminSeoPage } from '../pages/AdminSeoPage.jsx';

afterEach(() => vi.unstubAllGlobals());

test('SearchPage renders searchMeta (telemetry, spell suggestion, Dice expansions, clusters, highlighted snippets)', async () => {
  const fetchMock = mockFetch({
    '/api/articles': {
      items: [
        article(1, {
          searchScore: 4.82,
          snippetSegments: [
            { text: 'The ', match: false },
            { text: 'Manchester', match: true },
            { text: ' by-election.', match: false },
          ],
          scoreBreakdown: {
            model: 'bm25',
            fieldHits: ['title', 'content'],
          },
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      searchMeta: {
        latencyMs: 1.4,
        model: 'bm25',
        sort: 'relevance',
        queryLogId: 77,
        suggestion: { correctedQuery: 'manchester election', corrections: [] },
        expansions: [{ stem: 'parti', term: 'party', diceScore: 0.65, coOccurrences: 4 }],
        prfTerms: [{ stem: 'green', term: 'green', weight: 0.4 }],
        clusters: [{ id: 1, label: 'election · party', count: 1, articles: [{ slug: 'a-1', title: 'Title 1' }] }],
      },
    },
    '/api/search-clicks': { id: 10 },
  });

  const { container } = renderWithRouter(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
      <Route path="/articles/:slug" element={<p>Detail</p>} />
    </Routes>,
    { route: '/search?q=manchesterr' },
  );

  expect(await screen.findByText('Score 4.82')).toBeInTheDocument();
  expect(container.querySelector('mark.hl')).toHaveTextContent('Manchester');
  expect(screen.getByRole('button', { name: 'manchester election' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+ party' })).toBeInTheDocument();
  expect(screen.getByText(/Topic clusters/)).toBeInTheDocument();

  await userEvent.click(container.querySelector('.results a[href="/articles/a-1"]'));
  await waitFor(() => {
    const clickCall = fetchMock.mock.calls.find(([u]) => u === '/api/search-clicks');
    expect(clickCall).toBeTruthy();
    expect(JSON.parse(clickCall[1].body)).toEqual({
      queryString: 'manchesterr',
      slug: 'a-1',
      queryLogId: 77,
      rankPosition: 1,
      retrievalModel: 'bm25',
    });
  });
});

test('SearchPage empty state loads Tag Cloud and Recommendations only on click', async () => {
  mockFetch({
    '/api/search/tag-cloud': { items: [{ id: 1, slug: 'africa', name: 'Africa', count: 6, weight: 5 }] },
    '/api/search/recommendations': { items: [article(9, { recommendationReason: 'Popular across the portal' })] },
  });

  renderWithRouter(
    <Routes><Route path="/search" element={<SearchPage />} /></Routes>,
    { route: '/search' },
  );

  await userEvent.click(screen.getByRole('button', { name: /Explore Tag Cloud/i }));
  expect(await screen.findByRole('link', { name: 'Africa (6)' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Title 9' })).toBeInTheDocument();
});

test('AdminSearchEnginePage displays index stats, Chapter 9 benchmark, and inspects postings', async () => {
  const request = vi.fn(async (path) => {
    if (path.includes('/stats')) {
      return {
        docCount: 104,
        vocabSize: 4200,
        totalTokens: 32000,
        avgDocLength: 307.7,
        compression: { rawInt32Bytes: 80000, compressedBytes: 24000, compressionRatio: 3.33, spaceSavingsPct: 70.0 },
        zipf: { topTerms: [{ rank: 1, term: 'said', frequency: 410, rankTimesFreq: 410, zipfPredicted: 410 }] },
        heaps: { fittedK: 18.2, fittedBeta: 0.54, points: [{ docs: 104, tokensN: 32000, vocabularyV: 4200, heapsPredicted: 4150 }] },
        nearDuplicates: [],
      };
    }
    if (path.includes('/evaluate')) {
      return {
        offline: {
          queryCount: 12,
          models: [
            { id: 'tfidf', label: 'TF-IDF (Vector Space)', map: 0.61, mrr: 0.72, ndcgAt5: 0.65, ndcgAt10: 0.69, pAt5: 0.5, recallAt10: 0.78, avgLatencyMs: 0.8, kendallTauVsBaseline: 1, pValueVsBaseline: 1, significantVsBaseline: false },
            { id: 'bm25', label: 'Okapi BM25 (Fielded)', map: 0.74, mrr: 0.85, ndcgAt5: 0.79, ndcgAt10: 0.82, pAt5: 0.6, recallAt10: 0.88, avgLatencyMs: 0.6, kendallTauVsBaseline: 0.72, pValueVsBaseline: 0.031, significantVsBaseline: true },
          ],
        },
        live: { totalQueries: 10, totalClicks: 6, ctr: 0.6, clickMrr: 0.75, zeroHitRate: 0.1, p95LatencyMs: 2.4 },
      };
    }
    if (path.includes('/inspect')) {
      return {
        rawTerm: 'elections',
        stemmedTerm: 'elect',
        df: 5,
        cf: 14,
        idf: 2.95,
        rawVariants: ['election', 'elections'],
        skipCount: 1,
        compression: { rawBytes: 20, vbyteBytes: 5, deltas: [2, 3, 5], vbyteHex: '82 83 85' },
        postings: [{ docId: 2, slug: 'a-2', title: 'Manchester Election', tf: 4, fieldTf: { title: 1, summary: 0, content: 3, tags: 0, seoKeywords: 0 }, positions: [3, 14] }],
      };
    }
    return {};
  });

  renderWithRouter(
    <Routes><Route path="/admin/search-engine" element={<AdminSearchEnginePage />} /></Routes>,
    { route: '/admin/search-engine', auth: { user: { id: 1, roles: ['seo'] }, request } },
  );

  expect((await screen.findAllByText('104')).length).toBeGreaterThan(0);
  expect(await screen.findByText('Okapi BM25 (Fielded)')).toBeInTheDocument();
  expect(screen.getByText('60.0%')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Inspect Postings' }));
  expect(await screen.findByText('Manchester Election')).toBeInTheDocument();
  expect(screen.getByText('82 83 85')).toBeInTheDocument();
});

test('AdminSeoPage triggers On-Page SEO Audit', async () => {
  const request = vi.fn(async (path) => {
    if (path.includes('/seo/audit/')) {
      return {
        id: 1,
        slug: 'a-1',
        title: 'Story',
        score: 85,
        grade: 'A',
        checks: [{ id: 'meta_title', label: 'Meta title length (30–65 chars)', passed: true, points: 15, maxPoints: 15, detail: '45 chars' }],
        suggestedKeywords: ['solar', 'energy'],
        entities: [{ name: 'Europe', count: 2 }],
      };
    }
    return {
      items: [{ id: 1, title: 'Story', slug: 'a-1', status: 'published', summary: 'Sum', metaTitle: '', metaDescription: '', ogImageUrl: '', imageAlt: '', seoKeywords: '' }],
      page: 1,
      pageSize: 20,
      total: 1,
    };
  });

  renderWithRouter(
    <Routes><Route path="/admin/seo" element={<AdminSeoPage />} /></Routes>,
    { route: '/admin/seo', auth: { user: { id: 1, roles: ['seo'] }, request } },
  );

  await userEvent.click(await screen.findByRole('button', { name: 'Audit SEO' }));
  expect(await screen.findByText('Score: 85/100 (Grade A)')).toBeInTheDocument();
  expect(screen.getByText('solar, energy')).toBeInTheDocument();
});

test('SearchPage preserves sort=latest when user switches away from Relevance on a keyword query', async () => {
  const fetchMock = mockFetch({
    '/api/articles': { items: [article(1)], page: 1, pageSize: 20, total: 1 },
  });

  renderWithRouter(
    <Routes><Route path="/search" element={<SearchPage />} /></Routes>,
    { route: '/search?q=solar' },
  );

  await screen.findByText('Title 1');
  await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'latest');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

  await waitFor(() => {
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes('q=solar') && u.includes('sort=latest'))).toBe(true);
  });
});

test('ArticlePage renders TF-IDF related articles and loads suggested tags on click', async () => {
  mockFetch({
    '/api/articles/a-1/comments': { items: [], total: 0 },
    '/api/articles/a-1/related': { items: [article(2, { title: 'Related Wind Story' })] },
    '/api/articles/a-1/suggested-tags': {
      tags: [{ tag: 'Energy', stem: 'energi', score: 2.1 }],
      entities: [{ name: 'European Union', count: 2 }],
    },
    '/api/articles/a-1': article(1, { body: 'Solar story body', tags: ['Solar'], myUserTags: [] }),
  });

  const request = vi.fn(async (path, init) => {
    if (path.endsWith('/tags') && init?.method === 'POST') return { tags: ['Solar', 'Energy'], myUserTags: ['Energy'] };
    return { tags: ['Solar'], myUserTags: [], engagement: { myRating: null }, likes: { count: 0, likedByMe: false } };
  });

  renderWithRouter(
    <Routes><Route path="/articles/:slug" element={<ArticlePage />} /></Routes>,
    { route: '/articles/a-1', auth: { user: { id: 5, emailVerified: true, roles: ['reader'] }, request } },
  );

  expect(await screen.findByRole('heading', { name: 'Related Articles' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Related Wind Story' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Suggest tags' }));
  const chip = await screen.findByRole('button', { name: '+ Energy' });
  expect(screen.getByText(/Key entities: European Union/)).toBeInTheDocument();

  await userEvent.click(chip);
  expect(await screen.findByRole('link', { name: 'Energy' })).toBeInTheDocument();
});
