import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import './NavBar.css';

function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="navlink-dropdown">
        <span className="navlink">Deadlock</span>
        <div className="dropdown-menu">
          <NavLink to="/deadlock-view" className="dropdown-item">
            View
          </NavLink>
          <NavLink to="/deadlock-rank" className="dropdown-item">
            Rank
          </NavLink>
          <NavLink to="/deadlock-search" className="dropdown-item">
            Search
          </NavLink>
        </div>
      </div>
      <NavLink to="/docs" className="navlink">
        API Docs
      </NavLink>

      <div className="nav-account">
        {user ? (
          <>
            <NavLink to={`/deadlock-search/${user.username}`} className="navlink" title="Your rankings">
              {user.username}
            </NavLink>
            <button type="button" className="navlink nav-button" onClick={handleLogout}>
              Sign out
            </button>
          </>
        ) : (
          <NavLink to="/login" state={{ from: pathname }} className="navlink">
            Sign in
          </NavLink>
        )}
      </div>
    </nav>
  );
}

export default NavBar;
