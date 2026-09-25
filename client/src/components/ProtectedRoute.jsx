/**
 * Protected Route Wrappers
 *
 * Guards route access based on authentication and user role.
 *
 *   <HostRoute>     — Only allows role === 'host'
 *   <CustomerRoute> — Only allows role === 'customer'
 *
 * While the auth state is loading (initial token verification),
 * a minimal loading spinner is shown to prevent flash-of-content.
 *
 * Unauthenticated or wrong-role users are redirected to '/'.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Loading overlay shown during initial auth verification.
 */
function AuthLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-primary)',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div className="auth-spinner" />
        <span style={{
          fontSize: '13px',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-sans)',
        }}>
          Verifying session…
        </span>
      </div>
    </div>
  );
}

/**
 * Wraps children in a route guard requiring role === 'host'.
 * Redirects unauthenticated or customer-role users to '/'.
 */
export function HostRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <AuthLoading />;
  if (!user || user.role !== 'host') return <Navigate to="/" replace />;

  return children;
}

/**
 * Wraps children in a route guard requiring role === 'customer'.
 * Redirects unauthenticated or host-role users to '/'.
 */
export function CustomerRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <AuthLoading />;
  if (!user || user.role !== 'customer') return <Navigate to="/" replace />;

  return children;
}
