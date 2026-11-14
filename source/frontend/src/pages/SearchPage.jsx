import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ArticleResults } from '../components/ArticleResults.jsx';
import { Icon } from '../components/Icon.jsx';
import { parsePage } from '../lib/format.js';

const EXAMPLE_QUERIES = [
  '"World Passport"',
  'Manchester AND Green',
  'Pope Africa',
  'Obama -Biden',
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const outlet = useOutletContext();
  const categories = outlet?.categories ?? [];
  const { user, request } = useAuth();
  const [tagOptions, setTagOptions] = useState([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [discovery, setDiscovery] = useState({ loaded: false, loading: false, tags: [], recs: [], error: '' });
  const suggestSeq = useRef(0);
  const sortTouched = useRef(false);

  const q = (params.get('q') ?? '').trim();
  const category = (params.get('category') ?? '').trim();
  const tag = (params.get('tag') ?? '').trim();
  const from = (params.get('from') ?? '').trim();
  const to = (params.get('to') ?? '').trim();
  const sort = (params.get('sort') ?? '').trim();
  const model = (params.get('model') ?? 'bm25').trim();
  const prf = params.get('prf') === '1' ? '1' : '';
  const explain = params.get('explain') === '1' ? '1' : '';
  const page = parsePage(params.get('page'));

  useEffect(() => {
    sortTouched.current = false;
  }, [q, sort]);

  const hasFilters = Boolean(q || category || tag || from || to);
  const queryParams = { page };
  if (q) queryParams.q = q;
  if (category) queryParams.category = category;
  if (tag) queryParams.tag = tag;
  if (from) queryParams.from = from;
  if (to) queryParams.to = to;
  if (sort && (sort !== 'latest' || q)) queryParams.sort = sort;
  if (model && model !== 'bm25') queryParams.model = model;
  if (prf === '1') queryParams.prf = '1';
  if (explain === '1') queryParams.explain = '1';

  const articles = useApi(hasFilters ? '/api/articles' : null, queryParams);
  const searchMeta = articles.data?.searchMeta ?? null;

  function loadTagSuggestions() {
    if (tagsLoaded) return;
    setTagsLoaded(true);
    apiGet('/api/tags').then((d) => setTagOptions(d?.items ?? []), () => {});
  }

  function handleQueryInput(e) {
    const val = e.target.value.trim();
    const seq = ++suggestSeq.current;
    if (val.length < 2) {
      setSuggestions(null);
      return;
    }
    apiGet(`/api/search/suggest?q=${encodeURIComponent(val)}`).then(
      (d) => {
        if (suggestSeq.current === seq) setSuggestions(d);
      },
      () => {},
    );
  }

  async function loadDiscovery() {
    setDiscovery((d) => ({ ...d, loading: true, error: '' }));
    try {
      const [cloudRes, recRes] = await Promise.all([
        apiGet('/api/search/tag-cloud'),
        user ? request('/api/search/recommendations') : apiGet('/api/search/recommendations'),
      ]);
      setDiscovery({
        loaded: true,
        loading: false,
        tags: cloudRes?.items ?? [],
        recs: recRes?.items ?? [],
        error: '',
      });
    } catch (err) {
      setDiscovery({ loaded: true, loading: false, tags: [], recs: [], error: err.message || 'Could not load discovery data.' });
    }
  }

  function applyFilters(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['q', 'category', 'tag', 'from', 'to']) {
      const val = f.get(key)?.toString().trim();
      if (val) next.set(key, val);
    }
    const qVal = f.get('q')?.toString().trim() ?? '';
    const nextSort = f.get('sort')?.toString().trim();
    if (nextSort && nextSort !== 'latest' && nextSort !== 'relevance') next.set('sort', nextSort);
    else if (nextSort === 'relevance' && qVal) next.set('sort', 'relevance');
    else if (nextSort === 'latest' && qVal && (q || sortTouched.current)) next.set('sort', 'latest');
    const nextModel = f.get('model')?.toString().trim();
    if (nextModel && nextModel !== 'bm25') next.set('model', nextModel);
    if (f.get('prf') === '1') next.set('prf', '1');
    if (f.get('explain') === '1') next.set('explain', '1');
    setSuggestions(null);
    setParams(next);
  }

  function runWithQuery(nextQ) {
    const next = new URLSearchParams(params);
    next.set('q', nextQ);
    next.delete('page');
    setSuggestions(null);
    setParams(next);
  }

  function logSearchClick(article, rankPosition) {
    const queryString = q || [category && `category:${category}`, tag && `tag:${tag}`, from && `from:${from}`, to && `to:${to}`].filter(Boolean).join(' ');
    if (!queryString) return;
    const bodyObj = { queryString, slug: article.slug };
    if (searchMeta?.queryLogId != null) {
      bodyObj.queryLogId = searchMeta.queryLogId;
      if (rankPosition >= 1) bodyObj.rankPosition = rankPosition;
      if (searchMeta.model) bodyObj.retrievalModel = searchMeta.model;
    }
    const payload = JSON.stringify(bodyObj);
    if (user) {
      request('/api/search-clicks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } else {
      fetch('/api/search-clicks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }

  const buildHref = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    return `/search?${next}`;
  };

  const heading = q
    ? `Results for "${q}"`
    : hasFilters
      ? `Filtered articles${tag ? ` · #${tag}` : ''}`
      : 'Search';

  return (
    <div className="wrap page">
      <h1>{heading}</h1>
      <form
        className="search-filters card"
        role="search"
        aria-label="Filter articles"
        onSubmit={applyFilters}
        key={`${q}|${category}|${tag}|${from}|${to}|${sort}|${model}|${prf}|${explain}`}
      >
        <div className="filter-grid">
          <div>
            <label htmlFor="f-q">Keyword or Boolean query</label>
            <input
              id="f-q"
              type="search"
              name="q"
              defaultValue={q}
              list="search-term-suggestions"
              placeholder='e.g. "World Passport", Africa AND Pope, Obama -Biden'
              maxLength={200}
              onChange={handleQueryInput}
            />
            <datalist id="search-term-suggestions">
              {(suggestions?.terms ?? []).map((t) => <option key={t.term} value={t.term} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="f-model">Retrieval model</label>
            <select id="f-model" name="model" defaultValue={model}>
              <option value="bm25">Okapi BM25 (Fielded)</option>
              <option value="hybrid">Hybrid (BM25 + Proximity + Freshness)</option>
              <option value="tfidf">Vector Space (TF-IDF Cosine)</option>
              <option value="ql">Language Model (Query Likelihood)</option>
              <option value="boolean">Boolean (AND / OR / NOT / Phrase)</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-cat">Category</label>
            <select id="f-cat" name="category" defaultValue={category}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-tag">Tag</label>
            <input
              id="f-tag"
              type="text"
              name="tag"
              defaultValue={tag}
              list="search-tag-options"
              placeholder="e.g. politics, oil"
              maxLength={50}
              onFocus={loadTagSuggestions}
            />
            <datalist id="search-tag-options">
              {tagOptions.map((t) => <option key={t.slug} value={t.name} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="f-from">From date</label>
            <input id="f-from" type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <label htmlFor="f-to">To date</label>
            <input id="f-to" type="date" name="to" defaultValue={to} />
          </div>
          <div>
            <label htmlFor="f-sort">Sort by</label>
            <select
              id="f-sort"
              name="sort"
              defaultValue={sort || (q ? 'relevance' : 'latest')}
              onChange={() => { sortTouched.current = true; }}
            >
              <option value="relevance">Relevance (IR Score)</option>
              <option value="latest">Newest first</option>
              <option value="views">Most viewed</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>
        <div className="role-checks" style={{ marginTop: 12 }}>
          <label className="check-inline">
            <input type="checkbox" name="prf" value="1" defaultChecked={prf === '1'} />
            Pseudo-Relevance Feedback (RM3 expansion)
          </label>
          <label className="check-inline">
            <input type="checkbox" name="explain" value="1" defaultChecked={explain === '1'} />
            Explain ranking scores
          </label>
        </div>
        <div className="bar" style={{ justifyContent: 'flex-start', marginBottom: 0, marginTop: 14 }}>
          <button className="btn" type="submit"><Icon name="sliders" /> Apply filters</button>
          {hasFilters && <Link className="btn secondary" to="/search">Clear filters</Link>}
        </div>
      </form>

      {searchMeta && (
        <section className="search-telemetry card box" aria-label="Search engine diagnostics">
          <div className="meta">
            <span><strong>{articles.data?.total ?? 0}</strong> matches</span>
            <span>Latency: <strong>{searchMeta.latencyMs} ms</strong></span>
            <span>Model: <strong>{String(searchMeta.model || 'bm25').toUpperCase()}</strong></span>
            {searchMeta.queryLogId != null && <span>Query log #{searchMeta.queryLogId}</span>}
          </div>

          {searchMeta.suggestion?.correctedQuery && (
            <p className="did-you-mean">
              Did you mean{' '}
              <button type="button" className="link-btn" onClick={() => runWithQuery(searchMeta.suggestion.correctedQuery)}>
                {searchMeta.suggestion.correctedQuery}
              </button>
              ?
            </p>
          )}

          {searchMeta.expansions?.length > 0 && (
            <div className="expansion-row">
              <span className="muted">Related terms (Dice&apos;s coefficient):</span>
              {searchMeta.expansions.map((exp) => (
                <button
                  key={exp.stem}
                  type="button"
                  className="chip-btn"
                  onClick={() => runWithQuery(`${q} ${exp.term}`.trim())}
                  title={`Dice=${exp.diceScore} (${exp.coOccurrences} docs)`}
                >
                  + {exp.term}
                </button>
              ))}
            </div>
          )}

          {searchMeta.prfTerms?.length > 0 && (
            <div className="expansion-row">
              <span className="muted">RM3 feedback terms applied:</span>
              {searchMeta.prfTerms.map((t) => (
                <span key={t.stem} className="score-pill">{t.term} ({t.weight})</span>
              ))}
            </div>
          )}

          {searchMeta.clusters?.length > 0 && (
            <details className="cluster-box">
              <summary>Topic clusters ({searchMeta.clusters.length} K-Means groups)</summary>
              <div className="cluster-grid">
                {searchMeta.clusters.map((cl) => (
                  <div key={cl.id} className="cluster-card">
                    <strong>{cl.label} ({cl.count})</strong>
                    <ul>
                      {cl.articles.map((a) => (
                        <li key={a.slug}><Link to={`/articles/${a.slug}`}>{a.title}</Link></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {hasFilters ? (
        <ArticleResults state={articles} page={page} buildHref={buildHref} onResultClick={logSearchClick} />
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          <p className="hint">Enter a search term in the box above or choose filters to find articles.</p>
          <div className="expansion-row">
            <span className="muted">Try IR queries:</span>
            {EXAMPLE_QUERIES.map((ex) => (
              <button key={ex} type="button" className="chip-btn" onClick={() => runWithQuery(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <div>
            <button type="button" className="btn secondary" onClick={loadDiscovery} disabled={discovery.loading}>
              <Icon name="tag" /> {discovery.loading ? 'Loading…' : 'Explore Tag Cloud & Social Recommendations'}
            </button>
          </div>
          {discovery.error && <p className="error" role="alert">{discovery.error}</p>}
          {discovery.loaded && !discovery.error && (
            <div className="analytics-grid">
              {discovery.tags.length > 0 && (
                <section className="card box" aria-labelledby="tag-cloud-h">
                  <h2 id="tag-cloud-h">Tag Cloud</h2>
                  <div className="tag-cloud" style={{ marginTop: 12 }}>
                    {discovery.tags.map((t) => (
                      <Link key={t.slug} to={`/search?tag=${encodeURIComponent(t.name)}`} className={`cloud-w-${t.weight}`}>
                        {t.name} ({t.count})
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {discovery.recs.length > 0 && (
                <section className="card box" aria-labelledby="recs-h">
                  <h2 id="recs-h">{user ? 'Recommended for You' : 'Recommended Reading'}</h2>
                  <ul className="plain-list" style={{ marginTop: 12 }}>
                    {discovery.recs.map((r) => (
                      <li key={r.slug}>
                        <Link to={`/articles/${r.slug}`}>{r.title}</Link>
                        {r.recommendationReason && <div className="muted">{r.recommendationReason}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
