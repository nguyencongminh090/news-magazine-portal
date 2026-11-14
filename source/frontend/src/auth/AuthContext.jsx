import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createAuthClient } from './authClient.js';

export const AuthContext = createContext(null);

export const STAFF_ROLES = ['admin', 'editor', 'moderator', 'seo'];
export const ADMIN_ROLES = ['admin'];
export const CONTENT_ROLES = ['admin', 'editor'];
export const MOD_ROLES = ['admin', 'moderator'];
export const SEO_ROLES = ['admin', 'seo'];

/** status: 'loading' until the silent refresh on page load settles, then 'ready'. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const client = useMemo(() => createAuthClient({ onChange: setUser }), []);

  useEffect(() => {
    let live = true;
    client.refresh().finally(() => live && setStatus('ready'));
    return () => {
      live = false;
    };
  }, [client]);

  const value = useMemo(() => ({ user, status, ...client }), [user, status, client]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
