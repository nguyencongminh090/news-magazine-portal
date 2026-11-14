import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { mockFetch } from '../test/mockFetch.js';
import { ApiError } from '../api/client.js';
import { AdminArticlesPage } from './AdminArticlesPage.jsx';
import { AdminArticleFormPage } from './AdminArticleFormPage.jsx';

afterEach(() => vi.unstubAllGlobals());
const user = (roles) => ({ id: 1, email: 'a@b.c', displayName: 'A', roles });
const row = (id, o = {}) => ({
  id, slug: `a-${id}`, title: `Title ${id}`, summary: 's', body: 'Body text', status: 'draft', viewsCount: 1204,
  updatedAt: '2026-01-01T00:00:00.000Z', category: { slug: 'world', name: 'World' }, tags: ['Oil', 'Gas'], ...o,
});
const ui = (
  <Routes>
    <Route path="/admin" element={<AdminArticlesPage />} />
    <Route path="/admin/articles/new" element={<AdminArticleFormPage />} />
    <Route path="/admin/articles/:id" element={<AdminArticleFormPage />} />
  </Routes>
);
const list = (items) => ({ items, page: 1, pageSize: 20, total: items.length });

test('list: status is text + icon, views formatted; editor sees no Delete', async () => {
  const request = vi.fn(async () => list([row(1, { status: 'published' }), row(2), row(3, { status: 'archived' })]));
  renderWithRouter(ui, { route: '/admin', auth: { user: user(['editor']), request } });
  expect(await screen.findByText('● Published')).toBeInTheDocument();
  expect(screen.getByText('▲ Draft')).toBeInTheDocument();
  expect(screen.getByText('■ Archived')).toBeInTheDocument();
  expect(screen.getAllByText('1,204')).toHaveLength(3);
  expect(screen.getByRole('link', { name: 'Edit Title 2' })).toHaveAttribute('href', '/admin/articles/2');
  expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
});

test('filters go to the query string and the request', async () => {
  const request = vi.fn(async () => list([]));
  renderWithRouter(ui, { route: '/admin?q=oil&status=draft&page=2', auth: { user: user(['editor']), request } });
  await screen.findByText('No articles found');
  expect(request.mock.calls[0][0]).toBe('/api/admin/articles?page=2&q=oil&status=draft');
});

test('admin delete needs a second confirming click, then reloads', async () => {
  let items = [row(1)];
  const request = vi.fn(async (path, init) => {
    if (init?.method === 'DELETE') { items = []; return null; }
    return list(items);
  });
  renderWithRouter(ui, { route: '/admin', auth: { user: user(['admin']), request } });
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Title 1' }));
  expect(request).not.toHaveBeenCalledWith('/api/admin/articles/1', expect.anything());
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByText('No articles found')).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith('/api/admin/articles/1', { method: 'DELETE' });
});

test('list error is shown with retry', async () => {
  const request = vi.fn(async () => { throw new ApiError(500, 'Internal Server Error'); });
  renderWithRouter(ui, { route: '/admin', auth: { user: user(['editor']), request } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Internal Server Error');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

test('create: posts parsed tags, derived slug omitted, then returns to the list', async () => {
  mockFetch({ '/api/categories': { items: [{ id: 1, slug: 'world', name: 'World', articleCount: 0 }] } });
  const request = vi.fn(async (path, init) => (init ? row(9) : list([])));
  renderWithRouter(ui, { route: '/admin/articles/new', auth: { user: user(['editor']), request } });
  await userEvent.type(await screen.findByLabelText('Title'), 'Hello');
  await userEvent.type(screen.getByLabelText('Body'), 'Text');
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'world');
  await userEvent.type(screen.getByLabelText(/Tags/), 'Oil, , Gas ');
  await userEvent.click(screen.getByRole('button', { name: 'Create article' }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  const [path, init] = request.mock.calls[0];
  expect([path, init.method]).toEqual(['/api/admin/articles', 'POST']);
  expect(JSON.parse(init.body)).toEqual({ title: 'Hello', summary: '', body: 'Text', categorySlug: 'world', tags: ['Oil', 'Gas'], status: 'draft' });
  expect(await screen.findByRole('heading', { name: 'Articles' })).toBeInTheDocument();
});

test('edit: prefilled, PUT echoes updatedAt, stale 409 is explained and keeps the form', async () => {
  mockFetch({ '/api/categories': { items: [{ id: 1, slug: 'world', name: 'World', articleCount: 0 }] } });
  const request = vi.fn(async (path, init) => {
    if (init?.method === 'PUT') throw new ApiError(409, 'Article was changed by someone else; reload and retry');
    return row(4);
  });
  renderWithRouter(ui, { route: '/admin/articles/4', auth: { user: user(['editor']), request } });
  expect(await screen.findByLabelText('Title')).toHaveValue('Title 4');
  expect(screen.getByLabelText(/Tags/)).toHaveValue('Oil, Gas');
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  const put = request.mock.calls.find(([, i]) => i?.method === 'PUT');
  expect(put[0]).toBe('/api/admin/articles/4');
  expect(JSON.parse(put[1].body)).toMatchObject({ slug: 'a-4', updatedAt: '2026-01-01T00:00:00.000Z', status: 'draft' });
  expect(await screen.findByRole('alert')).toHaveTextContent(/changed by someone else/);
  expect(screen.getByLabelText('Title')).toBeInTheDocument();
});
