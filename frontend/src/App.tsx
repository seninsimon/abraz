

import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { ClientPage } from './pages/ClientPage';
import { HostPage } from './pages/HostPage';

function NavBar() {
  const location = useLocation();
  const isClient = location.pathname === '/client';
  const isHost = location.pathname === '/host';

  return (
    <nav className="app-nav">
      <div className="nav-brand">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#navGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <defs>
            <linearGradient id="navGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
        <span className="nav-title">DualStream</span>
      </div>
      <div className="nav-links">
        <Link
          to="/client"
          className={`nav-link ${isClient ? 'nav-link-active' : ''}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          Client
        </Link>
        <Link
          to="/host"
          className={`nav-link ${isHost ? 'nav-link-active' : ''}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Host
        </Link>
      </div>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <NavBar />
        <div className="app-content">
          <Routes>
            <Route path="/client" element={<ClientPage />} />
            <Route path="/host" element={<HostPage />} />
            <Route path="*" element={<Navigate to="/client" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
