import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter } from '../test/render.jsx';
import { mockFetch, respond } from '../test/mockFetch.js';
import { ApiError } from '../api/client.js';
import { Engagement } from './Engagement.jsx';

afterEach(() => vi.unstubAllGlobals());

const summary = { ratingAvg: 4.5, ratingCount: 2, commentCount: 1, myRating: null };
const comment = (id, body, extra = {}) => ({ id, body, createdAt: '2026-10-31T00:00:00Z', author: { displayName: 'Ann' }, ...extra });
const verified = { id: 1, emailVerified: true };
const renderEng = (auth = {}) => renderWithRouter(<Engagement slug="a-1" initial={summary} />, { auth });
const comments = (items = [comment(1, 'hello')]) => ({ items, total: items.length });

test('anonymous: counts and comments visible, writing is gated with a sign-in link', async () => {
  mockFetch({ '/api/articles/a-1/comments': comments() });
  renderEng();
  expect(await screen.findByText('hello')).toBeInTheDocument();
  expect(screen.getByText('Average rating 4.5 of 5 (2 ratings)')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Rate 3 of 5' })).toBeDisabled();
  expect(screen.queryByLabelText('Add a comment')).toBeNull();
});

test('unverified user sees the verify notice', async () => {
  mockFetch({ '/api/articles/a-1/comments': comments([]) });
  renderEng({ user: { id: 2, emailVerified: false } , request: async () => null });
  expect(await screen.findByText('No comments yet')).toBeInTheDocument();
  expect(screen.getByText(/Verify your email address/)).toBeInTheDocument();
});

test('comment text is rendered inert', async () => {
  mockFetch({ '/api/articles/a-1/comments': comments([comment(1, '<script>x</script>')]) });
  const { container } = renderEng();
  expect(await screen.findByText('<script>x</script>')).toBeInTheDocument();
  expect(container.querySelector('script')).toBeNull();
});

test('list error shows alert with Try again', async () => {
  mockFetch({ '/api/articles/a-1/comments': respond(500, { title: 'Server error' }) });
  renderEng();
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

test('rating is optimistic and rolls back on error', async () => {
  mockFetch({ '/api/articles/a-1/comments': comments() });
  const request = vi.fn(async (path, init) => {
    if (init?.method === 'PUT') throw new ApiError(429, 'Too Many Requests');
    return { engagement: { myRating: null } };
  });
  renderEng({ user: verified, request });
  await screen.findByText('hello');
  await userEvent.click(screen.getByRole('button', { name: 'Rate 4 of 5' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
  expect(screen.getByRole('button', { name: 'Rate 4 of 5' })).toHaveAttribute('aria-pressed', 'false');
});

test('rating success shows server summary', async () => {
  mockFetch({ '/api/articles/a-1/comments': comments() });
  const request = vi.fn(async (path, init) =>
    init?.method === 'PUT' ? { ratingAvg: 4.7, ratingCount: 3, commentCount: 1, myRating: 5 } : { engagement: { myRating: null } });
  renderEng({ user: verified, request });
  await screen.findByText('hello');
  await userEvent.click(screen.getByRole('button', { name: 'Rate 5 of 5' }));
  expect(await screen.findByText(/Average rating 4.7 of 5 \(3 ratings\)/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Rate 5 of 5' })).toHaveAttribute('aria-pressed', 'true');
});

test('posting a comment appends it and bumps the count', async () => {
  mockFetch({ '/api/articles/a-1/comments': comments() });
  const request = vi.fn(async (path, init) =>
    init?.method === 'POST' ? comment(9, 'new one') : { engagement: { myRating: null } });
  renderEng({ user: verified, request });
  await screen.findByText('hello');
  await userEvent.type(screen.getByLabelText('Add a comment'), 'new one');
  await userEvent.click(screen.getByRole('button', { name: 'Post comment' }));
  expect(await screen.findByText('new one')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Comments (2)' })).toBeInTheDocument();
});

test('reporting a comment: duplicate (409) shows "Reported"', async () => {
  mockFetch({ '/api/articles/a-1/comments': comments() });
  const request = vi.fn(async (path, init) => {
    if (init?.method === 'POST') throw new ApiError(409, 'Conflict');
    return { engagement: { myRating: null } };
  });
  renderEng({ user: verified, request });
  await screen.findByText('hello');
  await userEvent.click(screen.getByRole('button', { name: 'Report comment by Ann' }));
  await userEvent.type(screen.getByLabelText('Reason for report'), 'spam');
  await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
  await waitFor(() => expect(screen.getByText('Reported. Thank you.')).toBeInTheDocument());
  expect(request).toHaveBeenCalledWith('/api/comments/1/reports', expect.objectContaining({ method: 'POST' }));
});
