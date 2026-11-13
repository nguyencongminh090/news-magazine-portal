import { ArticleListItem } from './ArticleListItem.jsx';
import { Pagination } from './Pagination.jsx';
import { StateView } from './StateView.jsx';

/** Shared list + loading/error/empty + pager for Category and Search (result of `useApi('/api/articles')`). */
export function ArticleResults({ state: { data, error, loading, reload }, page, buildHref, onResultClick }) {
  const items = data?.items ?? [];
  const pageSize = data?.pageSize ?? 20;
  return (
    <>
      <StateView loading={loading} error={error} empty={!loading && !error && items.length === 0} onRetry={reload} />
      {items.length > 0 && (
        <ul className="list results">
          {items.map((a, idx) => (
            <ArticleListItem
              key={a.slug}
              article={a}
              headingLevel={2}
              rank={(page - 1) * pageSize + idx + 1}
              onSelect={onResultClick}
            />
          ))}
        </ul>
      )}
      {data && <Pagination page={page} total={data.total} pageSize={data.pageSize} buildHref={buildHref} />}
    </>
  );
}
