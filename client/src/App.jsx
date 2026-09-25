/**
 * App — Root component with React Router configuration
 *
 * Route Structure:
 *   /                      → EntryPage (role selection + login/register)
 *   /host/dashboard        → ControlTowerDashboard (Host only)
 *   /host/order-simulator  → OrderSimulator (Host only)
 *   /host/analytics        → Analytics (Host only)
 *   /host/how-it-works     → HowItWorks (Host only)
 *   /shop                  → Future customer shopping page
 *
 * All /host/* routes are protected by <HostRoute>.
 * The entire app is wrapped in <AuthProvider> for global auth state.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { HostRoute } from './components/ProtectedRoute';
import EntryPage from './pages/EntryPage';
import Layout from './layouts/Layout';
import ControlTowerDashboard from './pages/ControlTowerDashboard';
import OrderSimulator from './pages/OrderSimulator';
import Analytics from './pages/Analytics';
import HowItWorks from './pages/HowItWorks';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: Entry / Auth page */}
          <Route path="/" element={<EntryPage />} />

          {/* Host-protected routes (Control Tower) */}
          <Route
            element={
              <HostRoute>
                <Layout />
              </HostRoute>
            }
          >
            <Route path="host/dashboard" element={<ControlTowerDashboard />} />
            <Route path="host/order-simulator" element={<OrderSimulator />} />
            <Route path="host/analytics" element={<Analytics />} />
            <Route path="host/how-it-works" element={<HowItWorks />} />
          </Route>

          {/* Customer routes (placeholder for Phase 2) */}
          <Route path="shop" element={
            <div style={{
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
              flexDirection: 'column',
              gap: '12px',
            }}>
              <h2 style={{ fontSize: '24px', fontWeight: 700 }}>🛒 Customer Shop</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                Coming in Phase 2 — Product browsing, cart & checkout
              </p>
            </div>
          } />

          {/* Catch-all: redirect unknown routes to Entry */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
