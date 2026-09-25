/**
 * AuthContext — Global authentication state manager
 *
 * Provides:
 *   - user        : Current user object { id, name, email, role } or null
 *   - loading     : True during initial token verification
 *   - login()     : Authenticates and stores JWT
 *   - register()  : Creates account and stores JWT
 *   - logout()    : Clears token and user state
 *
 * On mount, checks localStorage for an existing token and verifies
 * it against /api/v1/auth/me. If invalid, silently clears the token.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authLogin, authRegister, authGetMe } from '../lib/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Verify existing token on mount ───────────────────────
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLoading(false);
      return;
    }

    authGetMe()
      .then((data) => {
        setUser(data.user);
      })
      .catch(() => {
        // Token invalid or expired — clean up silently
        localStorage.removeItem('auth_token');
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // ── Login ────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const data = await authLogin({ email, password });
    localStorage.setItem('auth_token', data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // ── Register ─────────────────────────────────────────────
  const register = useCallback(async (name, email, password, role = 'customer') => {
    const data = await authRegister({ name, email, password, role });
    localStorage.setItem('auth_token', data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // ── Logout ───────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access authentication context.
 * Must be used within an <AuthProvider>.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return context;
}
