import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

/** UI hint only (server enforces RBAC): anonymous -> /login, signed in without a role -> message. */
export function RequireRole({ roles, children }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <p className="muted" role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user.roles.some((r) => roles.includes(r))) {
    return <main id="content"><p className="error" role="alert">You do not have permission to view this page.</p></main>;
  }
  return children ?? <Outlet />;
}
