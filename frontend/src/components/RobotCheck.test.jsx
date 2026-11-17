import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RobotCheck from './RobotCheck';
import api from '../api';

vi.mock('../api', () => ({ default: { get: vi.fn() } }));

afterEach(() => {
  vi.clearAllMocks();
});

test('image check is the default and returns the token with selected tile answers', async () => {
  api.get.mockResolvedValue({
    data: {
      imageMode: true,
      prompt: 'Select all images with buses',
      token: 'signed-image-token',
      tiles: Array.from({ length: 9 }, (_, id) => ({
        id,
        svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
      }))
    }
  });
  const onToken = vi.fn();
  render(<RobotCheck onToken={onToken} />);

  fireEvent.click(screen.getByRole('button', { name: 'Start human verification' }));
  expect(api.get).toHaveBeenCalledWith('/reports/captcha-image');
  expect(await screen.findByText('Select all images with buses')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Image tile 2 of 9' }));
  fireEvent.click(screen.getByRole('button', { name: 'Image tile 7 of 9' }));
  fireEvent.click(screen.getByRole('button', { name: '✓ Verify' }));
  await waitFor(() => {
    expect(onToken).toHaveBeenLastCalledWith('signed-image-token', '[1,6]');
  });
});

test('text alternative remains available for people who cannot use the image challenge', async () => {
  api.get.mockResolvedValue({
    data: { question: 'Type 3', token: 'signed-text-token' }
  });
  const onToken = vi.fn();
  render(<RobotCheck onToken={onToken} />);

  fireEvent.click(screen.getByRole('button', { name: 'Use text check instead' }));
  expect(await screen.findByText('Type 3')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Security check answer'), { target: { value: ' 3 ' } });
  fireEvent.click(screen.getByRole('button', { name: '✓ Verify' }));

  expect(onToken).toHaveBeenLastCalledWith('signed-text-token', '3');
});
