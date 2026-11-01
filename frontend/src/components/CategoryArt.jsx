import { categoryArt } from '../lib/categoryArt.js';
import { Icon } from './Icon.jsx';

/** Category scene as a decorative image (the headline text carries the meaning). */
export function CategoryArt({ slug, className = '' }) {
  const { art, key } = categoryArt(slug);
  return <img className={`art art-${key} ${className}`.trim()} src={`/art/${art}.svg`} alt="" loading="lazy" width="480" height="320" />;
}

/** Category label: tinted pill with icon + text (state is never colour alone). */
export function Kicker({ category }) {
  if (!category) return null;
  const { icon, key } = categoryArt(category.slug);
  return <span className={`kicker cat-${key}`}><Icon name={icon} />{category.name}</span>;
}
