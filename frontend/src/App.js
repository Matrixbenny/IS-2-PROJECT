

import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import SubmitReport from './pages/SubmitReport';
import TrackReport from './pages/TrackReport';
import MyReports from './pages/MyReports';
import Login from './pages/Login';
import Register from './pages/Register';
import About from './pages/About';
import ReviewerQueue from './pages/ReviewerQueue';
import ManageUsers from './pages/ManageUsers';

function NavAuthLinks() {
  const { user, logout } = useAuth();
  if (user) {
    return (
      <>
        {['reviewer', 'admin'].includes(user.role) && <Link to="/reviewer-queue" className="kw-nav-link">Reviewer Queue</Link>}
        {user.role === 'admin' && <Link to="/manage-users" className="kw-nav-link">Manage Users</Link>}
        <Link to="/my-reports" className="kw-nav-link">My Reports ({user.name})</Link>
        <button type="button" className="kw-nav-link kw-nav-button" onClick={logout}>Log Out</button>
      </>
    );
  }
  return (
    <>
      <Link to="/login" className="kw-nav-link">Log In</Link>
      <Link to="/register" className="kw-nav-link">Register</Link>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
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
          </header>
          <nav className="kw-nav">
            <Link to="/" className="kw-nav-link">Home</Link>
            <Link to="/submit" className="kw-nav-link">Submit Report</Link>
            <Link to="/track" className="kw-nav-link">Track Report</Link>
            <Link to="/about" className="kw-nav-link">About</Link>
            <NavAuthLinks />
          </nav>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/submit" element={<SubmitReport />} />
            <Route path="/track" element={<TrackReport />} />
            <Route path="/my-reports" element={<MyReports />} />
            <Route path="/reviewer-queue" element={<ReviewerQueue />} />
            <Route path="/manage-users" element={<ManageUsers />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}


export default App;
