import { renderHook, waitFor, act } from '@testing-library/react';
import { useApi } from './useApi.js';

afterEach(() => vi.unstubAllGlobals());

const json = (data) => Promise.resolve(new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }));

test('returns loading then data', async () => {
  vi.stubGlobal('fetch', () => json({ items: [] }));
  const { result } = renderHook(() => useApi('/api/articles'));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ items: [] });
  expect(result.current.error).toBeNull();
});

test('changing params aborts the in-flight request', async () => {
  const signals = [];
  vi.stubGlobal('fetch', (_url, opts) => { signals.push(opts.signal); return new Promise(() => {}); });
  const { rerender } = renderHook(({ page }) => useApi('/api/articles', { page }), { initialProps: { page: 1 } });
  rerender({ page: 2 });
  expect(signals[0].aborted).toBe(true);
  expect(signals[1].aborted).toBe(false);
});

test('path null does not fetch', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useApi(null));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.current.loading).toBe(false);
});

test('reload refetches', async () => {
  const fetchMock = vi.fn(() => json({ n: 1 }));
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useApi('/api/categories'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.reload());
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});

test('error is exposed as ApiError', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('down')));
  const { result } = renderHook(() => useApi('/api/articles'));
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.error.status).toBe(0);
});
