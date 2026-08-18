/**
 * ControlTowerDashboard — Week 2: Mapbox Control Tower
 *
 * Integrates Mapbox GL JS with warehouse markers, stock health
 * visualization, interactive popups, a legend, and live stats.
 *
 * Data source: GET /api/v1/warehouses (map-data endpoint is Week 3).
 *
 * States:
 *   - Missing token → configuration instructions
 *   - Loading → skeleton placeholders
 *   - Error → message + retry button
 *   - Loaded → interactive map + stats
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import * as api from '../lib/apiClient';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Low-stock threshold — matches the deterministic engine's
 * depletion penalty tier (availableQty <= 5 triggers penalty).
 */
const LOW_STOCK_THRESHOLD = 5;

// ─── Sub-components ─────────────────────────────────────────

function StatCard({ icon, label, value, accentColor }) {
  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 flex items-center gap-3 hover:border-[var(--color-accent)] transition-colors duration-200"
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
        style={{ background: `${accentColor}20`, color: accentColor }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)] truncate">{label}</p>
        <p className="text-xl font-bold text-[var(--color-text-primary)]">{value}</p>
      </div>
    </div>
  );
}

function MapLegend() {
  return (
    <div
      className="absolute bottom-6 left-4 z-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 shadow-lg"
      role="region"
      aria-label="Map legend"
    >
      <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
        Warehouse Status
      </h4>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold shrink-0"
            style={{
              borderColor: 'var(--color-success)',
              background: 'rgba(52,211,153,0.2)',
              color: 'var(--color-success)',
            }}
            aria-hidden="true"
          >
            ✓
          </span>
          <span className="text-xs text-[var(--color-text-secondary)]">Healthy Stock</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold shrink-0"
            style={{
              borderColor: 'var(--color-warning)',
              background: 'rgba(251,191,36,0.2)',
              color: 'var(--color-warning)',
            }}
            aria-hidden="true"
          >
            ▼
          </span>
          <span className="text-xs text-[var(--color-text-secondary)]">Low Stock (≤ {LOW_STOCK_THRESHOLD} units)</span>
        </div>
      </div>
    </div>
  );
}

function SkeletonMap() {
  return (
    <div
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden"
      style={{ minHeight: '460px' }}
      role="status"
      aria-label="Loading map"
    >
      <div className="animate-shimmer w-full h-full" style={{ minHeight: '460px' }} />
      <span className="sr-only">Loading map data…</span>
    </div>
  );
}

function SkeletonStats() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 h-[72px] animate-shimmer"
          role="status"
        >
          <span className="sr-only">Loading stats…</span>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div
      className="rounded-xl border border-[var(--color-danger)] bg-[var(--color-bg-card)] p-12 flex flex-col items-center justify-center"
      style={{ minHeight: '400px' }}
      role="alert"
    >
      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
        Failed to Load Map Data
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6 text-center max-w-sm">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] font-semibold text-sm hover:bg-[var(--color-accent-hover)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg-primary)]"
        aria-label="Retry loading map data"
      >
        Retry
      </button>
    </div>
  );
}

function MissingTokenState() {
  return (
    <div
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-12 flex flex-col items-center justify-center"
      style={{ minHeight: '400px' }}
    >
      <div className="w-16 h-16 rounded-full bg-[var(--color-accent-glow)] flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
        Mapbox Token Required
      </h2>
      <p className="text-[var(--color-text-secondary)] text-center max-w-md mb-6">
        The Control Tower map requires a Mapbox access token.
        Add your token to the client environment configuration to enable the interactive map.
      </p>
      <div className="rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] p-4 max-w-md w-full">
        <p className="text-xs font-mono text-[var(--color-text-muted)] mb-1">client/.env</p>
        <code className="text-sm text-[var(--color-accent)] font-mono">
          VITE_MAPBOX_TOKEN=pk.your_token_here
        </code>
      </div>
      <p className="text-xs text-[var(--color-text-muted)] mt-4">
        Get a free token at{' '}
        <a
          href="https://mapbox.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
        >
          mapbox.com
        </a>
      </p>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────

/** Determine if a warehouse has low stock on any SKU. */
function isLowStock(warehouse) {
  if (!warehouse.inventory || warehouse.inventory.length === 0) return true;
  return warehouse.inventory.some((item) => item.availableQty <= LOW_STOCK_THRESHOLD);
}

/** Build the HTML content for a warehouse popup. */
function buildPopupHTML(warehouse) {
  const stockStatus = isLowStock(warehouse);
  const statusLabel = stockStatus ? 'Low Stock' : 'Healthy';
  const statusColor = stockStatus ? 'var(--color-warning)' : 'var(--color-success)';

  const inventoryRows = (warehouse.inventory || [])
    .map((item) => {
      const isLow = item.availableQty <= LOW_STOCK_THRESHOLD;
      const qtyColor = isLow ? 'var(--color-warning)' : 'var(--color-success)';
      const indicator = isLow ? '▼' : '✓';
      return `
        <tr style="border-bottom: 1px solid var(--color-border);">
          <td style="padding: 6px 8px; font-size: 12px; color: var(--color-text-secondary);">${item.name || item.sku}</td>
          <td style="padding: 6px 8px; font-size: 12px; color: ${qtyColor}; font-weight: 600; text-align: right;">
            <span style="margin-right: 4px;">${indicator}</span>${item.availableQty}
          </td>
          <td style="padding: 6px 8px; font-size: 12px; color: var(--color-text-muted); text-align: right;">${item.reservedQty}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="font-family: var(--font-sans);">
      <div style="padding: 12px 14px; border-bottom: 1px solid var(--color-border);">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; display: inline-block; flex-shrink: 0;"></span>
          <h3 style="font-size: 14px; font-weight: 700; color: var(--color-text-primary); margin: 0;">${warehouse.name}</h3>
        </div>
        <p style="font-size: 11px; color: var(--color-text-muted); margin: 0;">
          ${warehouse.lat.toFixed(4)}°, ${warehouse.lng.toFixed(4)}° · <span style="color: ${statusColor}; font-weight: 600;">${statusLabel}</span>
        </p>
      </div>
      ${warehouse.inventory && warehouse.inventory.length > 0 ? `
        <div style="padding: 4px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--color-border);">
                <th style="padding: 6px 8px; font-size: 10px; color: var(--color-text-muted); text-align: left; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">SKU</th>
                <th style="padding: 6px 8px; font-size: 10px; color: var(--color-text-muted); text-align: right; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Avail</th>
                <th style="padding: 6px 8px; font-size: 10px; color: var(--color-text-muted); text-align: right; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Reserved</th>
              </tr>
            </thead>
            <tbody>${inventoryRows}</tbody>
          </table>
        </div>
      ` : `
        <div style="padding: 12px 14px;">
          <p style="font-size: 12px; color: var(--color-text-muted); margin: 0;">No inventory data available</p>
        </div>
      `}
    </div>
  `;
}

// ─── Main Component ─────────────────────────────────────────

export default function ControlTowerDashboard() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /** Fetch warehouse data from the API. */
  const fetchWarehouses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getWarehouses();
      setWarehouses(data.warehouses || []);
    } catch (err) {
      setError(err.message || 'Unable to connect to the server. Check that the backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  // Initialize Mapbox map once we have a token and data
  useEffect(() => {
    if (!MAPBOX_TOKEN || loading || error || warehouses.length === 0) return;
    if (!mapContainerRef.current) return;

    // Don't re-create map if already initialized
    if (mapRef.current) {
      // Clear old markers and add new ones
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      addMarkers(mapRef.current, warehouses);
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Calculate centroid for initial center
    const avgLat = warehouses.reduce((s, w) => s + w.lat, 0) / warehouses.length;
    const avgLng = warehouses.reduce((s, w) => s + w.lng, 0) / warehouses.length;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [avgLng, avgLat],
      zoom: 4.5,
      attributionControl: true,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      addMarkers(map, warehouses);
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  // We intentionally depend on warehouses as data input, and also loading/error to know when to render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses, loading, error]);

  /** Add warehouse markers to the map. */
  function addMarkers(map, warehouseList) {
    warehouseList.forEach((wh) => {
      const lowStock = isLowStock(wh);

      // Create custom marker element
      const el = document.createElement('button');
      el.className = `warehouse-marker ${lowStock ? 'warehouse-marker--low-stock' : 'warehouse-marker--healthy'}`;
      el.setAttribute('aria-label', `${wh.name} — ${lowStock ? 'Low Stock' : 'Healthy Stock'}`);
      el.setAttribute('tabindex', '0');
      el.textContent = lowStock ? '▼' : '✓';

      const popup = new mapboxgl.Popup({
        offset: 20,
        closeButton: true,
        closeOnClick: true,
        maxWidth: '320px',
      }).setHTML(buildPopupHTML(wh));

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([wh.lng, wh.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Fit map bounds to markers
    if (warehouseList.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      warehouseList.forEach((wh) => bounds.extend([wh.lng, wh.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 1000 });
    }
  }

  // ─── Computed stats ─────────────────────────────────────
  const activeWarehouses = warehouses.filter((w) => w.active).length;
  const totalSkus = new Set(warehouses.flatMap((w) => (w.inventory || []).map((i) => i.sku))).size;
  const lowStockCount = warehouses.filter(isLowStock).length;

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-1">
          Control Tower
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Real-time warehouse and shipment monitoring dashboard
        </p>
      </div>

      {/* Quick Stats */}
      {loading ? (
        <SkeletonStats />
      ) : !error && warehouses.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon="🏭" label="Active Warehouses" value={activeWarehouses} accentColor="var(--color-accent)" />
          <StatCard icon="📦" label="SKUs Tracked" value={totalSkus} accentColor="var(--color-success)" />
          <StatCard
            icon="⚠️"
            label="Low Stock Alerts"
            value={lowStockCount}
            accentColor={lowStockCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
          />
        </div>
      ) : null}

      {/* Map Area */}
      <div className="mt-6">
        {!MAPBOX_TOKEN ? (
          <MissingTokenState />
        ) : loading ? (
          <SkeletonMap />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchWarehouses} />
        ) : warehouses.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-12 flex flex-col items-center justify-center" style={{ minHeight: '400px' }}>
            <p className="text-[var(--color-text-muted)]">No warehouse data available.</p>
            <button
              onClick={fetchWarehouses}
              className="mt-4 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] font-semibold text-sm hover:bg-[var(--color-accent-hover)] transition-colors"
              aria-label="Refresh warehouse data"
            >
              Refresh
            </button>
          </div>
        ) : (
          <div className="relative rounded-xl border border-[var(--color-border)] overflow-hidden" style={{ minHeight: '460px' }}>
            <div ref={mapContainerRef} className="w-full" style={{ height: '460px' }} />
            <MapLegend />
          </div>
        )}
      </div>
    </div>
  );
}
