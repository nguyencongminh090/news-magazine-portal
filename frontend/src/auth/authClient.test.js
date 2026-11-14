import { createAuthClient } from './authClient.js';

const session = (token = 't1', roles = ['reader']) => ({ accessToken: token, user: { id: 1, email: 'a@b.c', displayName: 'A', roles } });
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const stub = (...responses) => {
  const fn = vi.fn(async () => responses.shift() ?? json(500, { title: 'unexpected' }));
  vi.stubGlobal('fetch', fn);
  return fn;
};
afterEach(() => vi.unstubAllGlobals());

test('login posts JSON, stores the user via onChange and sends the token on later requests', async () => {
  const onChange = vi.fn();
  const fetchMock = stub(json(200, session('tok')), json(200, { ok: 1 }));
  const client = createAuthClient({ onChange });
  await client.login('a@b.c', 'pw');
  expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'a@b.c', password: 'pw' });
  expect(onChange).toHaveBeenLastCalledWith(session().user);
  await client.request('/api/x');
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
});

test('failed login rejects with ApiError, validation errors attached, no session set', async () => {
  const onChange = vi.fn();
  stub(json(422, { title: 'Validation failed', errors: [{ path: 'password', message: 'too short' }] }));
  const err = await createAuthClient({ onChange }).register('a@b.c', 'A', 'x').catch((e) => e);
  expect(err).toMatchObject({ name: 'ApiError', status: 422, errors: [{ path: 'password' }] });
  expect(onChange).not.toHaveBeenCalled();
});

test('network failure on login rejects with status 0', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('down')));
  await expect(createAuthClient().login('a', 'b')).rejects.toMatchObject({ status: 0 });
});

test('concurrent refresh calls share one request (single-flight)', async () => {
  const fetchMock = stub(json(200, session()));
  const client = createAuthClient();
  const [a, b] = await Promise.all([client.refresh(), client.refresh()]);
  expect([a, b]).toEqual([true, true]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].headers['X-Requested-With']).toBe('fetch');
});

test('refresh failure clears the session and resolves false', async () => {
  const onChange = vi.fn();
  stub(json(401, { title: 'Unauthorized' }));
  expect(await createAuthClient({ onChange }).refresh()).toBe(false);
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test('request on 401 refreshes once, retries once with the new token', async () => {
  const fetchMock = stub(json(401, { title: 'Unauthorized' }), json(200, session('new')), json(200, { ok: true }));
  const data = await createAuthClient().request('/api/x');
  expect(data).toEqual({ ok: true });
  expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/x', '/api/auth/refresh', '/api/x']);
  expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new');
});

test('a second 401 after refresh ends the session without looping', async () => {
  const onChange = vi.fn();
  const fetchMock = stub(json(401, {}), json(200, session()), json(401, { title: 'Unauthorized' }));
  await expect(createAuthClient({ onChange }).request('/api/x')).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test('403 is surfaced and does not trigger a refresh', async () => {
  const fetchMock = stub(json(403, { title: 'Forbidden' }));
  await expect(createAuthClient().request('/api/x')).rejects.toMatchObject({ status: 403 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('204 resolves to null', async () => {
  stub(new Response(null, { status: 204 }));
  expect(await createAuthClient().request('/api/x', { method: 'DELETE' })).toBeNull();
});

test('a 201 with an empty body (report endpoints) resolves to null instead of throwing', async () => {
  stub(new Response('', { status: 201 }));
  expect(await createAuthClient().request('/api/articles/x/reports', { method: 'POST' })).toBeNull();
});

test('logout clears locally even when the network call fails', async () => {
  const onChange = vi.fn();
  stub(json(200, session()));
  const client = createAuthClient({ onChange });
  await client.login('a', 'b');
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('down')));
  await client.logout().catch(() => {});
  expect(onChange).toHaveBeenLastCalledWith(null);
});
