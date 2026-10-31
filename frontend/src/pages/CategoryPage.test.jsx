import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { article, mockFetch } from '../test/mockFetch.js';
import { CategoryPage } from './CategoryPage.jsx';

const cats = { items: [{ slug: 'science', name: 'Science & Tech', articleCount: 2 }] };
const renderCat = (route) =>
  renderWithRouter(<Routes><Route path="/category/:slug" element={<CategoryPage />} /></Routes>, { route });
afterEach(() => vi.unstubAllGlobals());

test('requests the category filter and uses the category name as heading', async () => {
  const fetchMock = mockFetch({
    '/api/categories': cats,
    '/api/articles': { items: [article(1)], page: 1, pageSize: 20, total: 1 },
  });
  renderCat('/category/science');
  expect(await screen.findByRole('heading', { level: 1, name: 'Science & Tech' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Title 1' })).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([u]) => u.includes('category=science') && u.includes('page=1'))).toBe(true);
});

test('falls back to the slug when the category name is unknown', async () => {
  mockFetch({ '/api/categories': { items: [] }, '/api/articles': { items: [], page: 1, pageSize: 20, total: 0 } });
  renderCat('/category/weather');
  expect(await screen.findByRole('heading', { level: 1, name: 'weather' })).toBeInTheDocument();
  expect(await screen.findByText('No articles found')).toBeInTheDocument();
});

test('page beyond the last shows the empty state and pager keeps the page', async () => {
  mockFetch({ '/api/categories': cats, '/api/articles': { items: [], page: 9, pageSize: 20, total: 30 } });
  renderCat('/category/science?page=9');
  expect(await screen.findByText('No articles found')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/category/science?page=8');
});
