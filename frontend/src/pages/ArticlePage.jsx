import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useAuth } from '../auth/AuthContext.jsx';
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

function ArticleTags({ slug, initialTags = [], initialMyUserTags = [] }) {
  const { user, request } = useAuth();
  const [tags, setTags] = useState(initialTags);
  const [myTags, setMyTags] = useState(initialMyUserTags);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggested, setSuggested] = useState(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const canTag = Boolean(user?.emailVerified);

  useEffect(() => { setTags(initialTags); }, [initialTags]);
  useEffect(() => { setMyTags(initialMyUserTags); }, [initialMyUserTags]);
  useEffect(() => { setSuggested(null); }, [slug]);

  async function addTagValue(tagName) {
    const clean = String(tagName || '').trim();
    if (!clean || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await request(`/api/articles/${encodeURIComponent(slug)}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: clean }),
      });
      if (res?.tags) setTags(res.tags);
      if (res?.myUserTags) setMyTags(res.myUserTags);
      if (clean === newTag.trim()) setNewTag('');
      setSuggested((prev) => (prev ? {
        ...prev,
        tags: (prev.tags ?? []).filter((t) => t.tag.toLowerCase() !== clean.toLowerCase()),
      } : prev));
    } catch (err) {
      setError(err.errors?.[0]?.message || err.message || 'Could not add tag.');
    } finally {
      setBusy(false);
    }
  }

  async function addTag(event) {
    event.preventDefault();
    await addTagValue(newTag);
  }

  async function loadSuggestedTags() {
    if (suggestBusy) return;
    setSuggestBusy(true);
    try {
      const data = await apiGet(`/api/articles/${encodeURIComponent(slug)}/suggested-tags`);
      const tagSuggestions = Array.isArray(data?.tags)
        ? data.tags.filter((t) => t && typeof t === 'object' && t.tag)
        : [];
      const entities = Array.isArray(data?.entities) ? data.entities : [];
      setSuggested({ tags: tagSuggestions, entities });
    } catch {
      // ignore suggestion fetch errors
    } finally {
      setSuggestBusy(false);
    }
  }

  async function removeTag(tagName) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await request(`/api/articles/${encodeURIComponent(slug)}/tags/${encodeURIComponent(tagName)}`, {
        method: 'DELETE',
      });
      if (res?.tags) setTags(res.tags);
      if (res?.myUserTags) setMyTags(res.myUserTags);
    } catch (err) {
      setError(err.message || 'Could not remove tag.');
    } finally {
      setBusy(false);
    }
  }

  if (!tags.length && !canTag) return null;

  return (
    <section className="tags-section" aria-labelledby="article-tags-h">
      <h2 id="article-tags-h">Tags</h2>
      {tags.length > 0 ? (
        <div className="tags">
          {tags.map((t) => {
            const isMine = myTags.includes(t);
            return (
              <span key={t} className="tag-chip">
                <Link to={`/search?tag=${encodeURIComponent(t)}`}>
                  <Icon name="tag" /> {t}
                </Link>
                {isMine && (
                  <button
                    type="button"
                    className="tag-remove"
                    aria-label={`Remove your tag ${t}`}
                    disabled={busy}
                    onClick={() => removeTag(t)}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="hint">No tags yet. Be the first to tag this article.</p>
      )}
      {canTag && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <form className="tag-add-form" style={{ marginTop: 0 }} onSubmit={addTag}>
            <label htmlFor="add-user-tag" className="sr-only">Add a community tag</label>
            <input
              id="add-user-tag"
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add a tag (e.g. Energy)"
              maxLength={50}
            />
            <button className="btn secondary" type="submit" disabled={busy || !newTag.trim()}>Add tag</button>
            <button className="btn secondary" type="button" onClick={loadSuggestedTags} disabled={suggestBusy}>
              {suggestBusy ? 'Inferring…' : 'Suggest tags'}
            </button>
          </form>
          {suggested?.tags?.length > 0 && (
            <div className="expansion-row">
              <span className="muted">TF-IDF suggested tags:</span>
              {suggested.tags.map((t) => (
                <button
                  key={t.stem ?? t.tag}
                  type="button"
                  className="chip-btn"
                  disabled={busy}
                  onClick={() => addTagValue(t.tag)}
                >
                  + {t.tag}
                </button>
              ))}
            </div>
          )}
          {suggested?.entities?.length > 0 && (
            <p className="muted" style={{ margin: 0 }}>
              Key entities: {suggested.entities.slice(0, 5).map((e) => e.name).join(', ')}
            </p>
          )}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

export function ArticlePage() {
  const { slug } = useParams();
  const outlet = useOutletContext();
  const { user, request } = useAuth();
  const { data: article, error, loading, reload } = useApi(`/api/articles/${encodeURIComponent(slug)}`);
  const [imgFailed, setImgFailed] = useState(false);
  const [authSync, setAuthSync] = useState(null);
  const [related, setRelated] = useState([]);
  const title = article?.title;
  const userId = user?.id ?? null;

  useEffect(() => {
    setImgFailed(false);
    setAuthSync(null);
    setRelated([]);
  }, [slug]);

  useEffect(() => {
    if (!article) return undefined;
    let live = true;
    apiGet(`/api/articles/${encodeURIComponent(slug)}/related`).then(
      (d) => {
        if (live && Array.isArray(d?.items)) setRelated(d.items);
      },
      () => {},
    );
    return () => { live = false; };
  }, [slug, article]);

  useEffect(() => {
    if (userId === null || !article) {
      if (userId === null) setAuthSync(null);
      return undefined;
    }
    let live = true;
    request(`/api/articles/${encodeURIComponent(slug)}?view=0`).then(
      (a) => {
        if (!live || !a) return;
        setAuthSync({
          slug,
          tags: a.tags,
          myUserTags: a.myUserTags,
          myRating: a.engagement?.myRating,
          likes: a.likes,
        });
      },
      () => {},
    );
    return () => { live = false; };
  }, [slug, userId, article, request]);

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
  const showHeroImg = Boolean(article.ogImageUrl) && !imgFailed;

  const synced = authSync?.slug === slug ? authSync : null;
  const effectiveTags = synced?.tags ?? article.tags;
  const effectiveMyUserTags = synced?.myUserTags ?? article.myUserTags;
  const effectiveEngagement = synced?.myRating !== undefined
    ? { ...article.engagement, myRating: synced.myRating }
    : article.engagement;
  const effectiveLikes = synced?.likes ?? article.likes;
  const commentsAllowed = outlet?.settings?.allow_comments !== false;

  return (
    <>
      <ReadingProgress />
      <article className="article">
        <div className="hero-wrap">
          <figure className="hero">
            {showHeroImg ? (
              <img
                className="art"
                src={article.ogImageUrl}
                alt={article.imageAlt || article.title}
                onError={() => setImgFailed(true)}
              />
            ) : (
              <CategoryArt slug={article.category?.slug} />
            )}
          </figure>
        </div>
        <div className="read">
          <Kicker category={article.category} />
          <h1>{article.title}</h1>
          {(article.authorName || date || article.viewsCount != null) && (
            <p className="byline meta">
              {article.authorName && <span><Icon name="user" />{article.authorName}</span>}
              {date && <span><Icon name="clock" /><time dateTime={article.publishedAt}>{date}</time></span>}
              {article.viewsCount != null && (
                <span><Icon name="eye" />{Number(article.viewsCount).toLocaleString('en-GB')} views</span>
              )}
            </p>
          )}
          {points.length > 0 && (
            <section className="key" aria-labelledby="key-points">
              <h2 id="key-points"><Icon name="bulb" />Key points</h2>
              <ul>{points.map((p) => <li key={p}><Icon name="arrow" />{p}</li>)}</ul>
            </section>
          )}
          <div className="prose">{paragraphs.map((text, i) => <p key={i}>{text}</p>)}</div>
          <ArticleTags slug={article.slug} initialTags={effectiveTags} initialMyUserTags={effectiveMyUserTags} />
          {related.length > 0 && (
            <section className="tags-section" aria-labelledby="related-articles-h">
              <h2 id="related-articles-h">Related Articles</h2>
              <ul className="plain-list" style={{ marginTop: 12 }}>
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link to={`/articles/${r.slug}`}>{r.title}</Link>
                    {r.category?.name && <span className="muted"> · {r.category.name}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Engagement
            slug={article.slug}
            initial={effectiveEngagement}
            initialLikes={effectiveLikes}
            skipAuthSync
            commentsAllowed={commentsAllowed}
          />
        </div>
      </article>
    </>
  );
}
