import { useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { ArticleResults } from '../components/ArticleResults.jsx';
import { parsePage } from '../lib/format.js';

export function CategoryPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const page = parsePage(params.get('page'));
  const { data: categories } = useApi('/api/categories');
  const articles = useApi('/api/articles', { category: slug, page });
  const name = categories?.items?.find((c) => c.slug === slug)?.name ?? slug;

  return (
    <div className="wrap page">
      <h1>{name}</h1>
      <ArticleResults state={articles} page={page} buildHref={(p) => `/category/${slug}?page=${p}`} />
    </div>
  );
}
