import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import SubmitReport from './SubmitReport';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../context/LanguageContext', () => ({ useLanguage: vi.fn() }));
vi.mock('../components/LiveRecorder', () => ({
  default: function MockLiveRecorder() {
    return <div>Live recorder test placeholder</div>;
  }
}));
vi.mock('../components/RobotCheck', () => ({
  default: function MockRobotCheck({ onToken }) {
    return <button type="button" onClick={() => onToken('test-captcha-token', 'test-answer')}>Pass test security check</button>;
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: null });
  useLanguage.mockReturnValue({
    t: (key) => ({
      submit_title: 'Submit a Corruption Report',
      submit_anon: 'Reporting anonymously.',
      label_title: 'Title',
      label_category: 'Category',
      label_description: 'Description',
      label_county: 'County',
      label_subCounty: 'Sub-county',
      btn_submitReport: 'Submit Report',
      btn_submitting: 'Submitting...'
    }[key] || key)
  });
  api.get.mockResolvedValue({
    data: {
      categories: ['Bribery'],
      fields: { Bribery: [] }
    }
  });
});

test('anonymous citizen can submit a report and is shown one-time tracking credentials', async () => {
  api.post.mockResolvedValue({
    data: {
      trackingReference: 'KW-TEST99',
      accessKey: 'fictional-test-access-key',
      accessKeyWarning: 'Save this key now.'
    }
  });
  render(<SubmitReport />);

  fireEvent.change(screen.getByLabelText('Title*'), { target: { value: 'Permit payment request' } });
  await screen.findByRole('option', { name: 'Bribery' });
  fireEvent.change(screen.getByLabelText('Category*'), { target: { value: 'Bribery' } });
  fireEvent.change(screen.getByLabelText('Description*'), {
    target: { value: 'An officer allegedly requested an unofficial fee for a public service.' }
  });
  fireEvent.change(screen.getByLabelText('County*'), { target: { value: 'Nairobi' } });
  fireEvent.change(screen.getByLabelText('Sub-county*'), { target: { value: 'Westlands' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pass test security check' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  const [path, payload] = api.post.mock.calls[0];
  expect(path).toBe('/reports');
  expect(payload.get('title')).toBe('Permit payment request');
  expect(payload.get('reportedCategory')).toBe('Bribery');
  expect(payload.get('captchaToken')).toBe('test-captcha-token');
  expect(payload.get('captchaAnswer')).toBe('test-answer');
  expect(await screen.findByText('KW-TEST99')).toBeInTheDocument();
  expect(screen.getByText('fictional-test-access-key')).toBeInTheDocument();
});

test('emails a report receipt only after the supplied email is confirmed with an OTP', async () => {
  api.post.mockImplementation((path) => {
    if (path === '/reports') {
      return Promise.resolve({
        data: {
          trackingReference: 'KW-EMAIL01',
          accessKey: 'fictional-test-access-key',
          accessKeyWarning: 'Save this key now.'
        }
      });
    }
    if (path === '/reports/email-receipt/request-otp') {
      return Promise.resolve({ data: { message: 'A verification code was sent.' } });
    }
    if (path === '/reports/email-receipt/verify-otp') {
      return Promise.resolve({ data: { message: 'Your report tracking details were sent.' } });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  render(<SubmitReport />);

  fireEvent.change(screen.getByLabelText('Title*'), { target: { value: 'Permit payment request' } });
  await screen.findByRole('option', { name: 'Bribery' });
  fireEvent.change(screen.getByLabelText('Category*'), { target: { value: 'Bribery' } });
  fireEvent.change(screen.getByLabelText('Description*'), {
    target: { value: 'An officer allegedly requested an unofficial fee for a public service.' }
  });
  fireEvent.change(screen.getByLabelText('County*'), { target: { value: 'Nairobi' } });
  fireEvent.change(screen.getByLabelText('Sub-county*'), { target: { value: 'Westlands' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pass test security check' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));

  await screen.findByText('KW-EMAIL01');
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'citizen@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  expect(await screen.findByText('A verification code was sent.')).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/reports/email-receipt/request-otp', {
    trackingReference: 'KW-EMAIL01',
    accessKey: 'fictional-test-access-key',
    email: 'citizen@example.com'
  });

  fireEvent.change(screen.getByLabelText('Six-digit email verification code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify code and email receipt' }));
  expect(await screen.findByText('Your report tracking details were sent.')).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/reports/email-receipt/verify-otp', {
    trackingReference: 'KW-EMAIL01',
    accessKey: 'fictional-test-access-key',
    otp: '123456'
  });
});

test('pastes the six-digit verification code from the clipboard into the large OTP field', async () => {
  const originalReadText = navigator.clipboard?.readText;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText: vi.fn().mockResolvedValue('Your code is 482913. It expires soon.') }
  });
  api.post.mockImplementation((path) => {
    if (path === '/reports') {
      return Promise.resolve({
        data: {
          trackingReference: 'KW-PASTE01',
          accessKey: 'fictional-test-access-key',
          accessKeyWarning: 'Save this key now.'
        }
      });
    }
    if (path === '/reports/email-receipt/request-otp') {
      return Promise.resolve({ data: { message: 'A verification code was sent.' } });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  try {
    render(<SubmitReport />);
    fireEvent.change(screen.getByLabelText('Title*'), { target: { value: 'Permit payment request' } });
    await screen.findByRole('option', { name: 'Bribery' });
    fireEvent.change(screen.getByLabelText('Category*'), { target: { value: 'Bribery' } });
    fireEvent.change(screen.getByLabelText('Description*'), {
      target: { value: 'An officer allegedly requested an unofficial fee for a public service.' }
    });
    fireEvent.change(screen.getByLabelText('County*'), { target: { value: 'Nairobi' } });
    fireEvent.change(screen.getByLabelText('Sub-county*'), { target: { value: 'Westlands' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pass test security check' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));

    await screen.findByText('KW-PASTE01');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'citizen@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
    await screen.findByLabelText('Six-digit email verification code');
    fireEvent.click(screen.getByRole('button', { name: 'Paste code from clipboard' }));

    expect(await screen.findByLabelText('Six-digit email verification code')).toHaveValue('482913');
    expect(screen.getByLabelText('Six-digit email verification code')).toHaveClass('kw-otp-input');
  } finally {
    if (originalReadText) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: originalReadText }
      });
    } else {
      delete navigator.clipboard;
    }
  }
});
