import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { article, mockFetch } from '../test/mockFetch.js';
import { HomePage } from './HomePage.jsx';

const page = (items, extra = {}) => ({ items, page: 1, pageSize: 20, total: items.length, ...extra });
const renderHome = (route = '/') =>
  renderWithRouter(<Routes><Route path="/" element={<HomePage />} /></Routes>, { route });
afterEach(() => vi.unstubAllGlobals());

test('page 1: lead as h1, 2 secondary, 3 in the list', async () => {
  mockFetch({ '/api/articles': page([1, 2, 3, 4, 5, 6].map((n) => article(n))) });
  const { container } = renderHome();
  expect(await screen.findByRole('heading', { level: 1, name: 'Title 1' })).toBeInTheDocument();
  expect(container.querySelectorAll('.lead')).toHaveLength(1);
  expect(container.querySelectorAll('.duo h2')).toHaveLength(2);
  expect(container.querySelectorAll('.list li')).toHaveLength(3);
});

test('?page=abc requests page=1', async () => {
  const fetchMock = mockFetch({ '/api/articles': page([article(1)]) });
  renderHome('/?page=abc');
  await screen.findByRole('heading', { level: 1 });
  const urls = fetchMock.mock.calls.map(([u]) => u).filter((u) => u.startsWith('/api/articles'));
  expect(urls).toEqual(['/api/articles?page=1']);
});

test('later pages render a plain list without a lead', async () => {
  mockFetch({ '/api/articles': page([article(1), article(2)], { page: 2, total: 22 }) });
  const { container } = renderHome('/?page=2');
  await waitFor(() => expect(container.querySelectorAll('.list li')).toHaveLength(2));
  expect(container.querySelectorAll('.lead')).toHaveLength(0);
  expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/?page=1');
});

test('empty items shows "No articles found"', async () => {
  mockFetch({ '/api/articles': page([]) });
  renderHome();
  expect(await screen.findByText('No articles found')).toBeInTheDocument();
});

test('fetch failure shows the alert and Try again', async () => {
  mockFetch({ '/api/articles': new Error('down') });
  renderHome();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
