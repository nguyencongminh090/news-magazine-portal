import { Link } from 'react-router-dom';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { StateView } from '../components/StateView.jsx';
import { formatDate } from '../lib/format.js';

export function AdminAnalyticsPage() {
  const { data, loading, error, reload } = useAuthedApi('/api/admin/analytics');

  if (loading || error) return <StateView loading={loading} error={error} onRetry={reload} />;
  const o = data?.overview ?? {};

  return (
    <div className="stack">
      <div className="bar">
        <h1>Analytics &amp; Phase-2 Search Telemetry</h1>
        <div className="bar" style={{ marginBottom: 0 }}>
          <Link className="btn secondary" to="/admin/search-engine">Open Search Engine Lab</Link>
          <button type="button" className="btn secondary" onClick={reload}>Refresh</button>
        </div>
      </div>

      <section className="kpi-grid" aria-label="Portal overview metrics">
        <div className="card box kpi"><strong>{o.publishedArticles ?? 0}</strong><span>Published articles ({o.totalArticles ?? 0} total)</span></div>
        <div className="card box kpi"><strong>{(o.totalViews ?? 0).toLocaleString('en-GB')}</strong><span>Total article views</span></div>
        <div className="card box kpi"><strong>{o.totalSearchClicks ?? 0}</strong><span>Search clicks logged</span></div>
        <div className="card box kpi"><strong>{o.totalComments ?? 0}</strong><span>Comments</span></div>
        <div className="card box kpi"><strong>{o.avgRating != null ? `${o.avgRating} / 5` : '—'}</strong><span>Avg rating ({o.totalRatings ?? 0})</span></div>
        <div className="card box kpi"><strong>{o.totalLikes ?? 0}</strong><span>Article likes</span></div>
      </section>

      <div className="analytics-grid">
        <section className="card box" aria-labelledby="top-queries-h">
          <h2 id="top-queries-h">Top Search Queries (search_click_log)</h2>
          {data?.topQueries?.length ? (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Query</th><th>Clicks</th><th>Unique Docs</th></tr></thead>
                <tbody>
                  {data.topQueries.map((q) => (
                    <tr key={q.queryString}>
                      <td>{q.queryString}</td>
                      <td>{q.clicks}</td>
                      <td>{q.uniqueDocs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 8 }}>No search clicks logged yet. Search on the portal and click an article to record telemetry.</p>
          )}
        </section>

        <section className="card box" aria-labelledby="cat-stats-h">
          <h2 id="cat-stats-h">Views by Category</h2>
          {data?.categoryStats?.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Category</th><th>Articles</th><th>Views</th></tr></thead>
                <tbody>
                  {data.categoryStats.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.articleCount}</td>
                      <td>{Number(c.totalViews).toLocaleString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card box" aria-labelledby="top-articles-h">
        <h2 id="top-articles-h">Most Viewed Articles</h2>
        {data?.topArticles?.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Title</th><th>Category</th><th>Views</th><th>Comments</th><th>Rating</th></tr></thead>
              <tbody>
                {data.topArticles.map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/articles/${a.slug}`}>{a.title}</Link></td>
                    <td>{a.categoryName}</td>
                    <td>{a.viewsCount.toLocaleString('en-GB')}</td>
                    <td>{a.commentCount}</td>
                    <td>{a.ratingAvg != null ? `${a.ratingAvg} / 5` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card box" aria-labelledby="recent-clicks-h">
        <h2 id="recent-clicks-h">Recent Search Clicks</h2>
        {data?.recentSearchClicks?.length ? (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Query</th><th>Clicked Article</th><th>User</th><th>Time</th></tr></thead>
              <tbody>
                {data.recentSearchClicks.map((c) => (
                  <tr key={c.id}>
                    <td>{c.queryString}</td>
                    <td><Link to={`/articles/${c.article.slug}`}>{c.article.title}</Link></td>
                    <td>{c.userName ?? 'Anonymous'}</td>
                    <td>{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 8 }}>No recent click events.</p>
        )}
      </section>
    </div>
  );
}
