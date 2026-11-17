import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import api from './api';

vi.mock('./api', () => ({
  default: {
    defaults: { baseURL: '/api' },
    get: vi.fn().mockRejectedValue(new Error('API unavailable in smoke test'))
  }
}));

test('renders the Kenya Watch header and main navigation', async () => {
  render(<App />);
  expect(screen.getByText('Kenya Watch')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /skip to main content/i })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /submit report/i })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument());
});

test('agency accounts are sent to the agency portal instead of citizen reports', async () => {
  api.get.mockResolvedValueOnce({
    data: { user: { id: 'agency-1', name: 'Agency Officer', role: 'agency' } }
  });
  window.history.pushState({}, '', '/my-reports');
  render(<App />);

  expect(await screen.findByText(/my reports is available to citizen accounts only/i)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /my reports/i })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /open agency case portal/i }))
    .toHaveAttribute('href', `${window.location.origin}/agency-portal/`);
  expect(api.get).not.toHaveBeenCalledWith('/reports/mine');

  window.history.pushState({}, '', '/');
});
