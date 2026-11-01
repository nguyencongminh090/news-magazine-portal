import { useRef, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { STAFF_ROLES, useAuth } from '../auth/AuthContext.jsx';
import { Drawer } from '../components/Drawer.jsx';
import { Icon, IconSprite } from '../components/Icon.jsx';
import { TopicNav } from '../components/TopicNav.jsx';
import { Wave } from '../components/Wave.jsx';

export function PublicLayout() {
  const navigate = useNavigate();
  const { user, status, logout } = useAuth();
  const { data: categories } = useApi('/api/categories');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const items = categories?.items ?? [];

  function onSearch(event) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q').toString().trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <>
      <IconSprite />
      <a className="skip" href="#content">Skip to content</a>
      <header className="top">
        <button type="button" className="icon-btn menu-btn" ref={menuButton} aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <Icon name="menu" />
        </button>
        <Link className="brand" to="/">News Portal</Link>
        <form className="search" role="search" onSubmit={onSearch}>
          <input type="search" name="q" aria-label="Search articles" placeholder="Search articles" />
          <button type="submit" aria-label="Search"><Icon name="search" /></button>
        </form>
        <div className="acct">
          {status === 'loading' ? null : user ? (
            <>
              <span className="muted"><Icon name="user" /> {user.displayName}</span>
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
      </header>
      {menuOpen && (
        <Drawer label="Categories" onClose={() => setMenuOpen(false)} returnFocusRef={menuButton}>
          <TopicNav categories={items} onNavigate={() => setMenuOpen(false)} />
        </Drawer>
      )}
      <div className="shell">
        <aside className="rail"><TopicNav categories={items} /></aside>
        <div className="col">
          <main id="content">
            <Outlet />
          </main>
          <footer className="site">
            <Wave />
            <div className="wrap foot-in">
              <div className="foot-grid">
                <section className="foot-about" aria-labelledby="foot-about-h">
                  <h2 id="foot-about-h" className="foot-brand">News Portal</h2>
                  <p>Plain-language news explainers, organised by topic and easy to scan. Every article is open content you can read, share and reuse.</p>
                </section>
                <nav aria-labelledby="foot-topics-h">
                  <h2 id="foot-topics-h" className="foot-h">Topics</h2>
                  <ul className="foot-list foot-cols">
                    {items.map((c) => (
                      <li key={c.slug}><Link to={`/category/${c.slug}`}>{c.name}</Link></li>
                    ))}
                  </ul>
                </nav>
                <nav aria-labelledby="foot-links-h">
                  <h2 id="foot-links-h" className="foot-h">Explore</h2>
                  <ul className="foot-list">
                    <li><Link to="/">Home</Link></li>
                    <li><Link to="/search">Search</Link></li>
                  </ul>
                </nav>
              </div>
              <div className="foot-legal">
                <p>
                  Articles come from{' '}
                  <a href="https://en.wikinews.org" target="_blank" rel="noopener noreferrer">Wikinews</a>
                  {' '}and are licensed under{' '}
                  <a href="https://creativecommons.org/licenses/by/2.5/" target="_blank" rel="noopener noreferrer">CC BY</a>.
                  Attribution is shown on each article.
                </p>
                <p>&copy; {new Date().getFullYear()} News Portal</p>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
