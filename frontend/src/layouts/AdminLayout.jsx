import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Nav is a UI hint only; the server enforces RBAC.
export function AdminLayout() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const has = (...allowed) => roles.some((r) => allowed.includes(r));

  return (
    <div className="admin">
      <nav aria-label="Admin">
        <Link className="brand" to="/" style={{ fontSize: 22, display: 'block', marginBottom: 24 }}>News Portal</Link>
        {has('admin', 'editor') && <NavLink to="/admin" end>Articles</NavLink>}
        {has('admin', 'editor') && <NavLink to="/admin/taxonomy">Taxonomy</NavLink>}
        {has('admin', 'moderator') && <NavLink to="/admin/moderation">Moderation</NavLink>}
        {has('admin', 'seo') && <NavLink to="/admin/seo">SEO Metadata</NavLink>}
        {has('admin', 'seo') && <NavLink to="/admin/analytics">Analytics</NavLink>}
        {has('admin', 'seo') && <NavLink to="/admin/search-engine">Search Engine Lab</NavLink>}
        {has('admin') && <NavLink to="/admin/users">Users &amp; Roles</NavLink>}
        {has('admin') && <NavLink to="/admin/logs">Audit Logs</NavLink>}
        {has('admin') && <NavLink to="/admin/settings">Settings</NavLink>}
      </nav>
      <main id="content">
        <Outlet />
      </main>
    </div>
  );
}
