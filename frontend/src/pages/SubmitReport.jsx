import ReporterProtection from '../components/ReporterProtection';
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
  const [additionalCategories, setAdditionalCategories] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaWidgetKey, setCaptchaWidgetKey] = useState(0);
  const [recordingToken, setRecordingToken] = useState('');
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingName, setRecordingName] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [receiptOtp, setReceiptOtp] = useState('');
  const [receiptOtpRequested, setReceiptOtpRequested] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptEmailSent, setReceiptEmailSent] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState('');
  const [receiptError, setReceiptError] = useState('');

  const handleCaptchaToken = (token, answer) => {
    setCaptchaToken(token || '');
    setCaptchaAnswer(answer || '');
  };

  const requestReceiptOtp = async (event) => {
    event?.preventDefault();
    setReceiptBusy(true);
    setReceiptError('');
    setReceiptMessage('');
    try {
      const response = await api.post('/reports/email-receipt/request-otp', {
        trackingReference: result.trackingReference,
        accessKey: result.accessKey,
        email: receiptEmail
      });
      setReceiptOtpRequested(true);
      setReceiptMessage(response.data.message);
    } catch (requestError) {
      setReceiptError(requestError.response?.data?.error || 'Could not send the verification code.');
    } finally {
      setReceiptBusy(false);
    }
  };

  const verifyReceiptOtp = async (event) => {
    event.preventDefault();
    setReceiptBusy(true);
    setReceiptError('');
    setReceiptMessage('');
    try {
      const response = await api.post('/reports/email-receipt/verify-otp', {
        trackingReference: result.trackingReference,
        accessKey: result.accessKey,
        otp: receiptOtp
      });
      setReceiptMessage(response.data.message);
      setReceiptOtpRequested(false);
      setReceiptOtp('');
      setReceiptEmailSent(true);
    } catch (requestError) {
      setReceiptError(requestError.response?.data?.error || 'Could not verify the email code.');
    } finally {
      setReceiptBusy(false);
    }
  };

  const pasteReceiptOtp = async () => {
    setReceiptError('');
    try {
      const clipboardText = await navigator.clipboard.readText();
      const code = clipboardText.match(/(?:^|\D)(\d{6})(?:\D|$)/)?.[1];
      if (!code) {
        setReceiptError('No six-digit code was found in the clipboard. Copy the code from your email and try again.');
        return;
      }
      setReceiptOtp(code);
    } catch {
      setReceiptError('Clipboard access is unavailable. Copy the code from your email and paste it into the box.');
    }
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
      if (additionalCategories.length > 0) payload.append('additionalCategories', JSON.stringify(additionalCategories));
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
      setCaptchaToken('');
      setCaptchaAnswer('');
      setCaptchaWidgetKey((key) => key + 1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report');
      setCaptchaToken('');
      setCaptchaAnswer('');
      setCaptchaWidgetKey((key) => key + 1);
    }
    setLoading(false);
  };

  const subCounties = form.county ? (KENYA_COUNTIES[form.county] || []) : [];
  const activeFields = fieldsByCategory[form.reportedCategory] || [];

  if (result) {
    const receiptText = [
      'Kenya Watch - Report Submission Receipt',
      '=======================================',
      `Tracking Reference: ${result.trackingReference}`,
      `Access Key: ${result.accessKey || '(not applicable - report saved to your account)'}`,
      '',
      result.accessKeyWarning || '',
      '',
      'Use the Tracking Reference + Access Key pair on the Track page',
      'to check your case status without signing in.',
      `Saved: ${new Date().toLocaleString()}`
    ].join('\n');
    const downloadReceipt = () => {
      const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kenya-watch-receipt-${result.trackingReference}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    const copyReceipt = async () => {
      try {
        await navigator.clipboard.writeText(receiptText);
        alert('Receipt copied to clipboard. Paste it somewhere safe.');
      } catch (_) {
        alert('Copy failed - please select and copy the details manually.');
      }
    };
    return (
      <div>
        <h2>Submit a Corruption Report</h2>
        <div className="kw-confirm-panel">
          <h3>Report submitted</h3>
          <p>Save these details now - they are the only way to check your case status later.</p>
          <div className="kw-helper" style={{ color: '#cbd5e1' }}>Tracking Reference</div>
          <div className="kw-confirm-value" aria-live="polite">{result.trackingReference}</div>
          <div className="kw-helper" style={{ color: '#cbd5e1' }}>Access Key</div>
          <div className="kw-confirm-value">{result.accessKey}</div>
          <div className="kw-confirm-warning">{result.accessKeyWarning}</div>
          {user && (
            <div className="kw-helper" style={{ color: '#cbd5e1' }}>
              This report is also saved to your "My Reports" page while you're signed in - but keep this Access Key in case you lose the session.
            </div>
          )}
          <div className="kw-receipt-actions">
            <button type="button" className="kw-btn" onClick={downloadReceipt}>Download receipt</button>
            <button type="button" className="kw-btn kw-btn-secondary" onClick={copyReceipt}>Copy details</button>
          </div>
          <section className="kw-pro-form" aria-label="Email report receipt">
            <h4>Email these tracking details (optional)</h4>
            <div className="kw-helper">
              We will first send a one-time verification code. After you confirm the email, we will send the Tracking Reference and Access Key. Anyone with both can view this report's private tracking information.
            </div>
            {receiptEmailSent ? (
              <div className="kw-helper" role="status">{receiptMessage}</div>
            ) : (
              <form onSubmit={receiptOtpRequested ? verifyReceiptOtp : requestReceiptOtp}>
                {!receiptOtpRequested ? (
                  <div className="kw-form-section">
                    <label htmlFor="receipt-email">Email address</label>
                    <input
                      id="receipt-email"
                      type="email"
                      autoComplete="email"
                      value={receiptEmail}
                      onChange={(event) => setReceiptEmail(event.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className="kw-form-section">
                    <label htmlFor="receipt-email-otp">Six-digit email verification code</label>
                    <input
                      id="receipt-email-otp"
                      className="kw-otp-input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={receiptOtp}
                      onChange={(event) => setReceiptOtp(event.target.value)}
                      required
                    />
                    <button type="button" className="kw-btn kw-btn-secondary" onClick={pasteReceiptOtp}>
                      Paste code from clipboard
                    </button>
                  </div>
                )}
                <button type="submit" className="kw-btn kw-btn-secondary" disabled={receiptBusy}>
                  {receiptBusy ? 'Please wait…' : receiptOtpRequested ? 'Verify code and email receipt' : 'Send verification code'}
                </button>
                {receiptOtpRequested && (
                  <div className="kw-receipt-actions">
                    <button type="button" className="kw-btn kw-btn-secondary" onClick={() => requestReceiptOtp()} disabled={receiptBusy}>
                      Resend code
                    </button>
                    <button
                      type="button"
                      className="kw-btn kw-btn-secondary"
                      onClick={() => {
                        setReceiptOtpRequested(false);
                        setReceiptOtp('');
                        setReceiptMessage('');
                        setReceiptError('');
                      }}
                      disabled={receiptBusy}
                    >
                      Change email
                    </button>
                  </div>
                )}
                {receiptMessage && <div className="kw-helper" role="status">{receiptMessage}</div>}
                {receiptError && <div className="error" role="alert">{receiptError}</div>}
              </form>
            )}
          </section>
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
      <ReporterProtection />
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

        {form.reportedCategory && (
          <fieldset className="kw-form-section kw-additional-categories">
            <legend>{t('label_additionalCategories')}</legend>
            <div className="kw-helper">{t('help_additionalCategories')}</div>
            <div className="kw-checkbox-grid">
              {categories
                .filter((c) => c !== form.reportedCategory && c !== 'Other')
                .map((c) => {
                  const checked = additionalCategories.includes(c);
                  const atLimit = additionalCategories.length >= 3 && !checked;
                  return (
                    <label key={c} className="kw-checkbox-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={atLimit}
                        onChange={() => setAdditionalCategories(
                          checked ? additionalCategories.filter((item) => item !== c) : [...additionalCategories, c]
                        )}
                      />
                      <span>{c}</span>
                    </label>
                  );
                })}
            </div>
          </fieldset>
        )}

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
          <div className="kw-helper">
            Location and device details are removed from JPEG and PNG photos automatically. Other files (WebP images, video, audio, PDF and Word documents) are stored exactly as uploaded and may contain GPS, device or author details; remove them first if they could identify you.
          </div>
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
          <RobotCheck key={captchaWidgetKey} onToken={handleCaptchaToken} />
        </div>

        <button type="submit" disabled={loading || recordingBusy || !captchaToken} title={!captchaToken ? 'Complete the security check first' : undefined}>
          {loading ? t('btn_submitting') : recordingBusy ? 'Finish or cancel the recording to continue' : t('btn_submitReport')}
        </button>
        {!captchaToken && !loading && !recordingBusy && (
          <div className="kw-helper" role="status">The Submit button unlocks once you pass the security check above.</div>
        )}
        {error && <div className="error" role="alert" aria-live="assertive">{error}</div>}
      </form>
    </div>
  );
}

export default SubmitReport;
