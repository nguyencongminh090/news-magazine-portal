import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './client.js';

/** `path === null` means "do not fetch". Aborts the in-flight request on param change or unmount. */
export function useApi(path, params) {
  const [state, setState] = useState({ data: null, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0);
  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    const controller = new AbortController();
    setState((prev) => ({ ...prev, error: null, loading: true }));
    apiGet(path, JSON.parse(paramsKey), { signal: controller.signal }).then(
      (data) => setState({ data, error: null, loading: false }),
      (error) => {
        if (error.name !== 'AbortError') setState({ data: null, error, loading: false });
      },
    );
    return () => controller.abort();
  }, [path, paramsKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
