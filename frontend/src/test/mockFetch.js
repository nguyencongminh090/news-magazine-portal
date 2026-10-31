/** Route-based fetch mock: `routes` maps a URL prefix to a body or a function(url) => Response-like init. */
export function mockFetch(routes) {
  const fn = vi.fn(async (url) => {
    const key = Object.keys(routes).find((prefix) => String(url).startsWith(prefix));
    if (!key) throw new Error(`unmocked fetch ${url}`);
    const value = typeof routes[key] === 'function' ? routes[key](String(url)) : routes[key];
    if (value instanceof Error) throw value;
    const { status = 200, body } = value && value.__response ? value : { body: value };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
export const respond = (status, body) => ({ __response: true, status, body });
export const article = (n, extra = {}) => ({
  id: n, slug: `a-${n}`, title: `Title ${n}`, summary: `Summary ${n}`, publishedAt: '2026-10-31T00:00:00Z',
  authorName: null, category: { slug: 'science', name: 'Science' }, tags: [], ...extra,
});
