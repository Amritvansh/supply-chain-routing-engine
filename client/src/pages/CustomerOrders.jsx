/**
 * CustomerOrders — My Orders list view with Cancel Order and Return / Refund features
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/apiClient';

function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const STATUS_COLORS = {
  PENDING: { bg: 'rgba(234,179,8,0.12)', color: '#facc15', label: 'Pending' },
  ROUTED: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', label: 'Processing' },
  SPLIT_ROUTED: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', label: 'Processing' },
  MULTI_WAREHOUSE_SPLIT: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', label: 'Processing' },
  FULFILLED: { bg: 'rgba(16,185,129,0.12)', color: '#34d399', label: 'Delivered' },
  DELIVERED: { bg: 'rgba(16,185,129,0.12)', color: '#34d399', label: 'Delivered' },
  CANCELLED: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', label: 'Cancelled' },
  RETURN_REQUESTED: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', label: 'Return Requested' },
};

const CANCEL_REASONS = [
  'Ordered by mistake',
  'Found lower price elsewhere',
  'Delivery time is too long',
  'Need to change shipping address',
  'Changed mind / no longer needed',
  'Other reason',
];

const RETURN_REASONS = [
  'Item defective or not working properly',
  'Received wrong item or size',
  'Quality not as expected',
  'Missing parts or accessories',
  'Package arrived damaged',
  'Other reason',
];

export default function CustomerOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState(null); // { type: 'cancel' | 'return', order: Object }
  const [selectedReason, setSelectedReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('Original Payment Method');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = () => {
    api.getMyOrders()
      .then(data => setOrders(data.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpenCancel = (e, order) => {
    e.stopPropagation();
    setSelectedReason(CANCEL_REASONS[0]);
    setActiveModal({ type: 'cancel', order });
  };

  const handleOpenReturn = (e, order) => {
    e.stopPropagation();
    setSelectedReason(RETURN_REASONS[0]);
    setRefundMethod('Original Payment Method');
    setActiveModal({ type: 'return', order });
  };

  const handleConfirmCancel = async () => {
    if (!activeModal?.order) return;
    setSubmitting(true);
    try {
      await api.cancelOrder(activeModal.order.id, selectedReason);
      setOrders(prev => prev.map(o => o.id === activeModal.order.id ? { ...o, status: 'CANCELLED' } : o));
      showToast('Order cancelled successfully. Refund initiated.');
      setActiveModal(null);
    } catch (err) {
      showToast(err.message || 'Failed to cancel order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (!activeModal?.order) return;
    setSubmitting(true);
    try {
      await api.returnOrder(activeModal.order.id, selectedReason, refundMethod);
      setOrders(prev => prev.map(o => o.id === activeModal.order.id ? { ...o, status: 'RETURN_REQUESTED' } : o));
      showToast('Return request submitted. Pickup scheduled within 2 business days.');
      setActiveModal(null);
    } catch (err) {
      showToast(err.message || 'Failed to submit return request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', fontFamily: 'var(--font-sans)' }}>
        <div className="auth-spinner" />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', minHeight: '100vh', background: 'var(--color-bg-primary)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        {/* Toast Alert */}
        {toast && (
          <div style={{
            position: 'fixed', top: 24, right: 24, zIndex: 9999,
            padding: '12px 20px', borderRadius: 10,
            background: toast.type === 'error' ? '#ef4444' : '#10b981',
            color: '#ffffff', fontSize: 13, fontWeight: 700,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span>{toast.type === 'error' ? '⚠️' : '✓'}</span>
            <span>{toast.message}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>My Orders</h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Track, manage, or request returns for all your purchases</p>
          </div>
          <button
            onClick={() => navigate('/customer/shop')}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-glass-border)',
              background: 'var(--color-glass)', color: 'var(--color-text-primary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            ← Continue Shopping
          </button>
        </div>

        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)', borderRadius: 14 }}>
            <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>📦</span>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text-primary)' }}>No orders yet</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>Your order history will appear here once you make a purchase.</p>
            <button onClick={() => navigate('/customer/shop')} style={{
              padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
              fontSize: 13, fontWeight: 700,
            }}>Start Shopping</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {orders.map(order => {
              const st = STATUS_COLORS[order.status] || { bg: 'rgba(100,116,139,0.12)', color: 'var(--color-text-muted)', label: order.status };
              const canCancel = !['DELIVERED', 'FULFILLED', 'CANCELLED', 'RETURN_REQUESTED'].includes(order.status);
              const canReturn = ['DELIVERED', 'FULFILLED'].includes(order.status);

              return (
                <div
                  key={order.id}
                  onClick={() => navigate(`/customer/orders/${order.id}`)}
                  style={{
                    background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)',
                    borderRadius: 14, padding: '20px 24px', cursor: 'pointer',
                    transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>#{order.id.slice(0, 8)}...</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                          background: st.bg, color: st.color,
                        }}>{st.label}</span>
                      </div>
                      <p style={{ fontSize: 15, fontWeight: 700, margin: '6px 0 0', color: 'var(--color-text-primary)' }}>
                        {order.customerName || 'Customer Order'}
                      </p>
                    </div>

                    {/* Contextual Action Button */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {canCancel && (
                        <button
                          onClick={(e) => handleOpenCancel(e, order)}
                          style={{
                            padding: '6px 14px', borderRadius: 7,
                            border: '1px solid rgba(239,68,68,0.3)',
                            background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.18)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                        >
                          ✕ Cancel Order
                        </button>
                      )}

                      {canReturn && (
                        <button
                          onClick={(e) => handleOpenReturn(e, order)}
                          style={{
                            padding: '6px 14px', borderRadius: 7,
                            border: '1px solid rgba(245,158,11,0.35)',
                            background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.18)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
                        >
                          🔄 Return / Refund
                        </button>
                      )}

                      {order.status === 'CANCELLED' && (
                        <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600, background: 'rgba(239,68,68,0.08)', padding: '4px 10px', borderRadius: 6 }}>
                          ✓ Refund Processed
                        </span>
                      )}

                      {order.status === 'RETURN_REQUESTED' && (
                        <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600, background: 'rgba(245,158,11,0.08)', padding: '4px 10px', borderRadius: 6 }}>
                          📦 Pickup Scheduled
                        </span>
                      )}

                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>→</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--color-text-secondary)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>📦 {order.itemCount} item{order.itemCount > 1 ? 's' : ''}</span>
                    {order.totalAmount && <span style={{ fontWeight: 800, color: 'var(--color-success)' }}>{formatINR(order.totalAmount)}</span>}
                    <span>📅 {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>

                  {order.shippingAddress && (
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 10, marginBottom: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📍 {order.shippingAddress}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Cancel Order Modal ───────────────────────────────── */}
        {activeModal?.type === 'cancel' && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div style={{
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 16, maxWidth: 480, width: '100%', padding: '24px 28px',
              boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 22, background: 'rgba(239,68,68,0.12)', padding: '8px 10px', borderRadius: 10 }}>🛑</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>Cancel Order</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>#{activeModal.order.id.slice(0, 12)}</p>
                </div>
              </div>

              <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 10, padding: '12px 14px', marginBottom: 18, fontSize: 12, color: '#f87171',
                lineHeight: 1.5,
              }}>
                <strong>Warning:</strong> Cancelling will instantly stop shipment dispatch and release reserved warehouse inventory. Any prepaid amount will be refunded to your original payment method.
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                Reason for cancellation:
              </label>
              <select
                value={selectedReason}
                onChange={e => setSelectedReason(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--color-bg-primary)', border: '1px solid var(--color-glass-border)',
                  color: 'var(--color-text-primary)', fontSize: 13, marginBottom: 20,
                  outline: 'none', cursor: 'pointer',
                }}
              >
                {CANCEL_REASONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={submitting}
                  style={{
                    padding: '9px 16px', borderRadius: 8, border: '1px solid var(--color-glass-border)',
                    background: 'transparent', color: 'var(--color-text-secondary)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Keep Order
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={submitting}
                  style={{
                    padding: '9px 20px', borderRadius: 8, border: 'none',
                    background: '#ef4444', color: '#ffffff',
                    fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Return / Refund Modal ────────────────────────────── */}
        {activeModal?.type === 'return' && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div style={{
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 16, maxWidth: 500, width: '100%', padding: '24px 28px',
              boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 22, background: 'rgba(245,158,11,0.12)', padding: '8px 10px', borderRadius: 10 }}>🔄</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>Request Return & Refund</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>#{activeModal.order.id.slice(0, 12)}</p>
                </div>
              </div>

              <div style={{
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 10, padding: '12px 14px', marginBottom: 18, fontSize: 12, color: '#fbbf24',
                lineHeight: 1.5,
              }}>
                Doorstep reverse pickup will be scheduled within 2 business days. Please keep the item packed with all original tags and accessories.
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  Reason for return:
                </label>
                <select
                  value={selectedReason}
                  onChange={e => setSelectedReason(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    background: 'var(--color-bg-primary)', border: '1px solid var(--color-glass-border)',
                    color: 'var(--color-text-primary)', fontSize: 13,
                    outline: 'none', cursor: 'pointer',
                  }}
                >
                  {RETURN_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  Refund mode:
                </label>
                <select
                  value={refundMethod}
                  onChange={e => setRefundMethod(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    background: 'var(--color-bg-primary)', border: '1px solid var(--color-glass-border)',
                    color: 'var(--color-text-primary)', fontSize: 13,
                    outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="Original Payment Method">Original Payment Source (Bank / Card / UPI)</option>
                  <option value="Store Credit">Store Credit / Wallet (Instant credit)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={submitting}
                  style={{
                    padding: '9px 16px', borderRadius: 8, border: '1px solid var(--color-glass-border)',
                    background: 'transparent', color: 'var(--color-text-secondary)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReturn}
                  disabled={submitting}
                  style={{
                    padding: '9px 20px', borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#ffffff',
                    fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Submitting...' : 'Submit Return Request'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
