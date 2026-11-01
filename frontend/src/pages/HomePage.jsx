import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { DateMeta } from '../components/ArticleMeta.jsx';
import { ArticleListItem } from '../components/ArticleListItem.jsx';
import { CategoryArt, Kicker } from '../components/CategoryArt.jsx';
import { Icon } from '../components/Icon.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { StateView } from '../components/StateView.jsx';
import { Wave } from '../components/Wave.jsx';
import { categoryArt } from '../lib/categoryArt.js';
import { parsePage } from '../lib/format.js';

function Categories() {
  const { data } = useApi('/api/categories');
  if (!data?.items?.length) return null;
  return (
    <aside aria-labelledby="home-categories">
      <h2 id="home-categories" className="side-h">Categories</h2>
      <ol className="topics">
        {data.items.map((c) => {
          const { icon, key } = categoryArt(c.slug);
          return (
            <li key={c.slug} className={`topic card cat-${key}`}>
              <div className="fig"><CategoryArt slug={c.slug} /></div>
              <span className="t">
                <span className="dot"><Icon name={icon} /></span>
                <span><Link to={`/category/${c.slug}`}>{c.name}</Link> <small className="muted">({c.articleCount})</small></span>
              </span>
            </li>
          );
        })}
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
    <>
      <div className="wrap">
        <StateView loading={loading} error={error} empty={!loading && !error && items.length === 0} onRetry={reload} />
        {lead && (
          <section className="lead" aria-label="Top story">
            <div className="lead-fig"><CategoryArt slug={lead.category?.slug} /></div>
            <div className="lead-body">
              <Kicker category={lead.category} />
              <h1><Link to={`/articles/${lead.slug}`}>{lead.title}</Link></h1>
              {lead.summary && <p className="dek">{lead.summary}</p>}
              <DateMeta iso={lead.publishedAt} />
              <Link className="btn" to={`/articles/${lead.slug}`}>Read story<Icon name="arrow" /></Link>
            </div>
          </section>
        )}
        {secondary.length > 0 && (
          <div className="duo">
            {secondary.map((a) => (
              <article key={a.slug} className="story card">
                <div className="fig"><CategoryArt slug={a.category?.slug} /></div>
                <div className="txt">
                  <Kicker category={a.category} />
                  <h2><Link to={`/articles/${a.slug}`}>{a.title}</Link></h2>
                  <DateMeta iso={a.publishedAt} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <Wave />
      <div className="band">
        <div className="wrap home">
          <div>
            {listed.length > 0 && (
              <>
                <div className="section-h">
                  <Icon name="bulb" />
                  {page > 1 ? <h1>Latest news</h1> : <h2>Latest news</h2>}
                </div>
                <ul className="list">{listed.map((a) => <ArticleListItem key={a.slug} article={a} />)}</ul>
              </>
            )}
            {data && <Pagination page={page} total={data.total} pageSize={data.pageSize} buildHref={(p) => `/?page=${p}`} />}
          </div>
          <Categories />
        </div>
      </div>
      <Wave flip />
    </>
  );
}
