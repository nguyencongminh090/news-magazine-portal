export class ApiError extends Error {
  constructor(status, title) {
    super(title);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
  }
}

function withQuery(path, params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

async function errorTitle(res) {
  if (!(res.headers.get('content-type') ?? '').includes('json')) return res.statusText || 'Request failed';
  try {
    return (await res.json()).title ?? 'Request failed';
  } catch {
    return 'Request failed';
  }
}

export async function apiGet(path, params, { signal } = {}) {
  let res;
  try {
    res = await fetch(withQuery(path, params), { headers: { Accept: 'application/json' }, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Network error');
  }
  if (!res.ok) throw new ApiError(res.status, await errorTitle(res));
  return res.json();
}
