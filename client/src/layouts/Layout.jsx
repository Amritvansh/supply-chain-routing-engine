/**
 * Layout — Collapsible sidebar drawer + full-width main content
 *
 * Architecture:
 *   - Main content ALWAYS takes full viewport width (no margin offsets)
 *   - Sidebar is an overlay drawer, toggled by a fixed menu button
 *   - Click menu → drawer slides in from left with backdrop
 *   - Click backdrop / nav item / escape → drawer closes
 *   - No overlap, no cutoff, no broken margin calculations
 */
import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const navItems = [
  {
    to: '/',
    label: 'Control Tower',
    description: 'Real-time monitoring',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
      </svg>
    ),
  },
  {
    to: '/order-simulator',
    label: 'Order Simulator',
    description: 'Test checkout flow',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
      </svg>
    ),
  },
  {
    to: '/analytics',
    label: 'Analytics',
    description: 'Performance metrics',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    to: '/how-it-works',
    label: 'How It Works',
    description: 'Architecture guide',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
    ),
  },
];

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

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

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* ─── Fixed Menu Toggle Button ──────────────────── */}
      <button
        onClick={() => setDrawerOpen((prev) => !prev)}
        className="menu-toggle-btn"
        aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={drawerOpen}
        id="menu-toggle"
      >
        {drawerOpen ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        )}
      </button>

      {/* ─── Backdrop (visible when drawer is open) ──── */}
      <div
        className={`drawer-backdrop ${drawerOpen ? 'drawer-backdrop--visible' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* ─── Sidebar Drawer ────────────────────────────── */}
      <aside
        className={`sidebar-drawer ${drawerOpen ? 'sidebar-drawer--open' : ''}`}
      >
        {/* Logo / Brand */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-accent-gradient)',
                boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
              }}
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H18.75m-7.5-2.625h6.375c.621 0 1.125.504 1.125 1.125v1.5m0 0h.75m-6-3H6.375a1.125 1.125 0 0 0-1.125 1.125v3.659M18.75 12.75h.008v.008h-.008v-.008Zm-.375-3h.008v.008h-.008V9.75Z" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
                Supply Chain
              </h1>
              <p style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 500 }}>Routing Engine</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px 12px' }} aria-label="Main navigation">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'nav-item--active' : ''}`
                }
              >
                <span className="nav-item-icon">
                  {item.icon}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 400 }}>
                    {item.description}
                  </div>
                </div>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Hybrid Architecture
            </p>
          </div>
          <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            Deterministic Core + Async AI
          </p>
        </div>
      </aside>

      {/* ─── Main Content (ALWAYS full width) ──────────── */}
      <main style={{ minHeight: '100vh', paddingTop: 0 }}>
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
