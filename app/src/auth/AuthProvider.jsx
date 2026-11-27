import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, errorMessage } from '../lib/api';
import { AuthContext } from './context';

const STORAGE_KEY = 'tierlist.session';

// { token, expires_at, user } or null. Drops sessions past their expiry.
function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (session?.token && new Date(session.expires_at) > new Date()) return session;
  } catch {
    // fall through
  }
  localStorage.removeItem(STORAGE_KEY);
  return null;
}

function saveSession(session) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);
  const [verified, setVerified] = useState(false);

  const update = useCallback((next) => {
    saveSession(next);
    setSession(next);
  }, []);

  // Confirm a stored token is still live (it may have been revoked elsewhere).
  const storedToken = session?.token;
  useEffect(() => {
    if (!storedToken || verified) return;
    let cancelled = false;
    apiFetch('/auth/me', { token: storedToken }).then((result) => {
      if (cancelled) return;
      if (result.status === 401) update(null);
      else if (result.ok) update({ token: storedToken, ...result.data });
      setVerified(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storedToken, verified, update]);

  const authenticate = useCallback(async (path, username, password) => {
    const result = await apiFetch(path, { method: 'POST', body: { username, password } });
    if (!result.ok) return { ok: false, error: errorMessage(result) };
    update(result.data);
    setVerified(true);
    return { ok: true };
  }, [update]);

  const value = useMemo(() => ({
    user: session?.user ?? null,
    token: session?.token ?? null,
    expiresAt: session?.expires_at ?? null,
    ready: !session || verified,
    login: (username, password) => authenticate('/auth/login', username, password),
    register: (username, password) => authenticate('/auth/register', username, password),
    logout: async () => {
      if (session?.token) await apiFetch('/auth/logout', { method: 'POST', token: session.token });
      update(null);
    },
    // Call when the API answers 401: the session is gone server-side.
    expire: () => update(null),
  }), [session, verified, authenticate, update]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
