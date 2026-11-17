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

function renderLogin(login) {
  useAuth.mockReturnValue({ login });
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
