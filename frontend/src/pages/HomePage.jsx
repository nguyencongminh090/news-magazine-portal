import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { ArticleListItem } from '../components/ArticleListItem.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { StateView } from '../components/StateView.jsx';
import { formatDate, parsePage } from '../lib/format.js';

function ArticleMeta({ article }) {
  const date = formatDate(article.publishedAt);
  return (
    <>
      {article.category && <span className="cat">{article.category.name}</span>}
      {date && <span className="muted"> {date}</span>}
    </>
  );
}

function Categories() {
  const { data } = useApi('/api/categories');
  if (!data?.items?.length) return null;
  return (
    <aside aria-labelledby="home-categories">
      <h2 id="home-categories">Categories</h2>
      <ol>
        {data.items.map((c) => (
          <li key={c.slug}><Link to={`/category/${c.slug}`}>{c.name}</Link> <span className="muted">({c.articleCount})</span></li>
        ))}
      </ol>
    </aside>
  );
}

export function HomePage() {
  const [params] = useSearchParams();
  const page = parsePage(params.get('page'));
  const { data, error, loading, reload } = useApi('/api/articles', { page });
  const items = data?.items ?? [];
  const [lead, ...rest] = page === 1 ? items : [];
  const secondary = rest.slice(0, 2);
  const listed = page === 1 ? rest.slice(2) : items;

  return (
    <div className="wrap home">
      <div>
        <StateView loading={loading} error={error} empty={!loading && !error && items.length === 0} onRetry={reload} />
        {lead && (
          <section className="lead" aria-label="Top story">
            <div>
              <ArticleMeta article={lead} />
              <h1><Link to={`/articles/${lead.slug}`}>{lead.title}</Link></h1>
              {lead.summary && <p>{lead.summary}</p>}
            </div>
            <div className="second">
              {secondary.map((a) => (
                <div key={a.slug}>
                  <ArticleMeta article={a} />
                  <h3><Link to={`/articles/${a.slug}`}>{a.title}</Link></h3>
                </div>
              ))}
            </div>
          </section>
        )}
        {listed.length > 0 && (
          <>
            {page > 1 && <h1>Latest news</h1>}
            <ul className="list">{listed.map((a) => <ArticleListItem key={a.slug} article={a} />)}</ul>
          </>
        )}
        {data && <Pagination page={page} total={data.total} pageSize={data.pageSize} buildHref={(p) => `/?page=${p}`} />}
      </div>
      <Categories />
    </div>
  );
}
