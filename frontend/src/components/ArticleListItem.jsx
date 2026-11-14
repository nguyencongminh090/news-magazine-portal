import { Link } from 'react-router-dom';
import { CategoryArt, Kicker } from './CategoryArt.jsx';
import { DateMeta } from './ArticleMeta.jsx';
import { Icon } from './Icon.jsx';

/** One story row (thumbnail + category + title + summary/snippet + date + views). `headingLevel` follows the page outline. */
export function ArticleListItem({ article, headingLevel = 3, onSelect, rank }) {
  const Heading = `h${headingLevel}`;
  const segments = Array.isArray(article.snippetSegments) && article.snippetSegments.length > 0
    ? article.snippetSegments
    : null;

  return (
    <li className="row">
      <div className="th"><CategoryArt slug={article.category?.slug} /></div>
      <div className="txt">
        <Kicker category={article.category} />
        <Heading>
          <Link to={`/articles/${article.slug}`} onClick={onSelect ? () => onSelect(article, rank) : undefined}>
            {article.title}
          </Link>
        </Heading>
        {segments ? (
          <p className="summary">
            {segments.map((seg, idx) => (seg.match ? <mark key={idx} className="hl">{seg.text}</mark> : <span key={idx}>{seg.text}</span>))}
          </p>
        ) : (
          article.summary && <p className="summary">{article.summary}</p>
        )}
        <div className="meta">
          <DateMeta iso={article.publishedAt} />
          {article.viewsCount != null && (
            <span><Icon name="eye" />{Number(article.viewsCount).toLocaleString('en-GB')} views</span>
          )}
          {article.searchScore != null && (
            <span className="score-pill">Score {Number(article.searchScore).toFixed(2)}</span>
          )}
        </div>
        {article.scoreBreakdown && (
          <div className="breakdown-note">
            <span>Model: <strong>{article.scoreBreakdown.model?.toUpperCase()}</strong></span>
            {article.scoreBreakdown.fieldHits?.length > 0 && (
              <span> · Fields: {article.scoreBreakdown.fieldHits.join(', ')}</span>
            )}
            {article.scoreBreakdown.features && (
              <span>
                {' '}· BM25 {article.scoreBreakdown.features.bm25Norm}, Prox {article.scoreBreakdown.features.proximity}, Fresh {article.scoreBreakdown.features.freshness}, Eng {article.scoreBreakdown.features.engagement}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
