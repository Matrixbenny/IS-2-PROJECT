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
import { LanguageProvider, useLanguage } from './context/LanguageContext';

function LanguageToggle() {
  const { language, changeLanguage } = useLanguage();
  return (
    <div className="kw-lang-toggle" role="group" aria-label="Choose language">
      <button type="button" aria-pressed={language === 'en'} className={language === 'en' ? 'active' : ''} onClick={() => changeLanguage('en')}>EN</button>
      <button type="button" aria-pressed={language === 'sw'} className={language === 'sw' ? 'active' : ''} onClick={() => changeLanguage('sw')}>SW</button>
    </div>
  );
}

function InstallPrompt() {
  const [installPrompt, setInstallPrompt] = React.useState(null);

  React.useEffect(() => {
    const handleInstallAvailable = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', handleInstallAvailable);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallAvailable);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (!installPrompt) return null;
  return (
    <div className="kw-install-prompt">
      <span>Install Kenya Watch for quick access.</span>
      <button type="button" className="kw-btn" onClick={async () => {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
      }}>
        Install app
      </button>
    </div>
  );
}

function HeaderUser() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  if (!user) {
    return (
      <div className="kw-header-user">
        <NavLink to="/login" className="kw-nav-link kw-nav-cta">{t('signIn')}</NavLink>
      </div>
    );
  }
  return (
    <div className="kw-header-user">
      {t('signedInAs')} <strong>{user.name}</strong> ({user.role})
      <div>
        <button type="button" className="kw-btn kw-btn-secondary" style={{ marginTop: 6, padding: '6px 14px', fontSize: '0.85rem' }} onClick={logout}>
          {t('signOut')}
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const { user } = useAuth();
  const { t } = useLanguage();
  return (
    <Router>
      <div className="App">
        <a className="kw-skip-link" href="#main-content">Skip to main content</a>
        <header className="kw-header">
          <div className="kw-logo-circle">
            <span aria-hidden="true" className="kw-logo-emoji">🛡️</span>
          </div>
          <div className="kw-branding">
            <h1>Kenya Watch</h1>
            <div className="kw-tagline">{t('tagline')}</div>
          </div>
          <LanguageToggle />
          <HeaderUser />
        </header>
        <nav className="kw-nav" aria-label="Main navigation">
          <NavLink to="/" end className="kw-nav-link">{t('nav_home')}</NavLink>
          <NavLink to="/submit" className="kw-nav-link">{t('nav_submit')}</NavLink>
          <NavLink to="/track" className="kw-nav-link">{t('nav_track')}</NavLink>
          <NavLink to="/stats" className="kw-nav-link">{t('nav_stats')}</NavLink>
          {user && <NavLink to="/my-reports" className="kw-nav-link">{t('nav_myReports')}</NavLink>}
          {user && ['reviewer', 'admin'].includes(user.role) && (
            <NavLink to="/reviewer-queue" className="kw-nav-link">{t('nav_reviewerQueue')}</NavLink>
          )}
          {user && user.role === 'admin' && (
            <NavLink to="/manage-users" className="kw-nav-link">{t('nav_manageUsers')}</NavLink>
          )}
          {user && user.role === 'admin' && (
            <NavLink to="/escalations" className="kw-nav-link">{t('nav_escalations')}</NavLink>
          )}
          <NavLink to="/about" className="kw-nav-link">{t('nav_about')}</NavLink>
        </nav>
        <InstallPrompt />
        <main id="main-content" tabIndex="-1">
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
        </main>
      </div>
    </Router>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
