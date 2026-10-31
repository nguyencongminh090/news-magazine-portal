import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { STAFF_ROLES, useAuth } from '../auth/AuthContext.jsx';

export function PublicLayout() {
  const navigate = useNavigate();
  const { user, status, logout } = useAuth();
  const { data: categories } = useApi('/api/categories');

  function onSearch(event) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q').toString().trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="masthead">
        <div className="wrap">
          <div className="top">
            <Link className="brand" to="/">News Portal</Link>
            <form role="search" onSubmit={onSearch}>
              <input type="search" name="q" aria-label="Search articles" placeholder="Search articles" />
              <button className="btn secondary" type="submit">Search</button>
            </form>
            <div className="acct">
              {status === 'loading' ? null : user ? (
                <>
                  <span className="muted">{user.displayName}</span>
                  {user.roles.some((r) => STAFF_ROLES.includes(r)) && <Link to="/admin">Admin</Link>}
                  <button className="btn secondary" type="button" onClick={() => logout()}>Sign out</button>
                </>
              ) : (
                <>
                  <Link to="/login">Sign in</Link>
                  <Link className="btn" to="/register">Register</Link>
                </>
              )}
            </div>
          </div>
          <nav className="cats" aria-label="Categories">
            <NavLink to="/" end>Latest</NavLink>
            {(categories?.items ?? []).map((c) => (
              <NavLink key={c.slug} to={`/category/${c.slug}`}>{c.name}</NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="content">
        <Outlet />
      </main>
      <footer className="site">
        <div className="wrap muted">News Portal · Articles from Wikinews, licensed CC BY</div>
      </footer>
    </>
  );
}
