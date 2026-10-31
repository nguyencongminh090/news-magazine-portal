import { Link, NavLink, Outlet } from 'react-router-dom';

// Nav is a UI hint only; the server enforces RBAC.
export function AdminLayout() {
  return (
    <div className="admin">
      <nav aria-label="Admin">
        <Link className="brand" to="/" style={{ fontSize: 22, display: 'block', marginBottom: 24 }}>News Portal</Link>
        <NavLink to="/admin" end>Articles</NavLink>
      </nav>
      <main id="content">
        <Outlet />
      </main>
    </div>
  );
}
