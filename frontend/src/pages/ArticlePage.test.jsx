import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { article, mockFetch, respond } from '../test/mockFetch.js';
import { ArticlePage } from './ArticlePage.jsx';

const renderArticle = (slug = 'a-1') =>
  renderWithRouter(<Routes><Route path="/articles/:slug" element={<ArticlePage />} /></Routes>, { route: `/articles/${slug}` });
afterEach(() => vi.unstubAllGlobals());

test('splits the body on blank lines into paragraphs', async () => {
  mockFetch({ '/api/articles/a-1': article(1, { body: 'One\n\nTwo' }) });
  const { container } = renderArticle();
  expect(await screen.findByRole('heading', { level: 1, name: 'Title 1' })).toBeInTheDocument();
  expect([...container.querySelectorAll('.article p')].map((p) => p.textContent).filter((t) => ['One', 'Two'].includes(t))).toEqual(['One', 'Two']);
  expect(screen.getByText('Comments are not available yet.')).toBeInTheDocument();
});

test('HTML-like body text is inert', async () => {
  mockFetch({ '/api/articles/a-1': article(1, { body: '<b>x</b> &amp; y' }) });
  const { container } = renderArticle();
  expect(await screen.findByText('<b>x</b> &amp; y')).toBeInTheDocument();
  expect(container.querySelector('.article b')).toBeNull();
});

test('404 shows the not-found view', async () => {
  mockFetch({ '/api/articles/': respond(404, { title: 'Not Found' }) });
  renderArticle('missing');
  expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
});

test('500 shows the alert with Try again', async () => {
  mockFetch({ '/api/articles/': respond(500, { title: 'Server error' }) });
  renderArticle();
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

test('document.title is set while mounted and restored on unmount', async () => {
  document.title = 'Before';
  mockFetch({ '/api/articles/a-1': article(1, { body: 'x' }) });
  const { unmount } = renderArticle();
  await screen.findByRole('heading', { level: 1 });
  expect(document.title).toBe('Title 1 · News Portal');
  unmount();
  expect(document.title).toBe('Before');
});

test('missing publishedAt and author render no "Invalid Date"', async () => {
  mockFetch({ '/api/articles/a-1': article(1, { body: 'x', publishedAt: null, summary: null, category: null }) });
  renderArticle();
  await screen.findByRole('heading', { level: 1 });
  expect(screen.queryByText(/Invalid Date/)).toBeNull();
});
