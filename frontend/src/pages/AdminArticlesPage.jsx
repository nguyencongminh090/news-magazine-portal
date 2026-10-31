import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { Pagination } from '../components/Pagination.jsx';
import { StateView } from '../components/StateView.jsx';
import { parsePage } from '../lib/format.js';

export const STATUS_LABEL = { published: '● Published', draft: '▲ Draft', archived: '■ Archived' };
const STATUS_CLASS = { published: 'pub', draft: 'draft', archived: 'archived' };
export const StatusBadge = ({ status }) => <span className={`status ${STATUS_CLASS[status] ?? ''}`}>{STATUS_LABEL[status] ?? status}</span>;

export function AdminArticlesPage() {
  const { user, request } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = parsePage(params.get('page'));
  const q = (params.get('q') ?? '').trim();
  const status = params.get('status') ?? '';
  const list = useAuthedApi('/api/admin/articles', { page, q, status });
  const [confirmId, setConfirmId] = useState(null);
  const [actionError, setActionError] = useState('');
  const isAdmin = user?.roles.includes('admin');

  const buildHref = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    return `/admin?${next}`;
  };

  function applyFilter(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    if (f.get('q').toString().trim()) next.set('q', f.get('q').toString().trim());
    if (f.get('status')) next.set('status', f.get('status').toString());
    setParams(next);
  }

  async function remove(id) {
    setActionError('');
    try {
      await request(`/api/admin/articles/${id}`, { method: 'DELETE' });
      setConfirmId(null);
      list.reload();
    } catch (err) {
      setActionError(err.message || 'Delete failed');
    }
  }

  const items = list.data?.items ?? [];
  return (
    <div>
      <div className="bar"><h1>Articles</h1><Link className="btn" to="/admin/articles/new">New article</Link></div>
      <form className="bar" onSubmit={applyFilter} role="search" key={`${q}|${status}`}>
        <input type="search" name="q" aria-label="Filter by title" placeholder="Filter by title" defaultValue={q} maxLength={100} style={{ maxWidth: 280 }} />
        <select name="status" aria-label="Status" defaultValue={status} style={{ width: 'auto' }}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <button className="btn secondary" type="submit">Apply</button>
      </form>
      {actionError && <p className="error" role="alert">{actionError}</p>}
      <StateView loading={list.loading} error={list.error} empty={!list.loading && !list.error && items.length === 0} onRetry={list.reload} />
      {items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Views</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{a.category?.name ?? ''}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>{a.viewsCount.toLocaleString('en-GB')}</td>
                  <td>
                    <Link to={`/admin/articles/${a.id}`} aria-label={`Edit ${a.title}`}>Edit</Link>
                    {isAdmin && (confirmId === a.id ? (
                      <span> · <button type="button" className="link-btn danger" onClick={() => remove(a.id)}>Confirm delete</button>{' '}
                        <button type="button" className="link-btn" onClick={() => setConfirmId(null)}>Cancel</button></span>
                    ) : (
                      <span> · <button type="button" className="link-btn danger" aria-label={`Delete ${a.title}`} onClick={() => setConfirmId(a.id)}>Delete</button></span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && <Pagination page={page} total={list.data.total} pageSize={list.data.pageSize} buildHref={buildHref} />}
    </div>
  );
}
