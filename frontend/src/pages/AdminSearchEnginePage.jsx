import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { StateView } from '../components/StateView.jsx';

export function AdminSearchEnginePage() {
  const { request } = useAuth();
  const stats = useAuthedApi('/api/admin/search-engine/stats');
  const evaluation = useAuthedApi('/api/admin/search-engine/evaluate');
  const [termInput, setTermInput] = useState('elections');
  const [inspected, setInspected] = useState(null);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [error, setError] = useState('');

  async function runInspect(e) {
    e?.preventDefault();
    const clean = termInput.trim();
    if (!clean || inspectBusy) return;
    setInspectBusy(true);
    setError('');
    try {
      const data = await request(`/api/admin/search-engine/inspect?term=${encodeURIComponent(clean)}`);
      setInspected(data);
    } catch (err) {
      setError(err.message || 'Could not inspect term.');
    } finally {
      setInspectBusy(false);
    }
  }

  async function rebuildIndex() {
    if (rebuildBusy) return;
    setRebuildBusy(true);
    setError('');
    try {
      await request('/api/admin/search-engine/rebuild', { method: 'POST' });
      stats.reload();
      evaluation.reload();
    } catch (err) {
      setError(err.message || 'Could not rebuild index.');
    } finally {
      setRebuildBusy(false);
    }
  }

  if (stats.loading || stats.error) {
    return <StateView loading={stats.loading} error={stats.error} onRetry={stats.reload} />;
  }

  const s = stats.data ?? {};
  const comp = s.compression ?? {};
  const zipf = s.zipf ?? {};
  const heaps = s.heaps ?? {};
  const evalData = evaluation.data ?? {};
  const offline = evalData.offline ?? {};
  const live = evalData.live ?? {};

  return (
    <div className="stack">
      <div className="bar">
        <div>
          <h1>Search Engine Lab (Phase 2 IR)</h1>
          <p className="muted" style={{ margin: 0 }}>
            Tokenization, Porter Stemming, Fielded Inverted Index, V-Byte Compression, BM25/TF-IDF/QL Ranking &amp; Evaluation.
          </p>
        </div>
        <div className="bar" style={{ marginBottom: 0 }}>
          <button type="button" className="btn secondary" onClick={() => { stats.reload(); evaluation.reload(); }}>Refresh</button>
          <button type="button" className="btn" onClick={rebuildIndex} disabled={rebuildBusy}>
            {rebuildBusy ? 'Rebuilding…' : 'Rebuild Index'}
          </button>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="kpi-grid" aria-label="Inverted index statistics">
        <div className="card box kpi"><strong>{s.docCount ?? 0}</strong><span>Indexed documents (N)</span></div>
        <div className="card box kpi"><strong>{(s.vocabSize ?? 0).toLocaleString('en-GB')}</strong><span>Stemmed vocabulary (V)</span></div>
        <div className="card box kpi"><strong>{(s.totalTokens ?? 0).toLocaleString('en-GB')}</strong><span>Total indexed tokens</span></div>
        <div className="card box kpi"><strong>{s.avgDocLength ?? 0}</strong><span>Avg doc length (avgdl)</span></div>
        <div className="card box kpi"><strong>{comp.compressionRatio ?? 1}x</strong><span>V-Byte ratio ({comp.spaceSavingsPct ?? 0}% saved)</span></div>
        <div className="card box kpi">
          <strong>{(comp.compressedBytes ?? 0).toLocaleString('en-GB')} B</strong>
          <span>Compressed vs {(comp.rawInt32Bytes ?? 0).toLocaleString('en-GB')} B raw</span>
        </div>
      </section>

      <section className="card box" aria-labelledby="eval-models-h">
        <div className="bar">
          <h2 id="eval-models-h">Chapter 9 · Retrieval Model Benchmark ({offline.queryCount ?? 0} Corpus Queries)</h2>
          <span className="muted">Baseline: TF-IDF Vector Space</span>
        </div>
        {evaluation.loading ? (
          <p className="muted">Running retrieval benchmark…</p>
        ) : evaluation.error ? (
          <p className="error" role="alert">{evaluation.error.message}</p>
        ) : offline.models?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>MAP</th>
                  <th>MRR</th>
                  <th>NDCG@5</th>
                  <th>NDCG@10</th>
                  <th>P@5</th>
                  <th>Recall@10</th>
                  <th>Latency</th>
                  <th>Kendall τ</th>
                  <th>Sign p-val</th>
                </tr>
              </thead>
              <tbody>
                {offline.models.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.label}</strong></td>
                    <td>{m.map.toFixed(3)}</td>
                    <td>{m.mrr.toFixed(3)}</td>
                    <td>{m.ndcgAt5.toFixed(3)}</td>
                    <td>{m.ndcgAt10.toFixed(3)}</td>
                    <td>{m.pAt5.toFixed(3)}</td>
                    <td>{m.recallAt10.toFixed(3)}</td>
                    <td>{m.avgLatencyMs} ms</td>
                    <td>{m.kendallTauVsBaseline}</td>
                    <td>{m.pValueVsBaseline}{m.significantVsBaseline ? ' *' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No benchmark queries available yet.</p>
        )}

        <div className="kpi-grid" style={{ marginTop: 16 }}>
          <div className="stat-pill"><strong>{live.totalQueries ?? 0}</strong><span>Logged search queries</span></div>
          <div className="stat-pill"><strong>{live.totalClicks ?? 0}</strong><span>Logged search clicks</span></div>
          <div className="stat-pill"><strong>{((live.ctr ?? 0) * 100).toFixed(1)}%</strong><span>Click-Through Rate (CTR)</span></div>
          <div className="stat-pill"><strong>{live.clickMrr != null ? live.clickMrr.toFixed(3) : '—'}</strong><span>Live Click MRR</span></div>
          <div className="stat-pill"><strong>{((live.zeroHitRate ?? 0) * 100).toFixed(1)}%</strong><span>Zero-hit rate</span></div>
          <div className="stat-pill"><strong>{live.p95LatencyMs ?? 0} ms</strong><span>P95 query latency</span></div>
        </div>
      </section>

      <section className="card box" aria-labelledby="inspect-h">
        <h2 id="inspect-h">Chapter 5 · Inverted Index &amp; V-Byte Posting Inspector</h2>
        <form className="bar filter" style={{ marginTop: 12 }} onSubmit={runInspect}>
          <input
            type="search"
            value={termInput}
            onChange={(e) => setTermInput(e.target.value)}
            placeholder="Enter term (e.g. elections, africa, solar)"
            aria-label="Inspect term in inverted index"
            style={{ maxWidth: 320 }}
          />
          <button type="submit" className="btn secondary" disabled={inspectBusy}>
            {inspectBusy ? 'Inspecting…' : 'Inspect Postings'}
          </button>
        </form>

        {inspected && (
          <div className="stack">
            <div className="meta">
              <span>Raw: <strong>{inspected.rawTerm}</strong></span>
              <span>Porter Stem: <strong>{inspected.stemmedTerm}</strong></span>
              <span>DF: <strong>{inspected.df}</strong></span>
              <span>CF: <strong>{inspected.cf}</strong></span>
              <span>IDF: <strong>{inspected.idf}</strong></span>
              <span>Skip Pointers: <strong>{inspected.skipCount}</strong></span>
            </div>
            {inspected.rawVariants?.length > 0 && (
              <p className="muted" style={{ margin: 0 }}>Stem variants: {inspected.rawVariants.join(', ')}</p>
            )}
            <div className="card box" style={{ background: 'var(--paper)' }}>
              <div><strong>Delta Gaps (d-gaps):</strong> <code>[{inspected.compression?.deltas?.join(', ')}]</code></div>
              <div style={{ marginTop: 6 }}>
                <strong>V-Byte Encoded ({inspected.compression?.vbyteBytes ?? 0} B vs {inspected.compression?.rawBytes ?? 0} B raw):</strong>{' '}
                <code>{inspected.compression?.vbyteHex || '—'}</code>
              </div>
            </div>
            {inspected.postings?.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Doc ID</th><th>Article</th><th>Total TF</th><th>Fields (T / S / B / Tag / SEO)</th><th>Positions</th></tr>
                  </thead>
                  <tbody>
                    {inspected.postings.map((p) => (
                      <tr key={p.docId}>
                        <td>{p.docId}</td>
                        <td><Link to={`/articles/${p.slug}`}>{p.title}</Link></td>
                        <td>{p.tf}</td>
                        <td>{p.fieldTf.title} / {p.fieldTf.summary} / {p.fieldTf.content} / {p.fieldTf.tags} / {p.fieldTf.seoKeywords}</td>
                        <td><code>{p.positions.join(', ')}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Term not found in published corpus.</p>
            )}
          </div>
        )}
      </section>

      <div className="analytics-grid">
        <section className="card box" aria-labelledby="zipf-h">
          <h2 id="zipf-h">Chapter 4.2 · Zipf&apos;s Law (Top Terms)</h2>
          {zipf.topTerms?.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Rank (r)</th><th>Stem</th><th>Freq (f)</th><th>r × f</th><th>Zipf Pred</th></tr></thead>
                <tbody>
                  {zipf.topTerms.slice(0, 12).map((z) => (
                    <tr key={z.term}>
                      <td>{z.rank}</td>
                      <td><code>{z.term}</code></td>
                      <td>{z.frequency}</td>
                      <td>{z.rankTimesFreq}</td>
                      <td>{z.zipfPredicted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card box" aria-labelledby="heaps-h">
          <h2 id="heaps-h">Chapter 4.2 · Heap&apos;s Law (V = K · N^β)</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            Fitted parameters: <strong>K = {heaps.fittedK ?? 0}</strong>, <strong>β = {heaps.fittedBeta ?? 0}</strong>
          </p>
          {heaps.points?.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Docs</th><th>Tokens (N)</th><th>Vocab (V)</th><th>Predicted V</th></tr></thead>
                <tbody>
                  {heaps.points.map((pt) => (
                    <tr key={pt.docs}>
                      <td>{pt.docs}</td>
                      <td>{pt.tokensN.toLocaleString('en-GB')}</td>
                      <td>{pt.vocabularyV.toLocaleString('en-GB')}</td>
                      <td>{pt.heapsPredicted.toLocaleString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card box" aria-labelledby="dups-h">
        <h2 id="dups-h">Chapter 3.7 · Near-Duplicate Shingle Check (Jaccard ≥ 0.55)</h2>
        {s.nearDuplicates?.length ? (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Similarity</th><th>Document A</th><th>Document B</th></tr></thead>
              <tbody>
                {s.nearDuplicates.map((pair, i) => (
                  <tr key={i}>
                    <td>{(pair.similarity * 100).toFixed(1)}%</td>
                    <td><Link to={`/articles/${pair.docA.slug}`}>{pair.docA.title}</Link></td>
                    <td><Link to={`/articles/${pair.docB.slug}`}>{pair.docB.title}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>No near-duplicate documents detected above 55% 3-shingle similarity.</p>
        )}
      </section>
    </div>
  );
}
