import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import AdminDashboard from './AdminDashboard';

jest.mock('../api', () => ({ get: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const overview = {
  reports: {
    active: 9,
    archived: 2,
    total: 11,
    byStatus: { Received: 3, 'In Review': 2, Resolved: 3, Rejected: 1 }
  },
  accounts: { total: 6, admins: 1, reviewers: 2, users: 3 },
  escalations: { count: 1, thresholdMinutes: 60 },
  attention: [{
    _id: 'case-1',
    trackingReference: 'KW-TEST01',
    title: 'Test unclaimed report',
    status: 'Received',
    county: 'Nairobi',
    subCounty: 'Westlands',
    createdAt: '2026-10-15T10:00:00.000Z',
    classification: { urgency: 'High' }
  }]
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'admin' } });
  api.get.mockResolvedValue({ data: overview });
});

test('shows live admin metrics and links to admin workflows', async () => {
  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );

  expect(await screen.findByText('Active reports')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Admin overview' })).toBeInTheDocument();
  expect(screen.getByText('Awaiting review')).toBeInTheDocument();
  expect(screen.getByText('9', { selector: '.kw-admin-metric-value' })).toBeInTheDocument();
  expect(screen.getByText('Archived')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Unclaimed cases to review' })).toBeInTheDocument();
  expect(screen.getByText('Test unclaimed report')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open case' })).toHaveAttribute('href', '/reviewer-queue');
  expect(screen.getByRole('link', { name: /manage accounts/i })).toHaveAttribute('href', '/manage-users');
  expect(screen.getByRole('link', { name: /review archive/i })).toHaveAttribute('href', '/archived-reports');
  expect(api.get).toHaveBeenCalledWith('/reports/admin-overview');
});

test('keeps non-admin users out of the admin overview', () => {
  useAuth.mockReturnValue({ user: { role: 'reviewer' } });

  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: 'Admin access only' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Return to the public home page' })).toHaveAttribute('href', '/');
  expect(api.get).not.toHaveBeenCalled();
});

test('offers a sign-in path when the Admin page is opened while signed out', () => {
  useAuth.mockReturnValue({ user: null });

  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: 'Admin sign-in required' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(api.get).not.toHaveBeenCalled();
});
