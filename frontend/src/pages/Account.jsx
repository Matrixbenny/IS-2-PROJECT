import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AnonymousAvatar from '../components/AnonymousAvatar';
import ChangePassword from '../components/ChangePassword';

// Account page for reviewers, agency staff and Admin. Citizens manage the same
// things from their dashboard.
function Account() {
  const { user } = useAuth();
  if (!user) {
    return (
      <div className="kw-page-card kw-dashboard-access">
        <h2>Sign in to manage your account</h2>
        <Link className="kw-btn kw-dashboard-link" to="/login">Sign in</Link>
      </div>
    );
  }
  return (
    <div className="kw-account">
      <section className="kw-page-card kw-account-profile">
        <AnonymousAvatar seed={user.id || user.email || user.name} size={84} />
        <div>
          <h2>{user.name}</h2>
          {user.email && <div className="kw-helper">{user.email}</div>}
          <div className="kw-helper">
            Every profile picture on Kenya Watch is a masked, faceless figure. Staff are never identified by a photo.
          </div>
        </div>
      </section>
      {user.role === 'admin' ? (
        <section className="kw-page-card">
          <h2>Admin password</h2>
          <p className="kw-helper">
            The Admin password is not stored in the database and cannot be changed here. Run
            {' '}<code>node scripts/set-admin-password.js</code> on the server, then restart the backend.
          </p>
        </section>
      ) : (
        <ChangePassword />
      )}
    </div>
  );
}

export default Account;
