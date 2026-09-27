/**
 * CustomerLayout — Shell layout for customer pages
 * Wraps the customer navbar + page outlet + cart provider
 */
import { Outlet } from 'react-router-dom';
import CustomerNavbar from '../components/CustomerNavbar';

export default function CustomerLayout() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
      <CustomerNavbar />
      <Outlet />
    </div>
  );
}
