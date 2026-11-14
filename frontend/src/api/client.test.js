import { ApiError, apiGet } from './client.js';

function respond(body, { status = 200, type = 'application/json' } = {}) {
  return Promise.resolve(new Response(body, { status, headers: { 'content-type': type } }));
}

afterEach(() => vi.unstubAllGlobals());

test('apiGet drops undefined and empty params', async () => {
  const fetchMock = vi.fn(() => respond('{}'));
  vi.stubGlobal('fetch', fetchMock);
  await apiGet('/api/articles', { q: 'moon', page: undefined, category: '' });
  expect(fetchMock.mock.calls[0][0]).toBe('/api/articles?q=moon');
});

test('problem+json 404 rejects with ApiError carrying status and title', async () => {
  vi.stubGlobal('fetch', () => respond(JSON.stringify({ title: 'Not Found', status: 404 }), { status: 404, type: 'application/problem+json' }));
  await expect(apiGet('/api/articles/x')).rejects.toMatchObject({ name: 'ApiError', status: 404, title: 'Not Found' });
});

test('non-JSON 500 rejects with ApiError status 500 without a parse crash', async () => {
  vi.stubGlobal('fetch', () => respond('<html>oops</html>', { status: 500, type: 'text/html' }));
  const err = await apiGet('/api/articles').catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(500);
});

test('network failure rejects with ApiError status 0', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
  const err = await apiGet('/api/articles').catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(0);
});
