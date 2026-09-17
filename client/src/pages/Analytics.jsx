/**
 * Analytics — Professional Enterprise Analytics Dashboard
 *
 * All charts driven by real API data — no fabricated statistics.
 *
 * Sections:
 *   1. KPI Summary Row — Total Orders, Avg Cost, Warehouses, Low-Stock
 *   2. Orders Fulfilled per Warehouse — BarChart
 *   3. Average Routing Cost Over Time — LineChart
 *   4. Warehouse Inventory Health — Horizontal stacked BarChart
 *   5. Flash-Sale Stress Test — Controls + live results
 *   6. AI Explanation Source Breakdown — Donut + legend
 *   7. Routing Cost Distribution by Warehouse — Stat cards
 *
 * Data sources:
 *   - GET /api/v1/dashboard/map-data  → routes
 *   - GET /api/v1/orders/:id/explain  → AI source field
 *   - POST /api/v1/orders/flash-test  → stress-test metrics
 *   - GET /api/v1/warehouses          → inventory health
 */
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import * as api from '../lib/apiClient';

/* ── Theme constants ──────────────────────────────────────── */
const C = {
  accent: '#818cf8', accentSoft: '#6366f1',
  success: '#34d399', warning: '#fbbf24', danger: '#f87171',
  pink: '#f472b6', purple: '#a78bfa', orange: '#fb923c',
  muted: '#64748b', secondary: '#94a3b8', primary: '#e2e8f0',
  grid: 'rgba(51,65,85,0.25)', cursor: 'rgba(129,140,248,0.04)',
};
const WH_COLORS = [C.accent, C.success, C.pink, C.warning, C.purple, C.orange, C.danger, C.accentSoft];
const LOW_STOCK = 5;

/* ── SVG Icons ────────────────────────────────────────────── */
const Icon = ({ d, ...p }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);

const OrdersIcon = () => <Icon d={<><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>} />;
const CostIcon = () => <Icon d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />;
const WarehouseIcon = () => <Icon d={<><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21V13h6v8" /><path d="M1 21h22" /></>} />;
const AlertIcon = () => <Icon d={<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>} />;

/* ── KPI Card ─────────────────────────────────────────────── */
function KpiCard({ icon, label, value, sub, color, loading }) {
  return (
    <div className="kpi-card" style={{ '--kpi-accent': color }}>
      <div className="flex items-center gap-3">
        <div className="kpi-card__icon" style={{ background: `${color}12`, color }}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="kpi-card__label">{label}</p>
          {loading ? (
            <div className="animate-shimmer" style={{ width: 56, height: 22, borderRadius: 4, marginTop: 4 }} />
          ) : (
            <>
              <p className="kpi-card__value">{value}</p>
              {sub && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-tight">{sub}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Recharts Tooltip ─────────────────────────────────────── */
function Tip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="recharts-custom-tooltip">
      {label && <p className="recharts-custom-tooltip__label">{label}</p>}
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color || C.accent, fontSize: 12, marginTop: 2 }}>
          {e.name}: {fmt ? fmt(e.value) : e.value}
        </p>
      ))}
    </div>
  );
}

/* ── Section Card ─────────────────────────────────────────── */
function Section({ icon, title, desc, children, loading, error, errorMsg, onRetry, empty, emptyMsg }) {
  return (
    <div className="glass-card" style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div className="section-header-accent" style={{ marginBottom: 16 }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 15 }}>{icon}</span>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {title}
          </h3>
        </div>
        {desc && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{desc}</p>}
      </div>

      {/* States */}
      {loading ? (
        <div className="animate-shimmer" style={{ height: 240, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)' }} role="status" />
      ) : error ? (
        <div style={{ height: 200, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-danger)', background: 'var(--color-danger-glow)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }} role="alert">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
          <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{errorMsg || 'Failed to load data'}</p>
          {onRetry && <button onClick={onRetry} className="btn-ghost" style={{ color: 'var(--color-danger)', fontSize: 11 }}>Retry</button>}
        </div>
      ) : empty ? (
        <div style={{ height: 200, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>{emptyMsg || 'No data yet. Place orders to populate.'}</p>
        </div>
      ) : children}
    </div>
  );
}

/* ── Flash Stat Block ─────────────────────────────────────── */
function Stat({ label, value, unit, color = C.accent }) {
  return (
    <div className="stat-card" style={{ textAlign: 'center', padding: '10px 6px' }}>
      <p style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 2, fontWeight: 500 }}>{unit}</span>}
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function Analytics() {
  const [mapData, setMapData] = useState(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState(null);

  const [warehouseData, setWarehouseData] = useState(null);
  const [whLoading, setWhLoading] = useState(true);
  const [whError, setWhError] = useState(null);

  const [aiSources, setAiSources] = useState(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState(null);

  const [skus, setSkus] = useState([]);
  const [flashSku, setFlashSku] = useState('');
  const [flashQty, setFlashQty] = useState(1);
  const [flashConc, setFlashConc] = useState(10);
  const [flashState, setFlashState] = useState('idle');
  const [flashResult, setFlashResult] = useState(null);
  const [flashError, setFlashError] = useState(null);

  /* ── Fetchers ─────────────────────────────────────────── */
  const fetchMap = useCallback(async () => {
    setMapLoading(true); setMapError(null);
    try { setMapData(await api.getMapData()); }
    catch (e) { setMapError(e.message || 'Failed to load data'); }
    finally { setMapLoading(false); }
  }, []);

  const fetchWh = useCallback(async () => {
    setWhLoading(true); setWhError(null);
    try {
      const d = await api.getWarehouses();
      const wh = d.warehouses || [];
      setWarehouseData(wh);
      const m = new Map();
      wh.forEach(w => (w.inventory || []).forEach(i => { if (!m.has(i.sku)) m.set(i.sku, { sku: i.sku, name: i.name || i.sku }); }));
      setSkus([...m.values()]);
    }
    catch (e) { setWhError(e.message || 'Failed to load warehouses'); }
    finally { setWhLoading(false); }
  }, []);

  const fetchAi = useCallback(async () => {
    setAiLoading(true); setAiError(null);
    try {
      const d = await api.getMapData();
      const routes = d.routes || [];
      if (!routes.length) { setAiSources({ gemini: 0, fallback: 0, total: 0 }); setAiLoading(false); return; }
      const res = await Promise.allSettled(routes.slice(0, 20).map(r => api.getExplanation(r.orderId)));
      let g = 0, f = 0;
      for (const r of res) {
        if (r.status !== 'fulfilled') continue;
        const v = r.value;
        if (v.multiShipment && v.explanations) v.explanations.forEach(e => e.source === 'gemini' ? g++ : f++);
        else if (v.source) v.source === 'gemini' ? g++ : f++;
      }
      setAiSources({ gemini: g, fallback: f, total: g + f });
    }
    catch (e) { setAiError(e.message || 'Failed to load AI data'); }
    finally { setAiLoading(false); }
  }, []);

  useEffect(() => { fetchMap(); fetchWh(); fetchAi(); }, [fetchMap, fetchWh, fetchAi]);

  /* ── Flash test ───────────────────────────────────────── */
  const runFlash = async () => {
    if (!flashSku) { setFlashError({ message: 'Select a SKU' }); setFlashState('error'); return; }
    setFlashState('loading'); setFlashError(null); setFlashResult(null);
    try { setFlashResult(await api.triggerFlashTest({ sku: flashSku, qty: parseInt(flashQty, 10) || 1, concurrency: parseInt(flashConc, 10) || 10 })); setFlashState('success'); }
    catch (e) { setFlashError(e); setFlashState('error'); }
  };

  /* ── Derived data ─────────────────────────────────────── */
  const routes = mapData?.routes || [];
  const totalOrders = routes.length;
  const splitOrders = routes.filter(r => (r.shipments || []).length > 1).length;

  const avgCost = (() => {
    if (!routes.length) return 0;
    return routes.reduce((s, r) => s + (r.shipments || []).reduce((a, sh) => a + parseFloat(sh.totalCost || 0), 0), 0) / routes.length;
  })();

  const activeWh = (warehouseData || []).filter(w => w.active).length;
  const lowStockWh = (warehouseData || []).filter(w => {
    if (!w.inventory?.length) return true;
    return w.inventory.some(i => i.availableQty <= LOW_STOCK);
  }).length;

  // Bar chart: orders per warehouse
  const whOrders = (() => {
    const m = {};
    routes.forEach(r => (r.shipments || []).forEach(s => { const n = s.warehouseName || 'Unknown'; m[n] = (m[n] || 0) + 1; }));
    return Object.entries(m).map(([name, orders]) => ({ name, orders })).sort((a, b) => b.orders - a.orders);
  })();

  // Line chart: cost over time
  const costTime = (() => {
    const m = {};
    routes.forEach(r => {
      const d = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Unknown';
      const c = (r.shipments || []).reduce((s, sh) => s + parseFloat(sh.totalCost || 0), 0);
      if (!m[d]) m[d] = { date: d, sum: 0, n: 0 };
      m[d].sum += c; m[d].n++;
    });
    return Object.values(m).map(d => ({ date: d.date, avgCost: +(d.sum / d.n).toFixed(2), orders: d.n }));
  })();

  // Horizontal bar: warehouse health
  const whHealth = (warehouseData || []).map(w => ({
    name: w.name,
    available: (w.inventory || []).reduce((s, i) => s + (i.availableQty || 0), 0),
    reserved: (w.inventory || []).reduce((s, i) => s + (i.reservedQty || 0), 0),
    lowSkus: (w.inventory || []).filter(i => i.availableQty <= LOW_STOCK).length,
    skuCount: (w.inventory || []).length,
  })).sort((a, b) => b.available - a.available);

  // AI pie
  const aiPie = aiSources?.total > 0 ? [
    { name: 'Gemini AI', value: aiSources.gemini, color: C.accent },
    { name: 'Fallback', value: aiSources.fallback, color: C.muted },
  ] : [];

  // Flash result bar helper
  const flashBar = (fr) => {
    const t = (fr.successCount || 0) + (fr.rateLimited429Count || 0) + (fr.conflict409Count || 0);
    if (t === 0) return null;
    return { total: t, sp: (fr.successCount / t * 100), rp: (fr.rateLimited429Count / t * 100), cp: (fr.conflict409Count / t * 100) };
  };

  // Cost distribution
  const costDist = (() => {
    const m = {};
    routes.forEach(r => (r.shipments || []).forEach(s => {
      const n = s.warehouseName || 'Unknown';
      if (!m[n]) m[n] = { costs: [], dists: [] };
      m[n].costs.push(parseFloat(s.totalCost || 0));
      m[n].dists.push(parseFloat(s.distanceKm || 0));
    }));
    return Object.entries(m).map(([name, d], i) => ({
      name, avg: d.costs.reduce((a, b) => a + b, 0) / d.costs.length,
      dist: d.dists.reduce((a, b) => a + b, 0) / d.dists.length,
      count: d.costs.length, color: WH_COLORS[i % WH_COLORS.length],
    }));
  })();

  const kpiLoading = mapLoading || whLoading;

  /* ══ Render ═════════════════════════════════════════════ */
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title" style={{ marginBottom: 6 }}>Analytics</h1>
        <p className="page-subtitle">Routing performance metrics and operational insights — real order data</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginBottom: 24 }}>
        <KpiCard icon={<OrdersIcon />} label="Total Orders" value={totalOrders} sub={totalOrders > 0 ? `${splitOrders} split shipment${splitOrders !== 1 ? 's' : ''}` : undefined} color="var(--color-accent)" loading={kpiLoading} />
        <KpiCard icon={<CostIcon />} label="Avg Routing Cost" value={avgCost > 0 ? `₹${avgCost.toFixed(2)}` : '—'} sub={routes.length > 0 ? `across ${routes.length} order${routes.length !== 1 ? 's' : ''}` : undefined} color="var(--color-success)" loading={kpiLoading} />
        <KpiCard icon={<WarehouseIcon />} label="Active Warehouses" value={activeWh} sub={warehouseData ? `${warehouseData.length} total registered` : undefined} color="var(--color-accent)" loading={kpiLoading} />
        <KpiCard icon={<AlertIcon />} label="Low Stock Alerts" value={lowStockWh} sub={lowStockWh > 0 ? `≤${LOW_STOCK} units on ≥1 SKU` : 'All warehouses healthy'} color={lowStockWh > 0 ? 'var(--color-warning)' : 'var(--color-success)'} loading={kpiLoading} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 1. Orders per warehouse */}
        <Section icon="📊" title="Orders Fulfilled per Warehouse" desc={!mapLoading && whOrders.length > 0 ? `${routes.length} orders across ${whOrders.length} warehouses` : undefined} loading={mapLoading} error={!!mapError} errorMsg={mapError} onRetry={fetchMap} empty={whOrders.length === 0} emptyMsg="No orders found. Place checkout orders to see distribution.">
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={whOrders} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.grid }} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.grid }} tickLine={false} allowDecimals={false} />
                <Tooltip content={<Tip />} cursor={{ fill: C.cursor }} />
                <Bar dataKey="orders" name="Shipments" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {whOrders.map((_, i) => <Cell key={i} fill={WH_COLORS[i % WH_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* 2. Cost over time */}
        <Section icon="📈" title="Average Routing Cost Over Time" desc={!mapLoading && costTime.length > 0 ? 'Average cost per order grouped by date' : undefined} loading={mapLoading} error={!!mapError} errorMsg={mapError} onRetry={fetchMap} empty={costTime.length === 0} emptyMsg="No cost data yet. Place orders to track trends.">
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={costTime} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.grid }} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.grid }} tickLine={false} />
                <Tooltip content={<Tip fmt={v => `₹${v}`} />} />
                <Line type="monotone" dataKey="avgCost" name="Avg Cost" stroke={C.success} strokeWidth={2} dot={{ fill: C.success, strokeWidth: 0, r: 3 }} activeDot={{ fill: C.success, strokeWidth: 2, stroke: '#fff', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* 3. Warehouse health */}
        <Section icon="🏭" title="Warehouse Inventory Health" desc={!whLoading && whHealth.length > 0 ? `${whHealth.length} warehouse${whHealth.length !== 1 ? 's' : ''} — available vs reserved stock` : undefined} loading={whLoading} error={!!whError} errorMsg={whError} onRetry={fetchWh} empty={whHealth.length === 0} emptyMsg="No warehouse data available.">
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={whHealth} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.grid }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.grid }} tickLine={false} width={85} />
                <Tooltip content={<Tip />} cursor={{ fill: C.cursor }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: C.secondary }} />
                <Bar dataKey="available" name="Available" fill={C.success} radius={[0, 3, 3, 0]} stackId="s" />
                <Bar dataKey="reserved" name="Reserved" fill={C.warning} radius={[0, 3, 3, 0]} stackId="s" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {whHealth.some(w => w.lowSkus > 0) && (
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
              {whHealth.filter(w => w.lowSkus > 0).map(w => (
                <span key={w.name} className="badge badge--warning">{w.name}: {w.lowSkus} low-stock SKU{w.lowSkus !== 1 ? 's' : ''}</span>
              ))}
            </div>
          )}
        </Section>

        {/* 4. Flash-Sale Stress Test */}
        <Section icon="⚡" title="Flash-Sale Stress Test" desc="Concurrent checkout contention via real ACID path">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Controls */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 4 }}>Target SKU</label>
                <select value={flashSku} onChange={e => setFlashSku(e.target.value)} id="analytics-flash-sku"
                  style={{ width: '100%', height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 11, paddingLeft: 8, paddingRight: 8 }}>
                  <option value="">Select…</option>
                  {skus.map(s => <option key={s.sku} value={s.sku}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 4 }}>Qty / Order</label>
                <input type="number" min="1" max="100" value={flashQty} onChange={e => setFlashQty(e.target.value)} id="analytics-flash-qty"
                  style={{ width: '100%', height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 11, textAlign: 'center' }} />
              </div>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 4 }}>Concurrency</label>
                <input type="number" min="1" max="50" value={flashConc} onChange={e => setFlashConc(e.target.value)} id="analytics-flash-concurrency"
                  style={{ width: '100%', height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 11, textAlign: 'center' }} />
              </div>
            </div>

            <button onClick={runFlash} disabled={!flashSku || flashState === 'loading'} className="btn-outline-warning" style={{ width: '100%', padding: '8px 0', fontSize: 12 }} id="analytics-flash-btn">
              {flashState === 'loading' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  Running…
                </span>
              ) : '⚡ Run Flash-Sale Test'}
            </button>

            {flashState === 'error' && flashError && (
              <div style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger)', padding: '8px 12px', fontSize: 11, color: 'var(--color-danger)' }} role="alert">
                {flashError.message || 'Flash test failed.'}
              </div>
            )}

            {flashState === 'success' && flashResult ? (() => {
              const b = flashBar(flashResult);
              return (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {b && (
                    <div>
                      <div style={{ height: 8, borderRadius: 99, overflow: 'hidden', display: 'flex', background: 'var(--color-bg-primary)' }}>
                        {b.sp > 0 && <div style={{ width: `${b.sp}%`, background: C.success, transition: 'width .5s' }} />}
                        {b.rp > 0 && <div style={{ width: `${b.rp}%`, background: C.warning, transition: 'width .5s' }} />}
                        {b.cp > 0 && <div style={{ width: `${b.cp}%`, background: C.danger, transition: 'width .5s' }} />}
                      </div>
                      <div className="flex justify-between" style={{ marginTop: 4, fontSize: 10, color: C.muted }}>
                        <span style={{ color: C.success }}>✓ {flashResult.successCount} success</span>
                        <span style={{ color: C.warning }}>⏳ {flashResult.rateLimited429Count} rate-limited</span>
                        <span style={{ color: C.danger }}>⚠ {flashResult.conflict409Count} conflict</span>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-5 gap-2">
                    <Stat label="Success" value={flashResult.successCount} color={C.success} />
                    <Stat label="429" value={flashResult.rateLimited429Count} color={C.warning} />
                    <Stat label="409" value={flashResult.conflict409Count} color={C.danger} />
                    <Stat label="Avg" value={flashResult.avgLatencyMs?.toFixed(0)} unit="ms" color={C.accent} />
                    <Stat label="P95" value={flashResult.p95LatencyMs?.toFixed(0)} unit="ms" color={C.purple} />
                  </div>
                  <p style={{ fontSize: 10, color: C.muted, textAlign: 'center' }}>Real ACID checkout path — no simulated data</p>
                </div>
              );
            })() : flashState === 'idle' && (
              <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 0' }}>
                <p style={{ fontSize: 11, color: C.muted }}>Run a flash-sale test to see contention metrics</p>
              </div>
            )}
          </div>
        </Section>

        {/* 5. AI Source Breakdown */}
        <Section icon="🤖" title="AI Explanation Source" desc="Gemini vs deterministic fallback" loading={aiLoading} error={!!aiError} errorMsg={aiError} onRetry={fetchAi} empty={aiPie.length === 0} emptyMsg="No AI explanations yet. Place orders and view explanations.">
          <div className="flex items-center gap-6" style={{ flexWrap: 'wrap' }}>
            <div style={{ width: 170, height: 170, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={aiPie} cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {aiPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aiPie.map(e => {
                const pct = aiSources.total > 0 ? ((e.value / aiSources.total) * 100).toFixed(0) : 0;
                return (
                  <div key={e.name}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                      <div className="flex items-center gap-2">
                        <div style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: C.secondary, fontWeight: 500 }}>{e.name}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: 'var(--color-bg-primary)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: e.color, borderRadius: 99, transition: 'width .5s' }} />
                    </div>
                  </div>
                );
              })}
              {aiSources?.total > 0 && (
                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8, marginTop: 2 }}>
                  <div className="flex items-center gap-2">
                    <div style={{ width: 6, height: 6, borderRadius: 99, background: aiSources.gemini > aiSources.fallback ? C.success : C.warning, boxShadow: `0 0 6px ${aiSources.gemini > aiSources.fallback ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)'}` }} />
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Gemini {aiSources.gemini > aiSources.fallback ? 'Healthy' : 'Degraded'}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{aiSources.gemini} of {aiSources.total} from Gemini AI</p>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* 6. Cost Distribution */}
        {costDist.length > 0 && (
          <Section icon="💰" title="Routing Cost by Warehouse" desc="Average cost and distance per warehouse">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {costDist.map(w => (
                <div key={w.name} className="stat-card" style={{ textAlign: 'center', padding: '12px 8px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 99, background: w.color, margin: '0 auto 6px' }} />
                  <p style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 4 }} className="truncate" title={w.name}>{w.name}</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: w.color, letterSpacing: '-0.02em' }}>₹{w.avg.toFixed(1)}</p>
                  <p style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{w.dist.toFixed(0)} km · {w.count} order{w.count !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
