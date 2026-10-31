import { useSearchParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { ArticleResults } from '../components/ArticleResults.jsx';
import { parsePage } from '../lib/format.js';

export function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const page = parsePage(params.get('page'));
  const articles = useApi(q ? '/api/articles' : null, { q, page });

  const buildHref = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    return `/search?${next}`;
  };

  return (
    <main className="wrap page">
      {q ? (
        <>
          <h1>Results for "{q}"</h1>
          <ArticleResults state={articles} page={page} buildHref={buildHref} />
        </>
      ) : (
        <>
          <h1>Search</h1>
          <p>Enter a search term in the box above to find articles.</p>
        </>
      )}
    </main>
  );
}
