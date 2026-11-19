import React, { useCallback, useEffect, useState } from 'react';
import api from '../api';

// Reviewers meet Kenyan words the system does not know. They suggest them here; an
// Admin decides. Approved terms are used by triage, related-case matching and the
// model's input straight away. Nobody's private posts are scraped to learn them.
export function SuggestTerm() {
  const [form, setForm] = useState({ term: '', canonical: '', meaning: '', language: 'Sheng' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const res = await api.post('/lingo/suggestions', form);
      setMessage(res.data.message);
      setForm({ term: '', canonical: '', meaning: '', language: 'Sheng' });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send the suggestion.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="kw-page-card kw-lingo-suggest">
      <summary><strong>Teach Kenya Watch a word</strong> — suggest Sheng, Kiswahili or dialect vocabulary</summary>
      <p className="kw-helper">
        Seen a term in a report that the system does not understand? Suggest it. Write only the word or phrase and what it means:
        never a name, number, link or anything that identifies a person. An Admin approves it before it is used.
      </p>
      <form className="report-form" onSubmit={submit}>
        <div className="kw-form-section">
          <label htmlFor="lingo-term">The word or phrase</label>
          <input id="lingo-term" value={form.term} onChange={update('term')} maxLength={40} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="lingo-canonical">What it should be read as</label>
          <input id="lingo-canonical" value={form.canonical} onChange={update('canonical')} maxLength={80} required
            placeholder="e.g. rushwa bribe" />
          <div className="kw-helper">Plain English or Kiswahili words the system already understands, such as "rushwa bribe" or "embezzle public funds".</div>
        </div>
        <div className="kw-form-section">
          <label htmlFor="lingo-language">Language</label>
          <select id="lingo-language" value={form.language} onChange={update('language')}>
            <option>Sheng</option><option>Kiswahili</option><option>Dialect</option><option>Other</option>
          </select>
        </div>
        <div className="kw-form-section">
          <label htmlFor="lingo-meaning">What it means (10-300 characters)</label>
          <textarea id="lingo-meaning" value={form.meaning} onChange={update('meaning')} maxLength={300} minLength={10} required rows={2} />
        </div>
        <button type="submit" className="kw-btn kw-btn-secondary" disabled={busy}>{busy ? 'Sending…' : 'Suggest this term'}</button>
        {message && <div className="success" role="status">{message}</div>}
        {error && <div className="error" role="alert">{error}</div>}
      </form>
    </details>
  );
}

export function ReviewTerms() {
  const [items, setItems] = useState([]);
  const [glossary, setGlossary] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/lingo/suggestions')
      .then((res) => {
        setItems(res.data.suggestions || []);
        setGlossary(res.data.glossary || null);
      })
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, decision) => {
    setBusyId(id);
    setError('');
    try {
      await api.patch(`/lingo/suggestions/${id}`, { decision });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not record the decision.');
    } finally {
      setBusyId('');
    }
  };

  if (items.length === 0 && !glossary) return null;
  return (
    <section className="kw-page-card" aria-labelledby="lingo-review-heading">
      <h3 id="lingo-review-heading">Kenyan lingo suggestions</h3>
      {glossary && (
        <p className="kw-helper">
          The glossary knows {glossary.builtIn} built-in terms and {glossary.approved} approved from reviewers.
        </p>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      {items.length === 0 ? (
        <p className="kw-faded">No suggestions waiting for a decision.</p>
      ) : (
        <ul className="kw-admin-attention-list">
          {items.map((item) => (
            <li className="kw-admin-attention-item" key={item._id}>
              <div className="kw-admin-attention-copy">
                <strong>{item.term}</strong> <span className="kw-faded">({item.language})</span>
                <span>read as: <b>{item.canonical}</b></span>
                <span className="kw-admin-attention-meta">{item.meaning}</span>
              </div>
              <div>
                <button type="button" className="kw-btn kw-btn-secondary" disabled={busyId === item._id} onClick={() => decide(item._id, 'approved')}>Approve</button>
                <button type="button" className="kw-btn kw-btn-secondary" disabled={busyId === item._id} onClick={() => decide(item._id, 'rejected')}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
