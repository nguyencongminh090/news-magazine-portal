import { screen } from '@testing-library/react';
import { renderWithRouter } from '../test/render.jsx';
import { ArticleListItem } from './ArticleListItem.jsx';

const base = { slug: 'moon-samples', title: 'Moon samples', summary: null, body: '', publishedAt: null, category: null };

test('renders without summary, date or category and without "Invalid Date"', () => {
  renderWithRouter(<ul><ArticleListItem article={base} /></ul>);
  expect(screen.getByRole('link', { name: 'Moon samples' })).toHaveAttribute('href', '/articles/moon-samples');
  expect(screen.queryByText(/Invalid Date/)).toBeNull();
});

test('shows category, summary and formatted date when present', () => {
  const article = { ...base, summary: 'A summary.', publishedAt: '2026-10-31T00:00:00Z', category: { slug: 'science', name: 'Science' } };
  renderWithRouter(<ul><ArticleListItem article={article} /></ul>);
  expect(screen.getByText('Science')).toBeInTheDocument();
  expect(screen.getByText('A summary.')).toBeInTheDocument();
  expect(screen.getByText('31 Oct 2026')).toBeInTheDocument();
});
