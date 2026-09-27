/**
 * CustomerOrderTrack — Order tracking with visual timeline
 *
 * NEVER displays warehouse scores, AI explainability, or routing internals.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../lib/apiClient';

function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

export default function CustomerOrderTrack() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.trackOrder(id)
      .then(d => setData(d))
      .catch(e => setError(e.message || 'Failed to load order'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', fontFamily: 'var(--font-sans)' }}>
        <div className="auth-spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', fontFamily: 'var(--font-sans)', color: '#e2e8f0', gap: 16 }}>
        <span style={{ fontSize: 48 }}>⚠️</span>
        <p style={{ color: '#f87171' }}>{error || 'Order not found'}</p>
        <button onClick={() => navigate('/customer/orders')} style={{
          padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontSize: 13, fontWeight: 700,
        }}>Back to Orders</button>
      </div>
    );
  }

  const { order, items, timeline, estimatedDays, deliveryFee } = data;
  const lastCompleted = timeline ? timeline.reduce((acc, step, i) => step.completed ? i : acc, -1) : -1;

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: '#e2e8f0', minHeight: '100vh', background: 'var(--color-bg-primary)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Header */}
        <button onClick={() => navigate('/customer/orders')} style={{
          background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
          fontSize: 13, fontWeight: 500, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to Orders
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Order Tracking</h1>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0', fontFamily: 'monospace' }}>#{id.slice(0, 8)}...{id.slice(-4)}</p>
          </div>
          {estimatedDays && (
            <div style={{
              background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 10, padding: '8px 16px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Est. Delivery</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#10b981', margin: '2px 0 0' }}>{estimatedDays} day{estimatedDays > 1 ? 's' : ''}</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        {timeline && (
          <div style={{
            background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
            borderRadius: 14, padding: '28px 24px', marginBottom: 20,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Delivery Progress</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {timeline.map((step, i) => (
                <div key={step.step} style={{ display: 'flex', gap: 16 }}>
                  {/* Vertical line + dot */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: step.completed ? '#10b981' : 'rgba(51,65,85,0.5)',
                      border: step.completed ? '3px solid rgba(16,185,129,0.3)' : '3px solid rgba(51,65,85,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.3s',
                    }}>
                      {step.completed && (
                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                    {i < timeline.length - 1 && (
                      <div style={{
                        width: 2, flex: 1, minHeight: 28,
                        background: i <= lastCompleted - 1 ? '#10b981' : 'rgba(51,65,85,0.35)',
                        transition: 'background 0.3s',
                      }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: i < timeline.length - 1 ? 16 : 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: step.completed ? 700 : 500, margin: 0,
                      color: step.completed ? '#e2e8f0' : '#475569',
                    }}>{step.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Items */}
          <div style={{
            background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
            borderRadius: 14, padding: 22,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Items</h3>
            {items?.map(item => (
              <div key={item.sku} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, overflow: 'hidden', background: '#0a0f1a', flexShrink: 0 }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Qty: {item.qty} · {formatINR(item.price)} each</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{formatINR(item.lineTotal)}</span>
              </div>
            ))}
          </div>

          {/* Delivery Details */}
          <div style={{
            background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
            borderRadius: 14, padding: 22,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Delivery Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              {order?.customerName && (
                <div>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Name</p>
                  <p style={{ margin: '2px 0 0', color: '#e2e8f0' }}>{order.customerName}</p>
                </div>
              )}
              {order?.shippingAddress && (
                <div>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Address</p>
                  <p style={{ margin: '2px 0 0', color: '#e2e8f0' }}>{order.shippingAddress}</p>
                </div>
              )}
              {order?.customerPhone && (
                <div>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Phone</p>
                  <p style={{ margin: '2px 0 0', color: '#e2e8f0' }}>{order.customerPhone}</p>
                </div>
              )}
              <div style={{ height: 1, background: 'rgba(51,65,85,0.3)' }} />
              {deliveryFee != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Delivery Fee</span>
                  <span style={{ fontWeight: 600 }}>{formatINR(deliveryFee)}</span>
                </div>
              )}
              {order?.totalAmount && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontWeight: 800, color: '#10b981', fontSize: 16 }}>{formatINR(order.totalAmount)}</span>
                </div>
              )}
              <p style={{ fontSize: 11, color: '#64748b', margin: '8px 0 0' }}>
                Placed on {new Date(order?.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
