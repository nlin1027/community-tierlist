import { NavLink } from 'react-router-dom';
import './NavBar.css';

function NavBar() {
  return (
    <nav className="navbar">
      <NavLink to="/" className="navlink" end>
        Deadlock
      </NavLink>
      <NavLink to="/docs" className="navlink">
        API Docs
      </NavLink>
    </nav>
  );
}

export default NavBar;
