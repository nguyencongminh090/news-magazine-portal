import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../api/useApi.js';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { StateView } from '../components/StateView.jsx';

function messageFor(err) {
  if (err.status === 0) return 'Network error. Check your connection and try again.';
  if (err.status === 409) return `${err.message}. Reload the article and apply your changes again.`;
  if (err.status === 422 && err.errors?.length) return err.errors.map((e) => `${e.path ? `${e.path}: ` : ''}${e.message}`).join(' ');
  return err.message || 'Something went wrong.';
}

function ArticleForm({ article, categories }) {
  const { request } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body = {
      title: f.get('title').toString(),
      summary: f.get('summary').toString(),
      body: f.get('body').toString(),
      categorySlug: f.get('categorySlug').toString(),
      tags: f.get('tags').toString().split(',').map((t) => t.trim()).filter(Boolean),
      status: f.get('status').toString(),
    };
    const ogImageUrl = f.get('ogImageUrl')?.toString().trim() ?? '';
    const imageAlt = f.get('imageAlt')?.toString().trim() ?? '';
    if (ogImageUrl || article?.ogImageUrl) body.ogImageUrl = ogImageUrl || null;
    if (imageAlt || article?.imageAlt) body.imageAlt = imageAlt || null;

    const slug = f.get('slug').toString().trim();
    if (article) Object.assign(body, { slug: slug || article.slug, updatedAt: article.updatedAt });
    else if (slug) body.slug = slug;
    setBusy(true);
    setError('');
    try {
      await request(article ? `/api/admin/articles/${article.id}` : '/api/admin/articles', {
        method: article ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      navigate('/admin');
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="admin-form">
      <div className="bar"><h1>{article ? 'Edit article' : 'New article'}</h1></div>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" required maxLength={300} defaultValue={article?.title ?? ''} />
      <label htmlFor="slug">Slug <span className="muted">(optional, derived from the title)</span></label>
      <input id="slug" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={200} defaultValue={article?.slug ?? ''} />
      <label htmlFor="summary">Summary</label>
      <textarea id="summary" name="summary" rows={3} maxLength={1000} defaultValue={article?.summary ?? ''} />
      <label htmlFor="body">Body</label>
      <textarea id="body" name="body" rows={16} required maxLength={100000} defaultValue={article?.body ?? ''} />
      <label htmlFor="categorySlug">Category</label>
      <select id="categorySlug" name="categorySlug" required defaultValue={article?.category?.slug ?? ''}>
        <option value="" disabled>Select a category</option>
        {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </select>
      <label htmlFor="tags">Tags <span className="muted">(comma separated)</span></label>
      <input id="tags" name="tags" defaultValue={(article?.tags ?? []).join(', ')} />
      <label htmlFor="ogImageUrl">Hero image URL <span className="muted">(optional, https:// only)</span></label>
      <input id="ogImageUrl" name="ogImageUrl" type="url" maxLength={500} defaultValue={article?.ogImageUrl ?? ''} placeholder="https://..." />
      <label htmlFor="imageAlt">Image alt text <span className="muted">(optional, describes the hero image)</span></label>
      <input id="imageAlt" name="imageAlt" maxLength={250} defaultValue={article?.imageAlt ?? ''} />
      <label htmlFor="status">Status</label>
      <select id="status" name="status" defaultValue={article?.status ?? 'draft'}>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="bar" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" type="submit" disabled={busy}>{article ? 'Save changes' : 'Create article'}</button>
        <Link className="btn secondary" to="/admin">Cancel</Link>
      </p>
    </form>
  );
}

export function AdminArticleFormPage() {
  const { id } = useParams();
  const categories = useApi('/api/categories');
  const article = useAuthedApi(id ? `/api/admin/articles/${id}` : null);
  const loading = categories.loading || article.loading;
  const error = categories.error ?? article.error;
  if (loading || error) return <StateView loading={loading} error={error} onRetry={() => { categories.reload(); article.reload(); }} />;
  return <ArticleForm article={article.data} categories={categories.data?.items ?? []} />;
}
