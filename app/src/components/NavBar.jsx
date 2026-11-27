import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import Sigil from './Sigil';
import './NavBar.css';

function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inDeadlock = pathname === '/' || pathname.startsWith('/deadlock');

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="navbar">
      <Link to="/" className="brand">
        <Sigil className="brand-sigil" />
        <span className="brand-text">
          <span className="brand-title">Community Tierlist</span>
          <span className="brand-sub">Deadlock · Hero Rankings Ledger</span>
        </span>
      </Link>

      <nav className="nav-links" aria-label="Main">
        <div className={`nav-dropdown${inDeadlock ? ' active' : ''}`}>
          <button type="button" className="navlink" aria-haspopup="true">
            Deadlock <span className="caret" aria-hidden="true">▾</span>
          </button>
          <div className="dropdown-menu">
            <NavLink to="/deadlock-rank" className="dropdown-item">
              <span className="dropdown-title">Rank</span>
              <span className="dropdown-desc">Build and submit your tier list</span>
            </NavLink>
            <NavLink to="/deadlock-view" className="dropdown-item">
              <span className="dropdown-title">View</span>
              <span className="dropdown-desc">The community average, any period</span>
            </NavLink>
            <NavLink to="/deadlock-search" className="dropdown-item">
              <span className="dropdown-title">Search</span>
              <span className="dropdown-desc">Look up another player's rankings</span>
            </NavLink>
          </div>
        </div>
        <NavLink to="/docs" className="navlink">
          API Docs
        </NavLink>
      </nav>

      <div className="nav-account">
        {user ? (
          <>
            <Link to={`/deadlock-search/${user.username}`} className="account-name" title="Your rankings">
              {user.username}
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" state={{ from: pathname }} className="btn btn-brass btn-sm">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

export default NavBar;
