/**
 * HostOrders — Global Order Management Dashboard
 *
 * Shows all orders across the system for Host administrators.
 * Features:
 *   - Tabular list of all orders (newest first)
 *   - Status badges, amount, item count
 *   - Search/filter by order ID, customer, status
 *   - "View Analysis" navigation to deep-dive page
 *   - Summary stat cards
 *   - Shimmer loading + toast notifications
 *
 * Uses the enterprise dark-mode design tokens from index.css.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/apiClient';

/* ── Reusable style objects (design-token aligned) ───────── */
const S = {
  glass: {
    background: 'var(--color-glass)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid var(--color-glass-border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--color-bg-input)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--color-bg-input)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    appearance: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
};

/* ── Shimmer row component ───────────────────────────────── */
function ShimmerRows({ count = 6 }) {
  return Array.from({ length: count }, (_, i) => (
    <tr key={i}>
      {[180, 120, 100, 80, 60, 100].map((w, j) => (
        <td key={j} style={{ padding: '14px 16px' }}>
          <div
            style={{
              width: w, height: 14, borderRadius: 4,
              background: 'linear-gradient(90deg, var(--color-bg-hover) 25%, rgba(51,65,85,0.5) 50%, var(--color-bg-hover) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
        </td>
      ))}
    </tr>
  ));
}

/* ── Toast notification ──────────────────────────────────── */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const bgMap = {
    success: 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(16,185,129,0.1))',
    error: 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(239,68,68,0.1))',
    info: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(59,130,246,0.1))',
  };
  const borderMap = {
    success: 'rgba(16,185,129,0.5)',
    error: 'rgba(239,68,68,0.5)',
    info: 'rgba(59,130,246,0.5)',
  };

  return (
    <div
      style={{
        position: 'fixed', top: 24, right: 24, zIndex: 9999,
        padding: '14px 22px', maxWidth: 420,
        background: bgMap[type] || bgMap.info,
        border: `1px solid ${borderMap[type] || borderMap.info}`,
        borderRadius: 'var(--radius-sm)',
        color: 'var(--color-text-primary)',
        fontSize: 13, fontFamily: 'var(--font-sans)',
        backdropFilter: 'blur(12px)',
        animation: 'fadeInUp 0.3s ease-out',
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16 }}
      >×</button>
    </div>
  );
}

/* ── Status Badge ────────────────────────────────────────── */
function StatusBadge({ status }) {
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
        padding: '4px 10px', borderRadius: 20,
        background: s.bg, color: s.color, fontSize: 11, fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════ */
export default function HostOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /* ── Data fetching ──────────────────────────────────────── */
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getAllOrders();
      setOrders(res.orders || []);
    } catch (err) {
      setToast({ message: err.message || 'Failed to load orders', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  /* ── Filtered orders ────────────────────────────────────── */
  const filtered = useMemo(() => {
    let items = orders;
    if (statusFilter) {
      items = items.filter(o => o.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(o =>
        o.id.toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.shippingAddress || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [orders, statusFilter, search]);

  /* ── Summary stats ──────────────────────────────────────── */
  const stats = useMemo(() => {
    const total = orders.length;
    const routed = orders.filter(o => o.status === 'ROUTED').length;
    const split = orders.filter(o => o.status === 'SPLIT_ROUTED').length;
    const fulfilled = orders.filter(o => o.status === 'FULFILLED').length;
    const revenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    return { total, routed, split, fulfilled, revenue };
  }, [orders]);

  /* ── Unique statuses for filter ─────────────────────────── */
  const uniqueStatuses = useMemo(() => {
    return [...new Set(orders.map(o => o.status))].sort();
  }, [orders]);

  /* ── Format helpers ─────────────────────────────────────── */
  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (amount) => {
    if (amount == null) return '—';
    return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  };

  const shortenId = (id) => id.substring(0, 8) + '…';

  /* ══════════════════════════════════════════════════════════
   *  RENDER
   * ══════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: '32px 36px', maxWidth: 1400, margin: '0 auto' }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'var(--font-sans)' }}>
            All Orders
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, fontFamily: 'var(--font-sans)' }}>
            Global order visibility with routing analysis access
          </p>
        </div>
        <button
          onClick={fetchOrders}
          style={{
            padding: '10px 20px',
            background: 'rgba(59,130,246,0.1)',
            color: '#60a5fa',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13, fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)'; }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Orders', value: stats.total, color: '#60a5fa', icon: '📋' },
          { label: 'Routed', value: stats.routed, color: '#34d399', icon: '✅' },
          { label: 'Split Routed', value: stats.split, color: '#818cf8', icon: '🔀' },
          { label: 'Fulfilled', value: stats.fulfilled, color: '#a78bfa', icon: '📦' },
          { label: 'Total Revenue', value: formatCurrency(stats.revenue), color: '#fbbf24', icon: '💰' },
        ].map(card => (
          <div key={card.label} style={{ ...S.glass, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {card.label}
              </span>
              <span style={{ fontSize: 18 }}>{card.icon}</span>
            </div>
            <div style={{ fontSize: typeof card.value === 'string' ? 20 : 28, fontWeight: 700, color: card.color, fontFamily: 'var(--font-sans)' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Search & Filter Bar ────────────────────────────── */}
      <div style={{ ...S.glass, padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--color-text-muted)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Search by order ID, customer name, or address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...S.input, paddingLeft: 36 }}
          />
        </div>

        <div style={{ position: 'relative', minWidth: 180 }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={S.select}
          >
            <option value="">All Statuses</option>
            {uniqueStatuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <svg
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--color-text-muted)', pointerEvents: 'none' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>

        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {filtered.length} {filtered.length === 1 ? 'order' : 'orders'}
        </span>
      </div>

      {/* ── Orders Table ───────────────────────────────────── */}
      <div style={{ ...S.glass, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Order ID', 'Date', 'Customer', 'Amount', 'Items', 'Shipments', 'Status', 'Actions'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '14px 16px', fontSize: 11, fontWeight: 600,
                      color: 'var(--color-text-muted)', textTransform: 'uppercase',
                      letterSpacing: '0.5px', textAlign: 'left', whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <ShimmerRows />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                      No orders found
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      {search || statusFilter ? 'Try adjusting your filters' : 'Orders will appear here once customers place them'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((order, idx) => (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                      transition: 'background 0.15s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => navigate(`/host/orders/${order.id}`)}
                  >
                    {/* Order ID */}
                    <td style={{ padding: '14px 16px' }}>
                      <code style={{
                        fontSize: 12, padding: '3px 8px', borderRadius: 4,
                        background: 'rgba(99,102,241,0.1)', color: '#818cf8',
                        fontFamily: 'var(--font-mono, monospace)',
                      }}>
                        {shortenId(order.id)}
                      </code>
                    </td>

                    {/* Date */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        {formatDate(order.createdAt)}
                      </span>
                    </td>

                    {/* Customer */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {order.customerName || 'Guest'}
                      </div>
                      {order.pincode && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          PIN: {order.pincode}
                        </div>
                      )}
                    </td>

                    {/* Amount */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        color: order.totalAmount ? '#34d399' : 'var(--color-text-muted)',
                      }}>
                        {formatCurrency(order.totalAmount)}
                      </span>
                    </td>

                    {/* Items */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {order.itemCount}
                      </span>
                    </td>

                    {/* Shipments */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: '50%',
                        background: order.shipmentCount > 1 ? 'rgba(139,92,246,0.1)' : 'rgba(16,185,129,0.1)',
                        color: order.shipmentCount > 1 ? '#a78bfa' : '#34d399',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {order.shipmentCount}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 16px' }}>
                      <StatusBadge status={order.status} />
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/host/orders/${order.id}`); }}
                        style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 500,
                          background: 'var(--color-accent-gradient)', color: '#fff',
                          border: 'none', borderRadius: 6,
                          cursor: 'pointer', transition: 'all 0.15s',
                          fontFamily: 'var(--font-sans)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.3)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                        </svg>
                        View Analysis
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
