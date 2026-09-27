/**
 * Layout — Enterprise application shell
 *
 * Architecture:
 *   - Desktop (≥1024px): Persistent sidebar, content offset
 *   - Mobile (<1024px): Overlay drawer with backdrop
 *   - Health indicator shows backend connectivity
 *   - NavLink provides active route highlighting
 */
import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as api from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

const navItems = [
  {
    to: '/host/dashboard',
    label: 'Control Tower',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
      </svg>
    ),
  },
  {
    to: '/host/order-simulator',
    label: 'Order Simulator',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
      </svg>
    ),
  },
  {
    to: '/host/analytics',
    label: 'Analytics',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    to: '/host/products',
    label: 'Products',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
      </svg>
    ),
  },
  {
    to: '/host/warehouses',
    label: 'Warehouses',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5.5-1.5-.5M6.75 7.364V3h-3v18m3-13.636 10.5-3.819" />
      </svg>
    ),
  },
  {
    to: '/host/inventory',
    label: 'Inventory',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
  {
    to: '/host/how-it-works',
    label: 'How It Works',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
    ),
  },
];

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop sidebar collapse (separate from mobile drawer)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [healthStatus, setHealthStatus] = useState('unknown');
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate('/');
  }

  // ── Theme toggle (Day / Night) ──────────────────────────────
  const [isDark, setIsDark] = useState(() => {
    // Default: dark mode (existing site appearance). Only switch to light if
    // the user previously saved 'light' in localStorage.
    const saved = localStorage.getItem('theme');
    return saved !== 'light';
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Close drawer on escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  // Health check
  const checkHealth = useCallback(async () => {
    try {
      await api.getHealth();
      setHealthStatus('healthy');
    } catch {
      setHealthStatus('unhealthy');
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return (
    <div className="layout-root" style={{ minHeight: '100vh' }}>


      {/* Backdrop */}
      <div
        className={`drawer-backdrop ${drawerOpen ? 'drawer-backdrop--visible' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={[
        'sidebar-drawer',
        drawerOpen ? 'sidebar-drawer--open' : '',
        sidebarCollapsed ? 'sidebar-drawer--collapsed' : '',
      ].join(' ')}>
        {/* Brand */}
        <div className="px-5 py-5 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-accent)] shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H18.75m-7.5-2.625h6.375c.621 0 1.125.504 1.125 1.125v1.5m0 0h.75m-6-3H6.375a1.125 1.125 0 0 0-1.125 1.125v3.659M18.75 12.75h.008v.008h-.008v-.008Zm-.375-3h.008v.008h-.008V9.75Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[var(--color-text-primary)] leading-tight tracking-tight">
                Supply Chain
              </h1>
              <p className="text-[11px] text-[var(--color-text-muted)] font-normal">
                Routing Engine
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4" aria-label="Main navigation">
          <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest px-3 mb-2">
            Navigation
          </p>
          <div className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/host/dashboard'}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'nav-item--active' : ''}`
                }
              >
                <span className="nav-item-icon">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--color-border-subtle)]">
          {/* Sidebar collapse/expand toggle */}
          <button
            onClick={() => setSidebarCollapsed(true)}
            id="menu-toggle"
            aria-label="Collapse sidebar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              fontSize: '11px',
              fontWeight: 500,
              padding: '4px 0',
              marginBottom: '10px',
              width: '100%',
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
            Close menu
          </button>

          {/* Logged-in user info + Logout */}
          {user && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
              padding: '6px 8px',
              borderRadius: '6px',
              background: 'var(--color-bg-hover)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'var(--color-accent-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 700,
                }}>
                  {user.name?.charAt(0)?.toUpperCase() || 'H'}
                </div>
                <div>
                  <p style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    margin: 0,
                    lineHeight: 1.2,
                  }}>{user.name}</p>
                  <p style={{
                    fontSize: '9px',
                    color: 'var(--color-text-muted)',
                    margin: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>{user.role}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                aria-label="Logout"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Logout"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: healthStatus === 'healthy'
                  ? 'var(--color-success)'
                  : healthStatus === 'unhealthy'
                  ? 'var(--color-danger)'
                  : 'var(--color-text-muted)',
              }}
            />
            <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
              {healthStatus === 'healthy' ? 'API Connected' : healthStatus === 'unhealthy' ? 'API Offline' : 'Connecting…'}
            </span>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] opacity-50">
            Hybrid Architecture · v1.0
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={['layout-main', sidebarCollapsed ? 'layout-main--collapsed' : ''].join(' ')}
        style={{ minHeight: '100vh', position: 'relative' }}
      >
        {/* Floating reopen button — only visible when sidebar is collapsed */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Open sidebar"
            style={{
              position: 'fixed',
              top: '16px',
              left: '16px',
              zIndex: 60,
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'var(--color-bg-card-solid)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        )}
        {/* Top-right theme toggle */}
        <div
          style={{
            position: 'absolute',
            top: '18px',
            right: '24px',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 500,
              color: 'var(--color-text-muted)',
            }}
          >
            {isDark ? 'Dark' : 'Light'}
          </span>
          <button
            id="theme-toggle"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={!isDark}
            onClick={() => setIsDark((prev) => !prev)}
            className={`theme-toggle ${isDark ? 'theme-toggle--dark' : ''}`}
          >
            <span className="theme-toggle__thumb">☀️</span>
            <span className="theme-toggle__moon">🌙</span>
          </button>
        </div>
        <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-[1360px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
