import { Link } from 'react-router-dom';
import { formatDate } from '../lib/format.js';

export function ArticleListItem({ article }) {
  const date = formatDate(article.publishedAt);
  return (
    <li>
      <div>
        {article.category && <span className="cat">{article.category.name}</span>}
        <h3><Link to={`/articles/${article.slug}`}>{article.title}</Link></h3>
        {article.summary && <p style={{ margin: '4px 0' }}>{article.summary}</p>}
        {date && <span className="muted">{date}</span>}
      </div>
    </li>
  );
}
