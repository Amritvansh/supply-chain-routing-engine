/**
 * OrderConfirmation — Success page shown after a successful checkout
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../lib/apiClient';

function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

export default function OrderConfirmation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.trackOrder(id)
      .then(data => setOrder(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', fontFamily: 'var(--font-sans)' }}>
        <div className="auth-spinner" />
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: 'var(--font-sans)', color: '#e2e8f0', minHeight: '100vh',
      background: 'var(--color-bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
        borderRadius: 18, padding: '48px 40px', maxWidth: 520, width: '100%', textAlign: 'center',
      }}>
        {/* Animated checkmark */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
          background: 'rgba(16,185,129,0.15)', border: '3px solid #10b981',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Order Confirmed!</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>Your order has been placed successfully</p>

        {/* Order ID */}
        <div style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 24,
        }}>
          <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Order ID</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#10b981', margin: 0, wordBreak: 'break-all' }}>{id}</p>
        </div>

        {order && (
          <>
            {/* Items summary */}
            {order.items?.length > 0 && (
              <div style={{ textAlign: 'left', marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Items Ordered</p>
                {order.items.map(item => (
                  <div key={item.sku} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(51,65,85,0.2)' }}>
                    <span style={{ fontSize: 13, color: '#e2e8f0' }}>{item.name} × {item.qty}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{formatINR(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Delivery info */}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
              {order.order?.shippingAddress && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Delivery To</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>{order.order.shippingAddress}</p>
                </div>
              )}
              {order.estimatedDays && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Est. Delivery</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#10b981', margin: '4px 0 0' }}>{order.estimatedDays} day{order.estimatedDays > 1 ? 's' : ''}</p>
                </div>
              )}
              {order.order?.totalAmount && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Total Paid</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#10b981', margin: '4px 0 0' }}>{formatINR(order.order.totalAmount)}</p>
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => navigate(`/customer/orders/${id}`)} style={{
            padding: '11px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
            fontSize: 13, fontWeight: 700,
          }}>Track Order</button>
          <button onClick={() => navigate('/customer/shop')} style={{
            padding: '11px 24px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(51,65,85,0.5)',
            color: '#94a3b8', fontSize: 13, fontWeight: 600,
          }}>Continue Shopping</button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16,185,129,0.3); }
          50% { transform: scale(1.05); box-shadow: 0 0 20px 4px rgba(16,185,129,0.15); }
        }
      `}</style>
    </div>
  );
}
