import { useEffect, useState } from 'react';

export function App() {
  const [api, setApi] = useState('checking…');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
      .then((body) => setApi(body.status))
      .catch(() => setApi('unreachable'));
  }, []);

  return (
    <main>
      <h1>News Portal</h1>
      <p>
        API status: <strong>{api}</strong>
      </p>
    </main>
  );
}
