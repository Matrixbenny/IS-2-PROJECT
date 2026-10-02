import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPostForm } from '../api';
import { useAuth } from '../context/AuthContext';
import KENYA_COUNTIES from '../data/kenyaCounties';

const AGE_GROUPS = ['Under 18', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

function SubmitReport() {
  const { user } = useAuth();
  const [meta, setMeta] = useState({ categories: [], fields: {} });
  const [form, setForm] = useState({
    title: '', reportedCategory: '', description: '', county: '', subCounty: '',
    incidentDateTime: '', ageGroup: '', gender: '', occupation: ''
  });
  const [categoryDetails, setCategoryDetails] = useState({});
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    apiGet('/reports/categories').then(setMeta).catch(() => setError('Could not load report categories - is the backend running?'));
  }, []);

  const subCounties = useMemo(() => KENYA_COUNTIES[form.county] || [], [form.county]);
  const activeFields = meta.fields[form.reportedCategory] || [];

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'county') {
      setForm({ ...form, county: value, subCounty: '' });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleCategoryDetailChange = (fieldName, value) => {
    setCategoryDetails({ ...categoryDetails, [fieldName]: value });
  };

  const handleCategoryChange = (e) => {
    setForm({ ...form, reportedCategory: e.target.value });
    setCategoryDetails({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('title', form.title);
      formData.append('reportedCategory', form.reportedCategory);
      formData.append('description', form.description);
      formData.append('county', form.county);
      formData.append('subCounty', form.subCounty);
      if (form.incidentDateTime) formData.append('incidentDateTime', form.incidentDateTime);
      if (form.ageGroup) formData.append('ageGroup', form.ageGroup);
      if (form.gender) formData.append('gender', form.gender);
      if (form.occupation) formData.append('occupation', form.occupation);
      formData.append('categorySpecificDetails', JSON.stringify(categoryDetails));
      files.forEach((file) => formData.append('evidence', file));

      const res = await apiPostForm('/reports', formData);
      setResult(res);
      setForm({ title: '', reportedCategory: '', description: '', county: '', subCounty: '', incidentDateTime: '', ageGroup: '', gender: '', occupation: '' });
      setCategoryDetails({});
      setFiles([]);
    } catch (err) {
      setError(err.message || 'Failed to submit report');
    }
    setLoading(false);
  };

  if (result) {
    return (
      <div className="kw-confirmation kw-pro-form">
        <h2>Report Submitted</h2>
        <p>Your report has been received. Please save the details below - they are the only way to check back on this case.</p>
        <div className="kw-tracking-box">
          <div><b>Tracking Reference:</b> <span className="kw-mono">{result.trackingReference}</span></div>
          {result.accessKey && (
            <>
              <div><b>Access Key:</b> <span className="kw-mono">{result.accessKey}</span></div>
              <div className="kw-helper">{result.accessKeyWarning}</div>
            </>
          )}
          {!result.accessKey && (
            <div className="kw-helper">This report is saved under your account - find it any time in "My Reports".</div>
          )}
        </div>
        <button type="button" onClick={() => setResult(null)}>Submit Another Report</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Submit a Corruption Report</h2>
      <div className="kw-helper">
        {user
          ? `You're logged in as ${user.name} - this report will be saved to your account under "My Reports".`
          : 'You are not logged in - this report is fully anonymous. You will get a Tracking Reference and a secret Access Key to check back later.'}
      </div>
      <form className="report-form kw-pro-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="title">Title<span className="kw-required">*</span></label>
          <input id="title" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Bribery at City Hall" required />
        </div>

        <div className="kw-form-section">
          <label htmlFor="reportedCategory">Category<span className="kw-required">*</span></label>
          <select id="reportedCategory" name="reportedCategory" value={form.reportedCategory} onChange={handleCategoryChange} required>
            <option value="">Select the closest match...</option>
            {meta.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {activeFields.length > 0 && (
          <div className="kw-category-fields">
            <div className="kw-helper">Optional details for {form.reportedCategory} (fill in anything you know - none of this is required):</div>
            {activeFields.map((f) => (
              <div className="kw-form-section" key={f.name}>
                <label htmlFor={f.name}>{f.label}</label>
                <input id={f.name} value={categoryDetails[f.name] || ''} onChange={(e) => handleCategoryDetailChange(f.name, e.target.value)} />
              </div>
            ))}
          </div>
        )}

        <div className="kw-form-section">
          <label htmlFor="description">Description<span className="kw-required">*</span></label>
          <textarea id="description" name="description" value={form.description} onChange={handleChange} placeholder="Describe the incident in detail..." required />
          <div className="kw-helper">Please provide as much detail as possible (at least 20 characters).</div>
        </div>

        <div className="kw-demographic-row">
          <div className="kw-form-section">
            <label htmlFor="county">County<span className="kw-required">*</span></label>
            <select id="county" name="county" value={form.county} onChange={handleChange} required>
              <option value="">Select county...</option>
              {Object.keys(KENYA_COUNTIES).sort().map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="kw-form-section">
            <label htmlFor="subCounty">Sub-county<span className="kw-required">*</span></label>
            <select id="subCounty" name="subCounty" value={form.subCounty} onChange={handleChange} required disabled={!form.county}>
              <option value="">Select sub-county...</option>
              {subCounties.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
            </select>
          </div>
        </div>

        <div className="kw-form-section">
          <label htmlFor="incidentDateTime">When did it happen? (optional)</label>
          <input id="incidentDateTime" name="incidentDateTime" type="datetime-local" value={form.incidentDateTime} onChange={handleChange} />
        </div>

        <div className="kw-form-section">
          <label htmlFor="evidence">Evidence (optional)</label>
          <input id="evidence" name="evidence" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/mp4,application/pdf,.docx"
            onChange={(e) => setFiles(Array.from(e.target.files))} />
          <div className="kw-helper">Images, video, audio or documents. Any identifying metadata (e.g. GPS location in photos) is automatically stripped before storage.</div>
        </div>

        <div className="kw-form-section">
          <label>Demographic (optional)</label>
          <div className="kw-demographic-row">
            <select name="ageGroup" value={form.ageGroup} onChange={handleChange}>
              <option value="">Age group</option>
              {AGE_GROUPS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input name="gender" value={form.gender} onChange={handleChange} placeholder="Gender" />
            <input name="occupation" value={form.occupation} onChange={handleChange} placeholder="Occupation" />
          </div>
        </div>

        <button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit Report'}</button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}

export default SubmitReport;
