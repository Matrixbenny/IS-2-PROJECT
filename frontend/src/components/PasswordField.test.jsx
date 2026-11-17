import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PasswordField from './PasswordField';

test('password visibility can be toggled without changing its value', () => {
  const onChange = vi.fn();
  render(
    <PasswordField
      id="password"
      label="Password"
      value="StrongPassw0rd!"
      onChange={onChange}
      autoComplete="new-password"
    />
  );

  const input = screen.getByLabelText('Password');
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveValue('StrongPassw0rd!');

  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveValue('StrongPassw0rd!');
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(input).toHaveAttribute('type', 'password');
});
