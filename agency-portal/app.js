const API_BASE = `${window.location.origin}/api`;

const loginView = document.getElementById('login-view');
const casesView = document.getElementById('cases-view');
const applyView = document.getElementById('apply-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const agencyPassword = document.getElementById('agency-password');
const agencyPasswordToggle = document.getElementById('agency-password-toggle');
const agencyNameHeading = document.getElementById('agency-name-heading');
const casesList = document.getElementById('cases-list');
const casesError = document.getElementById('cases-error');
const logoutBtn = document.getElementById('logout-btn');
const refreshCasesBtn = document.getElementById('refresh-cases-btn');
const lastRefreshed = document.getElementById('last-refreshed');
let refreshTimer = null;
let loadingCases = false;

agencyPasswordToggle.addEventListener('click', () => {
  const visible = agencyPassword.type === 'password';
  agencyPassword.type = visible ? 'text' : 'password';
  agencyPasswordToggle.textContent = visible ? 'Hide' : 'Show';
  agencyPasswordToggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  agencyPasswordToggle.setAttribute('aria-pressed', String(visible));
});

async function readResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

// --- Agency officer application (applies from this portal; Admin verifies) ---
const applyForm = document.getElementById('apply-form');
const applyError = document.getElementById('apply-error');
const applySuccess = document.getElementById('apply-success');
const applyAgencySelect = document.getElementById('apply-agency');
const applyBackBtn = document.getElementById('apply-back-btn');
const showApplyLink = document.getElementById('show-apply-link');
const applyPassword = document.getElementById('apply-password');
const applyPasswordToggle = document.getElementById('apply-password-toggle');

applyPasswordToggle.addEventListener('click', () => {
  const visible = applyPassword.type === 'password';
  applyPassword.type = visible ? 'text' : 'password';
  applyPasswordToggle.textContent = visible ? 'Hide' : 'Show';
  applyPasswordToggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  applyPasswordToggle.setAttribute('aria-pressed', String(visible));
});

function showApply() {
  loginView.hidden = true;
  casesView.hidden = true;
  applyView.hidden = false;
  window.scrollTo(0, 0);
}

function showLogin() {
  applyView.hidden = true;
  casesView.hidden = true;
  loginView.hidden = false;
  window.scrollTo(0, 0);
}

showApplyLink.addEventListener('click', (event) => {
  event.preventDefault();
  window.location.hash = '#apply';
  showApply();
});
applyBackBtn.addEventListener('click', () => {
  window.location.hash = '';
  showLogin();
});
window.addEventListener('hashchange', () => {
  if (window.location.hash === '#apply') showApply();
});
if (window.location.hash === '#apply') showApply();

(async function loadAgencyPartners() {
  try {
    const data = await readResponse(await fetch(`${API_BASE}/reports/agency-partners`));
    for (const agency of data.agencies || []) {
      const option = document.createElement('option');
      option.value = agency.slug;
      option.textContent = agency.name;
      applyAgencySelect.appendChild(option);
    }
  } catch (error) {
    // The login form still works; the applicant sees the error when submitting.
    applyAgencySelect.insertAdjacentHTML('afterend',
      `<div class="ap-error" role="alert">Could not load the institution list: ${error.message}</div>`);
  }
})();

applyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  applyError.hidden = true;
  const button = applyForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const body = new FormData(applyForm);
    if (!body.get('declaration')) {
      throw new Error('Confirm the declaration before submitting.');
    }
    body.set('declaration', 'true');
    const response = await fetch(`${API_BASE}/auth/agency-application`, {
      method: 'POST',
      body
    });
    await readResponse(response);
    applyForm.hidden = true;
    applySuccess.hidden = false;
    window.scrollTo(0, 0);
  } catch (error) {
    applyError.textContent = error.message;
    applyError.hidden = false;
  } finally {
    button.disabled = false;
  }
});
// --- end agency officer application ---

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

// A referral brief is the officer's only written context at first contact. A
// brief with no spaces (keyboard mashing) or almost no readable words is not
// useful for an investigation, so say so plainly instead of presenting noise
// as an official summary.
function looksUnusable(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  const words = value.split(/\s+/).filter((w) => w.length > 1);
  const readableWords = words.filter((w) => /^[A-Za-z][A-Za-z'\-]*$/.test(w) && w.length >= 3);
  if (words.length === 0) return true;
  return readableWords.length < 3;
}

function renderBrief(text) {
  if (looksUnusable(text)) {
    return `<p class="ap-brief-warning" role="note">
      Kenya Watch has not supplied a usable referral brief for this case. Ask the liaison for a proper summary
      before acting on it — use the information request box below.
    </p>`;
  }
  return `<p>${escapeHtml(text)}</p>`;
}

function showCases(profile) {
  agencyNameHeading.textContent = `Cases assigned to ${profile.agency}`;
  loginView.hidden = true;
  casesView.hidden = false;
  loadCases();
  if (!refreshTimer) refreshTimer = window.setInterval(loadCases, 30000);
}

function renderCases(cases) {
  if (cases.length === 0) {
    casesList.innerHTML = '<div class="ap-empty">No active referrals are currently assigned to your agency.</div>';
    return;
  }
  casesList.innerHTML = cases.map((item) => {
    const statusOptions = {
      sent: ['acknowledged'],
      acknowledged: ['under_review', 'information_requested', 'action_taken', 'closed'],
      under_review: ['information_requested', 'action_taken', 'closed'],
      information_requested: ['under_review', 'action_taken', 'closed'],
      action_taken: ['under_review', 'closed'],
      closed: []
    }[item.referralStatus] || [];
    const updates = (item.agencyUpdates || []).map((update) => `
      <li>
        <strong>${escapeHtml(update.status || 'Update')}</strong> · ${escapeHtml(new Date(update.createdAt).toLocaleString())}
        <div>${escapeHtml(update.note)}</div>
        ${update.publicMessage ? `<div>Reporter message: ${escapeHtml(update.publicMessage)} (${escapeHtml(update.publicMessageStatus)})</div>` : ''}
      </li>
    `).join('') || '<li>No updates have been recorded.</li>';

    // Released case file: what this agency is authorised to investigate.
    const caseFile = item.caseFile || {};
    const evidenceFiles = caseFile.evidence || [];
    const caseFileHtml = (caseFile.narrative || evidenceFiles.length || caseFile.categoryDetails) ? `
      <section class="ap-casefile">
        <h4>Case file released to your agency</h4>
        <p class="ap-helper">Released by ${escapeHtml(caseFile.releasedByName || 'Kenya Watch')}${caseFile.releasedAt ? ' on ' + escapeHtml(new Date(caseFile.releasedAt).toLocaleString()) : ''}. Every file you open is recorded against your account.</p>
        ${caseFile.narrative ? `<div class="ap-casefile-block"><b>Complaint narrative</b><p>${escapeHtml(caseFile.narrative)}</p></div>` : ''}
        ${caseFile.categoryDetails ? `<div class="ap-casefile-block"><b>Structured category details</b><pre>${escapeHtml(JSON.stringify(caseFile.categoryDetails, null, 2))}</pre></div>` : ''}
        ${evidenceFiles.length ? `
          <div class="ap-casefile-block">
            <b>Evidence files (${evidenceFiles.length})</b>
            <ul class="ap-evidence-list">
              ${evidenceFiles.map((file) => `
                <li>
                  <span>${escapeHtml(file.filename)} <small class="ap-faded">${escapeHtml(file.type || 'file')}</small></span>
                  <a class="ap-download" href="${API_BASE}/agency-portal/cases/${encodeURIComponent(item.id)}/evidence/${encodeURIComponent(file.id)}" download>Download</a>
                </li>`).join('')}
            </ul>
          </div>` : '<p class="ap-helper">No evidence files were released with this referral.</p>'}
        ${caseFile.reporterContact ? '<p class="ap-helper">Kenya Watch has been asked to contact the reporter on your behalf. Do not attempt to identify or approach the reporter directly.</p>' : '<p class="ap-helper">The reporter\'s identity is not available to Kenya Watch for this case. If you need more information, submit a request below.</p>'}
      </section>` : '';

    // Information requests back to Kenya Watch.
    const infoRequests = (item.informationRequests || []).map((req) => `
      <li>
        <div>${escapeHtml(req.question)}</div>
        <small>Asked ${escapeHtml(new Date(req.requestedAt).toLocaleString())} · ${escapeHtml(req.status)}</small>
        ${req.answer ? `<div class="ap-info-answer"><b>Kenya Watch reply:</b> ${escapeHtml(req.answer)}</div>` : ''}
      </li>
    `).join('');

    const canRequestInfo = item.referralStatus !== 'closed';

    return `
      <article class="ap-case-card" data-id="${escapeHtml(item.id)}">
        <div class="ap-case-title">
          <h3>${escapeHtml(item.reportedCategory)} · ${escapeHtml(item.county)}</h3>
          <span class="ap-status">${escapeHtml(item.referralStatus.replaceAll('_', ' '))}</span>
        </div>
        <div class="ap-meta"><b>Kenya Watch reference:</b> ${escapeHtml(item.trackingReference)}</div>
        <div class="ap-meta"><b>Location:</b> ${escapeHtml(item.subCounty)}, ${escapeHtml(item.county)}</div>
        <div class="ap-meta"><b>Received:</b> ${escapeHtml(item.referredAt ? new Date(item.referredAt).toLocaleString() : 'Date not recorded')}</div>
        <div class="ap-meta"><b>Agency file reference:</b> ${escapeHtml(item.referenceNumber || 'Not recorded')}</div>
        <section class="ap-brief">
          <h4>Referral brief</h4>
          ${renderBrief(item.referralSummary)}
        </section>
        ${caseFileHtml}
        <details class="ap-inforeq" ${infoRequests ? 'open' : ''}>
          <summary>Information requests to Kenya Watch${infoRequests ? ` (${infoRequests.length})` : ''}</summary>
          ${infoRequests ? `<ul class="ap-inforeq-list">${infoRequests}</ul>` : '<p class="ap-helper">No requests submitted yet.</p>'}
          ${canRequestInfo ? `
            <form class="ap-inforeq-form" data-id="${escapeHtml(item.id)}">
              <label for="inforeq-${escapeHtml(item.id)}">Need more detail to investigate? Ask Kenya Watch.</label>
              <textarea id="inforeq-${escapeHtml(item.id)}" name="question" maxlength="2000" rows="3" required></textarea>
              <button type="submit">Send request to Kenya Watch</button>
              <div class="ap-update-error ap-error" role="alert" hidden></div>
            </form>` : ''}
        </details>
        <section class="ap-updates">
          <h4>Case updates</h4>
          <ul>${updates}</ul>
        </section>
        ${statusOptions.length > 0 ? `
          <form class="ap-update-form" data-id="${escapeHtml(item.id)}">
            <h4>Record a case update</h4>
            <p class="ap-helper">The internal note is visible to your agency and Kenya Watch reviewers. Optional reporter-facing messages are held for Admin approval.</p>
            <div class="ap-field">
              <label for="status-${escapeHtml(item.id)}">New referral status</label>
              <select id="status-${escapeHtml(item.id)}" name="status" required>
                ${statusOptions.map((status) => `<option value="${status}">${status.replaceAll('_', ' ')}</option>`).join('')}
              </select>
            </div>
            <div class="ap-field">
              <label for="reference-${escapeHtml(item.id)}">Agency file reference (optional)</label>
              <input id="reference-${escapeHtml(item.id)}" name="referenceNumber" maxlength="120" value="${escapeHtml(item.referenceNumber || '')}" />
            </div>
            <div class="ap-field">
              <label for="note-${escapeHtml(item.id)}">Internal update</label>
              <textarea id="note-${escapeHtml(item.id)}" name="note" maxlength="2000" required></textarea>
            </div>
            <div class="ap-field">
              <label for="message-${escapeHtml(item.id)}">Optional message for the reporter (max 500 characters)</label>
              <textarea id="message-${escapeHtml(item.id)}" name="publicMessage" maxlength="500"></textarea>
            </div>
            <fieldset class="ap-resolution" data-resolution-for="${escapeHtml(item.id)}">
              <legend>Required only when closing the case</legend>
              <p class="ap-helper">
                Closing ends the reporter's case on their tracking page, so record what the institution
                actually decided. The reporter reads this — avoid internal jargon.
              </p>
              <div class="ap-field">
                <label for="outcome-${escapeHtml(item.id)}">Outcome</label>
                <select id="outcome-${escapeHtml(item.id)}" name="outcome">
                  <option value="">Select the decision…</option>
                  <option value="investigated_charged">Investigated and charges filed</option>
                  <option value="investigated_no_action">Investigated, no charges filed</option>
                  <option value="referred_elsewhere">Referred to another authority</option>
                  <option value="administrative_action">Administrative action taken</option>
                  <option value="not_pursued">Not pursued by this institution</option>
                </select>
              </div>
              <div class="ap-field">
                <label for="outcomeref-${escapeHtml(item.id)}">Institution case / file reference</label>
                <input id="outcomeref-${escapeHtml(item.id)}" name="outcomeReference" maxlength="120" placeholder="e.g. EACC/INV/2026/117" />
              </div>
              <div class="ap-field">
                <label for="legals-${escapeHtml(item.id)}">Legal basis (required if charges filed)</label>
                <input id="legals-${escapeHtml(item.id)}" name="legalBasis" maxlength="200" placeholder="e.g. ACECA 2003 sections 39 and 42" />
              </div>
              <div class="ap-field">
                <label for="court-${escapeHtml(item.id)}">Court involved (optional)</label>
                <input id="court-${escapeHtml(item.id)}" name="courtsInvolved" maxlength="200" placeholder="e.g. Milimani Anti-Corruption Court" />
              </div>
              <div class="ap-field">
                <label for="outcomesum-${escapeHtml(item.id)}">What happened, in plain language (min 30 characters)</label>
                <textarea id="outcomesum-${escapeHtml(item.id)}" name="outcomeSummary" maxlength="2000" rows="3"></textarea>
              </div>
            </fieldset>
            <button type="submit">Submit update</button>
            <div class="ap-update-error ap-error" role="alert" hidden></div>
          </form>
        ` : '<p class="ap-helper">This referral is closed. Contact the Kenya Watch liaison if it needs to be reopened.</p>'}
      </article>
    `;
  }).join('');

  casesList.querySelectorAll('.ap-inforeq-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const error = form.querySelector('.ap-update-error');
      button.disabled = true;
      error.hidden = true;
      try {
        await readResponse(await fetch(`${API_BASE}/agency-portal/cases/${encodeURIComponent(form.dataset.id)}/information-requests`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: new FormData(form).get('question') })
        }));
        await loadCases();
      } catch (requestError) {
        error.textContent = requestError.message;
        error.hidden = false;
      } finally {
        button.disabled = false;
      }
    });
  });

  casesList.querySelectorAll('.ap-update-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const error = form.querySelector('.ap-update-error');
      button.disabled = true;
      error.hidden = true;
      const formData = new FormData(form);
      try {
        await readResponse(await fetch(`${API_BASE}/agency-portal/cases/${encodeURIComponent(form.dataset.id)}/updates`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: formData.get('status'),
            referenceNumber: formData.get('referenceNumber'),
            note: formData.get('note'),
            publicMessage: formData.get('publicMessage'),
            outcome: formData.get('outcome') || undefined,
            outcomeReference: formData.get('outcomeReference') || undefined,
            outcomeSummary: formData.get('outcomeSummary') || undefined,
            legalBasis: formData.get('legalBasis') || undefined,
            courtsInvolved: formData.get('courtsInvolved') || undefined
          })
        }));
        await loadCases();
      } catch (requestError) {
        error.textContent = requestError.message;
        error.hidden = false;
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function loadCases() {
  if (loadingCases) return;
  loadingCases = true;
  casesError.hidden = true;
  refreshCasesBtn.disabled = true;
  try {
    renderCases(await readResponse(await fetch(`${API_BASE}/agency-portal/cases`, { credentials: 'same-origin' })));
    lastRefreshed.textContent = `Last refreshed ${new Date().toLocaleTimeString()}. Cases refresh automatically every 30 seconds while this page is open.`;
  } catch (error) {
    casesError.textContent = error.message;
    casesError.hidden = false;
    if (error.status === 401 || error.status === 403) {
      if (error.status === 403) {
        loginError.textContent = 'The signed-in account is not an authorised agency officer.';
        loginError.hidden = false;
      }
      casesView.hidden = true;
      loginView.hidden = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  } finally {
    loadingCases = false;
    refreshCasesBtn.disabled = false;
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const credentials = new FormData(loginForm);
    await readResponse(await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: credentials.get('email'), password: credentials.get('password') })
    }));
    const profile = await readResponse(await fetch(`${API_BASE}/agency-portal/me`, { credentials: 'same-origin' }));
    loginForm.reset();
    showCases(profile);
  } catch (error) {
    let detail = `${error.message} Agency accounts must be individually provisioned by Kenya Watch.`;
    try {
      await readResponse(await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'same-origin' }));
    } catch (logoutError) {
      detail = `${detail} Sign-out could not be confirmed: ${logoutError.message}`;
    }
    loginError.textContent = detail;
    loginError.hidden = false;
  } finally {
    button.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await readResponse(await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'same-origin' }));
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;
    casesView.hidden = true;
    loginView.hidden = false;
  } catch (error) {
    casesError.textContent = error.message;
    casesError.hidden = false;
  }
});

refreshCasesBtn.addEventListener('click', loadCases);

fetch(`${API_BASE}/agency-portal/me`, { credentials: 'same-origin' })
  .then(readResponse)
  .then(showCases)
  .catch((error) => {
    if (error.status !== 401) {
      loginError.textContent = error.message || 'Could not verify your agency portal session.';
      loginError.hidden = false;
    }
  });
