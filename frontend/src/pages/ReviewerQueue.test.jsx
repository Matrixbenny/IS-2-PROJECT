import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import ReviewerQueue from './ReviewerQueue';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

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
const categoryReview = {
  status: 'agreed',
  annotationCount: 2,
  ownAnnotationSubmitted: true,
  ownDecision: 'category',
  ownCategory: 'Bribery',
  adjudicatedDecision: 'category',
  adjudicatedCategory: 'Bribery'
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'admin' } });
  api.get.mockImplementation((path) => {
    if (path === '/reports/queue') return Promise.resolve({ data: [report] });
    if (path === '/reports/agencies') return Promise.resolve({ data: { agencies: [] } });
    if (path === '/reports/case-1/category-review') return Promise.resolve({ data: categoryReview });
    if (path === '/reports/categories') return Promise.resolve({ data: { categories: ['Bribery'] } });
    if (path === '/reports/case-1/related-suggestions') return Promise.resolve({ data: [] });
    if (path === '/reports/case-1/ml-category-suggestion') {
      return Promise.resolve({
        data: {
          suggestion: 'Bribery',
          modelVersion: 'test-model',
          trainingDataStatus: 'synthetic_only_not_for_real_world_validation_or_production_training',
          realWorldPerformanceClaim: false,
          warning: 'Experimental suggestion trained on data that is not validated for real-world performance.'
        }
      });
    }
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
  expect(screen.getByRole('region', { name: 'Internal reviewer workspace' })).toHaveTextContent(
    'Agency officers use a separate portal'
  );
  expect(screen.getByRole('link', { name: 'Open the separate Agency Case Portal' })).toHaveAttribute(
    'href',
    'http://localhost:5000/agency-portal/'
  );
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/case-1/related-suggestions'));
});

test('shows the synthetic-trained model output only as a non-binding suggestion after independent review', async () => {
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

  const section = await screen.findByRole('region', { name: 'Experimental ML category suggestion' });
  await waitFor(() => expect(section).toHaveTextContent('Model suggestion only: Bribery'));
  expect(section).toHaveTextContent('Training data: Synthetic examples only');
  expect(section).toHaveTextContent('does not set the report category or urgency');
  expect(section).toHaveTextContent('Model version: test-model');
  expect(section).not.toHaveTextContent('probability');
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/case-1/ml-category-suggestion'));
});

test('explains text-similarity suggestions as advisory scores rather than probabilities', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/reports/queue') return Promise.resolve({ data: [report] });
    if (path === '/reports/agencies') return Promise.resolve({ data: { agencies: [] } });
    if (path === '/reports/case-1/category-review') return Promise.resolve({ data: categoryReview });
    if (path === '/reports/categories') return Promise.resolve({ data: { categories: ['Bribery'] } });
    if (path === '/reports/case-1/related-suggestions') {
      return Promise.resolve({
        data: [{
          id: 'case-2',
          title: 'Permit payment allegation',
          subCounty: 'Westlands',
          similarityPercent: 48.3,
          sharedTerms: ['permit', 'payment']
        }]
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });

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

  expect(await screen.findByText(/TF-IDF text similarity ranks recent reports in the same county/)).toBeInTheDocument();
  expect(await screen.findByText(/Text match: 48.3%/)).toBeInTheDocument();
  expect(screen.getByText('Shared terms: permit, payment')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Link after review' })).toBeInTheDocument();
  expect(screen.queryByText(/probability that these reports are related/i)).not.toBeInTheDocument();
});

test('keeps reporter category and related-case suggestions hidden until an independent label is submitted', async () => {
  const blindedReport = { ...report, reportedCategory: undefined, classification: null };
  api.get.mockImplementation((path) => {
    if (path === '/reports/queue') return Promise.resolve({ data: [blindedReport] });
    if (path === '/reports/agencies') return Promise.resolve({ data: { agencies: [] } });
    if (path === '/reports/case-1/category-review') {
      return Promise.resolve({
        data: {
          status: 'awaiting_second_review',
          annotationCount: 0,
          ownAnnotationSubmitted: false,
          ownDecision: null,
          ownCategory: null,
          adjudicatedDecision: null,
          adjudicatedCategory: null
        }
      });
    }
    if (path === '/reports/categories') return Promise.resolve({ data: { categories: ['Bribery'] } });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });

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

  expect(await screen.findByLabelText('Your independent assessment')).toBeInTheDocument();
  expect(screen.getByText(/reporter-selected category and existing classifier output are hidden/i)).toBeInTheDocument();
  expect(screen.getByText('Submit your independent category label before viewing related-case suggestions.')).toBeInTheDocument();
  expect(screen.queryByText('Reporter category: Bribery')).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith('/reports/case-1/related-suggestions');
  expect(api.get).not.toHaveBeenCalledWith('/reports/case-1/ml-category-suggestion');
});

test('allows reviewers to mark insufficient information without submitting a category', async () => {
  const blindedReport = { ...report, reportedCategory: undefined, classification: null };
  let annotationSubmitted = false;
  api.get.mockImplementation((path) => {
    if (path === '/reports/queue') return Promise.resolve({ data: [blindedReport] });
    if (path === '/reports/agencies') return Promise.resolve({ data: { agencies: [] } });
    if (path === '/reports/case-1/category-review') {
      return Promise.resolve({
        data: annotationSubmitted
          ? {
            status: 'awaiting_second_review',
            annotationCount: 1,
            ownAnnotationSubmitted: true,
            ownDecision: 'insufficient_information',
            ownCategory: null,
            adjudicatedDecision: null,
            adjudicatedCategory: null
          }
          : {
            status: 'awaiting_second_review',
            annotationCount: 0,
            ownAnnotationSubmitted: false,
            ownDecision: null,
            ownCategory: null,
            adjudicatedDecision: null,
            adjudicatedCategory: null
          }
      });
    }
    if (path === '/reports/categories') return Promise.resolve({ data: { categories: ['Bribery'] } });
    if (path === '/reports/case-1') return Promise.resolve({ data: blindedReport });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  api.post.mockImplementation((path, body) => {
    expect(path).toBe('/reports/case-1/category-review/annotations');
    expect(body).toEqual({
      decision: 'insufficient_information',
      note: 'The action described is too vague.'
    });
    annotationSubmitted = true;
    return Promise.resolve({ data: { status: 'awaiting_second_review' } });
  });

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

  fireEvent.change(await screen.findByLabelText('Your independent assessment'), {
    target: { value: 'insufficient_information' }
  });
  expect(screen.queryByLabelText('Category of the alleged conduct')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('What information is missing or unclear? (required)'), {
    target: { value: 'The action described is too vague.' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit independent assessment' }));

  expect(await screen.findByText(/Your assessment: Insufficient information/)).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.get).not.toHaveBeenCalledWith('/reports/case-1/related-suggestions');
  expect(api.get).not.toHaveBeenCalledWith('/reports/case-1/ml-category-suggestion');
});

test('allows an Admin to adjudicate a disagreement as insufficient information', async () => {
  let adjudicated = false;
  api.get.mockImplementation((path) => {
    if (path === '/reports/queue') return Promise.resolve({ data: [report] });
    if (path === '/reports/agencies') return Promise.resolve({ data: { agencies: [] } });
    if (path === '/reports/case-1/category-review') {
      return Promise.resolve({
        data: adjudicated
          ? {
            status: 'adjudicated',
            annotationCount: 2,
            ownAnnotationSubmitted: false,
            ownDecision: null,
            ownCategory: null,
            adjudicatedDecision: 'insufficient_information',
            adjudicatedCategory: null
          }
          : {
            status: 'needs_adjudication',
            annotationCount: 2,
            ownAnnotationSubmitted: false,
            ownDecision: null,
            ownCategory: null,
            adjudicatedDecision: null,
            adjudicatedCategory: null,
            proposedAnnotations: [
              { decision: 'insufficient_information', category: null, note: 'Conduct is unclear.' },
              { decision: 'category', category: 'Bribery', note: null }
            ]
          }
      });
    }
    if (path === '/reports/categories') return Promise.resolve({ data: { categories: ['Bribery'] } });
    if (path === '/reports/case-1') return Promise.resolve({ data: report });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  api.patch.mockImplementation((path, body) => {
    expect(path).toBe('/reports/case-1/category-review/adjudication');
    expect(body).toEqual({
      decision: 'insufficient_information',
      note: 'There is not enough detail to support the proposed category.'
    });
    adjudicated = true;
    return Promise.resolve({ data: { status: 'adjudicated' } });
  });

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

  expect(await screen.findByText(/Insufficient information — Conduct is unclear\./)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Admin outcome'), {
    target: { value: 'insufficient_information' }
  });
  expect(screen.queryByLabelText('Adjudicated category')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Adjudication reason'), {
    target: { value: 'There is not enough detail to support the proposed category.' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record adjudication' }));

  expect(await screen.findByText(/Final outcome: Insufficient information; excluded from category training/)).toBeInTheDocument();
  expect(api.patch).toHaveBeenCalledTimes(1);
});

test('reviewer submits a minimum-data agency referral only after confirming authorization', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/reports/queue') return Promise.resolve({ data: [report] });
    if (path === '/reports/agencies') {
      return Promise.resolve({
        data: { agencies: [{ name: 'Ethics and Anti-Corruption Commission (EACC)', slug: 'eacc' }] }
      });
    }
    if (path === '/reports/case-1/category-review') return Promise.resolve({ data: categoryReview });
    if (path === '/reports/categories') return Promise.resolve({ data: { categories: ['Bribery'] } });
    if (path === '/reports/case-1/related-suggestions') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  api.post.mockImplementation((path, body) => {
    expect(path).toBe('/reports/case-1/refer');
    expect(body).toEqual({
      agency: 'Ethics and Anti-Corruption Commission (EACC)',
      notes: '',
      referralSummary: 'A minimized brief describing the reviewed allegation and requested follow-up.',
      transferConfirmed: true
    });
    return Promise.resolve({ data: { ...report, agencyReferral: { agency: body.agency } } });
  });

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

  fireEvent.change(await screen.findByLabelText('Agency'), {
    target: { value: 'Ethics and Anti-Corruption Commission (EACC)' }
  });
  fireEvent.change(screen.getByLabelText(/Referral brief/), {
    target: { value: 'A minimized brief describing the reviewed allegation and requested follow-up.' }
  });
  const confirm = screen.getByRole('checkbox', {
    name: /I confirmed the official receiving contact/
  });
  expect(screen.getByRole('button', { name: 'Send Secure Referral' })).toBeDisabled();
  fireEvent.click(confirm);
  fireEvent.click(screen.getByRole('button', { name: 'Send Secure Referral' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
});
