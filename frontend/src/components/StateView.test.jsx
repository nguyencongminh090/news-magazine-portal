import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StateView } from './StateView.jsx';

test('loading shows a status message', () => {
  render(<StateView loading />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
});

test('error shows an alert and Try again calls onRetry', async () => {
  const onRetry = vi.fn();
  render(<StateView error={{ title: 'Network error' }} onRetry={onRetry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('empty shows "No articles found"', () => {
  render(<StateView empty />);
  expect(screen.getByText('No articles found')).toBeInTheDocument();
});

test('renders nothing when there is no state to show', () => {
  const { container } = render(<StateView />);
  expect(container).toBeEmptyDOMElement();
});
