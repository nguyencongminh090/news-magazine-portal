import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { StateView } from '../components/StateView.jsx';

export function AdminSettingsPage() {
  const { request } = useAuth();
  const { data, loading, error, reload } = useAuthedApi('/api/admin/settings');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data?.settings) return;
    setForm({
      site_name: String(data.settings.site_name ?? 'News Portal'),
      site_tagline: String(data.settings.site_tagline ?? ''),
      articles_per_page: Number(data.settings.articles_per_page ?? 20),
      allow_registration: Boolean(data.settings.allow_registration ?? true),
      allow_comments: Boolean(data.settings.allow_comments ?? true),
      maintenance_mode: Boolean(data.settings.maintenance_mode ?? false),
    });
  }, [data]);

  if (loading || error || !form) return <StateView loading={loading || !form} error={error} onRetry={reload} />;

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setSaveError('');
    setSaved(false);
    try {
      await request('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_name: form.site_name.trim(),
          site_tagline: form.site_tagline.trim(),
          articles_per_page: Number(form.articles_per_page),
          allow_registration: Boolean(form.allow_registration),
          allow_comments: Boolean(form.allow_comments),
          maintenance_mode: Boolean(form.maintenance_mode),
        }),
      });
      setSaved(true);
      reload();
    } catch (err) {
      setSaveError(err.message || 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="bar"><h1>Global Site Settings</h1></div>
      <form className="card box admin-form" onSubmit={onSubmit}>
        <label htmlFor="s-name">Site name</label>
        <input id="s-name" required maxLength={100} value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} />

        <label htmlFor="s-tag">Site tagline</label>
        <textarea id="s-tag" rows={2} maxLength={300} value={form.site_tagline} onChange={(e) => setForm({ ...form, site_tagline: e.target.value })} />

        <label htmlFor="s-pp">Default articles per page</label>
        <input
          id="s-pp"
          type="number"
          min={5}
          max={50}
          value={form.articles_per_page}
          onChange={(e) => setForm({ ...form, articles_per_page: Number(e.target.value) })}
        />

        <div className="role-checks" style={{ marginTop: 16 }}>
          <label className="check-inline">
            <input type="checkbox" checked={form.allow_registration} onChange={(e) => setForm({ ...form, allow_registration: e.target.checked })} />
            Allow new user registration
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={form.allow_comments} onChange={(e) => setForm({ ...form, allow_comments: e.target.checked })} />
            Allow public commenting
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={form.maintenance_mode} onChange={(e) => setForm({ ...form, maintenance_mode: e.target.checked })} />
            Maintenance mode banner
          </label>
        </div>

        {saveError && <p className="error" role="alert">{saveError}</p>}
        {saved && <p className="hint" role="status">Settings saved and recorded in audit log.</p>}
        <p style={{ marginTop: 18 }}>
          <button className="btn" type="submit" disabled={busy}>Save global settings</button>
        </p>
      </form>
    </div>
  );
}
