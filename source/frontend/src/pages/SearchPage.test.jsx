import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { article, mockFetch } from '../test/mockFetch.js';
import { SearchPage } from './SearchPage.jsx';

const renderSearch = (route) =>
  renderWithRouter(<Routes><Route path="/search" element={<SearchPage />} /></Routes>, { route });
afterEach(() => vi.unstubAllGlobals());

test('sends q and page, and Next keeps q', async () => {
  const fetchMock = mockFetch({ '/api/articles': { items: [article(1)], page: 2, pageSize: 20, total: 60 } });
  renderSearch('/search?q=moon&page=2');
  expect(await screen.findByRole('heading', { level: 1, name: 'Results for "moon"' })).toBeInTheDocument();
  const url = fetchMock.mock.calls[0][0];
  expect(url).toContain('q=moon');
  expect(url).toContain('page=2');
  expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/search?q=moon&page=3');
});

test('without q it prompts and makes no request', () => {
  const fetchMock = mockFetch({});
  renderSearch('/search');
  expect(screen.getByText(/enter a search term/i)).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('markup in the query is rendered as literal text', async () => {
  mockFetch({ '/api/articles': { items: [], page: 1, pageSize: 20, total: 0 } });
  const { container } = renderSearch('/search?q=' + encodeURIComponent('<script>alert(1)</script>'));
  expect(await screen.findByText('Results for "<script>alert(1)</script>"')).toBeInTheDocument();
  expect(container.querySelector('script')).toBeNull();
});

test('empty result shows "No articles found"', async () => {
  mockFetch({ '/api/articles': { items: [], page: 1, pageSize: 20, total: 0 } });
  renderSearch('/search?q=zzz');
  expect(await screen.findByText('No articles found')).toBeInTheDocument();
});
