/**
 * App — Root component with React Router configuration
 *
 * Route Structure:
 *   /                             → EntryPage (role selection + login/register)
 *   /host/dashboard               → ControlTowerDashboard (Host only)
 *   /host/order-simulator         → OrderSimulator (Host only)
 *   /host/analytics               → Analytics (Host only)
 *   /host/how-it-works            → HowItWorks (Host only)
 *   /customer/shop                → CustomerShop (Customer only)
 *   /customer/checkout            → CheckoutPage (Customer only)
 *   /customer/orders              → CustomerOrders (Customer only)
 *   /customer/orders/:id          → CustomerOrderTrack (Customer only)
 *   /customer/confirmation/:id    → OrderConfirmation (Customer only)
 *
 * All /host/* routes are protected by <HostRoute>.
 * All /customer/* routes are protected by <CustomerRoute>.
 * The entire app is wrapped in <AuthProvider> and <CartProvider>.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { HostRoute, CustomerRoute } from './components/ProtectedRoute';
import EntryPage from './pages/EntryPage';
import Layout from './layouts/Layout';
import CustomerLayout from './layouts/CustomerLayout';
import ControlTowerDashboard from './pages/ControlTowerDashboard';
import OrderSimulator from './pages/OrderSimulator';
import Analytics from './pages/Analytics';
import HowItWorks from './pages/HowItWorks';
import HostProducts from './pages/HostProducts';
import CustomerShop from './pages/CustomerShop';
import CheckoutPage from './pages/CheckoutPage';
import CustomerOrders from './pages/CustomerOrders';
import CustomerOrderTrack from './pages/CustomerOrderTrack';
import OrderConfirmation from './pages/OrderConfirmation';

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
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
              <Route path="host/products" element={<HostProducts />} />
            </Route>

            {/* Customer-protected routes (Store Experience) */}
            <Route
              element={
                <CustomerRoute>
                  <CustomerLayout />
                </CustomerRoute>
              }
            >
              <Route path="customer" element={<Navigate to="/customer/shop" replace />} />
              <Route path="customer/shop" element={<CustomerShop />} />
              <Route path="customer/checkout" element={<CheckoutPage />} />
              <Route path="customer/orders" element={<CustomerOrders />} />
              <Route path="customer/orders/:id" element={<CustomerOrderTrack />} />
              <Route path="customer/confirmation/:id" element={<OrderConfirmation />} />
            </Route>

            {/* Legacy shop redirect */}
            <Route path="shop" element={<Navigate to="/customer/shop" replace />} />

            {/* Catch-all: redirect unknown routes to Entry */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
