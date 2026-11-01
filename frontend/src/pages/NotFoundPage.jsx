import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="wrap state">
      <img className="state-art" src="/art/empty.svg" alt="" width="480" height="320" />
      <h1>Page not found</h1>
      <p><Link className="btn secondary" to="/">Back to the home page</Link></p>
    </div>
  );
}
