import { ApiError } from '../api/client.js';

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };
const CSRF = { Accept: 'application/json', 'X-Requested-With': 'fetch' };

async function toError(res) {
  let body = null;
  if ((res.headers.get('content-type') ?? '').includes('json')) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  }
  const err = new ApiError(res.status, body?.detail ?? body?.title ?? res.statusText ?? 'Request failed');
  err.errors = body?.errors;
  return err;
}

/**
 * Framework-free auth session (ADR-002 #10): the access token lives only in this closure (never storage),
 * the refresh token is an HttpOnly cookie the browser sends itself. `onChange(user|null)` fires on every change.
 */
export function createAuthClient({ onChange = () => {} } = {}) {
  let token = null;
  let inflight = null;

  const set = (session) => {
    token = session?.accessToken ?? null;
    onChange(session?.user ?? null);
  };

  /** Single-flight: concurrent callers (StrictMode double mount, parallel 401s) share one rotation. */
  function refresh() {
    inflight ??= (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', headers: CSRF });
        if (!res.ok) return set(null), false;
        set(await res.json());
        return true;
      } catch {
        set(null);
        return false;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function submit(path, body) {
    let res;
    try {
      res = await fetch(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'Network error');
    }
    if (!res.ok) throw await toError(res);
    set(await res.json());
  }

  /** Authenticated request: on 401 refresh once and retry once; a second 401 ends the session (no loop). */
  async function request(path, init = {}) {
    const send = () =>
      fetch(path, { ...init, headers: { Accept: 'application/json', ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    let res = await send();
    if (res.status === 401 && (await refresh())) {
      res = await send();
      if (res.status === 401) set(null);
    }
    if (!res.ok) throw await toError(res);
    const text = await res.text(); // 204 and body-less 201 (report endpoints) both mean "no payload"
    return text ? JSON.parse(text) : null;
  }

  return {
    refresh,
    request,
    login: (email, password) => submit('/api/auth/login', { email, password }),
    register: (email, displayName, password) => submit('/api/auth/register', { email, displayName, password }),
    async logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST', headers: CSRF });
      } finally {
        set(null); // clear locally even if the network call failed
      }
    },
  };
}
