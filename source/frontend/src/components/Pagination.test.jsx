import { screen } from '@testing-library/react';
import { renderWithRouter } from '../test/render.jsx';
import { Pagination } from './Pagination.jsx';

const buildHref = (p) => `/?page=${p}`;

test('first page: Previous is disabled, Next links to page 2', () => {
  renderWithRouter(<Pagination page={1} total={50} pageSize={20} buildHref={buildHref} />);
  expect(screen.getByText('Previous')).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/?page=2');
});

test('last page: Next is disabled, Previous links to page 2', () => {
  renderWithRouter(<Pagination page={3} total={50} pageSize={20} buildHref={buildHref} />);
  expect(screen.getByText('Next')).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/?page=2');
});

test('renders nothing when everything fits on one page', () => {
  const { container } = renderWithRouter(<Pagination page={1} total={20} pageSize={20} buildHref={buildHref} />);
  expect(container).toBeEmptyDOMElement();
});
