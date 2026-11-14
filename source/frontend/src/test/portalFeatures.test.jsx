import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from './render.jsx';
import { article, mockFetch } from './mockFetch.js';
import { SearchPage } from '../pages/SearchPage.jsx';
import { ArticlePage } from '../pages/ArticlePage.jsx';
import { AuthPage } from '../pages/AuthPage.jsx';
import { PublicLayout } from '../layouts/PublicLayout.jsx';
import { ProfilePage } from '../pages/ProfilePage.jsx';
import { AdminLayout } from '../layouts/AdminLayout.jsx';
import { AdminTaxonomyPage } from '../pages/AdminTaxonomyPage.jsx';
import { AdminModerationPage } from '../pages/AdminModerationPage.jsx';
import { AdminSeoPage } from '../pages/AdminSeoPage.jsx';
import { AdminAnalyticsPage } from '../pages/AdminAnalyticsPage.jsx';
import { AdminUsersPage } from '../pages/AdminUsersPage.jsx';
import { AdminLogsPage } from '../pages/AdminLogsPage.jsx';
import { AdminSettingsPage } from '../pages/AdminSettingsPage.jsx';
import { Engagement } from '../components/Engagement.jsx';

afterEach(() => vi.unstubAllGlobals());

test('SearchPage: supports tag, category, date range, sort and logs search clicks', async () => {
  const fetchMock = mockFetch({
    '/api/articles': { items: [article(1, { viewsCount: 88 })], page: 1, pageSize: 20, total: 1 },
    '/api/search-clicks': { id: 1, clickedDocId: 1, queryString: 'solar' },
  });
  renderWithRouter(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
      <Route path="/articles/:slug" element={<p>Article target</p>} />
    </Routes>,
    { route: '/search?q=solar&tag=Energy&from=2026-01-01&to=2026-01-31&sort=views' },
  );

  expect(await screen.findByText('Title 1')).toBeInTheDocument();
  const articlesUrl = fetchMock.mock.calls[0][0];
  expect(articlesUrl).toContain('q=solar');
  expect(articlesUrl).toContain('tag=Energy');
  expect(articlesUrl).toContain('from=2026-01-01');
  expect(articlesUrl).toContain('to=2026-01-31');
  expect(articlesUrl).toContain('sort=views');
  expect(screen.getByText('88 views')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('link', { name: 'Title 1' }));
  await waitFor(() => {
    const clickCall = fetchMock.mock.calls.find(([u]) => u === '/api/search-clicks');
    expect(clickCall).toBeTruthy();
    expect(JSON.parse(clickCall[1].body)).toEqual({ queryString: 'solar', slug: 'a-1' });
  });
});

test('ArticlePage: displays hero image, viewsCount, tags and syncs myUserTags via authenticated view=0', async () => {
  mockFetch({
    '/api/articles/a-1/comments': { items: [], total: 0 },
    '/api/articles/a-1': article(1, {
      body: 'Body text',
      viewsCount: 1520,
      tags: ['Energy', 'Solar'],
      myUserTags: [],
      ogImageUrl: 'https://cdn.example/hero.jpg',
      imageAlt: 'Solar array',
      likes: { count: 4, likedByMe: false },
    }),
  });
  const request = vi.fn(async (path, init) => {
    if (path.endsWith('/tags') && init?.method === 'POST') return { tags: ['Energy', 'Solar', 'Clean'], myUserTags: ['Solar', 'Clean'] };
    if (path.includes('/tags/') && init?.method === 'DELETE') return { tags: ['Energy', 'Clean'], myUserTags: ['Clean'] };
    return {
      tags: ['Energy', 'Solar'],
      myUserTags: ['Solar'],
      engagement: { myRating: null },
      likes: { count: 4, likedByMe: false },
    };
  });

  renderWithRouter(
    <Routes><Route path="/articles/:slug" element={<ArticlePage />} /></Routes>,
    { route: '/articles/a-1', auth: { user: { id: 9, emailVerified: true, roles: ['reader'] }, request } },
  );

  expect(await screen.findByText('1,520 views')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Solar array' })).toHaveAttribute('src', 'https://cdn.example/hero.jpg');
  expect(screen.getByRole('link', { name: 'Energy' })).toHaveAttribute('href', '/search?tag=Energy');
  expect(await screen.findByRole('button', { name: 'Remove your tag Solar' })).toBeInTheDocument();

  await userEvent.type(screen.getByPlaceholderText('Add a tag (e.g. Energy)'), 'Clean');
  await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));
  expect(await screen.findByRole('link', { name: 'Clean' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Remove your tag Solar' }));
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Solar' })).not.toBeInTheDocument());
});

test('PublicLayout + AuthPage + ArticlePage enforce site_settings flags', async () => {
  mockFetch({
    '/api/categories': { items: [] },
    '/api/settings': {
      settings: {
        site_name: 'Daily Pulse',
        site_tagline: 'Custom tagline',
        allow_registration: false,
        allow_comments: false,
        articles_per_page: 10,
        maintenance_mode: true,
      },
    },
    '/api/articles/a-1/comments': { items: [], total: 0 },
    '/api/articles/a-1': article(1, { body: 'Story body' }),
  });

  const regView = renderWithRouter(
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/register" element={<AuthPage mode="register" />} />
      </Route>
    </Routes>,
    { route: '/register' },
  );

  expect(await screen.findByRole('link', { name: 'Daily Pulse' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Maintenance mode is active');
  expect(screen.getByRole('alert')).toHaveTextContent('New user registration is currently disabled');
  expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  regView.unmount();

  renderWithRouter(
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/articles/:slug" element={<ArticlePage />} />
      </Route>
    </Routes>,
    { route: '/articles/a-1', auth: { user: { id: 9, emailVerified: true, roles: ['reader'] }, request: async () => null } },
  );

  expect(await screen.findByText('Commenting is currently disabled by site administrators.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument();
});

test('Engagement: like button toggles via PUT/DELETE /like', async () => {
  mockFetch({ '/api/articles/a-1/comments': { items: [], total: 0 } });
  const request = vi.fn(async (path, init) => {
    if (path.endsWith('/like') && init?.method === 'PUT') return { likeCount: 3, likedByMe: true };
    return { engagement: { myRating: null }, likes: { count: 2, likedByMe: false } };
  });
  renderWithRouter(
    <Engagement slug="a-1" initial={{ ratingAvg: 4, ratingCount: 1, commentCount: 0, myRating: null }} initialLikes={{ count: 2, likedByMe: false }} />,
    { auth: { user: { id: 1, emailVerified: true }, request } },
  );
  const likeBtn = await screen.findByRole('button', { name: /Like \(2\)/ });
  await userEvent.click(likeBtn);
  expect(await screen.findByRole('button', { name: /Liked \(3\)/ })).toHaveAttribute('aria-pressed', 'true');
});

test('ProfilePage: loads and saves bio and interest tags', async () => {
  const request = vi.fn(async (_path, init) => {
    if (init?.method === 'PATCH') {
      return {
        user: { id: 5, email: 'r@x.test', displayName: 'Reader Two', bio: 'Updated bio', avatarUrl: null, roles: ['reader'], emailVerified: true },
        tags: [{ id: 1, slug: 'science', name: 'Science' }],
        stats: { commentsCount: 2, ratingsCount: 1, likesCount: 4 },
      };
    }
    return {
      user: { id: 5, email: 'r@x.test', displayName: 'Reader One', bio: '', avatarUrl: null, roles: ['reader'], emailVerified: true },
      tags: [],
      stats: { commentsCount: 2, ratingsCount: 1, likesCount: 4 },
    };
  });

  renderWithRouter(
    <Routes><Route path="/account/profile" element={<ProfilePage />} /></Routes>,
    { route: '/account/profile', auth: { user: { id: 5, displayName: 'Reader One', roles: ['reader'] }, request } },
  );

  const nameInput = await screen.findByLabelText('Display name');
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, 'Reader Two');
  await userEvent.type(screen.getByLabelText('Short bio'), 'Updated bio');
  await userEvent.type(screen.getByLabelText(/Topic tags/), 'Science');
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

  expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
  const patchCall = request.mock.calls.find(([, i]) => i?.method === 'PATCH');
  expect(JSON.parse(patchCall[1].body)).toEqual({
    displayName: 'Reader Two', bio: 'Updated bio', avatarUrl: null, tags: ['Science'],
  });
});

test('AdminLayout: displays role-specific navigation for all 4 staff roles', () => {
  const renderNav = (roles) =>
    renderWithRouter(
      <Routes><Route path="/admin" element={<AdminLayout />}><Route index element={<p>ok</p>} /></Route></Routes>,
      { route: '/admin', auth: { user: { id: 1, roles } } },
    );

  const r1 = renderNav(['moderator']);
  expect(screen.getByRole('link', { name: 'Moderation' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Articles' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Users & Roles' })).not.toBeInTheDocument();
  r1.unmount();

  const r2 = renderNav(['seo']);
  expect(screen.getByRole('link', { name: 'SEO Metadata' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Moderation' })).not.toBeInTheDocument();
  r2.unmount();

  const r3 = renderNav(['editor']);
  expect(screen.getByRole('link', { name: 'Articles' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Taxonomy' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  r3.unmount();

  renderNav(['admin']);
  for (const label of ['Articles', 'Taxonomy', 'Moderation', 'SEO Metadata', 'Analytics', 'Users & Roles', 'Audit Logs', 'Settings']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  }
});

test('Admin pages: taxonomy, moderation, seo, analytics, users, logs, settings render and submit actions', async () => {
  // 1. Taxonomy
  const taxReq = vi.fn(async (path, init) => {
    if (init?.method === 'POST') return { id: 2, name: 'AI', slug: 'ai', articleCount: 0 };
    if (path.includes('/categories')) return { items: [{ id: 1, name: 'World', slug: 'world', articleCount: 5 }] };
    return { items: [{ id: 1, name: 'Oil', slug: 'oil', articleCount: 3 }] };
  });
  const tView = renderWithRouter(<Routes><Route path="/admin/taxonomy" element={<AdminTaxonomyPage />} /></Routes>, {
    route: '/admin/taxonomy', auth: { user: { id: 1, roles: ['editor'] }, request: taxReq },
  });
  expect(await screen.findByText('World')).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText('New category name'), 'AI');
  await userEvent.click(screen.getByRole('button', { name: 'Add category' }));
  await waitFor(() => expect(taxReq).toHaveBeenCalledWith('/api/admin/taxonomy/categories', expect.objectContaining({ method: 'POST' })));
  tView.unmount();

  // 2. Moderation
  const modReq = vi.fn(async (_path, init) => {
    if (init?.method === 'PATCH') return { id: 10, status: 'resolved' };
    return {
      items: [{
        id: 10, reason: 'Spam link', status: 'open', createdAt: '2026-01-01T00:00:00Z',
        reporter: { displayName: 'Rea' }, targetType: 'comment',
        article: { slug: 'a-1', title: 'Story' }, comment: { id: 7, body: 'Buy now', status: 'visible' },
      }],
      page: 1, pageSize: 20, total: 1,
    };
  });
  const mView = renderWithRouter(<Routes><Route path="/admin/moderation" element={<AdminModerationPage />} /></Routes>, {
    route: '/admin/moderation', auth: { user: { id: 1, roles: ['moderator'] }, request: modReq },
  });
  expect(await screen.findByText('Spam link')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Resolve & hide' }));
  await waitFor(() => expect(modReq).toHaveBeenCalledWith('/api/admin/moderation/reports/10', expect.objectContaining({ method: 'PATCH' })));
  mView.unmount();

  // 3. SEO + Analytics
  const seoReq = vi.fn(async (_path, init) => {
    if (init?.method === 'PATCH') return { id: 1, title: 'Story', slug: 'a-1', metaTitle: 'Updated SEO' };
    return { items: [{ id: 1, title: 'Story', slug: 'a-1', status: 'published', summary: 'Sum', metaTitle: '', metaDescription: '', ogImageUrl: '', imageAlt: '', seoKeywords: '' }], page: 1, pageSize: 20, total: 1 };
  });
  const sView = renderWithRouter(<Routes><Route path="/admin/seo" element={<AdminSeoPage />} /></Routes>, {
    route: '/admin/seo', auth: { user: { id: 1, roles: ['seo'] }, request: seoReq },
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Edit SEO' }));
  await userEvent.type(screen.getByLabelText(/Meta title/), 'Updated SEO');
  await userEvent.click(screen.getByRole('button', { name: 'Save SEO' }));
  await waitFor(() => expect(seoReq).toHaveBeenCalledWith('/api/admin/seo/articles/1', expect.objectContaining({ method: 'PATCH' })));
  sView.unmount();

  const anReq = vi.fn(async () => ({
    overview: { totalArticles: 10, publishedArticles: 8, totalViews: 500, totalSearchClicks: 12, totalComments: 4, totalRatings: 3, avgRating: 4.5, totalLikes: 9 },
    topArticles: [{ id: 1, title: 'Top Story', slug: 'top', viewsCount: 300, categoryName: 'World', commentCount: 2, ratingAvg: 4.5 }],
    topQueries: [{ queryString: 'climate', clicks: 5, uniqueDocs: 2 }],
    categoryStats: [{ id: 1, slug: 'world', name: 'World', articleCount: 5, totalViews: 400 }],
    recentSearchClicks: [{ id: 1, queryString: 'climate', createdAt: '2026-01-01T00:00:00Z', article: { slug: 'top', title: 'Top Story' }, userName: null }],
  }));
  const aView = renderWithRouter(<Routes><Route path="/admin/analytics" element={<AdminAnalyticsPage />} /></Routes>, {
    route: '/admin/analytics', auth: { user: { id: 1, roles: ['seo'] }, request: anReq },
  });
  expect((await screen.findAllByText('Top Story')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('climate').length).toBeGreaterThan(0);
  aView.unmount();

  // 4. Users, Logs, Settings (Super Admin)
  const uReq = vi.fn(async (path, init) => {
    if (init?.method === 'PUT') return { id: 2, roles: ['moderator'] };
    return { items: [{ id: 2, email: 'u@x.test', displayName: 'User Two', roles: ['reader'], isActive: true, emailVerified: true, createdAt: '2026-01-01T00:00:00Z' }], page: 1, pageSize: 20, total: 1 };
  });
  const uView = renderWithRouter(<Routes><Route path="/admin/users" element={<AdminUsersPage />} /></Routes>, {
    route: '/admin/users', auth: { user: { id: 1, roles: ['admin'] }, request: uReq },
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Roles' }));
  await userEvent.click(screen.getByLabelText(/Moderator/));
  await userEvent.click(screen.getByRole('button', { name: 'Save roles' }));
  await waitFor(() => expect(uReq).toHaveBeenCalledWith('/api/users/2/roles', expect.objectContaining({ method: 'PUT' })));
  uView.unmount();

  const lReq = vi.fn(async () => ({ items: [{ id: 1, createdAt: '2026-01-01T00:00:00Z', actor: { displayName: 'Ad', email: 'a@x.test' }, action: 'article.create', entityType: 'document', entityId: '5', details: { slug: 's' } }], page: 1, pageSize: 20, total: 1 }));
  const lView = renderWithRouter(<Routes><Route path="/admin/logs" element={<AdminLogsPage />} /></Routes>, {
    route: '/admin/logs', auth: { user: { id: 1, roles: ['admin'] }, request: lReq },
  });
  expect(await screen.findByText('article.create')).toBeInTheDocument();
  lView.unmount();

  const setReq = vi.fn(async (_p, init) => {
    if (init?.method === 'PUT') return { settings: { site_name: 'Portal X', site_tagline: 'Tag', articles_per_page: 20, allow_registration: true, allow_comments: true, maintenance_mode: false } };
    return { settings: { site_name: 'News Portal', site_tagline: 'Tag', articles_per_page: 20, allow_registration: true, allow_comments: true, maintenance_mode: false } };
  });
  renderWithRouter(<Routes><Route path="/admin/settings" element={<AdminSettingsPage />} /></Routes>, {
    route: '/admin/settings', auth: { user: { id: 1, roles: ['admin'] }, request: setReq },
  });
  expect(await screen.findByLabelText('Site name')).toHaveValue('News Portal');
  await userEvent.click(screen.getByRole('button', { name: 'Save global settings' }));
  await waitFor(() => expect(setReq).toHaveBeenCalledWith('/api/admin/settings', expect.objectContaining({ method: 'PUT' })));
});
