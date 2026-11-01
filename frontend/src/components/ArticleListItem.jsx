import { Link } from 'react-router-dom';
import { CategoryArt, Kicker } from './CategoryArt.jsx';
import { DateMeta } from './ArticleMeta.jsx';

/** One story row (thumbnail + category + title + summary + date). `headingLevel` follows the page outline (h3 under a section h2, h2 directly under the page h1). Title link stretches over the whole row. */
export function ArticleListItem({ article, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  return (
    <li className="row">
      <div className="th"><CategoryArt slug={article.category?.slug} /></div>
      <div className="txt">
        <Kicker category={article.category} />
        <Heading><Link to={`/articles/${article.slug}`}>{article.title}</Link></Heading>
        {article.summary && <p className="summary">{article.summary}</p>}
        <DateMeta iso={article.publishedAt} />
      </div>
    </li>
  );
}
