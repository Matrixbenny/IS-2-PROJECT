import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import ManageUsers from './ManageUsers';

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: 'admin-1', role: 'admin' } });
  api.get.mockImplementation((path) => {
    if (path === '/users/agency-options') {
      return Promise.resolve({ data: { agencies: [{ name: 'Ethics and Anti-Corruption Commission (EACC)', slug: 'eacc' }] } });
    }
    return Promise.resolve({ data: [] });
  });
});

test('creates an agency invitation only after explicit identity verification and displays its setup link', async () => {
  api.post.mockResolvedValue({
    data: {
      _id: 'officer-1',
      name: 'Agency Officer',
      email: 'officer@example.gov',
      role: 'agency',
      agencySlug: 'eacc',
      agencyVerificationReference: 'Liaison record 4',
      isActive: false,
      setupUrl: 'http://localhost:3000/reset-password?token=single-use'
    }
  });

  render(<ManageUsers />);
  fireEvent.change(await screen.findByLabelText('Officer name'), { target: { value: 'Agency Officer' } });
  fireEvent.change(screen.getByLabelText('Official email'), { target: { value: 'officer@example.gov' } });
  fireEvent.change(screen.getByLabelText('Agency', { selector: 'select' }), { target: { value: 'eacc' } });
  fireEvent.change(screen.getByLabelText('Identity/affiliation verification reference'), { target: { value: 'Liaison record 4' } });
  fireEvent.click(screen.getByLabelText(/I personally confirmed this officer/));
  fireEvent.click(screen.getByRole('button', { name: 'Create One-Time Invite' }));

  const setupLink = await screen.findByLabelText('One-time agency account setup link');
  expect(api.post).toHaveBeenCalledWith('/users/agency-invitations', {
    name: 'Agency Officer',
    email: 'officer@example.gov',
    agencySlug: 'eacc',
    verificationReference: 'Liaison record 4',
    identityVerified: true
  });
  expect(setupLink).toHaveValue('http://localhost:3000/reset-password?token=single-use');
  expect(screen.getByText('Invitation pending')).toBeInTheDocument();
});

test('does not create an agency account without identity and affiliation confirmation', async () => {
  render(<ManageUsers />);
  fireEvent.change(await screen.findByLabelText('Officer name'), { target: { value: 'Agency Officer' } });
  fireEvent.change(screen.getByLabelText('Official email'), { target: { value: 'officer@example.gov' } });
  fireEvent.change(screen.getByLabelText('Agency', { selector: 'select' }), { target: { value: 'eacc' } });
  fireEvent.change(screen.getByLabelText('Identity/affiliation verification reference'), { target: { value: 'Liaison record 4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create One-Time Invite' }));

  expect(screen.getByLabelText(/I personally confirmed this officer/)).toBeInvalid();
  expect(api.post).not.toHaveBeenCalled();
});

test('Admin approves a pending reviewer application and moves the applicant to reviewer accounts', async () => {
  const reviewerDocuments = [
    { kind: 'cv', gridFsId: 'cv-document-id', filename: 'applicant-cv.pdf', size: 2048, viewedBy: 'admin-1' },
    { kind: 'qualification', gridFsId: 'qualification-document-id', filename: 'qualification.pdf', size: 1024, viewedBy: 'admin-1' }
  ];
  api.get.mockImplementation((path) => {
    if (path === '/users/agency-options') {
      return Promise.resolve({ data: { agencies: [] } });
    }
    if (path === '/users/agency-applications') return Promise.resolve({ data: [] });
    if (path === '/users/reviewer-applications') {
      return Promise.resolve({
        data: [{
          _id: 'applicant-1',
          name: 'Review Applicant',
          email: 'review-applicant@example.com',
          reviewerApplicationStatus: 'pending',
          reviewerApplicationNote: 'I can carefully review reports and follow the project labeling guidance.',
          reviewerApplicationDocuments: reviewerDocuments
        }]
      });
    }
    return Promise.resolve({ data: [] });
  });
  api.patch.mockResolvedValue({
    data: {
      _id: 'applicant-1',
      id: 'applicant-1',
      name: 'Review Applicant',
      email: 'review-applicant@example.com',
      role: 'reviewer',
      isActive: true,
      reviewerApplicationStatus: 'approved'
    }
  });

  render(<ManageUsers />);
  expect(await screen.findByText('I can carefully review reports and follow the project labeling guidance.')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Open PDF' })).toHaveLength(2);
  fireEvent.click(screen.getByLabelText(/I opened both documents/));
  fireEvent.click(screen.getByRole('button', { name: 'Approve Reviewer' }));

  expect(api.patch).toHaveBeenCalledWith('/users/applicant-1/reviewer-application', {
    decision: 'approve',
    reason: '',
    documentsVerified: true
  });
  expect(await screen.findByText('No reviewer applications are awaiting approval.')).toBeInTheDocument();
});

test('Admin must open each supporting document before attesting and approving', async () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const anchorClick = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:reviewer-document')
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  api.get.mockImplementation((path) => {
    if (path === '/users') return Promise.resolve({ data: [] });
    if (path === '/users/agency-options') return Promise.resolve({ data: { agencies: [] } });
    if (path === '/users/agency-applications') return Promise.resolve({ data: [] });
    if (path === '/users/agency-applications') return Promise.resolve({ data: [] });
    if (path === '/users/reviewer-applications') {
      return Promise.resolve({
        data: [{
          _id: 'applicant-3',
          name: 'Review Applicant',
          email: 'review-applicant@example.com',
          reviewerApplicationStatus: 'pending',
          reviewerApplicationNote: 'I can carefully review reports and follow the project labeling guidance.',
          reviewerApplicationDocuments: [
            { kind: 'cv', gridFsId: 'cv-document-id', filename: 'applicant-cv.pdf', size: 2048 },
            { kind: 'qualification', gridFsId: 'qualification-document-id', filename: 'qualification.pdf', size: 1024 }
          ]
        }]
      });
    }
    return Promise.resolve({ data: new Blob(['%PDF-1.7'], { type: 'application/pdf' }) });
  });

  try {
    render(<ManageUsers />);
    const documentButtons = await screen.findAllByRole('button', { name: 'Open PDF' });
    fireEvent.click(documentButtons[0]);
    fireEvent.click(documentButtons[1]);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/users/applicant-3/reviewer-application/documents/cv-document-id',
      { responseType: 'blob' }
    ));
    await waitFor(() => expect(screen.getAllByText('Opened by you')).toHaveLength(2));
    fireEvent.click(screen.getByLabelText(/I opened both documents/));
    expect(screen.getByRole('button', { name: 'Approve Reviewer' })).toBeEnabled();
  } finally {
    anchorClick.mockRestore();
    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl });
    } else {
      delete URL.createObjectURL;
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl });
    } else {
      delete URL.revokeObjectURL;
    }
  }
});

test('Admin must provide a rejection reason before rejecting a reviewer application', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/users/agency-options') {
      return Promise.resolve({ data: { agencies: [] } });
    }
    if (path === '/users/agency-applications') return Promise.resolve({ data: [] });
    if (path === '/users/reviewer-applications') {
      return Promise.resolve({
        data: [{
          _id: 'applicant-2',
          name: 'Review Applicant',
          email: 'review-applicant@example.com',
          reviewerApplicationStatus: 'pending',
          reviewerApplicationNote: 'I can carefully review reports and follow the project labeling guidance.',
          reviewerApplicationDocuments: [
            { kind: 'cv', gridFsId: 'cv-document-id', filename: 'applicant-cv.pdf', size: 2048 },
            { kind: 'qualification', gridFsId: 'qualification-document-id', filename: 'qualification.pdf', size: 1024 }
          ]
        }]
      });
    }
    return Promise.resolve({ data: [] });
  });
  api.patch.mockResolvedValue({
    data: {
      _id: 'applicant-2',
      name: 'Review Applicant',
      email: 'review-applicant@example.com',
      role: 'reviewer_pending',
      isActive: false,
      reviewerApplicationStatus: 'rejected',
      reviewerApplicationRejectionReason: 'The application needs more relevant experience.'
    }
  });

  render(<ManageUsers />);
  expect(await screen.findByText('Review Applicant')).toBeInTheDocument();
  const reject = screen.getByRole('button', { name: 'Reject application' });
  expect(reject).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason if rejecting'), {
    target: { value: 'The application needs more relevant experience.' }
  });
  expect(reject).toBeEnabled();
  fireEvent.click(reject);
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/applicant-2/reviewer-application', {
    decision: 'reject',
    reason: 'The application needs more relevant experience.',
    documentsVerified: false
  }));
  expect(await screen.findByText('Previously rejected applications')).toBeInTheDocument();
});

