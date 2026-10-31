import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { mockFetch, respond } from '../test/mockFetch.js';
import { PublicLayout } from './PublicLayout.jsx';

const renderLayout = () =>
  renderWithRouter(<Routes><Route element={<PublicLayout />}><Route index element={<p>child</p>} /></Route></Routes>);
afterEach(() => vi.unstubAllGlobals());

test('nav lists a link per category after Latest', async () => {
  mockFetch({ '/api/categories': { items: [{ slug: 'science', name: 'Science', articleCount: 3 }, { slug: 'health', name: 'Health', articleCount: 1 }] } });
  renderLayout();
  expect(await screen.findByRole('link', { name: 'Science' })).toHaveAttribute('href', '/category/science');
  expect(screen.getByRole('link', { name: 'Health' })).toHaveAttribute('href', '/category/health');
  expect(screen.getByRole('link', { name: 'Latest' })).toBeInTheDocument();
});

test('still renders Latest when the categories request fails', async () => {
  const fetchMock = mockFetch({ '/api/categories': respond(500, { title: 'Boom' }) });
  renderLayout();
  expect(screen.getByRole('link', { name: 'Latest' })).toBeInTheDocument();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.getByRole('link', { name: 'Latest' })).toBeInTheDocument();
});
