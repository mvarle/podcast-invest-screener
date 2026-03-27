import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Layout({ children }) {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const navLinks = [
    { to: '/', label: 'Feed' },
    { to: '/episodes', label: 'Episodes' },
    { to: '/speakers', label: 'Speakers' },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="logo">
            <span className="logo-icon">P</span>
            PodSignal
          </Link>
          <nav className="nav">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`nav-link ${location.pathname === to ? 'active' : ''}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="auth-section">
            {user ? (
              <div className="user-menu">
                <span className="user-email">{user.email}</span>
                <button onClick={signOut} className="btn btn-sm">Sign Out</button>
              </div>
            ) : (
              <Link to="/login" className="btn btn-sm btn-primary">Sign In</Link>
            )}
          </div>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
