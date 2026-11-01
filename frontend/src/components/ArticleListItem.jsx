import { Link } from 'react-router-dom';
import { CategoryArt, Kicker } from './CategoryArt.jsx';
import { DateMeta } from './ArticleMeta.jsx';

/** One story row (thumbnail + category + title + summary + date). Title link stretches over the whole row. */
export function ArticleListItem({ article }) {
  return (
    <li className="row">
      <div className="th"><CategoryArt slug={article.category?.slug} /></div>
      <div className="txt">
        <Kicker category={article.category} />
        <h3><Link to={`/articles/${article.slug}`}>{article.title}</Link></h3>
        {article.summary && <p className="summary">{article.summary}</p>}
        <DateMeta iso={article.publishedAt} />
      </div>
    </li>
  );
}
