import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatDate } from '../lib/format.js';

const PAGE_SIZE = 20;
const BODY_MAX = 2000;
const REASON_MAX = 1000;

export function engagementMessage(err, action) {
  if (err.status === 0) return 'Network error. Check your connection and try again.';
  if (err.status === 401) return `Sign in to ${action}.`;
  if (err.status === 403) return `Verify your email to ${action}.`;
  if (err.status === 409) return 'Already reported.';
  if (err.status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (err.status === 422 && err.errors?.length) return err.errors.map((e) => e.message).join(' ');
  return err.message || 'Something went wrong.';
}

/** Why the viewer cannot write, or null when they can (signed in + verified email). */
function GateNotice({ user }) {
  const location = useLocation();
  if (!user) {
    return (
      <p className="hint" role="note">
        <Link to="/login" state={{ from: location.pathname }}>Sign in</Link> with a verified email to rate, comment or report.
      </p>
    );
  }
  if (!user.emailVerified) return <p className="hint" role="note">Verify your email address to rate, comment or report.</p>;
  return null;
}

function RatingControl({ slug, summary, onSummary, canWrite }) {
  const { request } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { ratingAvg, ratingCount, myRating } = summary;

  async function rate(score) {
    if (busy) return;
    const previous = summary;
    const clearing = myRating === score;
    setBusy(true);
    setError('');
    onSummary({ ...summary, myRating: clearing ? null : score }); // optimistic; counts come from the server reply
    try {
      const next = await request(`/api/articles/${encodeURIComponent(slug)}/rating`, clearing
        ? { method: 'DELETE' }
        : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score }) });
      onSummary({ ...summary, ...next });
    } catch (err) {
      onSummary(previous);
      setError(engagementMessage(err, 'rate'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rating-block">
      <p className="rating-summary" aria-live="polite">
        {ratingCount > 0 ? `Average rating ${ratingAvg} of 5 (${ratingCount} ${ratingCount === 1 ? 'rating' : 'ratings'})` : 'No ratings yet'}
        {myRating ? ` · Your rating: ${myRating} of 5` : ''}
      </p>
      <div className="rating" role="group" aria-label="Rate this article">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`btn secondary star${myRating === n ? ' on' : ''}`}
            aria-pressed={myRating === n}
            aria-label={`Rate ${n} of 5`}
            disabled={!canWrite || busy}
            onClick={() => rate(n)}
          >
            {n} ★
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/** Inline reason form (no dialogs). `path` is the POST endpoint of the target. */
function ReportForm({ path, label }) {
  const { request } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ busy: false, error: '', done: false });

  async function submit(event) {
    event.preventDefault();
    setState({ busy: true, error: '', done: false });
    try {
      await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
      setState({ busy: false, error: '', done: true });
      setOpen(false);
    } catch (err) {
      const done = err.status === 409;
      setState({ busy: false, error: done ? '' : engagementMessage(err, 'report'), done });
      if (done) setOpen(false);
    }
  }

  if (state.done) return <span className="hint" role="status">Reported. Thank you.</span>;
  if (!open) {
    return <button type="button" className="link-btn" aria-label={label} onClick={() => setOpen(true)}>Report</button>;
  }
  return (
    <form className="report-form" onSubmit={submit}>
      <label htmlFor={`${path}-reason`}>Reason for report</label>
      <textarea id={`${path}-reason`} value={reason} maxLength={REASON_MAX} rows={3} onChange={(e) => setReason(e.target.value)} required />
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <p>
        <button className="btn" type="submit" disabled={state.busy || !reason.trim()}>Send report</button>{' '}
        <button className="btn secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </p>
    </form>
  );
}

function CommentForm({ slug, onPosted }) {
  const { request } = useAuth();
  const [body, setBody] = useState('');
  const [state, setState] = useState({ busy: false, error: '' });

  async function submit(event) {
    event.preventDefault();
    setState({ busy: true, error: '' });
    try {
      const comment = await request(`/api/articles/${encodeURIComponent(slug)}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: body.trim() }),
      });
      setBody('');
      setState({ busy: false, error: '' });
      onPosted(comment);
    } catch (err) {
      setState({ busy: false, error: err.status === 409 ? 'You already posted this comment.' : engagementMessage(err, 'comment') });
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="comment-body">Add a comment</label>
      <textarea id="comment-body" value={body} maxLength={BODY_MAX} rows={4} onChange={(e) => setBody(e.target.value)} required />
      <p className="hint">{body.length} / {BODY_MAX}</p>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <p><button className="btn" type="submit" disabled={state.busy || !body.trim()}>Post comment</button></p>
    </form>
  );
}

function CommentList({ slug, canWrite, onTotal, items, setItems }) {
  const [state, setState] = useState({ total: 0, page: 0, loading: true, error: null });

  const load = useCallback(async (page) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiGet(`/api/articles/${encodeURIComponent(slug)}/comments`, { page, pageSize: PAGE_SIZE });
      setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
      setState({ total: res.total, page, loading: false, error: null });
      onTotal(res.total);
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [slug, setItems, onTotal]);

  useEffect(() => { load(1); }, [load]);

  if (state.error && items.length === 0) {
    return (
      <div className="stack">
        <p className="error" role="alert">{state.error.title ?? 'Could not load comments'}</p>
        <button className="btn secondary" type="button" onClick={() => load(1)}>Try again</button>
      </div>
    );
  }
  if (state.loading && items.length === 0) return <p className="state" role="status">Loading comments…</p>;
  if (items.length === 0) return <p className="hint">No comments yet</p>;
  return (
    <>
      <ul className="comments" style={{ listStyle: 'none', padding: 0 }}>
        {items.map((c) => (
          <li key={c.id} className="comment">
            <p className="muted"><strong>{c.author?.displayName ?? 'Deleted user'}</strong> · {formatDate(c.createdAt)}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{c.body}</p>
            {canWrite && <ReportForm path={`/api/comments/${c.id}/reports`} label={`Report comment by ${c.author?.displayName ?? 'deleted user'}`} />}
          </li>
        ))}
      </ul>
      {state.error && <p className="error" role="alert">{state.error.title ?? 'Could not load more comments'}</p>}
      {items.length < state.total && (
        <button className="btn secondary" type="button" disabled={state.loading} onClick={() => load(state.page + 1)}>Show more comments</button>
      )}
    </>
  );
}

const EMPTY = { ratingAvg: null, ratingCount: 0, commentCount: 0, myRating: null };

/** Rating, comments and reports for one article. `initial` = `article.engagement` (anonymous view of the counts). */
export function Engagement({ slug, initial }) {
  const { user, request } = useAuth();
  const [summary, setSummary] = useState({ ...EMPTY, ...initial });
  const [items, setItems] = useState([]);
  const canWrite = Boolean(user?.emailVerified);
  const userId = user?.id ?? null;

  // The public article fetch is anonymous; with a session, re-read it once to learn the caller's own rating.
  useEffect(() => {
    if (userId === null) return undefined;
    let live = true;
    request(`/api/articles/${encodeURIComponent(slug)}`).then(
      (a) => live && a?.engagement && setSummary((s) => ({ ...s, myRating: a.engagement.myRating })),
      () => {},
    );
    return () => { live = false; };
  }, [slug, userId, request]);

  const onTotal = useCallback((total) => setSummary((s) => ({ ...s, commentCount: total })), []);
  const onPosted = (comment) => {
    setItems((prev) => [...prev, comment]);
    setSummary((s) => ({ ...s, commentCount: s.commentCount + 1 }));
  };

  return (
    <>
      <section aria-labelledby="rating-heading">
        <h2 id="rating-heading">Rating</h2>
        <RatingControl slug={slug} summary={summary} onSummary={setSummary} canWrite={canWrite} />
        {canWrite && <ReportForm path={`/api/articles/${encodeURIComponent(slug)}/reports`} label="Report this article" />}
      </section>
      <section aria-labelledby="comments-heading">
        <h2 id="comments-heading">Comments ({summary.commentCount})</h2>
        <GateNotice user={user} />
        <CommentList slug={slug} canWrite={canWrite} onTotal={onTotal} items={items} setItems={setItems} />
        {canWrite && <CommentForm slug={slug} onPosted={onPosted} />}
      </section>
    </>
  );
}
