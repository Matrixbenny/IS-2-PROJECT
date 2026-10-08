import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import KENYA_COUNTIES from '../data/kenyaCounties';

const emptyForm = {
  title: '',
  reportedCategory: '',
  description: '',
  county: '',
  subCounty: '',
  incidentDateTime: '',
  ageGroup: '',
  gender: '',
  occupation: ''
};

function SubmitReport() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [categories, setCategories] = useState([]);
  const [fieldsByCategory, setFieldsByCategory] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [categoryDetails, setCategoryDetails] = useState({});
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/reports/categories')
      .then((res) => {
        setCategories(res.data.categories);
        setFieldsByCategory(res.data.fields);
      })
      .catch(() => setError('Could not load report categories. Is the backend running?'));
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const payload = new FormData();
      payload.append('title', form.title);
      payload.append('reportedCategory', form.reportedCategory);
      payload.append('description', form.description);
      payload.append('county', form.county);
      payload.append('subCounty', form.subCounty);
      if (form.incidentDateTime) payload.append('incidentDateTime', form.incidentDateTime);
      if (form.ageGroup) payload.append('ageGroup', form.ageGroup);
      if (form.gender) payload.append('gender', form.gender);
      if (form.occupation) payload.append('occupation', form.occupation);
      payload.append('categorySpecificDetails', JSON.stringify(categoryDetails));
      files.forEach((f) => payload.append('evidence', f));

      const res = await api.post('/reports', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      setForm(emptyForm);
      setCategoryDetails({});
      setFiles([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report');
    }
    setLoading(false);
  };

  const subCounties = form.county ? (KENYA_COUNTIES[form.county] || []) : [];
  const activeFields = fieldsByCategory[form.reportedCategory] || [];

  if (result) {
    return (
      <div>
        <h2>Submit a Corruption Report</h2>
        <div className="kw-confirm-panel">
          <h3>Report submitted</h3>
          <p>Save these details now - they are the only way to check your case status later.</p>
          <div className="kw-helper" style={{ color: '#cbd5e1' }}>Tracking Reference</div>
          <div className="kw-confirm-value">{result.trackingReference}</div>
          {result.accessKey && (
            <>
              <div className="kw-helper" style={{ color: '#cbd5e1' }}>Access Key</div>
              <div className="kw-confirm-value">{result.accessKey}</div>
              <div className="kw-confirm-warning">{result.accessKeyWarning}</div>
            </>
          )}
          {!result.accessKey && (
            <div className="kw-helper" style={{ color: '#cbd5e1' }}>
              You're signed in, so this report is already saved to your "My Reports" page - no access key needed.
            </div>
          )}
        </div>
        <button type="button" className="kw-btn kw-btn-secondary" onClick={() => setResult(null)}>
          Submit another report
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>{t('submit_title')}</h2>
      <div className="kw-helper" style={{ marginBottom: 14 }}>
        {user ? `Reporting as ${user.name} - ${t('submit_loggedIn')}` : t('submit_anon')}
      </div>
      <form className="report-form kw-pro-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="title">{t('label_title')}<span className="kw-required">*</span></label>
          <input id="title" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Bribery at City Hall" required />
        </div>

        <div className="kw-form-section">
          <label htmlFor="reportedCategory">{t('label_category')}<span className="kw-required">*</span></label>
          <select id="reportedCategory" name="reportedCategory" value={form.reportedCategory} onChange={handleChange} required>
            <option value="">Select a category...</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {activeFields.length > 0 && (
          <div className="kw-category-fields">
            <div className="kw-helper">Optional details, if known:</div>
            {activeFields.map((f) => (
              <div className="kw-form-section" key={f.name}>
                <label htmlFor={f.name}>{f.label}</label>
                <input
                  id={f.name}
                  value={categoryDetails[f.name] || ''}
                  onChange={(e) => handleCategoryDetailChange(f.name, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="kw-form-section">
          <label htmlFor="description">{t('label_description')}<span className="kw-required">*</span></label>
          <textarea id="description" name="description" value={form.description} onChange={handleChange} placeholder="Describe the incident in detail..." required />
          <div className="kw-helper">At least 20 characters. Please provide as much detail as possible.</div>
        </div>

        <div className="kw-demographic-row">
          <div className="kw-form-section">
            <label htmlFor="county">{t('label_county')}<span className="kw-required">*</span></label>
            <select id="county" name="county" value={form.county} onChange={handleChange} required>
              <option value="">Select county...</option>
              {Object.keys(KENYA_COUNTIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="kw-form-section">
            <label htmlFor="subCounty">{t('label_subCounty')}<span className="kw-required">*</span></label>
            <select id="subCounty" name="subCounty" value={form.subCounty} onChange={handleChange} required disabled={!form.county}>
              <option value="">Select sub-county...</option>
              {subCounties.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="kw-form-section">
          <label htmlFor="incidentDateTime">{t('label_incidentDate')}</label>
          <input id="incidentDateTime" name="incidentDateTime" type="datetime-local" value={form.incidentDateTime} onChange={handleChange} />
        </div>

        <div className="kw-form-section">
          <label htmlFor="evidence">{t('label_evidence')}</label>
          <input
            id="evidence"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/mp4,application/pdf,.docx"
            onChange={(e) => setFiles(Array.from(e.target.files))}
          />
          <div className="kw-helper">Images, video, audio or documents. Any embedded location/device metadata in photos is stripped automatically before storage.</div>
        </div>

        <div className="kw-form-section">
          <label>{t('label_demographic')}</label>
          <div className="kw-demographic-row">
            <input name="ageGroup" value={form.ageGroup} onChange={handleChange} placeholder="Age Group" />
            <input name="gender" value={form.gender} onChange={handleChange} placeholder="Gender" />
            <input name="occupation" value={form.occupation} onChange={handleChange} placeholder="Occupation" />
          </div>
        </div>

        <button type="submit" disabled={loading}>{loading ? t('btn_submitting') : t('btn_submitReport')}</button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}

export default SubmitReport;
