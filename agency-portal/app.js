const API_BASE = 'http://localhost:5000/api/agency-portal';

const loginView = document.getElementById('login-view');
const casesView = document.getElementById('cases-view');
const agencySelect = document.getElementById('agency-select');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const agencyNameHeading = document.getElementById('agency-name-heading');
const casesList = document.getElementById('cases-list');
const logoutBtn = document.getElementById('logout-btn');

let session = null; // { slug, code, agencyName }

function loadAgencies() {
  fetch(`${API_BASE}/agencies`)
    .then((r) => r.json())
    .then((data) => {
      agencySelect.innerHTML = data.agencies
        .map((a) => `<option value="${a.slug}">${a.name}</option>`)
        .join('');
    })
    .catch(() => {
      loginError.textContent = 'Could not reach the backend. Is it running on port 5000?';
      loginError.hidden = false;
    });
}

function renderCases(cases) {
  if (cases.length === 0) {
    casesList.innerHTML = '<div class="ap-empty">No cases referred to your agency yet.</div>';
    return;
  }
  casesList.innerHTML = cases.map((c) => `
    <div class="ap-case-card" data-id="${c.id}">
      <h3>${c.title}</h3>
      <div class="ap-meta"><span class="ap-chip">${c.trackingReference}</span></div>
      <div class="ap-meta"><b>Category:</b> ${c.reportedCategory}</div>
      <div class="ap-meta"><b>Location:</b> ${c.subCounty}, ${c.county}</div>
      <div class="ap-meta"><b>Description:</b> ${c.description}</div>
      <div class="ap-meta"><b>Our reference:</b> ${c.referenceNumber || '(none given)'}</div>
      <div class="ap-meta"><b>Reviewer notes:</b> ${c.notes || '(none)'}</div>
      <div class="ap-updates">
        <b>Your agency's updates</b>
        <ul>
          ${(c.agencyUpdates || []).map((u) => `<li>${new Date(u.createdAt).toLocaleString()} - ${u.note}</li>`).join('') || '<li class="ap-empty" style="padding:4px 0;">No updates yet</li>'}
        </ul>
        <form class="ap-update-form" data-id="${c.id}">
          <input type="text" placeholder="e.g. Investigation opened, file no. ..." required />
          <button type="submit">Add Update</button>
        </form>
      </div>
    </div>
  `).join('');

  casesList.querySelectorAll('.ap-update-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      const id = form.dataset.id;
      await fetch(`${API_BASE}/cases/${id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: session.slug, code: session.code, note: input.value })
      });
      input.value = '';
      loadCases();
    });
  });
}

function loadCases() {
  const params = new URLSearchParams({ slug: session.slug, code: session.code });
  fetch(`${API_BASE}/cases?${params}`)
    .then((r) => r.json())
    .then(renderCases);
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const slug = agencySelect.value;
  const code = document.getElementById('access-code').value;
  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    session = { slug, code, agencyName: data.agencyName };
    agencyNameHeading.textContent = `Referred Cases - ${data.agencyName}`;
    loginView.hidden = true;
    casesView.hidden = false;
    loadCases();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener('click', () => {
  session = null;
  casesView.hidden = true;
  loginView.hidden = false;
});

loadAgencies();
