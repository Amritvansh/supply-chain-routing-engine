/**
 * HostInventory — Host Inventory Management Dashboard
 *
 * Full inventory control interface for Host administrators.
 * Features:
 *   - Stock overview table grouped by warehouse
 *   - Adjust Stock modal with product/warehouse selectors
 *   - Real-time table refresh after adjustments
 *   - Search and filter by warehouse/product
 *   - Toast notifications for success/error feedback
 *   - Shimmer loading states and animated empty state
 *
 * Uses the enterprise dark-mode design tokens from index.css.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
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
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  btnPrimary: {
    padding: '10px 20px',
    background: 'var(--color-accent-gradient)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.2s',
  },
  btnGhost: {
    padding: '10px 20px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};

/* ── Shimmer row component ───────────────────────────────── */
function ShimmerRows({ count = 6 }) {
  return Array.from({ length: count }, (_, i) => (
    <tr key={i}>
      {[140, 160, 120, 80, 80].map((w, j) => (
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
  const iconMap = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
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
      <span style={{ fontSize: 16, fontWeight: 700 }}>{iconMap[type] || iconMap.info}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16 }}
      >×</button>
    </div>
  );
}

/* ── Stock Level Badge ───────────────────────────────────── */
function StockBadge({ qty }) {
  let bg, color, text;
  if (qty === 0) {
    bg = 'rgba(239,68,68,0.15)'; color = '#f87171'; text = 'Out of Stock';
  } else if (qty <= 10) {
    bg = 'rgba(245,158,11,0.15)'; color = '#fbbf24'; text = 'Low Stock';
  } else {
    bg = 'rgba(16,185,129,0.15)'; color = '#34d399'; text = 'In Stock';
  }

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 20,
        background: bg, color, fontSize: 11, fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {text}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════ */
export default function HostInventory() {
  /* ── State ──────────────────────────────────────────────── */
  const [inventory, setInventory] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Adjust form state
  const [form, setForm] = useState({ sku: '', warehouse_id: '', quantity: '' });

  /* ── Data fetching ──────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [invRes, whRes, prodRes] = await Promise.all([
        api.getInventory(),
        api.getWarehouses(),
        api.getProducts(),
      ]);
      setInventory(invRes.inventory || []);
      setWarehouses(whRes.warehouses || []);
      setProducts(prodRes.products || []);
    } catch (err) {
      setToast({ message: err.message || 'Failed to load inventory data', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Filtered & sorted inventory ────────────────────────── */
  const filtered = useMemo(() => {
    let items = inventory;
    if (warehouseFilter) {
      items = items.filter(i => i.warehouseId === warehouseFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.productName.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.warehouseName.toLowerCase().includes(q)
      );
    }
    return items;
  }, [inventory, warehouseFilter, search]);

  /* ── Summary stats ──────────────────────────────────────── */
  const stats = useMemo(() => {
    const totalItems = inventory.length;
    const totalStock = inventory.reduce((s, i) => s + i.availableQty, 0);
    const totalReserved = inventory.reduce((s, i) => s + i.reservedQty, 0);
    const outOfStock = inventory.filter(i => i.availableQty === 0).length;
    const lowStock = inventory.filter(i => i.availableQty > 0 && i.availableQty <= 10).length;
    return { totalItems, totalStock, totalReserved, outOfStock, lowStock };
  }, [inventory]);

  /* ── Adjust stock handler ───────────────────────────────── */
  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!form.sku || !form.warehouse_id || form.quantity === '') {
      setToast({ message: 'Please fill all fields', type: 'error' });
      return;
    }
    try {
      setSubmitting(true);
      const res = await api.adjustInventory({
        sku: form.sku,
        warehouse_id: form.warehouse_id,
        quantity: parseInt(form.quantity, 10),
      });
      setToast({ message: res.message || 'Stock updated successfully', type: 'success' });
      setShowModal(false);
      setForm({ sku: '', warehouse_id: '', quantity: '' });
      fetchData();
    } catch (err) {
      setToast({ message: err.message || 'Failed to adjust stock', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Quick adjust from table row ────────────────────────── */
  const handleQuickAdjust = (item) => {
    setForm({
      sku: item.sku,
      warehouse_id: item.warehouseId,
      quantity: String(item.availableQty),
    });
    setShowModal(true);
  };

  /* ── Unique warehouse names for filter dropdown ─────────── */
  const uniqueWarehouses = useMemo(() => {
    const map = new Map();
    inventory.forEach(i => map.set(i.warehouseId, i.warehouseName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [inventory]);

  /* ══════════════════════════════════════════════════════════
   *  RENDER
   * ══════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: '32px 36px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'var(--font-sans)' }}>
            Inventory Management
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, fontFamily: 'var(--font-sans)' }}>
            Manage stock levels across all warehouses
          </p>
        </div>
        <button
          style={S.btnPrimary}
          onClick={() => {
            setForm({ sku: '', warehouse_id: '', quantity: '' });
            setShowModal(true);
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,130,246,0.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Adjust Stock
          </span>
        </button>
      </div>

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Entries', value: stats.totalItems, color: '#60a5fa', icon: '📋' },
          { label: 'Total Available', value: stats.totalStock.toLocaleString(), color: '#34d399', icon: '📦' },
          { label: 'Reserved', value: stats.totalReserved.toLocaleString(), color: '#fbbf24', icon: '🔒' },
          { label: 'Low Stock', value: stats.lowStock, color: '#fb923c', icon: '⚠️' },
          { label: 'Out of Stock', value: stats.outOfStock, color: '#f87171', icon: '🚫' },
        ].map(card => (
          <div key={card.label} style={{ ...S.glass, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {card.label}
              </span>
              <span style={{ fontSize: 18 }}>{card.icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color, fontFamily: 'var(--font-sans)' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Search & Filter Bar ────────────────────────────── */}
      <div style={{ ...S.glass, padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--color-text-muted)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Search by product, SKU, or warehouse..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...S.input, paddingLeft: 36 }}
          />
        </div>

        {/* Warehouse filter */}
        <div style={{ position: 'relative', minWidth: 200 }}>
          <select
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            style={S.select}
          >
            <option value="">All Warehouses</option>
            {uniqueWarehouses.map(wh => (
              <option key={wh.id} value={wh.id}>{wh.name}</option>
            ))}
          </select>
          <svg
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--color-text-muted)', pointerEvents: 'none' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>

        {/* Count */}
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* ── Inventory Table ────────────────────────────────── */}
      <div style={{ ...S.glass, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Warehouse', 'Product', 'SKU', 'Available', 'Reserved', 'Status', 'Actions'].map(h => (
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
                  <td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                      No inventory found
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      {search || warehouseFilter ? 'Try adjusting your filters' : 'Add stock using the "Adjust Stock" button above'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Warehouse */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: item.warehouseActive ? '#34d399' : '#6b7280',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                          {item.warehouseName}
                        </span>
                      </div>
                    </td>

                    {/* Product */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {item.productName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {item.productCategory}
                      </div>
                    </td>

                    {/* SKU */}
                    <td style={{ padding: '14px 16px' }}>
                      <code style={{
                        fontSize: 12, padding: '3px 8px', borderRadius: 4,
                        background: 'rgba(99,102,241,0.1)', color: '#818cf8',
                        fontFamily: 'var(--font-mono, monospace)',
                      }}>
                        {item.sku}
                      </code>
                    </td>

                    {/* Available Qty */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: item.availableQty === 0 ? '#f87171' : item.availableQty <= 10 ? '#fbbf24' : '#34d399',
                      }}>
                        {item.availableQty.toLocaleString()}
                      </span>
                    </td>

                    {/* Reserved Qty */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        fontSize: 13, fontVariantNumeric: 'tabular-nums',
                        color: item.reservedQty > 0 ? '#fbbf24' : 'var(--color-text-muted)',
                      }}>
                        {item.reservedQty.toLocaleString()}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 16px' }}>
                      <StockBadge qty={item.availableQty} />
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        onClick={() => handleQuickAdjust(item)}
                        style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 500,
                          background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
                          border: '1px solid rgba(59,130,246,0.2)', borderRadius: 6,
                          cursor: 'pointer', transition: 'all 0.15s',
                          fontFamily: 'var(--font-sans)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)'; }}
                      >
                        ✎ Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
       *  ADJUST STOCK MODAL
       * ══════════════════════════════════════════════════════ */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              ...S.glass, width: '100%', maxWidth: 500, padding: '28px 32px',
              animation: 'fadeInUp 0.3s ease-out',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'var(--font-sans)' }}>
                Adjust Stock
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 22, padding: 4 }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAdjust}>
              {/* Warehouse Selector */}
              <div style={{ marginBottom: 18 }}>
                <label style={S.label}>Warehouse *</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={form.warehouse_id}
                    onChange={e => setForm(f => ({ ...f, warehouse_id: e.target.value }))}
                    style={S.select}
                    required
                  >
                    <option value="">Select a warehouse</option>
                    {warehouses.map(wh => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} {!wh.active ? '(Inactive)' : ''}
                      </option>
                    ))}
                  </select>
                  <svg
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--color-text-muted)', pointerEvents: 'none' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>

              {/* Product Selector */}
              <div style={{ marginBottom: 18 }}>
                <label style={S.label}>Product *</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={form.sku}
                    onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                    style={S.select}
                    required
                  >
                    <option value="">Select a product</option>
                    {products.map(p => (
                      <option key={p.sku} value={p.sku}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                  <svg
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--color-text-muted)', pointerEvents: 'none' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>

              {/* Quantity */}
              <div style={{ marginBottom: 24 }}>
                <label style={S.label}>Available Quantity *</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Enter quantity"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  style={S.input}
                  required
                />
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  This will set the available quantity directly (not add/subtract).
                </p>
              </div>

              {/* Preview */}
              {form.sku && form.warehouse_id && form.quantity !== '' && (
                <div
                  style={{
                    padding: '12px 16px', marginBottom: 20,
                    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                    borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text-secondary)',
                  }}
                >
                  <strong style={{ color: '#60a5fa' }}>Preview:</strong>{' '}
                  Setting{' '}
                  <strong>{products.find(p => p.sku === form.sku)?.name || form.sku}</strong>{' '}
                  at{' '}
                  <strong>{warehouses.find(w => w.id === form.warehouse_id)?.name || form.warehouse_id}</strong>{' '}
                  → <strong>{parseInt(form.quantity, 10).toLocaleString()} units</strong>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" style={S.btnGhost} onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    ...S.btnPrimary,
                    opacity: submitting ? 0.6 : 1,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Saving…' : '✓ Save Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Shimmer keyframe (injected once) ────────────────── */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
