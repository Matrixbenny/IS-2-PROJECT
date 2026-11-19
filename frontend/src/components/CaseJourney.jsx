import React from 'react';

export const JOURNEY_STEPS = [
  { key: 'received', label: 'Received', help: 'Kenya Watch has your report.' },
  { key: 'review', label: 'Under review', help: 'A trained reviewer is assessing it.' },
  { key: 'referred', label: 'Sent to the authorities', help: 'Referred to the institution(s) with the legal mandate.' },
  { key: 'investigating', label: 'Being investigated', help: 'An officer has taken the case and is working it.' },
  { key: 'outcome', label: 'Outcome recorded', help: 'The institution recorded what it decided.' }
];

// How far a case has travelled, 1 to 5, from what the reporter is allowed to see.
export function journeyStage(report) {
  const referrals = report.agencyReferrals || [];
  if (report.status === 'Resolved' || referrals.some((item) => item.status === 'closed')) return 5;
  if (referrals.some((item) => item.status && item.status !== 'sent')) return 4;
  if (referrals.length > 0) return 3;
  if (report.status === 'In Review' || report.status === 'Rejected' || report.caseStatus?.claimed) return 2;
  return 1;
}

function CaseJourney({ report }) {
  const stage = journeyStage(report);
  const rejected = report.status === 'Rejected';
  return (
    <ol className="kw-journey" aria-label={`Case progress: step ${stage} of ${JOURNEY_STEPS.length}, ${JOURNEY_STEPS[stage - 1].label}`}>
      {JOURNEY_STEPS.map((step, index) => {
        const number = index + 1;
        const state = number < stage ? 'done' : number === stage ? 'current' : 'todo';
        return (
          <li key={step.key} className={`kw-journey-step kw-journey-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="kw-journey-dot" aria-hidden="true">{state === 'done' ? '✓' : number}</span>
            <span className="kw-journey-label">{step.label}</span>
            {state === 'current' && <span className="kw-journey-help">{rejected ? 'Closed by the review team. See the reason below.' : step.help}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default CaseJourney;
