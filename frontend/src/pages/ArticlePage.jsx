import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { StateView } from '../components/StateView.jsx';
import { formatDate } from '../lib/format.js';
import { CategoryArt, Kicker } from '../components/CategoryArt.jsx';
import { Engagement } from '../components/Engagement.jsx';
import { Icon } from '../components/Icon.jsx';
import { ReadingProgress } from '../components/ReadingProgress.jsx';
import { NotFoundPage } from './NotFoundPage.jsx';

/** Summary split into up to 3 sentences for the Key points box (no separate field exists in the API). */
export function keyPoints(summary) {
  return (summary ?? '').match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean).slice(0, 3) ?? [];
}

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
  const paragraphs = (article.body ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const points = keyPoints(article.summary);

  return (
    <>
      <ReadingProgress />
      <article className="article">
        <div className="hero-wrap">
          <figure className="hero"><CategoryArt slug={article.category?.slug} /></figure>
        </div>
        <div className="read">
          <Kicker category={article.category} />
          <h1>{article.title}</h1>
          {(article.authorName || date) && (
            <p className="byline meta">
              {article.authorName && <span><Icon name="user" />{article.authorName}</span>}
              {date && <span><Icon name="clock" /><time dateTime={article.publishedAt}>{date}</time></span>}
            </p>
          )}
          {points.length > 0 && (
            <section className="key" aria-labelledby="key-points">
              <h2 id="key-points"><Icon name="bulb" />Key points</h2>
              <ul>{points.map((p) => <li key={p}><Icon name="arrow" />{p}</li>)}</ul>
            </section>
          )}
          <div className="prose">{paragraphs.map((text, i) => <p key={i}>{text}</p>)}</div>
          <Engagement slug={article.slug} initial={article.engagement} />
        </div>
      </article>
    </>
  );
}
