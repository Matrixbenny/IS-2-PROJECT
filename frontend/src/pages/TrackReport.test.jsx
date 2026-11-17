import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../api';
import TrackReport from './TrackReport';

vi.mock('../api', () => ({ default: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({
    data: {
      _id: 'case-1',
      trackingReference: 'KW-AGENCY1',
      title: 'My report',
      reportedCategory: 'Bribery',
      county: 'Nairobi',
      subCounty: 'Westlands',
      description: 'The report description is visible only to its authorised reporter.',
      evidence: [],
      createdAt: '2026-10-15T10:00:00.000Z',
      status: 'In Review',
      statusHistory: [],
      agencyProgress: {
        agency: 'Ethics and Anti-Corruption Commission (EACC)',
        status: 'information_requested',
        updates: [{
          message: 'The referral has been received and is being assessed.',
          createdAt: '2026-10-15T11:00:00.000Z'
        }]
      }
    }
  });
});

test('shows the agency status and only reporter-approved messages in private tracking', async () => {
  render(<TrackReport />);
  fireEvent.change(screen.getByLabelText('Tracking Reference'), { target: { value: 'KW-AGENCY1' } });
  fireEvent.change(screen.getByLabelText('Access Key'), { target: { value: 'private-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check Status' }));

  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/track', {
    params: { ref: 'KW-AGENCY1', key: 'private-key' }
  }));
  expect(await screen.findByRole('heading', { name: 'Agency follow-up' })).toBeInTheDocument();
  expect(screen.getByText(/information requested/)).toBeInTheDocument();
  expect(screen.getByText(/The referral has been received and is being assessed/)).toBeInTheDocument();
});
