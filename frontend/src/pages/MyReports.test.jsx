import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import MyReports from './MyReports';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../hooks/usePolling', () => ({ default: vi.fn() }));

const reports = [{
  _id: 'case-1',
  title: 'Clinic permit report',
  reportedCategory: 'Bribery',
  county: 'Nairobi',
  subCounty: 'Westlands',
  trackingReference: 'KW-TEST01',
  status: 'In Review',
  createdAt: '2026-10-10T12:00:00.000Z',
  description: 'A report submitted by a signed-in citizen.',
  evidence: [],
  comments: []
}, {
  _id: 'case-2',
  title: 'Resolved report',
  reportedCategory: 'Other',
  county: 'Kisumu',
  trackingReference: 'KW-TEST02',
  status: 'Resolved',
  description: 'A resolved report.',
  resolutionNote: 'The case was reviewed.',
  resolutionReference: 'REF-02',
  evidence: [],
  comments: []
}];

function renderDashboard() {
  return render(
    <MemoryRouter>
      <MyReports />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({
    user: { id: 'citizen-1', name: 'Amina Citizen', role: 'user' },
    deleteAccount: vi.fn().mockResolvedValue({ message: 'deleted' })
  });
  api.get.mockResolvedValue({ data: reports });
});

test('shows a styled citizen dashboard with report summary and case cards', async () => {
  renderDashboard();

  expect(await screen.findByRole('heading', { name: 'Welcome back, Amina' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Your report summary' })).toHaveTextContent('2');
  expect(screen.getByRole('region', { name: 'Your report summary' })).toHaveTextContent('1');
  expect(screen.getByRole('heading', { name: 'Your reports' })).toBeInTheDocument();
  expect(screen.getByText('Clinic permit report')).toBeInTheDocument();
  expect(screen.getByText('KW-TEST01')).toBeInTheDocument();
  expect(screen.getByText('The case was reviewed. (Reference: REF-02)')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /submit a report/i })).toHaveAttribute('href', '/submit');
  expect(api.get).toHaveBeenCalledWith('/reports/mine');
});

test('explains empty report state and offers a route to submit a first report', async () => {
  api.get.mockResolvedValue({ data: [] });
  renderDashboard();

  expect(await screen.findByRole('heading', { name: 'Your report list is ready when you are' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Create your first report' })).toHaveAttribute('href', '/submit');
});

test('requires password and typed confirmation before requesting permanent account deletion', async () => {
  const deleteAccount = vi.fn().mockResolvedValue({ message: 'deleted' });
  useAuth.mockReturnValue({
    user: { id: 'citizen-1', name: 'Amina Citizen', role: 'user' },
    deleteAccount
  });
  renderDashboard();

  fireEvent.click(await screen.findByRole('button', { name: 'Permanently delete account' }));
  expect(screen.getByText(/Reports already submitted will remain for case integrity/)).toBeInTheDocument();
  const submitButton = screen.getByRole('button', { name: 'Confirm permanent deletion' });
  expect(submitButton).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Confirm your password'), { target: { value: 'StrongPassw0rd!' } });
  expect(submitButton).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
  expect(submitButton).toBeEnabled();

  fireEvent.click(submitButton);
  await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith({
    password: 'StrongPassw0rd!',
    confirmation: 'DELETE'
  }));
});

test('shows a server error if account deletion fails and allows cancellation', async () => {
  useAuth.mockReturnValue({
    user: { id: 'citizen-1', name: 'Amina Citizen', role: 'user' },
    deleteAccount: vi.fn().mockRejectedValue({
      response: { data: { error: 'The password is incorrect. Your account was not deleted.' } }
    })
  });
  renderDashboard();

  fireEvent.click(await screen.findByRole('button', { name: 'Permanently delete account' }));
  fireEvent.change(screen.getByLabelText('Confirm your password'), { target: { value: 'wrong-password' } });
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The password is incorrect');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Confirm your password')).not.toBeInTheDocument();
});
