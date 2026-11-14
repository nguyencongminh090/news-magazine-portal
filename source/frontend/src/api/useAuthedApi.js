import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

/** GET with the session's bearer token (refresh-once on 401). `path === null` = do not fetch. Same shape as useApi. */
export function useAuthedApi(path, params) {
  const { request } = useAuth();
  const [state, setState] = useState({ data: null, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0);
  const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    let live = true;
    setState((prev) => ({ ...prev, error: null, loading: true }));
    request(qs ? `${path}?${qs}` : path).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: null, error, loading: false }),
    );
    return () => {
      live = false;
    };
  }, [path, qs, nonce, request]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
