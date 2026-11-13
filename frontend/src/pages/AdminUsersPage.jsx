import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { Pagination } from '../components/Pagination.jsx';
import { StateView } from '../components/StateView.jsx';
import { formatDate, parsePage } from '../lib/format.js';

const ALL_ROLES = [
  { id: 'admin', label: 'Super Admin' },
  { id: 'editor', label: 'Content Manager' },
  { id: 'moderator', label: 'Moderator' },
  { id: 'seo', label: 'Data & SEO' },
  { id: 'reader', label: 'Reader' },
];

export function AdminUsersPage() {
  const { user: self, request } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = parsePage(params.get('page'));
  const q = (params.get('q') ?? '').trim();
  const role = params.get('role') ?? '';
  const list = useAuthedApi('/api/admin/users', { page, q, role });

  const [editingUser, setEditingUser] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function startRoleEdit(u) {
    setEditingUser(u);
    setSelectedRoles([...(u.roles ?? [])]);
    setError('');
  }

  function toggleRole(r) {
    setSelectedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function saveRoles(event) {
    event.preventDefault();
    if (!editingUser || selectedRoles.length === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/users/${editingUser.id}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: selectedRoles }),
      });
      setEditingUser(null);
      list.reload();
    } catch (err) {
      setError(err.message || 'Could not update roles.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(u) {
    setError('');
    try {
      await request(`/api/admin/users/${u.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      list.reload();
    } catch (err) {
      setError(err.message || 'Could not update account status.');
    }
  }

  const buildHref = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    return `/admin/users?${next}`;
  };

  const items = list.data?.items ?? [];

  return (
    <div className="stack">
      <div className="bar"><h1>Users &amp; Role Permissions</h1></div>

      <form
        key={`${q}|${role}`}
        className="bar filter"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          if (f.get('q').toString().trim()) next.set('q', f.get('q').toString().trim());
          if (f.get('role')) next.set('role', f.get('role').toString());
          setParams(next);
        }}
      >
        <input type="search" name="q" defaultValue={q} placeholder="Search email or name…" aria-label="Search users" style={{ maxWidth: 260 }} />
        <select name="role" defaultValue={role} aria-label="Filter by role" style={{ width: 'auto' }}>
          <option value="">All roles</option>
          {ALL_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button className="btn secondary" type="submit">Apply</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {editingUser && (
        <form className="card box admin-form" onSubmit={saveRoles}>
          <h2>Assign roles for {editingUser.displayName} ({editingUser.email})</h2>
          <div className="role-checks">
            {ALL_ROLES.map((r) => (
              <label key={r.id} className="check-inline">
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(r.id)}
                  onChange={() => toggleRole(r.id)}
                />
                {r.label} ({r.id})
              </label>
            ))}
          </div>
          <div className="bar" style={{ justifyContent: 'flex-start', marginTop: 14, marginBottom: 0 }}>
            <button className="btn" type="submit" disabled={busy || selectedRoles.length === 0}>Save roles</button>
            <button className="btn secondary" type="button" onClick={() => setEditingUser(null)}>Cancel</button>
          </div>
        </form>
      )}

      <StateView loading={list.loading} error={list.error} empty={!list.loading && !list.error && items.length === 0} onRetry={list.reload} />
      {items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Roles</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div><strong>{u.displayName}</strong></div>
                    <div className="muted">{u.email}{u.emailVerified ? ' · verified' : ' · unverified'}</div>
                  </td>
                  <td>{(u.roles ?? []).join(', ')}</td>
                  <td><span className={`status ${u.isActive ? 'pub' : 'archived'}`}>{u.isActive ? '● Active' : '■ Inactive'}</span></td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => startRoleEdit(u)}>Roles</button>
                    {u.id !== self?.id && (
                      <>
                        {' · '}
                        <button type="button" className={`link-btn ${u.isActive ? 'danger' : ''}`} onClick={() => toggleStatus(u)}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </>
                    )}
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
