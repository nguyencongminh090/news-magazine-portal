import { Link } from 'react-router-dom';
import { Icon } from './Icon.jsx';

function PageLink({ label, to, next = false }) {
  const content = next ? <>{label}<Icon name="arrow" /></> : <><Icon name="arrow" className="back" />{label}</>;
  if (!to) return <span className="btn secondary" aria-disabled="true">{content}</span>;
  return <Link className="btn secondary" to={to}>{content}</Link>;
}

export function Pagination({ page, total, pageSize, buildHref }) {
  if (total <= pageSize) return null;
  const lastPage = Math.ceil(total / pageSize);
  return (
    <nav className="pager" aria-label="Pagination">
      <PageLink label="Previous" to={page > 1 ? buildHref(page - 1) : null} />
      <PageLink label="Next" to={page < lastPage ? buildHref(page + 1) : null} next />
    </nav>
  );
}
