import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { Pagination } from '../components/Pagination.jsx';
import { StateView } from '../components/StateView.jsx';
import { parsePage } from '../lib/format.js';

export function AdminSeoPage() {
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = parsePage(params.get('page'));
  const q = (params.get('q') ?? '').trim();
  const missingMeta = params.get('missingMeta') === '1' ? '1' : '';
  const list = useAuthedApi('/api/admin/seo/articles', { page, q, missingMeta });

  const [editing, setEditing] = useState(null);
  const [auditResult, setAuditResult] = useState(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function runAudit(article) {
    if (auditBusy) return;
    setAuditBusy(true);
    setError('');
    try {
      const res = await request(`/api/admin/seo/audit/${article.id}`);
      setAuditResult(res);
    } catch (err) {
      setError(err.message || 'Could not run SEO audit.');
    } finally {
      setAuditBusy(false);
    }
  }

  async function saveSeo(event) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/api/admin/seo/articles/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metaTitle: editing.metaTitle.trim() || null,
          metaDescription: editing.metaDescription.trim() || null,
          ogImageUrl: editing.ogImageUrl.trim() || null,
          imageAlt: editing.imageAlt.trim() || null,
          seoKeywords: editing.seoKeywords.trim(),
        }),
      });
      setNotice(`Saved SEO metadata for "${editing.title}".`);
      setEditing(null);
      list.reload();
    } catch (err) {
      if (err.status === 422 && err.errors?.length) {
        setError(err.errors.map((e) => `${e.path ? `${e.path}: ` : ''}${e.message}`).join(' '));
      } else {
        setError(err.message || 'Could not update SEO metadata.');
      }
    } finally {
      setBusy(false);
    }
  }

  const buildHref = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    return `/admin/seo?${next}`;
  };

  const items = list.data?.items ?? [];

  return (
    <div className="stack">
      <div className="bar"><h1>SEO Metadata Manager</h1></div>

      <form
        key={`${q}|${missingMeta}`}
        className="bar filter"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          if (f.get('q').toString().trim()) next.set('q', f.get('q').toString().trim());
          if (f.get('missingMeta')) next.set('missingMeta', '1');
          setParams(next);
        }}
      >
        <input type="search" name="q" defaultValue={q} placeholder="Filter by title or slug" aria-label="Search SEO articles" style={{ maxWidth: 260 }} />
        <label className="check-inline">
          <input type="checkbox" name="missingMeta" value="1" defaultChecked={missingMeta === '1'} /> Missing SEO metadata only
        </label>
        <button className="btn secondary" type="submit">Apply</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="hint" role="status">{notice}</p>}

      {auditResult && (
        <section className="card box" aria-label="On-page SEO audit">
          <div className="bar">
            <h2>On-Page SEO Audit: {auditResult.title}</h2>
            <div className="bar" style={{ marginBottom: 0 }}>
              <span className="score-pill">Score: {auditResult.score}/100 (Grade {auditResult.grade})</span>
              <button type="button" className="btn secondary" onClick={() => setAuditResult(null)}>Close</button>
            </div>
          </div>
          <ul className="plain-list">
            {auditResult.checks?.map((c) => (
              <li key={c.id}>
                <strong>{c.passed ? '[PASS]' : '[IMPROVE]'} {c.label}</strong> ({c.points}/{c.maxPoints} pts) — {c.detail}
              </li>
            ))}
          </ul>
          {auditResult.suggestedKeywords?.length > 0 && (
            <p className="muted" style={{ marginTop: 10 }}>
              TF-IDF inferred keywords: <code>{auditResult.suggestedKeywords.join(', ')}</code>
            </p>
          )}
          {auditResult.entities?.length > 0 && (
            <p className="muted" style={{ marginTop: 4 }}>
              Extracted entities: {auditResult.entities.map((e) => e.name).join(', ')}
            </p>
          )}
        </section>
      )}

      {editing && (
        <form className="card box admin-form" onSubmit={saveSeo}>
          <h2>Editing SEO: {editing.title}</h2>
          <label htmlFor="seo-title">Meta title <span className="muted">({editing.metaTitle.length}/70)</span></label>
          <input id="seo-title" maxLength={70} value={editing.metaTitle} onChange={(e) => setEditing({ ...editing, metaTitle: e.target.value })} placeholder={editing.title.slice(0, 70)} />

          <label htmlFor="seo-desc">Meta description <span className="muted">({editing.metaDescription.length}/320)</span></label>
          <textarea id="seo-desc" rows={3} maxLength={320} value={editing.metaDescription} onChange={(e) => setEditing({ ...editing, metaDescription: e.target.value })} placeholder={editing.summary} />

          <label htmlFor="seo-kw">SEO keywords <span className="muted">(comma-separated, {editing.seoKeywords.length}/300)</span></label>
          <input id="seo-kw" maxLength={300} value={editing.seoKeywords} onChange={(e) => setEditing({ ...editing, seoKeywords: e.target.value })} placeholder="news, climate, energy" />

          <label htmlFor="seo-img">OG image URL <span className="muted">(https://)</span></label>
          <input id="seo-img" type="url" maxLength={500} value={editing.ogImageUrl} onChange={(e) => setEditing({ ...editing, ogImageUrl: e.target.value })} placeholder="https://..." />

          <label htmlFor="seo-alt">Image alt text <span className="muted">({editing.imageAlt.length}/250)</span></label>
          <input id="seo-alt" maxLength={250} value={editing.imageAlt} onChange={(e) => setEditing({ ...editing, imageAlt: e.target.value })} />

          <div className="bar" style={{ justifyContent: 'flex-start', marginTop: 16, marginBottom: 0 }}>
            <button className="btn" type="submit" disabled={busy}>Save SEO</button>
            <button className="btn secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <StateView loading={list.loading} error={list.error} empty={!list.loading && !list.error && items.length === 0} onRetry={list.reload} />
      {items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Article</th><th>Meta Title</th><th>Meta Description</th><th>Keywords / Alt</th><th>Action</th></tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div><strong>{a.title}</strong></div>
                    <div className="muted">/{a.slug} · {a.status}</div>
                  </td>
                  <td>{a.metaTitle || <span className="muted">(Fallback: article title)</span>}</td>
                  <td>{a.metaDescription ? `${a.metaDescription.slice(0, 90)}${a.metaDescription.length > 90 ? '…' : ''}` : <span className="muted">(Missing)</span>}</td>
                  <td>
                    <div>{a.seoKeywords || <span className="muted">No keywords</span>}</div>
                    <div className="muted">Alt: {a.imageAlt || '—'}</div>
                  </td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setEditing({ ...a })}>Edit SEO</button>
                    {' · '}
                    <button type="button" className="link-btn" onClick={() => runAudit(a)} disabled={auditBusy}>Audit SEO</button>
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
