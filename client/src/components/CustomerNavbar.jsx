/**
 * CustomerNavbar — Glassmorphic sticky navigation for the customer store
 */
import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import storage from '../lib/storage';

export default function CustomerNavbar() {
  const { user, logout } = useAuth();
  const { cartCount } = useCart();
  const { currentLanguage, openPicker } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

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

  function handleLogout() {
    logout();
    navigate('/');
  }

  const isOrdersActive = location.pathname.startsWith('/customer/orders');
  const isShopActive = location.pathname.startsWith('/customer/shop');

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'var(--color-glass)',
      backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      borderBottom: '1px solid var(--color-glass-border)',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        maxWidth: 1360, margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 60,
      }}>
        {/* Brand */}
        <Link to="/customer/shop" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(16, 185, 129, 0.25)',
          }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>Supply Chain Store</span>
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginTop: -2 }}>Powered by Routing Engine</span>
          </div>
        </Link>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Shop */}
          <Link
            to="/customer/shop"
            className={`customer-nav-link ${isShopActive ? 'customer-nav-link--active' : ''}`}
          >
            Shop
          </Link>

          {/* My Orders */}
          <Link
            to="/customer/orders"
            className={`customer-nav-link ${isOrdersActive ? 'customer-nav-link--active' : ''}`}
          >
            My Orders
          </Link>

          {/* Cart */}
          <Link to="/customer/checkout" style={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600, textDecoration: 'none',
            padding: '7px 14px', borderRadius: 8,
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.22)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.12)'; }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
            Cart
            {cartCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#10b981', color: 'white',
                fontSize: 10, fontWeight: 700,
                width: 20, height: 20, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 8px rgba(16,185,129,0.5)',
              }}>{cartCount}</span>
            )}
          </Link>

          {/* Language Switcher */}
          <button
            type="button"
            onClick={openPicker}
            data-no-translate="true"
            style={{
              padding: '6px 11px', borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-chip)',
              color: 'var(--color-text-primary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            title="Switch Language"
          >
            <span>🌐</span>
            <span>{currentLanguage.native}</span>
          </button>

          {/* Day / Night Theme Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 4px' }}>
            <button
              id="theme-toggle"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={!isDark}
              onClick={() => setIsDark((prev) => !prev)}
              className={`theme-toggle ${isDark ? 'theme-toggle--dark' : ''}`}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ transform: 'scale(0.85)' }}
            >
              <span className="theme-toggle__thumb">☀️</span>
              <span className="theme-toggle__moon">🌙</span>
            </button>
          </div>

          {/* User menu */}
          {user && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(!menuOpen)} style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none', cursor: 'pointer',
                color: 'white', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {user.name?.charAt(0)?.toUpperCase() || 'U'}
              </button>
              {menuOpen && (
                <div style={{
                  position: 'absolute', top: 44, right: 0, width: 200,
                  background: 'var(--color-bg-card-solid)', border: '1px solid var(--color-border)',
                  borderRadius: 10, padding: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{user.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>{user.email}</p>
                  </div>
                  {user.role === 'host' && (
                    <button onClick={() => { setMenuOpen(false); navigate('/host/dashboard'); }} style={{
                      width: '100%', padding: '8px 12px', border: 'none', background: 'none',
                      color: 'var(--color-accent)', fontSize: 12, fontWeight: 500, textAlign: 'left',
                      cursor: 'pointer', borderRadius: 6,
                    }}>⚡ Switch to Control Tower</button>
                  )}
                  <button onClick={() => { setMenuOpen(false); handleLogout(); }} style={{
                    width: '100%', padding: '8px 12px', border: 'none', background: 'none',
                    color: 'var(--color-danger)', fontSize: 12, fontWeight: 500, textAlign: 'left',
                    cursor: 'pointer', borderRadius: 6,
                  }}>Logout</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
