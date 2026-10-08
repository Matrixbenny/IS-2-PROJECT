import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import SubmitReport from './pages/SubmitReport';
import About from './pages/About';
import Login from './pages/Login';
import Register from './pages/Register';
import TrackReport from './pages/TrackReport';
import MyReports from './pages/MyReports';
import ReviewerQueue from './pages/ReviewerQueue';
import ManageUsers from './pages/ManageUsers';
import Stats from './pages/Stats';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Escalations from './pages/Escalations';
import { AuthProvider, useAuth } from './context/AuthContext';

function HeaderUser() {
  const { user, logout } = useAuth();
  if (!user) {
    return (
      <div className="kw-header-user">
        <NavLink to="/login" className="kw-nav-link kw-nav-cta">Sign In</NavLink>
      </div>
    );
  }
  return (
    <div className="kw-header-user">
      Signed in as <strong>{user.name}</strong> ({user.role})
      <div>
        <button type="button" className="kw-btn kw-btn-secondary" style={{ marginTop: 6, padding: '6px 14px', fontSize: '0.85rem' }} onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const { user } = useAuth();
  return (
    <Router>
      <div className="App">
        <header className="kw-header">
          <div className="kw-logo-circle">
            <span role="img" aria-label="shield" className="kw-logo-emoji">🛡️</span>
          </div>
          <div className="kw-branding">
            <h1>Kenya Watch</h1>
            <div className="kw-tagline">A Trusted Platform to Report and Track Corruption</div>
          </div>
          <HeaderUser />
        </header>
        <nav className="kw-nav">
          <NavLink to="/" end className="kw-nav-link">Home</NavLink>
          <NavLink to="/submit" className="kw-nav-link">Submit Report</NavLink>
          <NavLink to="/track" className="kw-nav-link">Track Report</NavLink>
          <NavLink to="/stats" className="kw-nav-link">Statistics</NavLink>
          {user && <NavLink to="/my-reports" className="kw-nav-link">My Reports</NavLink>}
          {user && ['reviewer', 'admin'].includes(user.role) && (
            <NavLink to="/reviewer-queue" className="kw-nav-link">Reviewer Queue</NavLink>
          )}
          {user && user.role === 'admin' && (
            <NavLink to="/manage-users" className="kw-nav-link">Manage Users</NavLink>
          )}
          {user && user.role === 'admin' && (
            <NavLink to="/escalations" className="kw-nav-link">Escalations</NavLink>
          )}
          <NavLink to="/about" className="kw-nav-link">About</NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/submit" element={<SubmitReport />} />
          <Route path="/track" element={<TrackReport />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/my-reports" element={<MyReports />} />
          <Route path="/reviewer-queue" element={<ReviewerQueue />} />
          <Route path="/manage-users" element={<ManageUsers />} />
          <Route path="/escalations" element={<Escalations />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </div>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
