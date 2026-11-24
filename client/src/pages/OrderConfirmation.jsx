/**
 * OrderConfirmation — Success page shown after a successful checkout
 * With Instant Customer Tax Invoice Generation & PDF Export
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
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);

  useEffect(() => {
    // Fetch order details
    api.trackOrder(id)
      .then(data => setOrder(data))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Retrieve payment info from local storage
    try {
      const stored = localStorage.getItem(`order_payment_${id}`);
      if (stored) {
        setPaymentInfo(JSON.parse(stored));
      } else {
        setPaymentInfo({
          method: 'COD',
          label: 'Cash on Delivery (COD)',
          status: 'Pending on Delivery',
          txRef: `TXN-${id.slice(0, 8).toUpperCase()}`,
          paidAt: new Date().toISOString(),
        });
      }
    } catch {
      setPaymentInfo({
        method: 'COD',
        label: 'Cash on Delivery (COD)',
        status: 'Pending on Delivery',
        txRef: `TXN-${id.slice(0, 8).toUpperCase()}`,
        paidAt: new Date().toISOString(),
      });
    }
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', fontFamily: 'var(--font-sans)' }}>
        <div className="auth-spinner" />
      </div>
    );
  }

  const itemsSubtotal = order?.items?.reduce((sum, it) => sum + (Number(it.lineTotal) || (it.price * it.qty)), 0) || 0;
  const deliveryCost = order?.deliveryFee != null ? order.deliveryFee : (order?.order?.totalAmount ? (order.order.totalAmount - itemsSubtotal) : 0);
  const totalAmount = order?.order?.totalAmount || itemsSubtotal + deliveryCost;
  const invoiceNumber = `INV-${id.slice(0, 10).toUpperCase()}`;
  const orderDate = order?.order?.createdAt ? new Date(order.order.createdAt) : new Date();

  return (
    <div style={{
      fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', minHeight: '100vh',
      background: 'var(--color-bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px',
    }}>
      <div style={{
        background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)',
        borderRadius: 18, padding: '44px 36px', maxWidth: 580, width: '100%', textAlign: 'center',
        boxShadow: 'var(--shadow-card)',
      }}>
        {/* Animated checkmark */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
          background: 'rgba(16,185,129,0.15)', border: '3px solid var(--color-success)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="var(--color-success)" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>Order Confirmed!</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 20 }}>Your order has been placed successfully</p>

        {/* Order ID & Payment Badge */}
        <div style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 20, textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
        }}>
          <div>
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: '0 0 4px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Order ID</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)', margin: 0, fontFamily: 'monospace' }}>{id}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              display: 'inline-block', fontSize: 11, fontWeight: 700,
              padding: '3px 10px', borderRadius: 20,
              background: paymentInfo?.method === 'COD' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
              color: paymentInfo?.method === 'COD' ? '#f59e0b' : '#10b981',
            }}>
              {paymentInfo?.label || 'Cash on Delivery'}
            </span>
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: '3px 0 0' }}>
              Status: <strong>{paymentInfo?.status || 'Pending on Delivery'}</strong>
            </p>
          </div>
        </div>

        {order && (
          <>
            {/* Fulfillment type badge */}
            {order.order?.fulfillmentType === 'SPLIT_SHIPMENT' && (
              <div style={{
                background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 10, padding: '10px 16px', marginBottom: 20, textAlign: 'center',
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', margin: 0 }}>
                  📦 Your order will arrive in {order.shipments?.length || 2} shipments
                </p>
                <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                  Items are being shipped from different fulfillment hubs for fastest delivery
                </p>
              </div>
            )}

            {/* Shipment breakdown for split orders */}
            {order.shipments?.length > 1 && (
              <div style={{ textAlign: 'left', marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Shipment Details</p>
                {order.shipments.map((sh, i) => (
                  <div key={sh.id || i} style={{
                    background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)',
                    borderRadius: 10, padding: '12px 16px', marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        Shipment {i + 1}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: '#60a5fa',
                        background: 'rgba(59,130,246,0.12)', padding: '2px 8px', borderRadius: 4,
                      }}>
                        🏭 {sh.warehouseName}
                      </span>
                    </div>
                    {sh.items?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {sh.items.map((item, j) => (
                          <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: 'var(--color-text-secondary)' }}>{item.name} × {item.qty}</span>
                            <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{sh.distanceKm?.toFixed(1)}km away</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Single shipment fulfilled message */}
            {order.shipments?.length === 1 && (
              <div style={{
                background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 10, padding: '10px 16px', marginBottom: 20, textAlign: 'center',
              }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)', margin: 0 }}>
                  🏭 Fulfilled directly from {order.shipments[0].warehouseName}
                </p>
              </div>
            )}

            {/* Delivery & Summary details */}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'space-around', marginBottom: 24, flexWrap: 'wrap', background: 'var(--color-surface-chip)', padding: 14, borderRadius: 10, border: '1px solid var(--color-border-subtle)' }}>
              {order.order?.shippingAddress && (
                <div style={{ textAlign: 'left', maxWidth: 220 }}>
                  <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: 0, fontWeight: 700, textTransform: 'uppercase' }}>Delivery Address</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '3px 0 0', lineHeight: 1.3 }}>{order.order.shippingAddress}</p>
                </div>
              )}
              {order.estimatedDays && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: 0, fontWeight: 700, textTransform: 'uppercase' }}>Est. Delivery</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-success)', margin: '3px 0 0' }}>{order.estimatedDays} day{order.estimatedDays > 1 ? 's' : ''}</p>
                </div>
              )}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: 0, fontWeight: 700, textTransform: 'uppercase' }}>Total Amount</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-success)', margin: '3px 0 0' }}>{formatINR(totalAmount)}</p>
              </div>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => setShowInvoiceModal(true)}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white',
              fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 14px rgba(37,99,235,0.25)', transition: 'all 0.15s ease',
            }}
          >
            <span>📄</span>
            <span>View & Download Tax Invoice (PDF)</span>
          </button>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => navigate(`/customer/orders/${id}`)} style={{
              flex: 1, padding: '11px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
              fontSize: 13, fontWeight: 700,
            }}>Track Live Order</button>
            <button onClick={() => navigate('/customer/shop')} style={{
              flex: 1, padding: '11px 20px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600,
            }}>Continue Shopping</button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
       *  CUSTOMER TAX INVOICE MODAL
       * ═══════════════════════════════════════════════════════ */}
      {showInvoiceModal && (
        <div
          id="printable-customer-invoice-modal"
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, overflowY: 'auto',
          }}
          onClick={(e) => { if (e.target.id === 'printable-customer-invoice-modal') setShowInvoiceModal(false); }}
        >
          <div
            className="invoice-paper"
            style={{
              width: '100%', maxWidth: 780, maxHeight: '92vh', overflowY: 'auto',
              background: '#ffffff', color: '#0f172a',
              borderRadius: 14, padding: '36px 40px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
              position: 'relative', fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            }}
          >
            {/* Modal Screen Action Bar */}
            <div className="no-print" style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: '#dcfce7', color: '#15803d',
                  fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                }}>Customer Copy</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>Original Tax Invoice & Payment Receipt</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 18px', borderRadius: 6,
                    background: '#10b981', color: '#ffffff',
                    border: 'none', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 2px 4px rgba(16,185,129,0.2)',
                  }}
                >
                  🖨️ Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  style={{
                    padding: '8px 14px', borderRadius: 6,
                    background: '#f1f5f9', color: '#475569',
                    border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Invoice Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: '#10b981',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#ffffff', fontWeight: 900, fontSize: 16,
                  }}>⚡</div>
                  <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
                    SUPPLY CHAIN STORE
                  </h1>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Intelligent Multi-Echelon E-Commerce Retail
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  GSTIN: <strong>08AAAAA0000A1Z5</strong> • CIN: U72900DL2026PTC108920
                </div>
              </div>

              {/* Barcode Graphic */}
              <div style={{ textAlign: 'right' }}>
                <svg width="150" height="36" viewBox="0 0 150 36" style={{ display: 'block', marginLeft: 'auto' }}>
                  {[
                    0, 4, 7, 12, 16, 19, 24, 28, 33, 37, 42, 45, 51, 56, 61, 65, 70, 75,
                    80, 84, 88, 93, 98, 103, 108, 114, 118, 123, 128, 134, 139, 145
                  ].map((x, i) => (
                    <rect key={i} x={x} y="0" width={i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1} height="30" fill="#0f172a" />
                  ))}
                </svg>
                <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#0f172a', letterSpacing: '1.5px' }}>
                  {invoiceNumber}
                </div>
              </div>
            </div>

            {/* Document Details Strip */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
              padding: '12px 16px', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 24,
            }}>
              <div>
                <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Invoice No.</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                  {invoiceNumber}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Order Date</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                  {orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Payment Mode</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: paymentInfo?.method === 'COD' ? '#d97706' : '#16a34a' }}>
                  {paymentInfo?.label || 'Cash on Delivery'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Payment Status</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: paymentInfo?.method === 'COD' ? '#d97706' : '#16a34a' }}>
                  {paymentInfo?.status || 'Pending on Delivery'}
                </div>
              </div>
            </div>

            {/* Billed To & Shipped To Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', marginBottom: 6 }}>
                  👤 Customer & Delivery Details
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {order.order?.customerName || 'Customer'}
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                  Phone: {order.order?.customerPhone || 'N/A'}
                </div>
                <div style={{ fontSize: 12, color: '#334155', marginTop: 4, lineHeight: 1.4 }}>
                  {order.order?.shippingAddress || 'No address text'}
                </div>
              </div>

              <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', marginBottom: 6 }}>
                  📦 Dispatch & Fulfillment Information
                </div>
                <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>
                  {order.shipments?.length > 1
                    ? `Split Fulfillment (${order.shipments.length} Dedicated Hubs)`
                    : `Direct Fulfillment (${order.shipments?.[0]?.warehouseName || 'Main Hub'})`}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Estimated Delivery: <strong>{order.estimatedDays || 2} business days</strong>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
                  Ref: {paymentInfo?.txRef || `ORD-${id.slice(0, 8)}`}
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div style={{ marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>#</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Item Description</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>SKU</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Qty</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Price</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((it, idx) => (
                    <tr key={it.sku || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '9px 12px', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0f172a' }}>{it.name}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: '#64748b' }}>{it.sku}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600 }}>{it.qty}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#475569' }}>{formatINR(it.price || (it.lineTotal / it.qty))}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{formatINR(it.lineTotal || (it.price * it.qty))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Calculations Breakdown */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
              <div style={{ width: 280, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 6 }}>
                  <span>Items Subtotal:</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatINR(itemsSubtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 6 }}>
                  <span>Delivery & Handling:</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatINR(deliveryCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #cbd5e1' }}>
                  <span>GST (18% Incl.):</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatINR(totalAmount * 0.18 / 1.18)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                  <span>Grand Total:</span>
                  <span style={{ color: '#16a34a' }}>{formatINR(totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div style={{
              borderTop: '1px solid #e2e8f0', paddingTop: 16, textAlign: 'center', fontSize: 11, color: '#64748b',
            }}>
              <p style={{ margin: 0 }}>This is a computer-generated tax invoice and requires no physical signature.</p>
              <p style={{ margin: '4px 0 0' }}>Thank you for shopping with Supply Chain Store! For support, email help@supplychainstore.com</p>
            </div>

            {/* Print CSS */}
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-customer-invoice-modal, #printable-customer-invoice-modal * {
                  visibility: visible !important;
                }
                #printable-customer-invoice-modal {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  background: #ffffff !important;
                  color: #0f172a !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  z-index: 999999 !important;
                }
                .invoice-paper {
                  max-height: none !important;
                  box-shadow: none !important;
                  border: none !important;
                  padding: 20px 24px !important;
                  width: 100% !important;
                  max-width: 100% !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16,185,129,0.3); }
          50% { transform: scale(1.05); box-shadow: 0 0 20px 4px rgba(16,185,129,0.15); }
        }
      `}</style>
    </div>
  );
}
