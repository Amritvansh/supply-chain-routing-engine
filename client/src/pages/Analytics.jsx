/**
 * Analytics — Week 4: Recharts data visualizations
 *
 * Charts (all driven by real API data, no fabricated statistics):
 *   1. Orders Fulfilled per Warehouse — BarChart from map-data routes
 *   2. Average Routing Cost Over Time — LineChart from map-data routes
 *   3. Flash-Test Contention Rates — Live trigger + stat panel
 *   4. AI Explanation Source Breakdown — PieChart (gemini vs fallback)
 *
 * Data sources:
 *   - GET /api/v1/dashboard/map-data  → routes (orders, costs, warehouses)
 *   - GET /api/v1/orders/:id/explain  → per-order AI source field
 *   - POST /api/v1/orders/flash-test  → live stress-test metrics
 *   - GET /api/v1/warehouses          → SKU list for flash-test selector
 */
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import * as api from '../lib/apiClient';

// ─── Theme Colors (match CSS design tokens) ──────────────────
const COLORS = {
  accent: '#6366f1',
  accentHover: '#818cf8',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  pink: '#f472b6',
  purple: '#a78bfa',
  orange: '#fb923c',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  bgCard: 'rgba(17, 24, 39, 0.7)',
  border: 'rgba(55, 65, 81, 0.5)',
  grid: 'rgba(55, 65, 81, 0.3)',
};

const WAREHOUSE_COLORS = [
  COLORS.accent, COLORS.success, COLORS.pink, COLORS.warning,
  COLORS.purple, COLORS.orange, COLORS.danger, COLORS.accentHover,
];

// ─── Custom Recharts Tooltip ─────────────────────────────────
function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="recharts-custom-tooltip">
      <p className="recharts-custom-tooltip__label">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color || COLORS.accent, fontSize: 12 }}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

// ─── Chart Card Wrapper ──────────────────────────────────────
function ChartCard({ icon, title, children, isEmpty, emptyMsg, isError, errorMsg, onRetry, isLoading }) {
  return (
    <div className="glass-card p-6">
      <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4 flex items-center gap-2 section-header-accent">
        <span>{icon}</span>
        {title}
      </h3>

      {isLoading ? (
        <div className="h-64 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] animate-shimmer" role="status">
          <span className="sr-only">Loading chart data…</span>
        </div>
      ) : isError ? (
        <div className="h-64 rounded-xl border border-[var(--color-danger)] bg-[var(--color-bg-primary)] flex flex-col items-center justify-center" role="alert">
          <p className="text-sm text-[var(--color-danger)] mb-3">{errorMsg || 'Failed to load data.'}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-[var(--color-danger)] text-xs font-semibold hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      ) : isEmpty ? (
        <div className="h-64 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-accent-glow)] flex items-center justify-center mb-3">
            <span className="text-lg">{icon}</span>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] text-center max-w-xs">
            {emptyMsg || 'No data available yet. Place orders to populate this chart.'}
          </p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ─── Stat Block (re-used for flash test) ─────────────────────
function StatBlock({ label, value, unit, accentColor = COLORS.accent }) {
  return (
    <div className="stat-card text-center">
      <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1 font-semibold">{label}</p>
      <p className="text-2xl font-extrabold tracking-tight" style={{ color: accentColor }}>
        {value}
        {unit && <span className="text-xs text-[var(--color-text-muted)] ml-1 font-medium">{unit}</span>}
      </p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function Analytics() {
  // === Map Data (orders per warehouse + cost over time) ===
  const [mapData, setMapData] = useState(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState(null);

  // === AI Source Breakdown ===
  const [aiSources, setAiSources] = useState(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState(null);

  // === Flash Test ===
  const [availableSkus, setAvailableSkus] = useState([]);
  const [flashSku, setFlashSku] = useState('');
  const [flashQty, setFlashQty] = useState(1);
  const [flashConcurrency, setFlashConcurrency] = useState(10);
  const [flashState, setFlashState] = useState('idle');
  const [flashResult, setFlashResult] = useState(null);
  const [flashError, setFlashError] = useState(null);

  // ─── Fetch map data for charts ─────────────────────────────
  const fetchMapData = useCallback(async () => {
    setMapLoading(true);
    setMapError(null);
    try {
      const data = await api.getMapData();
      setMapData(data);
    } catch (err) {
      setMapError(err.message || 'Failed to load analytics data.');
    } finally {
      setMapLoading(false);
    }
  }, []);

  // ─── Fetch AI source breakdown ─────────────────────────────
  const fetchAiSources = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await api.getMapData();
      const routes = data.routes || [];

      if (routes.length === 0) {
        setAiSources({ gemini: 0, fallback: 0, total: 0 });
        setAiLoading(false);
        return;
      }

      // Sample up to 20 recent orders for AI source info
      const sampleRoutes = routes.slice(0, 20);
      const results = await Promise.allSettled(
        sampleRoutes.map((r) => api.getExplanation(r.orderId))
      );

      let geminiCount = 0;
      let fallbackCount = 0;

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const data = result.value;

        if (data.multiShipment && data.explanations) {
          for (const exp of data.explanations) {
            if (exp.source === 'gemini') geminiCount++;
            else fallbackCount++;
          }
        } else if (data.source) {
          if (data.source === 'gemini') geminiCount++;
          else fallbackCount++;
        }
      }

      setAiSources({
        gemini: geminiCount,
        fallback: fallbackCount,
        total: geminiCount + fallbackCount,
      });
    } catch (err) {
      setAiError(err.message || 'Failed to load AI source data.');
    } finally {
      setAiLoading(false);
    }
  }, []);

  // ─── Load available SKUs ───────────────────────────────────
  useEffect(() => {
    api.getWarehouses()
      .then((data) => {
        const skuMap = new Map();
        (data.warehouses || []).forEach((w) => {
          (w.inventory || []).forEach((inv) => {
            if (!skuMap.has(inv.sku)) {
              skuMap.set(inv.sku, { sku: inv.sku, name: inv.name || inv.sku });
            }
          });
        });
        setAvailableSkus([...skuMap.values()]);
      })
      .catch(() => { /* SKUs unavailable — user can still type manually */ });
  }, []);

  // ─── Initial fetch ─────────────────────────────────────────
  useEffect(() => {
    fetchMapData();
    fetchAiSources();
  }, [fetchMapData, fetchAiSources]);

  // ─── Flash Test Handler ────────────────────────────────────
  const handleFlashTest = async () => {
    if (!flashSku) {
      setFlashError({ message: 'Please select a SKU.' });
      setFlashState('error');
      return;
    }
    setFlashState('loading');
    setFlashError(null);
    setFlashResult(null);
    try {
      const result = await api.triggerFlashTest({
        sku: flashSku,
        qty: parseInt(flashQty, 10) || 1,
        concurrency: parseInt(flashConcurrency, 10) || 10,
      });
      setFlashResult(result);
      setFlashState('success');
    } catch (err) {
      setFlashError(err);
      setFlashState('error');
    }
  };

  // ─── Derived chart data ────────────────────────────────────
  const routes = mapData?.routes || [];

  // 1. Orders per warehouse
  const warehouseOrderCounts = (() => {
    const counts = {};
    routes.forEach((route) => {
      (route.shipments || []).forEach((s) => {
        const name = s.warehouseName || 'Unknown';
        counts[name] = (counts[name] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, orders: count }))
      .sort((a, b) => b.orders - a.orders);
  })();

  // 2. Cost over time (grouped by date)
  const costOverTime = (() => {
    const dateMap = {};
    routes.forEach((route) => {
      const date = route.createdAt
        ? new Date(route.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
        : 'Unknown';
      const totalCost = (route.shipments || []).reduce(
        (sum, s) => sum + parseFloat(s.totalCost || 0), 0
      );
      if (!dateMap[date]) {
        dateMap[date] = { date, totalCost: 0, count: 0 };
      }
      dateMap[date].totalCost += totalCost;
      dateMap[date].count += 1;
    });
    return Object.values(dateMap)
      .map((d) => ({
        date: d.date,
        avgCost: d.count > 0 ? parseFloat((d.totalCost / d.count).toFixed(2)) : 0,
        totalOrders: d.count,
      }));
  })();

  // 3. AI Source pie data
  const aiPieData = aiSources && aiSources.total > 0
    ? [
        { name: 'Gemini AI', value: aiSources.gemini, color: COLORS.accent },
        { name: 'Computed Fallback', value: aiSources.fallback, color: COLORS.textMuted },
      ]
    : [];

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="page-title mb-2">
          Analytics
        </h1>
        <p className="page-subtitle">
          Routing performance metrics and operational insights — driven by real order data
        </p>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══ 1. Orders Fulfilled per Warehouse ═══ */}
        <ChartCard
          icon="📊"
          title="Orders Fulfilled per Warehouse"
          isLoading={mapLoading}
          isError={!!mapError}
          errorMsg={mapError}
          onRetry={fetchMapData}
          isEmpty={warehouseOrderCounts.length === 0}
          emptyMsg="No orders found. Place checkout orders to see warehouse distribution."
        >
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={warehouseOrderCounts} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                />
                <Bar dataKey="orders" name="Shipments" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {warehouseOrderCounts.map((_, idx) => (
                    <Cell key={idx} fill={WAREHOUSE_COLORS[idx % WAREHOUSE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-2 text-center">
            Based on {routes.length} recent order{routes.length !== 1 ? 's' : ''} from map data
          </p>
        </ChartCard>

        {/* ═══ 2. Average Routing Cost Over Time ═══ */}
        <ChartCard
          icon="📈"
          title="Average Routing Cost Over Time"
          isLoading={mapLoading}
          isError={!!mapError}
          errorMsg={mapError}
          onRetry={fetchMapData}
          isEmpty={costOverTime.length === 0}
          emptyMsg="No cost data available. Place orders to track routing cost trends."
        >
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={costOverTime} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={false}
                />
                <Tooltip
                  content={<CustomTooltip formatter={(val) => `₹${val}`} />}
                />
                <Line
                  type="monotone"
                  dataKey="avgCost"
                  name="Avg Cost"
                  stroke={COLORS.success}
                  strokeWidth={2.5}
                  dot={{ fill: COLORS.success, strokeWidth: 0, r: 4 }}
                  activeDot={{ fill: COLORS.success, strokeWidth: 2, stroke: '#fff', r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-2 text-center">
            Average routing cost per order, grouped by date
          </p>
        </ChartCard>

        {/* ═══ 3. Flash-Test Results ═══ */}
        <ChartCard
          icon="⚡"
          title="Flash-Sale Stress Test"
          isEmpty={false}
        >
          <div className="space-y-4">
            {/* Flash-test controls */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">SKU</label>
                <select
                  value={flashSku}
                  onChange={(e) => setFlashSku(e.target.value)}
                  className="w-full h-9 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-warning)]"
                  id="analytics-flash-sku"
                >
                  <option value="">Select…</option>
                  {availableSkus.map((s) => (
                    <option key={s.sku} value={s.sku}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Qty</label>
                <input
                  type="number" min="1" max="100" value={flashQty}
                  onChange={(e) => setFlashQty(e.target.value)}
                  className="w-full h-9 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-2 text-xs text-[var(--color-text-primary)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-warning)]"
                  id="analytics-flash-qty"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Concurrency</label>
                <input
                  type="number" min="1" max="50" value={flashConcurrency}
                  onChange={(e) => setFlashConcurrency(e.target.value)}
                  className="w-full h-9 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-2 text-xs text-[var(--color-text-primary)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-warning)]"
                  id="analytics-flash-concurrency"
                />
              </div>
            </div>

            <button
              onClick={handleFlashTest}
              disabled={!flashSku || flashState === 'loading'}
              className="w-full py-2 btn-outline-warning text-xs"
              id="analytics-flash-btn"
            >
              {flashState === 'loading' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Running…
                </span>
              ) : '⚡ Run Flash-Sale Test'}
            </button>

            {/* Results */}
            {flashState === 'error' && flashError && (
              <div className="rounded-lg border border-[var(--color-danger)] p-2 text-xs text-[var(--color-danger)]" role="alert">
                {flashError.message || 'Flash test failed.'}
              </div>
            )}

            {flashState === 'success' && flashResult ? (
              <div className="animate-fade-in">
                <div className="grid grid-cols-5 gap-2">
                  <StatBlock label="Success" value={flashResult.successCount} accentColor={COLORS.success} />
                  <StatBlock label="429" value={flashResult.rateLimited429Count} accentColor={COLORS.warning} />
                  <StatBlock label="409" value={flashResult.conflict409Count} accentColor={COLORS.danger} />
                  <StatBlock label="Avg" value={flashResult.avgLatencyMs?.toFixed(0)} unit="ms" accentColor={COLORS.accent} />
                  <StatBlock label="P95" value={flashResult.p95LatencyMs?.toFixed(0)} unit="ms" accentColor={COLORS.purple} />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-2 text-center">
                  Results from the real ACID checkout path — no simulated data
                </p>
              </div>
            ) : flashState === 'idle' && (
              <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] flex items-center justify-center py-8">
                <p className="text-xs text-[var(--color-text-muted)]">
                  Run a flash-sale test to see contention metrics
                </p>
              </div>
            )}
          </div>
        </ChartCard>

        {/* ═══ 4. AI Explanation Source Breakdown ═══ */}
        <ChartCard
          icon="🤖"
          title="AI Explanation Source Breakdown"
          isLoading={aiLoading}
          isError={!!aiError}
          errorMsg={aiError}
          onRetry={fetchAiSources}
          isEmpty={aiPieData.length === 0}
          emptyMsg="No AI explanations generated yet. Place orders and view explanations to populate."
        >
          <div className="flex items-center gap-6">
            <div style={{ width: 200, height: 200 }} className="shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={aiPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {aiPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<CustomTooltip />}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend + health indicator */}
            <div className="flex-1 space-y-3">
              {aiPieData.map((entry) => {
                const pct = aiSources.total > 0
                  ? ((entry.value / aiSources.total) * 100).toFixed(0)
                  : 0;
                return (
                  <div key={entry.name} className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: entry.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-secondary)] font-medium">{entry.name}</span>
                        <span className="text-xs font-bold text-[var(--color-text-primary)]">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[var(--color-bg-primary)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: entry.color }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Gemini health indicator */}
              {aiSources && aiSources.total > 0 && (
                <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: aiSources.gemini > aiSources.fallback ? COLORS.success : COLORS.warning,
                        boxShadow: `0 0 8px ${aiSources.gemini > aiSources.fallback ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)'}`,
                      }}
                    />
                    <span className="text-[10px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
                      Gemini {aiSources.gemini > aiSources.fallback ? 'Healthy' : 'Degraded'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    {aiSources.gemini} of {aiSources.total} explanation{aiSources.total !== 1 ? 's' : ''} from Gemini AI
                  </p>
                </div>
              )}
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
