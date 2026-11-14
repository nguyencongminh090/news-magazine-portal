import { useSearchParams } from 'react-router-dom';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { Pagination } from '../components/Pagination.jsx';
import { StateView } from '../components/StateView.jsx';
import { formatDate, parsePage } from '../lib/format.js';

export function AdminLogsPage() {
  const [params, setParams] = useSearchParams();
  const page = parsePage(params.get('page'));
  const action = (params.get('action') ?? '').trim();
  const entityType = (params.get('entityType') ?? '').trim();
  const list = useAuthedApi('/api/admin/logs', { page, action, entityType });

  const buildHref = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    return `/admin/logs?${next}`;
  };

  const items = list.data?.items ?? [];

  return (
    <div className="stack">
      <div className="bar">
        <h1>System Audit Logs</h1>
        <button type="button" className="btn secondary" onClick={list.reload}>Refresh</button>
      </div>

      <form
        key={`${action}|${entityType}`}
        className="bar filter"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          if (f.get('action').toString().trim()) next.set('action', f.get('action').toString().trim());
          if (f.get('entityType').toString().trim()) next.set('entityType', f.get('entityType').toString().trim());
          setParams(next);
        }}
      >
        <input type="search" name="action" defaultValue={action} placeholder="Filter by action (e.g. article.create)" aria-label="Filter by action" style={{ maxWidth: 260 }} />
        <select name="entityType" defaultValue={entityType} aria-label="Entity type" style={{ width: 'auto' }}>
          <option value="">All entities</option>
          <option value="document">Document</option>
          <option value="user">User</option>
          <option value="comment">Comment</option>
          <option value="report">Report</option>
          <option value="category">Category</option>
          <option value="tag">Tag</option>
          <option value="site_settings">Site settings</option>
        </select>
        <button className="btn secondary" type="submit">Apply</button>
      </form>

      <StateView loading={list.loading} error={list.error} empty={!list.loading && !list.error && items.length === 0} onRetry={list.reload} />
      {items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td>{formatDate(l.createdAt)}</td>
                  <td>{l.actor ? `${l.actor.displayName} (${l.actor.email})` : 'System'}</td>
                  <td><code>{l.action}</code></td>
                  <td>{l.entityType}{l.entityId ? ` #${l.entityId}` : ''}</td>
                  <td>{l.details ? <code>{JSON.stringify(l.details)}</code> : '—'}</td>
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
