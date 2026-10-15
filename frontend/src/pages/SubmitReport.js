import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import KENYA_COUNTIES from '../data/kenyaCounties';
import LiveRecorder from '../components/LiveRecorder';
import RobotCheck from '../components/RobotCheck';

const AGE_GROUPS = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'];
const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];
const OCCUPATIONS = [
  'Student', 'Business / Trader', 'Farmer', 'Civil Servant', 'Teacher / Lecturer',
  'Healthcare Worker', 'Driver / Transport (Matatu, Taxi, Boda Boda)', 'Office / Corporate Employee',
  'Unemployed', 'Retired', 'Other / Prefer not to say'
];

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
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [recordingToken, setRecordingToken] = useState('');
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingName, setRecordingName] = useState('');

  const handleCaptchaToken = (token, answer) => {
    setCaptchaToken(token || '');
    setCaptchaAnswer(answer || '');
  };

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
      payload.append('captchaToken', captchaToken);
      payload.append('captchaAnswer', captchaAnswer);
      if (recordingToken) payload.append('recordingToken', recordingToken);
      files.forEach((f) => payload.append('evidence', f));

      const res = await api.post('/reports', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      setForm(emptyForm);
      setCategoryDetails({});
      setFiles([]);
      setRecordingToken('');
      setRecordingName('');
      setCaptchaAnswer('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report');
      setCaptchaToken('');
      setCaptchaAnswer('');
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
          <div className="kw-helper" style={{ color: '#cbd5e1' }}>Access Key</div>
          <div className="kw-confirm-value">{result.accessKey}</div>
          <div className="kw-confirm-warning">{result.accessKeyWarning}</div>
          {user && (
            <div className="kw-helper" style={{ color: '#cbd5e1' }}>
              This report is also saved to your "My Reports" page while you're signed in - but keep this Access Key in case you lose the session.
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
          <LiveRecorder
            onRecordingReady={(token, filename) => {
              setRecordingToken(token || '');
              setRecordingName(filename || '');
            }}
            onBusyChange={setRecordingBusy}
          />
          {recordingName && <p className="kw-helper">Attached live recording: {recordingName}</p>}
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
            <select name="ageGroup" aria-label="Age group" value={form.ageGroup} onChange={handleChange}>
              <option value="">Age group (optional)...</option>
              {AGE_GROUPS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select name="gender" aria-label="Gender" value={form.gender} onChange={handleChange}>
              <option value="">Gender (optional)...</option>
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select name="occupation" aria-label="Occupation" value={form.occupation} onChange={handleChange}>
              <option value="">Occupation (optional)...</option>
              {OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="kw-helper">Shared voluntarily to help reviewers understand reporting patterns - never required, and never linked back to your identity.</div>
        </div>

        <div className="kw-form-section">
          <label>Security check<span className="kw-required">*</span></label>
          <RobotCheck onToken={handleCaptchaToken} />
        </div>

        <button type="submit" disabled={loading || recordingBusy || !captchaToken} title={!captchaToken ? 'Complete the security check first' : undefined}>
          {loading ? t('btn_submitting') : recordingBusy ? 'Finish or cancel the recording to continue' : t('btn_submitReport')}
        </button>
        {!captchaToken && !loading && !recordingBusy && (
          <div className="kw-helper" role="status">The Submit button unlocks once you pass the security check above.</div>
        )}
        {error && <div className="error" role="alert">{error}</div>}
      </form>
    </div>
  );
}

export default SubmitReport;
