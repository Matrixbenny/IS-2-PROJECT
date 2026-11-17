import React, { useState } from 'react';

// Shared new-password rule: must combine uppercase, lowercase, number and special
// characters over at least 8 characters. Kept in sync with the backend policy
// (backend/utils/passwordPolicy.js) so the browser blocks weak passwords early.
export const STRONG_PASSWORD_PATTERN = '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}';

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  pattern,
  title,
  required = true,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="kw-form-section">
      <label htmlFor={id}>{label}</label>
      <div className="kw-password-input">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={minLength}
          pattern={pattern}
          title={title}
          required={required}
        />
        <button
          type="button"
          className="kw-password-toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

export default PasswordField;
