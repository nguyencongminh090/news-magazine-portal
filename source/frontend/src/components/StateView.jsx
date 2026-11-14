/** Loading / error / empty block with the shared sprout illustration (decorative). */
function Sprout() {
  return <img className="state-art" src="/art/empty.svg" alt="" width="480" height="320" />;
}

export function StateView({ loading, error, empty, onRetry }) {
  if (loading) return <div className="state"><Sprout /><p role="status">Loading…</p></div>;
  if (error) {
    return (
      <div className="state stack">
        <Sprout />
        <p className="error" role="alert">{error.title ?? 'Something went wrong'}</p>
        {onRetry && <button className="btn secondary" type="button" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  if (empty) return <div className="state"><Sprout /><p>No articles found</p></div>;
  return null;
}
