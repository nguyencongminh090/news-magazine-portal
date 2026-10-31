export function StateView({ loading, error, empty, onRetry }) {
  if (loading) return <p className="state" role="status">Loading…</p>;
  if (error) {
    return (
      <div className="state stack">
        <p className="error" role="alert">{error.title ?? 'Something went wrong'}</p>
        {onRetry && <button className="btn secondary" type="button" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  if (empty) return <p className="state">No articles found</p>;
  return null;
}
