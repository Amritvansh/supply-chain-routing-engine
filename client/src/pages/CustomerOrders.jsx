/**
 * CustomerOrders — My Orders list view
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/apiClient';

function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

const STATUS_COLORS = {
  ROUTED: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', label: 'Processing' },
  SPLIT_ROUTED: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', label: 'Processing' },
  FULFILLED: { bg: 'rgba(16,185,129,0.12)', color: '#34d399', label: 'Delivered' },
  DELIVERED: { bg: 'rgba(16,185,129,0.12)', color: '#34d399', label: 'Delivered' },
};

export default function CustomerOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getMyOrders()
      .then(data => setOrders(data.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', fontFamily: 'var(--font-sans)' }}>
        <div className="auth-spinner" />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: '#e2e8f0', minHeight: '100vh', background: 'var(--color-bg-primary)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 28, letterSpacing: '-0.02em' }}>My Orders</h1>

        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>📦</span>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>No orders yet</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>Your order history will appear here</p>
            <button onClick={() => navigate('/customer/shop')} style={{
              padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
              fontSize: 13, fontWeight: 700,
            }}>Start Shopping</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {orders.map(order => {
              const st = STATUS_COLORS[order.status] || { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', label: order.status };
              return (
                <div
                  key={order.id}
                  onClick={() => navigate(`/customer/orders/${order.id}`)}
                  style={{
                    background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
                    borderRadius: 12, padding: '18px 22px', cursor: 'pointer',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(16,185,129,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0, fontFamily: 'monospace' }}>#{order.id.slice(0, 8)}...</p>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: '4px 0 0', color: '#e2e8f0' }}>
                        {order.customerName || 'Order'}
                      </p>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                      background: st.bg, color: st.color,
                    }}>{st.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 24, fontSize: 12, color: '#94a3b8' }}>
                    <span>{order.itemCount} item{order.itemCount > 1 ? 's' : ''}</span>
                    {order.totalAmount && <span style={{ fontWeight: 700, color: '#10b981' }}>{formatINR(order.totalAmount)}</span>}
                    <span>{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  {order.shippingAddress && (
                    <p style={{ fontSize: 11, color: '#64748b', marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📍 {order.shippingAddress}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
