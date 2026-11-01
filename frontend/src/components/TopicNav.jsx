import { NavLink } from 'react-router-dom';
import { categoryArt } from '../lib/categoryArt.js';
import { Icon } from './Icon.jsx';

/** Category navigation (left rail on desktop, inside the Drawer on mobile). Active link = `aria-current` + dot, not colour alone. */
export function TopicNav({ categories, onNavigate }) {
  return (
    <nav className="rail-in" aria-label="Categories">
      <h2>Topics</h2>
      <ul>
        <li>
          <NavLink to="/" end onClick={onNavigate}>
            <span className="dot"><Icon name="home" /></span>Latest
          </NavLink>
        </li>
        {categories.map((c) => {
          const { icon, key } = categoryArt(c.slug);
          return (
            <li key={c.slug} className={`cat-${key}`}>
              <NavLink to={`/category/${c.slug}`} onClick={onNavigate}>
                <span className="dot"><Icon name={icon} /></span>{c.name}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
