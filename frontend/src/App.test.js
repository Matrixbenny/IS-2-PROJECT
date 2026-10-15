import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Deliberately not mocking the api module here - both AuthContext and Home already
// handle failed network calls gracefully via .catch(), so letting the real (failing,
// since no backend is running in this test) requests reject naturally keeps this
// smoke test simple and avoids fighting module-mock quirks in this toolchain.

test('renders the Kenya Watch header and main navigation', async () => {
  render(<App />);
  expect(screen.getByText('Kenya Watch')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /skip to main content/i })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /submit report/i })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument());
});
