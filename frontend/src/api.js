const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000/api';

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function apiGet(path) {
  return fetch(`${API_BASE}${path}`, { credentials: 'include' }).then(handleResponse);
}

export function apiPost(path, body) {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(handleResponse);
}

export function apiPatch(path, body) {
  return fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(handleResponse);
}

// For multipart/form-data submissions (e.g. report + evidence files) - never set
// Content-Type manually here, the browser needs to add its own multipart boundary.
export function apiPostForm(path, formData) {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  }).then(handleResponse);
}

export { API_BASE };
