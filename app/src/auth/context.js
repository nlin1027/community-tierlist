import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

// { user, token, ready, login, register, logout, expire }
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
