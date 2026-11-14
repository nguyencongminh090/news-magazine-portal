import { useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { ArticleResults } from '../components/ArticleResults.jsx';
import { CategoryArt } from '../components/CategoryArt.jsx';
import { categoryArt } from '../lib/categoryArt.js';
import { parsePage } from '../lib/format.js';
import { NotFoundPage } from './NotFoundPage.jsx';

export function CategoryPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const page = parsePage(params.get('page'));
  const { data: categories } = useApi('/api/categories');
  const articles = useApi('/api/articles', { category: slug, page });
  const known = categories?.items?.find((c) => c.slug === slug);
  // Only a loaded list can prove a slug unknown; if it failed to load, keep the slug-based page.
  if (categories && !known) return <NotFoundPage />;
  const name = known?.name ?? slug;

  return (
    <div className="wrap page">
      <header className={`cat-head cat-${categoryArt(slug).key}`}>
        <div className="fig"><CategoryArt slug={slug} /></div>
        <div className="t">
          <h1>{name}</h1>
          {known && <p>{known.articleCount} {known.articleCount === 1 ? 'story' : 'stories'}</p>}
        </div>
      </header>
      <ArticleResults state={articles} page={page} buildHref={(p) => `/category/${slug}?page=${p}`} />
    </div>
  );
}
