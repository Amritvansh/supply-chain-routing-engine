/**
 * App — Root component with React Router configuration
 *
 * Routes:
 *   /                 → ControlTowerDashboard
 *   /order-simulator  → OrderSimulator
 *   /analytics        → Analytics
 *
 * All routes share the Layout wrapper (persistent sidebar).
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Layout from './layouts/Layout';
import ControlTowerDashboard from './pages/ControlTowerDashboard';
import OrderSimulator from './pages/OrderSimulator';
import Analytics from './pages/Analytics';
import HowItWorks from './pages/HowItWorks';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ControlTowerDashboard />} />
          <Route path="order-simulator" element={<OrderSimulator />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          {/* Catch-all: redirect unknown routes to Control Tower */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
