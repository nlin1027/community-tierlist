import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import Sigil from '../components/Sigil';
import './Auth.css';

const USERNAME_PATTERN = /^[a-zA-Z0-9]{3,20}$/;

function Auth() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from && location.state.from !== '/login' ? location.state.from : '/deadlock-rank';

  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user && !busy) return <Navigate to={from} replace />;

  const isRegister = mode === 'register';

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setConfirm('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!USERNAME_PATTERN.test(username)) {
      setError('Usernames are 3-20 letters and numbers.');
      return;
    }
    if (isRegister && password.length < 8) {
      setError('Passwords need at least 8 characters.');
      return;
    }
    if (isRegister && password !== confirm) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    const result = await (isRegister ? register : login)(username, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <div className="page auth-page">
      <section className="panel auth-card">
        <Sigil className="auth-sigil" />
        <p className="eyebrow">{isRegister ? 'Join the ledger' : 'Welcome back'}</p>
        <h1 className="page-title">{isRegister ? 'Create an account' : 'Sign in'}</h1>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!isRegister}
            className={!isRegister ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRegister}
            className={isRegister ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9]+"
              title="3-20 characters: letters and numbers only"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={isRegister ? 8 : 1}
              maxLength={128}
              required
            />
          </label>
          {isRegister && (
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                maxLength={128}
                required
              />
            </label>
          )}

          {error && <p className="notice notice-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-brass btn-block" disabled={busy}>
            {busy ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
          <p className="auth-fine">
            {isRegister
              ? 'Your username is public: other players can search for it and see your rankings.'
              : 'Sessions last one week on this device.'}
          </p>
        </form>
      </section>
    </div>
  );
}

export default Auth;
