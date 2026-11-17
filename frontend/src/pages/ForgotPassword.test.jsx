import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPassword from './ForgotPassword';
import api from '../api';

vi.mock('../api', () => ({ default: { post: vi.fn() } }));
vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => ({ label_email: 'Email', forgot_send: 'Send Reset Link' }[key] || key) })
}));

test('password recovery shows the generic response after request submission', async () => {
  api.post.mockResolvedValue({
    data: { message: 'If this email is registered, a password reset link will be sent.' }
  });
  render(<MemoryRouter><ForgotPassword /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

  await waitFor(() => {
    expect(screen.getByText('If this email is registered, a password reset link will be sent.')).toBeInTheDocument();
  });
  expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'person@example.com' });
});

test('password recovery displays a request failure instead of a success message', async () => {
  api.post.mockRejectedValue(new Error('network failure'));
  render(<MemoryRouter><ForgotPassword /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Could not submit the reset request. Please try again.');
  });
  expect(screen.queryByText(/password reset link will be sent/i)).not.toBeInTheDocument();
});
