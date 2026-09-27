/**
 * HostOrderDetails — Deep Algorithm Analysis Dashboard
 *
 * Surfaces the complete routing engine logic for a single order:
 *   Section 1: Order Summary
 *   Section 2: 5-Step Algorithm Analysis (visual step-by-step)
 *   Section 3: Shipment Details
 *   Section 4: AI Explainability Widget
 *
 * Uses the enterprise dark-mode design tokens from index.css.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../lib/apiClient';
import AIExplanationWidget from '../components/AIExplanationWidget';

/* ── Reusable style objects ──────────────────────────────── */
const S = {
  glass: {
    background: 'var(--color-glass)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid var(--color-glass-border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
  },
};

/* ── Status Badge ────────────────────────────────────────── */
function StatusBadge({ status, large }) {
  const map = {
    ROUTED: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', label: 'Routed' },
    SPLIT_ROUTED: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', label: 'Split Routed' },
    PENDING: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', label: 'Pending' },
    FULFILLED: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', label: 'Fulfilled' },
    FAILED: { bg: 'rgba(239,68,68,0.15)', color: '#f87171', label: 'Failed' },
  };
  const s = map[status] || { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', label: status };

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: large ? '6px 16px' : '4px 10px', borderRadius: 20,
        background: s.bg, color: s.color,
        fontSize: large ? 13 : 11, fontWeight: 600,
      }}
    >
      <span style={{ width: large ? 8 : 6, height: large ? 8 : 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
}

/* ── Step icon colors ────────────────────────────────────── */
const STEP_COLORS = [
  { accent: '#60a5fa', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)' },
  { accent: '#34d399', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)' },
  { accent: '#fbbf24', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  { accent: '#a78bfa', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.25)' },
  { accent: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.25)' },
];

const STEP_ICONS = ['🌍', '📦', '💰', '🔀', '📐'];

/* ── Loading shimmer ─────────────────────────────────────── */
function LoadingState() {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200, margin: '0 auto' }}>
      {[300, 500, 400, 350].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 80 : 200, marginBottom: 24,
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(90deg, var(--color-bg-hover) 25%, rgba(51,65,85,0.5) 50%, var(--color-bg-hover) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      ))}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════ */
export default function HostOrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── Fetch order detail ─────────────────────────────────── */
  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getHostOrderDetail(id);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load order detail');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  /* ── Format helpers ─────────────────────────────────────── */
  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatCurrency = (amount) => {
    if (amount == null) return '—';
    return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  };

  /* ── Render states ──────────────────────────────────────── */
  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div style={{ padding: '32px 36px', maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
          Error Loading Order
        </h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 24 }}>{error}</p>
        <button
          onClick={() => navigate('/host/orders')}
          style={{
            padding: '10px 24px', background: 'var(--color-accent-gradient)',
            color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ← Back to Orders
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { order, items, shipments, routingAnalysis, aiExplanation } = data;

  /* ══════════════════════════════════════════════════════════
   *  RENDER
   * ══════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Back Navigation ────────────────────────────────── */}
      <button
        onClick={() => navigate('/host/orders')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', color: 'var(--color-text-muted)',
          fontSize: 13, cursor: 'pointer', marginBottom: 20,
          fontFamily: 'var(--font-sans)', padding: 0,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#60a5fa'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to All Orders
      </button>

      {/* ═══════════════════════════════════════════════════════
       *  SECTION 1: ORDER SUMMARY
       * ═══════════════════════════════════════════════════════ */}
      <div style={{ ...S.glass, padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'var(--font-sans)' }}>
                Order Analysis
              </h1>
              <StatusBadge status={order.status} large />
            </div>
            <code style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 4,
              background: 'rgba(99,102,241,0.1)', color: '#818cf8',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              {order.id}
            </code>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-sans)' }}>
              {formatCurrency(order.totalAmount)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {formatDate(order.createdAt)}
            </div>
          </div>
        </div>

        {/* Order meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--color-border)' }}>
          {[
            { label: 'Customer', value: order.customerName || 'Guest' },
            { label: 'Phone', value: order.customerPhone || '—' },
            { label: 'Address', value: order.shippingAddress || '—' },
            { label: 'PIN Code', value: order.pincode || '—' },
            { label: 'Location', value: `${order.customerLat?.toFixed(4)}, ${order.customerLng?.toFixed(4)}` },
            { label: 'Items', value: `${items.length} product${items.length !== 1 ? 's' : ''}` },
          ].map(m => (
            <div key={m.label}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, wordBreak: 'break-word' }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Order Items Table ──────────────────────────────── */}
      <div style={{ ...S.glass, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'var(--font-sans)' }}>
            📦 Order Items
          </h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Product', 'SKU', 'Category', 'Qty', 'Unit Price', 'Weight', 'Dimensions', 'Line Total'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.itemId} style={{ borderBottom: idx < items.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.productName}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <code style={{ fontSize: 11, padding: '2px 6px', borderRadius: 3, background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                      {item.sku}
                    </code>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-muted)' }}>{item.category}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.qty}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatCurrency(item.price)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-muted)' }}>{item.weightKg} kg</td>
                  <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {item.dimensions.lengthCm}×{item.dimensions.widthCm}×{item.dimensions.heightCm} cm
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#34d399' }}>{formatCurrency(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
       *  SECTION 2: 5-STEP ALGORITHM ANALYSIS
       * ═══════════════════════════════════════════════════════ */}
      <div style={{ ...S.glass, padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'var(--font-sans)' }}>
            🧬 Algorithm Analysis
          </h2>
          <span style={{
            padding: '3px 10px', borderRadius: 20,
            background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
            fontSize: 11, fontWeight: 600,
          }}>
            5-Step Routing Engine
          </span>
        </div>

        {/* Summary bar */}
        {routingAnalysis?.summary && (
          <div style={{
            display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24, padding: '14px 20px',
            background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)',
            borderRadius: 'var(--radius-sm)',
          }}>
            {[
              { label: 'Total Shipments', value: routingAnalysis.summary.totalShipments },
              { label: 'Total Items', value: routingAnalysis.summary.totalItems },
              { label: 'Delivery Cost', value: formatCurrency(routingAnalysis.summary.totalDeliveryCost) },
              { label: 'Split Shipment', value: routingAnalysis.summary.isSplitShipment ? 'Yes' : 'No' },
            ].map(item => (
              <div key={item.label} style={{ flex: '0 0 auto' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#60a5fa', marginTop: 2 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {routingAnalysis?.steps?.map((step, idx) => {
            const colors = STEP_COLORS[idx] || STEP_COLORS[0];
            const icon = STEP_ICONS[idx] || '⚙';

            return (
              <div
                key={step.step}
                style={{
                  padding: '20px 24px',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 'var(--radius-sm)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Step number badge */}
                <div style={{
                  position: 'absolute', top: 16, right: 20,
                  width: 32, height: 32, borderRadius: '50%',
                  background: colors.border,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800, color: colors.accent,
                }}>
                  {step.step}
                </div>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 22 }}>{icon}</span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: colors.accent, margin: 0, fontFamily: 'var(--font-sans)' }}>
                    {step.title}
                  </h3>
                </div>

                {/* Description */}
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 14px', lineHeight: 1.5, maxWidth: '90%' }}>
                  {step.description}
                </p>

                {/* Step-specific data */}
                {renderStepData(step, colors, formatCurrency)}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
       *  SECTION 3: SHIPMENT DETAILS
       * ═══════════════════════════════════════════════════════ */}
      <div style={{ ...S.glass, padding: '24px 28px', marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 16px', fontFamily: 'var(--font-sans)' }}>
          🚚 Shipment Details
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {shipments.map((sh, idx) => (
            <div
              key={sh.shipmentId}
              style={{
                padding: '18px 20px',
                background: 'rgba(30,41,59,0.5)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Shipment #{idx + 1}
                </span>
                <span style={{
                  padding: '3px 10px', borderRadius: 20,
                  background: sh.boxSize === 'SMALL' ? 'rgba(16,185,129,0.15)' : sh.boxSize === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                  color: sh.boxSize === 'SMALL' ? '#34d399' : sh.boxSize === 'MEDIUM' ? '#fbbf24' : '#f87171',
                  fontSize: 11, fontWeight: 600,
                }}>
                  📦 {sh.boxSize}
                </span>
              </div>

              {[
                { label: 'Warehouse', value: sh.warehouseName },
                { label: 'Location', value: `${sh.warehouseLat.toFixed(4)}, ${sh.warehouseLng.toFixed(4)}` },
                { label: 'Distance', value: `${sh.distanceKm.toFixed(1)} km` },
                { label: 'Shipping Cost', value: formatCurrency(sh.totalCost) },
                { label: 'Shipped At', value: formatDate(sh.shippedAt) },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{row.value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
       *  SECTION 4: AI EXPLAINABILITY
       * ═══════════════════════════════════════════════════════ */}
      <div style={{ ...S.glass, padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'var(--font-sans)' }}>
            ✦ AI Explainability
          </h2>
          {aiExplanation?.available && (
            <span style={{
              padding: '3px 10px', borderRadius: 20,
              background: 'var(--color-accent-glow, rgba(59,130,246,0.15))',
              color: '#60a5fa', fontSize: 10, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              {aiExplanation.source === 'gemini' ? '✦ AI Generated' : '⚙ Computed'}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Natural language explanation of the routing decision, generated by the AI explainability layer.
        </p>
        <AIExplanationWidget orderId={id} autoFetch />
      </div>

      {/* ── Animations ──────────────────────────────────────── */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/**
 * Render step-specific detailed data tables/lists.
 */
function renderStepData(step, colors, formatCurrency) {
  switch (step.step) {
    case 1: // Geo-Distance Sorting
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {step.warehouseDistances?.map((wh, i) => (
            <div key={i} style={{
              padding: '8px 14px', borderRadius: 8,
              background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(148,163,184,0.1)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.accent }}>{wh.warehouseName}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>•</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {wh.distanceKm.toFixed(1)} km
              </span>
            </div>
          ))}
          {step.customerLocation && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
              📍 Customer: {step.customerLocation.lat.toFixed(4)}, {step.customerLocation.lng.toFixed(4)}
            </div>
          )}
        </div>
      );

    case 2: // Inventory Availability
      return (
        <div>
          <div style={{
            padding: '10px 14px', borderRadius: 6,
            background: 'rgba(0,0,0,0.2)', fontSize: 12, color: 'var(--color-text-secondary)',
            marginBottom: 10, lineHeight: 1.5,
          }}>
            {step.result}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {step.itemsRequested?.map((item, i) => (
              <div key={i} style={{
                padding: '6px 12px', borderRadius: 6,
                background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(148,163,184,0.08)',
                fontSize: 11, color: 'var(--color-text-primary)',
              }}>
                <strong>{item.productName}</strong>
                <span style={{ color: 'var(--color-text-muted)', marginLeft: 6 }}>×{item.qtyRequested}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case 3: // Fulfillment Cost
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Warehouse', 'Distance Cost', 'Packaging', 'Box Size', 'Total Cost'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {step.shipmentCosts?.map((cost, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px 12px', fontWeight: 500, color: colors.accent }}>{cost.warehouseName}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(cost.distanceCost)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(cost.packagingCost)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 10,
                      background: cost.boxSize === 'SMALL' ? 'rgba(16,185,129,0.15)' : cost.boxSize === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                      color: cost.boxSize === 'SMALL' ? '#34d399' : cost.boxSize === 'MEDIUM' ? '#fbbf24' : '#f87171',
                      fontSize: 10, fontWeight: 600,
                    }}>
                      {cost.boxSize}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(cost.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 4: // Split Shipment
      return (
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 20,
            background: step.isSplit ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.15)',
            color: step.isSplit ? '#a78bfa' : '#34d399',
            fontSize: 12, fontWeight: 600, marginBottom: 12,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: step.isSplit ? '#a78bfa' : '#34d399' }} />
            {step.isSplit ? 'Split Shipment' : 'Single Fulfillment'}
          </div>
          {step.shipmentGroups?.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {step.shipmentGroups.map((g, i) => (
                <div key={i} style={{
                  padding: '8px 14px', borderRadius: 8,
                  background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(148,163,184,0.1)',
                  fontSize: 12, color: 'var(--color-text-primary)',
                }}>
                  <strong style={{ color: colors.accent }}>Group {g.group}:</strong> {g.warehouseName}
                </div>
              ))}
            </div>
          )}
        </div>
      );

    case 5: // Bin Packing
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', fontSize: 12 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Total Weight: </span>
            <strong style={{ color: colors.accent }}>{step.totalWeightKg} kg</strong>
          </div>
          <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', fontSize: 12 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Total Volume: </span>
            <strong style={{ color: colors.accent }}>{step.totalVolumeCm3?.toLocaleString()} cm³</strong>
          </div>
          {step.boxesUsed?.map((box, i) => (
            <div key={i} style={{
              padding: '8px 14px', borderRadius: 8,
              background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(148,163,184,0.1)',
              fontSize: 12,
            }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{box.warehouseName}: </span>
              <span style={{
                padding: '2px 8px', borderRadius: 10,
                background: box.boxSize === 'SMALL' ? 'rgba(16,185,129,0.15)' : box.boxSize === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                color: box.boxSize === 'SMALL' ? '#34d399' : box.boxSize === 'MEDIUM' ? '#fbbf24' : '#f87171',
                fontSize: 10, fontWeight: 600,
              }}>
                📐 {box.boxSize}
              </span>
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
}
