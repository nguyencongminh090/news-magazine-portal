import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { StateView } from '../components/StateView.jsx';

export function AdminTaxonomyPage() {
  const { request } = useAuth();
  const categories = useAuthedApi('/api/admin/taxonomy/categories');
  const tags = useAuthedApi('/api/admin/taxonomy/tags');
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [tagName, setTagName] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [editingTag, setEditingTag] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function addCategory(event) {
    event.preventDefault();
    if (!catName.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = { name: catName.trim() };
      if (catSlug.trim()) payload.slug = catSlug.trim();
      await request('/api/admin/taxonomy/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      setCatName('');
      setCatSlug('');
      categories.reload();
    } catch (err) {
      setError(err.message || 'Could not create category.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    if (!editingCat || busy) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/admin/taxonomy/categories/${editingCat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCat.name.trim(), slug: editingCat.slug.trim() }),
      });
      setEditingCat(null);
      categories.reload();
    } catch (err) {
      setError(err.message || 'Could not update category.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(id) {
    setError('');
    try {
      await request(`/api/admin/taxonomy/categories/${id}`, { method: 'DELETE' });
      categories.reload();
    } catch (err) {
      setError(err.message || 'Could not delete category.');
    }
  }

  async function addTag(event) {
    event.preventDefault();
    if (!tagName.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await request('/api/admin/taxonomy/tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tagName.trim() }),
      });
      setTagName('');
      tags.reload();
    } catch (err) {
      setError(err.message || 'Could not create tag.');
    } finally {
      setBusy(false);
    }
  }

  async function saveTag(event) {
    event.preventDefault();
    if (!editingTag || busy) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/admin/taxonomy/tags/${editingTag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingTag.name.trim(), slug: editingTag.slug.trim() }),
      });
      setEditingTag(null);
      tags.reload();
    } catch (err) {
      setError(err.message || 'Could not update tag.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTag(id) {
    setError('');
    try {
      await request(`/api/admin/taxonomy/tags/${id}`, { method: 'DELETE' });
      tags.reload();
    } catch (err) {
      setError(err.message || 'Could not delete tag.');
    }
  }

  const catItems = categories.data?.items ?? [];
  const tagItems = tags.data?.items ?? [];

  return (
    <div className="stack">
      <div className="bar"><h1>Taxonomy Management</h1></div>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card box" aria-labelledby="tax-cats">
        <h2 id="tax-cats">Categories ({catItems.length})</h2>
        <form className="bar filter" onSubmit={addCategory} style={{ marginTop: 12 }}>
          <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="New category name" aria-label="Category name" maxLength={100} required style={{ maxWidth: 240 }} />
          <input value={catSlug} onChange={(e) => setCatSlug(e.target.value)} placeholder="Slug (optional)" aria-label="Category slug" maxLength={100} style={{ maxWidth: 200 }} />
          <button className="btn" type="submit" disabled={busy}>Add category</button>
        </form>
        <StateView loading={categories.loading} error={categories.error} onRetry={categories.reload} />
        {catItems.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Slug</th><th>Articles</th><th>Actions</th></tr></thead>
              <tbody>
                {catItems.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {editingCat?.id === c.id ? (
                        <input value={editingCat.name} onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })} aria-label="Edit category name" />
                      ) : c.name}
                    </td>
                    <td>
                      {editingCat?.id === c.id ? (
                        <input value={editingCat.slug} onChange={(e) => setEditingCat({ ...editingCat, slug: e.target.value })} aria-label="Edit category slug" />
                      ) : c.slug}
                    </td>
                    <td>{c.articleCount}</td>
                    <td>
                      {editingCat?.id === c.id ? (
                        <>
                          <button type="button" className="link-btn" onClick={saveCategory}>Save</button>{' · '}
                          <button type="button" className="link-btn" onClick={() => setEditingCat(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="link-btn" onClick={() => setEditingCat({ ...c })}>Edit</button>
                          {c.articleCount === 0 && (
                            <> · <button type="button" className="link-btn danger" onClick={() => deleteCategory(c.id)}>Delete</button></>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card box" aria-labelledby="tax-tags">
        <h2 id="tax-tags">Tags ({tagItems.length})</h2>
        <form className="bar filter" onSubmit={addTag} style={{ marginTop: 12 }}>
          <input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="New tag name" aria-label="Tag name" maxLength={50} required style={{ maxWidth: 240 }} />
          <button className="btn" type="submit" disabled={busy}>Add tag</button>
        </form>
        <StateView loading={tags.loading} error={tags.error} onRetry={tags.reload} />
        {tagItems.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Slug</th><th>Articles</th><th>Actions</th></tr></thead>
              <tbody>
                {tagItems.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {editingTag?.id === t.id ? (
                        <input value={editingTag.name} onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })} aria-label="Edit tag name" />
                      ) : t.name}
                    </td>
                    <td>
                      {editingTag?.id === t.id ? (
                        <input value={editingTag.slug} onChange={(e) => setEditingTag({ ...editingTag, slug: e.target.value })} aria-label="Edit tag slug" />
                      ) : t.slug}
                    </td>
                    <td>{t.articleCount}</td>
                    <td>
                      {editingTag?.id === t.id ? (
                        <>
                          <button type="button" className="link-btn" onClick={saveTag}>Save</button>{' · '}
                          <button type="button" className="link-btn" onClick={() => setEditingTag(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="link-btn" onClick={() => setEditingTag({ ...t })}>Edit</button>
                          {' · '}
                          <button type="button" className="link-btn danger" onClick={() => deleteTag(t.id)}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
