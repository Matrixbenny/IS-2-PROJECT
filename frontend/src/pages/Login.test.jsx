import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Login from './Login';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../context/LanguageContext', () => ({ useLanguage: vi.fn() }));

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderLogin(login, verifyLogin) {
  useAuth.mockReturnValue({ login, verifyLogin });
  useLanguage.mockReturnValue({
    t: (key) => ({ login_title: 'Sign In', label_email: 'Email', label_password: 'Password', signIn: 'Sign In' }[key] || key)
  });
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<CurrentPath />} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPassw0rd!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

test('redirects an Admin to the Admin dashboard after sign-in', async () => {
  const login = vi.fn().mockResolvedValue({ role: 'admin' });
  renderLogin(login);

  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/admin'));
  expect(login).toHaveBeenCalledWith('person@example.com', 'StrongPassw0rd!');
});

test('redirects a regular user to the public home page after sign-in', async () => {
  const login = vi.fn().mockResolvedValue({ role: 'user' });
  renderLogin(login);

  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/'));
});

test('an officer is asked for the emailed code, and only the code step signs them in', async () => {
  const login = vi.fn().mockResolvedValue({ mfaRequired: true, challengeId: 'abc', message: 'We emailed a 6-digit code to of***@eacc.go.ke.' });
  const verifyLogin = vi.fn().mockResolvedValue({ role: 'admin' });
  renderLogin(login, verifyLogin);

  const codeBox = await screen.findByLabelText('Sign-in code');
  expect(screen.getByText(/We emailed a 6-digit code/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  expect(screen.queryByTestId('current-path')).not.toBeInTheDocument();

  fireEvent.change(codeBox, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/admin'));
  expect(verifyLogin).toHaveBeenCalledWith('abc', '123456');
});
