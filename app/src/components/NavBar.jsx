import { NavLink } from 'react-router-dom';
import './NavBar.css';

function NavBar() {
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
        </div>
      </div>
      <NavLink to="/docs" className="navlink">
        API Docs
      </NavLink>
    </nav>
  );
}

export default NavBar;
