/**
 * EntryPage — Authorization & Role Selection
 *
 * The landing page of the Supply Chain Routing Engine.
 * Displays the project title and two distinct entry points:
 *   - Customer View (green accent)
 *   - Host View (gold accent)
 *
 * Selecting a view opens the login/register form for that role.
 * Already-authenticated users are redirected to their dashboard.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthForm from '../components/AuthForm';
import storage from '../lib/storage';

export default function EntryPage() {
  const [selectedRole, setSelectedRole] = useState(null);
  const { user, loading, logout } = useAuth();
  const { currentLanguage, openPicker } = useLanguage();
  const navigate = useNavigate();

  // ── Theme toggle (Day / Night) ──────────────────────────────
  const [isDark, setIsDark] = useState(() => {
    const saved = storage.getItem('theme');
    return saved !== 'light';
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
    storage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  function handleRoleClick(role) {
    if (user && user.role === role) {
      navigate(role === 'host' ? '/host/dashboard' : '/customer/shop');
      return;
    }
    setSelectedRole(role);
  }

  const themeToggleNode = (
    <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        onClick={openPicker}
        data-no-translate="true"
        style={{
          padding: '7px 14px',
          borderRadius: 99,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-card-solid)',
          color: 'var(--color-text-primary)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        }}
        title="Choose Language"
      >
        <span>🌐</span>
        <span>{currentLanguage.native}</span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
      </button>
      <button
        id="entry-theme-toggle"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-pressed={!isDark}
        onClick={() => setIsDark((prev) => !prev)}
        className={`theme-toggle ${isDark ? 'theme-toggle--dark' : ''}`}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <span className="theme-toggle__thumb">☀️</span>
        <span className="theme-toggle__moon">🌙</span>
      </button>
    </div>
  );

  // Show auth form if a role is selected
  if (selectedRole) {
    return (
      <div className="entry-page">
        {themeToggleNode}
        <AuthForm
          role={selectedRole}
          onBack={() => setSelectedRole(null)}
        />
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="entry-page">
        <div className="entry-loading">
          <div className="auth-spinner" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="entry-page">
      {themeToggleNode}
      {/* Animated background elements */}
      <div className="entry-bg-grid" />
      <div className="entry-bg-glow entry-bg-glow--1" />
      <div className="entry-bg-glow entry-bg-glow--2" />

      <div className="entry-content">
        {/* Logo/Brand */}
        <div className="entry-brand">
          <div className="entry-logo">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H18.75m-7.5-2.625h6.375c.621 0 1.125.504 1.125 1.125v1.5m0 0h.75m-6-3H6.375a1.125 1.125 0 0 0-1.125 1.125v3.659M18.75 12.75h.008v.008h-.008v-.008Zm-.375-3h.008v.008h-.008V9.75Z" />
            </svg>
          </div>
          <h1 className="entry-title">SUPPLY CHAIN<br />ROUTING ENGINE</h1>
          <p className="entry-subtitle">Intelligent Routing • Real-time Tracking • AI Analytics</p>
        </div>

        {/* Active Session Banner (if already signed in) */}
        {user && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              flexWrap: 'wrap',
              padding: '8px 16px',
              marginBottom: 16,
              borderRadius: 99,
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>
              Signed in as <strong style={{ color: 'var(--color-text-primary)' }}>{user.name}</strong> ({user.role?.toUpperCase()})
            </span>
            <button
              onClick={logout}
              style={{
                padding: '3px 10px',
                borderRadius: 99,
                border: '1px solid rgba(239, 68, 68, 0.35)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#f87171',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign Out / Switch
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="entry-divider">
          <span>Select your view</span>
        </div>

        {/* Role cards */}
        <div className="entry-cards">
          {/* Customer Card */}
          <button
            className="entry-card entry-card--customer"
            onClick={() => handleRoleClick('customer')}
          >
            <div className="entry-card-icon entry-card-icon--customer">
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
              </svg>
            </div>
            <h3 className="entry-card-title">Customer View</h3>
            <p className="entry-card-desc">
              Browse products, place orders, and track deliveries
            </p>
            <div className="entry-card-features">
              <span>🛒 Shop Products</span>
              <span>📍 Set Location</span>
              <span>📦 Track Orders</span>
            </div>
            <div className="entry-card-action entry-card-action--customer">
              {user?.role === 'customer' ? `Continue as ${user.name} →` : 'Sign In as Customer →'}
            </div>
          </button>

          {/* Host Card */}
          <button
            className="entry-card entry-card--host"
            onClick={() => handleRoleClick('host')}
          >
            <div className="entry-card-icon entry-card-icon--host">
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
              </svg>
            </div>
            <h3 className="entry-card-title">Host View</h3>
            <p className="entry-card-desc">
              Control Tower, routing analysis, AI explanations & analytics
            </p>
            <div className="entry-card-features">
              <span>🗺️ Control Tower</span>
              <span>🤖 AI Analysis</span>
              <span>📊 Analytics</span>
            </div>
            <div className="entry-card-action entry-card-action--host">
              {user?.role === 'host' ? `Continue as ${user.name} →` : 'Sign In as Host →'}
            </div>
          </button>
        </div>

        {/* Footer */}
        <p className="entry-footer">
          Distributed Logistics Platform • Hybrid Architecture • v2.0
        </p>
      </div>
    </div>
  );
}
