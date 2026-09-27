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
import AuthForm from '../components/AuthForm';

export default function EntryPage() {
  const [selectedRole, setSelectedRole] = useState(null);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      if (user.role === 'host') {
        navigate('/host/dashboard', { replace: true });
      } else {
        navigate('/customer/shop', { replace: true });
      }
    }
  }, [user, loading, navigate]);

  // Show auth form if a role is selected
  if (selectedRole) {
    return (
      <div className="entry-page">
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
          <p className="entry-subtitle">Optimize • Route • Fulfill • Analyze</p>
        </div>

        {/* Divider */}
        <div className="entry-divider">
          <span>Select your view</span>
        </div>

        {/* Role cards */}
        <div className="entry-cards">
          {/* Customer Card */}
          <button
            className="entry-card entry-card--customer"
            onClick={() => setSelectedRole('customer')}
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
              Enter as Customer →
            </div>
          </button>

          {/* Host Card */}
          <button
            className="entry-card entry-card--host"
            onClick={() => setSelectedRole('host')}
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
              Enter as Host →
            </div>
          </button>
        </div>

        {/* Footer */}
        <p className="entry-footer">
          College Major Project • Distributed Logistics Platform • 2026
        </p>
      </div>
    </div>
  );
}
