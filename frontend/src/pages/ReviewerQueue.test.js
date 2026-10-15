import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import ReviewerQueue from './ReviewerQueue';

jest.mock('../api', () => ({ get: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const report = {
  _id: 'case-1',
  title: 'Priority report',
  trackingReference: 'KW-TEST01',
  reportedCategory: 'Bribery',
  county: 'Nairobi',
  subCounty: 'Westlands',
  status: 'Received',
  description: 'A report opened directly from the Admin overview.',
  evidence: [],
  relatedCaseLinks: [],
  classification: { urgency: 'High' }
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'admin' } });
  api.get.mockImplementation((path) => {
    if (path === '/reports/queue') return Promise.resolve({ data: [report] });
    if (path === '/reports/agencies') return Promise.resolve({ data: { agencies: [] } });
    if (path === '/reports/case-1/related-suggestions') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
});

test('opens the case passed from the Admin overview', async () => {
  render(
    <MemoryRouter initialEntries={[{
      pathname: '/reviewer-queue',
      state: { focusReportId: 'case-1' }
    }]}>
      <Routes>
        <Route path="/reviewer-queue" element={<ReviewerQueue />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText('A report opened directly from the Admin overview.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/reports/case-1/related-suggestions');
});
