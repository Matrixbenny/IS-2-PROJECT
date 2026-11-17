import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import ReviewerApplication from './ReviewerApplication';

vi.mock('../api', () => ({ default: { post: vi.fn() } }));

test('submits a reviewer application without creating a signed-in session', async () => {
  api.post.mockResolvedValue({
    status: 202,
    data: { message: 'Your reviewer application has been sent to the Kenya Watch Admin for approval.' }
  });
  render(<MemoryRouter><ReviewerApplication /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Review Applicant' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'applicant@example.com' } });
  fireEvent.change(screen.getByLabelText('Choose a password'), { target: { value: 'StrongPassw0rd!' } });
  fireEvent.change(screen.getByLabelText('Why would you like to review reports?'), {
    target: { value: 'I can carefully review reports and follow the project labeling guidance.' }
  });
  const cv = new File(['%PDF-1.7 CV'], 'applicant-cv.pdf', { type: 'application/pdf' });
  const qualification = new File(['%PDF-1.7 qualification'], 'qualification.pdf', { type: 'application/pdf' });
  await userEvent.upload(screen.getByLabelText(/CV or resume/), cv);
  await userEvent.upload(screen.getByLabelText(/Proof of relevant qualification/), qualification);
  expect(screen.getByLabelText(/CV or resume/).files).toHaveLength(1);
  expect(screen.getByLabelText(/Proof of relevant qualification/).files).toHaveLength(1);
  fireEvent.submit(screen.getByRole('button', { name: 'Send to Admin for approval' }).closest('form'));

  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const [path, submittedForm] = api.post.mock.calls[0];
  expect(path).toBe('/auth/reviewer-application');
  expect(submittedForm).toBeInstanceOf(FormData);
  expect(submittedForm.get('name')).toBe('Review Applicant');
  expect(submittedForm.get('email')).toBe('applicant@example.com');
  expect(submittedForm.get('applicationNote')).toBe('I can carefully review reports and follow the project labeling guidance.');
  expect(submittedForm.get('cv').name).toBe('applicant-cv.pdf');
  expect(submittedForm.get('qualification').name).toBe('qualification.pdf');
  expect(await screen.findByRole('heading', { name: 'Application sent to Admin' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('cannot sign in as a Reviewer yet');
});
