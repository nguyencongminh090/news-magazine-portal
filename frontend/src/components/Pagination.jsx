import { Link } from 'react-router-dom';

function PageLink({ label, to }) {
  if (!to) return <span className="btn secondary" aria-disabled="true">{label}</span>;
  return <Link className="btn secondary" to={to}>{label}</Link>;
}

export function Pagination({ page, total, pageSize, buildHref }) {
  if (total <= pageSize) return null;
  const lastPage = Math.ceil(total / pageSize);
  return (
    <nav className="pager" aria-label="Pagination">
      <PageLink label="Previous" to={page > 1 ? buildHref(page - 1) : null} />
      <PageLink label="Next" to={page < lastPage ? buildHref(page + 1) : null} />
    </nav>
  );
}
