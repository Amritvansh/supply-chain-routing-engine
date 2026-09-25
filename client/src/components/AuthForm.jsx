/**
 * AuthForm — Login / Register form component
 *
 * Handles both login and registration with a toggle between modes.
 * Calls the AuthContext login/register methods and redirects
 * to the appropriate dashboard on success.
 *
 * Props:
 *   - role: 'customer' | 'host' — determines which account type to create
 *   - onBack: callback to return to the entry page role selection
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AuthForm({ role = 'customer', onBack }) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const roleLabel = role === 'host' ? 'Host' : 'Customer';
  const roleColor = role === 'host' ? 'var(--color-warning)' : 'var(--color-success)';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (isLogin) {
        const user = await login(email, password);
        // Redirect based on role
        if (user.role === 'host') {
          navigate('/host/dashboard');
        } else {
          navigate('/shop');
        }
      } else {
        if (!name.trim()) {
          setError('Name is required');
          setSubmitting(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setSubmitting(false);
          return;
        }
        const user = await register(name.trim(), email, password, role);
        if (user.role === 'host') {
          navigate('/host/dashboard');
        } else {
          navigate('/shop');
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-form-container">
      {/* Back button */}
      <button onClick={onBack} className="auth-back-btn">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      {/* Form card */}
      <div className="auth-form-card">
        {/* Role indicator */}
        <div className="auth-role-badge" style={{ background: roleColor }}>
          {role === 'host' ? (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
            </svg>
          ) : (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          )}
          <span>{roleLabel} {isLogin ? 'Login' : 'Registration'}</span>
        </div>

        {/* Title */}
        <h2 className="auth-form-title">
          {isLogin ? `Welcome Back` : `Create ${roleLabel} Account`}
        </h2>
        <p className="auth-form-subtitle">
          {isLogin
            ? `Sign in to access your ${roleLabel === 'Host' ? 'Control Tower' : 'shopping experience'}`
            : `Register to ${roleLabel === 'Host' ? 'manage operations' : 'start shopping'}`
          }
        </p>

        {/* Error */}
        {error && (
          <div className="auth-error">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="auth-field">
              <label htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                autoComplete="name"
                required={!isLogin}
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={role === 'host' ? 'host@supplychain.com' : 'you@example.com'}
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? 'Enter password' : 'Minimum 6 characters'}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={submitting}
            style={{ '--btn-accent': roleColor }}
          >
            {submitting ? (
              <div className="auth-spinner auth-spinner--sm" />
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Toggle */}
        <div className="auth-toggle">
          {isLogin ? (
            <>
              Don&apos;t have an account?{' '}
              <button onClick={() => { setIsLogin(false); setError(''); }}>
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => { setIsLogin(true); setError(''); }}>
                Sign In
              </button>
            </>
          )}
        </div>

        {/* Demo credentials hint for host */}
        {role === 'host' && isLogin && (
          <div className="auth-hint">
            <span>Demo:</span> host@supplychain.com / host123
          </div>
        )}
        {role === 'customer' && isLogin && (
          <div className="auth-hint">
            <span>Demo:</span> customer@test.com / customer123
          </div>
        )}
      </div>
    </div>
  );
}
