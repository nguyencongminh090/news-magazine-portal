import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { StateView } from '../components/StateView.jsx';
import { formatDate } from '../lib/format.js';
import { NotFoundPage } from './NotFoundPage.jsx';

export function ArticlePage() {
  const { slug } = useParams();
  const { data: article, error, loading, reload } = useApi(`/api/articles/${encodeURIComponent(slug)}`);
  const title = article?.title;

  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    document.title = `${title} · News Portal`;
    return () => { document.title = previous; };
  }, [title]);

  if (error?.status === 404) return <NotFoundPage />;
  if (!article) {
    return <div className="wrap page"><StateView loading={loading} error={error} onRetry={reload} /></div>;
  }

  const date = formatDate(article.publishedAt);
  const byline = [article.authorName, date].filter(Boolean).join(' · ');
  const paragraphs = (article.body ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <article className="article">
      {article.category && <span className="cat">{article.category.name}</span>}
      <h1>{article.title}</h1>
      {byline && <p className="muted">{byline}</p>}
      {article.summary && <p><strong>{article.summary}</strong></p>}
      {paragraphs.map((text, i) => <p key={i}>{text}</p>)}
      <section aria-labelledby="comments-heading">
        <h2 id="comments-heading">Comments</h2>
        <p className="hint">Comments are not available yet.</p>
      </section>
    </article>
  );
}
