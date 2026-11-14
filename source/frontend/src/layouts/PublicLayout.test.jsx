import { screen, within } from '@testing-library/react';
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
  const rail = within(screen.getAllByRole('complementary')[0]);
  expect(await rail.findByRole('link', { name: 'Science' })).toHaveAttribute('href', '/category/science');
  expect(rail.getByRole('link', { name: 'Health' })).toHaveAttribute('href', '/category/health');
  expect(rail.getByRole('link', { name: 'Latest' })).toBeInTheDocument();
});

test('footer lists topics and credits Wikinews under CC BY', async () => {
  mockFetch({ '/api/categories': { items: [{ slug: 'science', name: 'Science', articleCount: 3 }] } });
  renderLayout();
  const foot = within(screen.getByRole('contentinfo'));
  expect(await foot.findByRole('link', { name: 'Science' })).toHaveAttribute('href', '/category/science');
  expect(foot.getByRole('link', { name: 'Wikinews' })).toHaveAttribute('href', 'https://en.wikinews.org');
  expect(foot.getByRole('link', { name: 'CC BY' })).toBeInTheDocument();
});

test('still renders Latest when the categories request fails', async () => {
  const fetchMock = mockFetch({ '/api/categories': respond(500, { title: 'Boom' }) });
  renderLayout();
  expect(screen.getByRole('link', { name: 'Latest' })).toBeInTheDocument();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.getByRole('link', { name: 'Latest' })).toBeInTheDocument();
});

test('wraps every routed page in exactly one main landmark (skip link target)', () => {
  mockFetch({ '/api/categories': { items: [] } });
  const { container } = renderLayout();
  const mains = screen.getAllByRole('main');
  expect(mains).toHaveLength(1);
  expect(mains[0]).toHaveAttribute('id', 'content');
  expect(container.querySelectorAll('main')).toHaveLength(1);
});

const signedIn = (roles) => ({ user: { id: 1, email: 'a@b.c', displayName: 'Ann', roles } });
const renderAs = (auth) => {
  mockFetch({ '/api/categories': { items: [] } });
  return renderWithRouter(<Routes><Route element={<PublicLayout />}><Route index element={<p>child</p>} /></Route></Routes>, { auth });
};

test('anonymous sees Sign in and Register', () => {
  renderAs({});
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
});
test('reader sees name and Sign out but no Admin link', () => {
  renderAs(signedIn(['reader']));
  expect(screen.getByText('Ann')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
});
test('staff roles see the Admin link', () => {
  renderAs(signedIn(['editor']));
  expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
});
