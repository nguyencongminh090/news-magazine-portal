import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { Pagination } from '../components/Pagination.jsx';
import { StateView } from '../components/StateView.jsx';
import { formatDate, parsePage } from '../lib/format.js';

export function AdminModerationPage() {
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'comments' ? 'comments' : 'reports';
  const status = params.get('status') ?? (tab === 'reports' ? 'open' : '');
  const q = (params.get('q') ?? '').trim();
  const page = parsePage(params.get('page'));

  const reports = useAuthedApi(tab === 'reports' ? '/api/admin/moderation/reports' : null, { page, status });
  const comments = useAuthedApi(tab === 'comments' ? '/api/admin/moderation/comments' : null, { page, status, q });
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  function switchTab(nextTab) {
    setParams(nextTab === 'comments' ? { tab: 'comments' } : { status: 'open' });
  }

  async function resolveReport(id, nextStatus, hideTarget = false) {
    setBusyId(`r-${id}`);
    setError('');
    try {
      await request(`/api/admin/moderation/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, hideTarget }),
      });
      reports.reload();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleComment(id, nextStatus) {
    setBusyId(`c-${id}`);
    setError('');
    try {
      await request(`/api/admin/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      comments.reload();
    } catch (err) {
      setError(err.message || 'Could not update comment');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteComment(id) {
    setBusyId(`c-${id}`);
    setError('');
    try {
      await request(`/api/admin/comments/${id}`, { method: 'DELETE' });
      comments.reload();
    } catch (err) {
      setError(err.message || 'Could not delete comment');
    } finally {
      setBusyId(null);
    }
  }

  async function spamAction(userId, action) {
    setBusyId(`u-${userId}`);
    setError('');
    try {
      await request(`/api/admin/moderation/users/${userId}/spam-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      comments.reload();
      reports.reload();
    } catch (err) {
      setError(err.message || 'Spam action failed');
    } finally {
      setBusyId(null);
    }
  }

  const buildHref = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    return `/admin/moderation?${next}`;
  };

  return (
    <div className="stack">
      <div className="bar">
        <h1>Moderation &amp; Spam Control</h1>
        <div className="bar filter" style={{ marginBottom: 0 }}>
          <button type="button" className={tab === 'reports' ? 'btn' : 'btn secondary'} onClick={() => switchTab('reports')}>
            Reports Queue
          </button>
          <button type="button" className={tab === 'comments' ? 'btn' : 'btn secondary'} onClick={() => switchTab('comments')}>
            Comments &amp; Spam
          </button>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {tab === 'reports' ? (
        <>
          <div className="bar filter">
            <label htmlFor="rep-status" className="sr-only">Report status</label>
            <select
              id="rep-status"
              value={status}
              onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}
              style={{ width: 'auto' }}
            >
              <option value="">All reports</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
          <StateView
            loading={reports.loading}
            error={reports.error}
            empty={!reports.loading && !reports.error && (reports.data?.items?.length ?? 0) === 0}
            onRetry={reports.reload}
          />
          {reports.data?.items?.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Target</th><th>Reason</th><th>Reporter</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {reports.data.items.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.targetType === 'comment' ? 'Comment' : 'Article'}</strong>
                        {r.article && (
                          <div><Link to={`/articles/${r.article.slug}`}>{r.article.title}</Link></div>
                        )}
                        {r.comment && (
                          <div className="muted">“{r.comment.body.slice(0, 120)}” ({r.comment.status})</div>
                        )}
                      </td>
                      <td>{r.reason}<div className="muted">{formatDate(r.createdAt)}</div></td>
                      <td>{r.reporter?.displayName ?? 'Anonymous'}</td>
                      <td><span className={`status ${r.status === 'open' ? 'draft' : 'pub'}`}>{r.status}</span></td>
                      <td>
                        {r.status === 'open' ? (
                          <div className="bar filter" style={{ marginBottom: 0 }}>
                            <button type="button" className="link-btn danger" disabled={busyId === `r-${r.id}`} onClick={() => resolveReport(r.id, 'resolved', true)}>
                              Resolve &amp; hide
                            </button>
                            <button type="button" className="link-btn" disabled={busyId === `r-${r.id}`} onClick={() => resolveReport(r.id, 'resolved', false)}>
                              Resolve
                            </button>
                            <button type="button" className="link-btn" disabled={busyId === `r-${r.id}`} onClick={() => resolveReport(r.id, 'dismissed', false)}>
                              Dismiss
                            </button>
                          </div>
                        ) : (
                          <span className="muted">{r.resolver?.displayName ?? 'Staff'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {reports.data && <Pagination page={page} total={reports.data.total} pageSize={reports.data.pageSize} buildHref={buildHref} />}
        </>
      ) : (
        <>
          <form
            key={`comments|${q}|${status}`}
            className="bar filter"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const next = { tab: 'comments' };
              if (f.get('q').toString().trim()) next.q = f.get('q').toString().trim();
              if (f.get('status')) next.status = f.get('status').toString();
              setParams(next);
            }}
          >
            <input type="search" name="q" defaultValue={q} placeholder="Search comment or author…" aria-label="Search comments" style={{ maxWidth: 260 }} />
            <select name="status" defaultValue={status} aria-label="Comment status" style={{ width: 'auto' }}>
              <option value="">All statuses</option>
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
            </select>
            <button className="btn secondary" type="submit">Apply</button>
          </form>
          <StateView
            loading={comments.loading}
            error={comments.error}
            empty={!comments.loading && !comments.error && (comments.data?.items?.length ?? 0) === 0}
            onRetry={comments.reload}
          />
          {comments.data?.items?.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Comment</th><th>Author</th><th>Article</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {comments.data.items.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div>{c.body}</div>
                        <div className="muted">{formatDate(c.createdAt)}{c.openReports > 0 ? ` · ${c.openReports} open reports` : ''}</div>
                      </td>
                      <td>
                        {c.author ? (
                          <>
                            <div>{c.author.displayName}</div>
                            <div className="muted">{c.author.isActive ? 'Active' : 'Suspended'}</div>
                          </>
                        ) : 'Deleted user'}
                      </td>
                      <td><Link to={`/articles/${c.article.slug}`}>{c.article.title}</Link></td>
                      <td><span className={`status ${c.status === 'visible' ? 'pub' : 'archived'}`}>{c.status}</span></td>
                      <td>
                        <div className="bar filter" style={{ marginBottom: 0 }}>
                          <button
                            type="button"
                            className="link-btn"
                            disabled={busyId === `c-${c.id}`}
                            onClick={() => toggleComment(c.id, c.status === 'visible' ? 'hidden' : 'visible')}
                          >
                            {c.status === 'visible' ? 'Hide' : 'Unhide'}
                          </button>
                          <button type="button" className="link-btn danger" disabled={busyId === `c-${c.id}`} onClick={() => deleteComment(c.id)}>
                            Delete
                          </button>
                          {c.author && (
                            <button
                              type="button"
                              className="link-btn"
                              disabled={busyId === `u-${c.author.id}`}
                              onClick={() => spamAction(c.author.id, 'hide_comments')}
                            >
                              Hide user comments
                            </button>
                          )}
                          {c.author && c.author.isActive && (
                            <button
                              type="button"
                              className="link-btn danger"
                              disabled={busyId === `u-${c.author.id}`}
                              onClick={() => spamAction(c.author.id, 'suspend')}
                            >
                              Suspend spammer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {comments.data && <Pagination page={page} total={comments.data.total} pageSize={comments.data.pageSize} buildHref={buildHref} />}
        </>
      )}
    </div>
  );
}
