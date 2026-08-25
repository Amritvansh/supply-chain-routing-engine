/**
 * ControlTowerDashboard — Week 3: Map routes + warehouse markers
 *
 * Integrates MapLibre GL JS with:
 *   - Warehouse markers (healthy vs low-stock) from getWarehouses()
 *   - Route lines (warehouse → customer) from getMapData()
 *   - Customer destination markers
 *   - Interactive popups, legend, and live stats
 *
 * Data sources:
 *   - GET /api/v1/warehouses   → detailed inventory popups
 *   - GET /api/v1/dashboard/map-data → route overlays + warehouse health
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import * as api from '../lib/apiClient';

/**
 * Low-stock threshold — matches the deterministic engine's
 * depletion penalty tier (availableQty <= 5 triggers penalty).
 */
const LOW_STOCK_THRESHOLD = 5;

/** Colors for multi-shipment route lines. */
const ROUTE_COLORS = [
  '#38bdf8', // accent blue
  '#34d399', // green
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // purple
  '#fb923c', // orange
];

// ─── Sub-components ─────────────────────────────────────────

function StatCard({ icon, label, value, accentColor }) {
  return (
    <div className="stat-card flex items-center gap-3">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0"
        style={{ background: `${accentColor}15`, color: accentColor }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)] truncate font-medium">{label}</p>
        <p className="text-2xl font-extrabold text-[var(--color-text-primary)] tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function MapLegend() {
  return (
    <div
      className="absolute bottom-6 left-4 z-10 glass-card p-3"
      role="region"
      aria-label="Map legend"
    >
      <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
        Map Legend
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
        <div className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded-full border-2 shrink-0"
            style={{
              borderColor: '#f472b6',
              background: 'rgba(244,114,182,0.3)',
            }}
            aria-hidden="true"
          />
          <span className="text-xs text-[var(--color-text-secondary)]">Customer Location</span>
        </div>
        {/* Split-shipment route color legend */}
        <div className="pt-1 border-t border-[var(--color-border-subtle)] mt-1">
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Shipment Routes</span>
        </div>
        {ROUTE_COLORS.slice(0, 4).map((color, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span
              className="w-4 h-1 rounded shrink-0"
              style={{ background: color }}
              aria-hidden="true"
            />
            <span className="text-xs text-[var(--color-text-secondary)]">
              {idx === 0 ? 'Shipment 1 / Single' : `Shipment ${idx + 1}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Selected order detail panel — shown when a route is clicked. */
function SelectedOrderPanel({ route, onClose }) {
  if (!route) return null;
  const shipments = route.shipments || [];
  const totalCost = shipments.reduce((sum, s) => sum + parseFloat(s.totalCost || 0), 0);
  const isSplit = shipments.length > 1;

  return (
    <div
      className="absolute top-4 right-14 z-10 glass-card p-4 animate-fade-in"
      style={{ width: 280 }}
      role="region"
      aria-label="Selected order details"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          Order Details
        </h4>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          aria-label="Close order details"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Order ID */}
      <p className="text-[10px] font-mono text-[var(--color-text-muted)] mb-2 truncate">
        {route.orderId}
      </p>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] p-2 text-center">
          <p className="text-xs text-[var(--color-text-muted)]">Shipments</p>
          <p className="text-sm font-bold text-[var(--color-text-primary)]">{shipments.length}</p>
        </div>
        <div className="rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] p-2 text-center">
          <p className="text-xs text-[var(--color-text-muted)]">Total Cost</p>
          <p className="text-sm font-bold text-[var(--color-accent)]">₹{totalCost.toFixed(2)}</p>
        </div>
      </div>

      {isSplit && (
        <span className="inline-block mb-3 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-warning-glow)] text-[var(--color-warning)] uppercase">
          Split Shipment
        </span>
      )}

      {/* Per-shipment breakdown */}
      <div className="space-y-2">
        {shipments.map((s, idx) => (
          <div
            key={s.shipmentId || idx}
            className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] p-2"
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: ROUTE_COLORS[idx % ROUTE_COLORS.length] }}
              />
              <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                {s.warehouseName || 'Unknown'}
              </span>
              {s.boxSize && (
                <span className="ml-auto text-[10px] text-[var(--color-accent)] font-semibold">
                  📦 {s.boxSize}
                </span>
              )}
            </div>
            <div className="flex justify-between text-[10px] text-[var(--color-text-muted)]">
              <span>{parseFloat(s.distanceKm).toFixed(1)} km</span>
              <span className="font-medium text-[var(--color-text-secondary)]">₹{parseFloat(s.totalCost).toFixed(2)}</span>
            </div>
          </div>
        ))}
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
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
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



// ─── Helpers ────────────────────────────────────────────────

/** Determine if a warehouse has low stock on any SKU. */
function isLowStock(warehouse) {
  // map-data format uses healthStatus field
  if (warehouse.healthStatus) {
    return warehouse.healthStatus === 'low_stock';
  }
  // warehouses endpoint format uses inventory array
  if (!warehouse.inventory || warehouse.inventory.length === 0) return true;
  return warehouse.inventory.some((item) => item.availableQty <= LOW_STOCK_THRESHOLD);
}

/** Build the HTML content for a warehouse popup. */
function buildPopupHTML(warehouse) {
  const stockStatus = isLowStock(warehouse);
  const statusLabel = stockStatus ? 'Low Stock' : 'Healthy';
  const statusColor = stockStatus ? 'var(--color-warning)' : 'var(--color-success)';

  // Handle both warehouse formats (getWarehouses vs getMapData)
  const hasInventory = warehouse.inventory && warehouse.inventory.length > 0;

  const inventoryRows = hasInventory
    ? (warehouse.inventory || [])
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
        .join('')
    : '';

  const aggregateInfo = warehouse.totalStock != null
    ? `
      <div style="padding: 8px 14px; border-top: 1px solid var(--color-border);">
        <div style="display: flex; justify-content: space-between; font-size: 11px;">
          <span style="color: var(--color-text-muted);">Total Stock</span>
          <span style="color: var(--color-text-primary); font-weight: 600;">${warehouse.totalStock}</span>
        </div>
        ${warehouse.lowStockSkus != null ? `
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px;">
            <span style="color: var(--color-text-muted);">Low Stock SKUs</span>
            <span style="color: ${warehouse.lowStockSkus > 0 ? 'var(--color-warning)' : 'var(--color-success)'}; font-weight: 600;">${warehouse.lowStockSkus}</span>
          </div>
        ` : ''}
      </div>
    `
    : '';

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
      ${hasInventory ? `
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
      ` : aggregateInfo ? aggregateInfo : `
        <div style="padding: 12px 14px;">
          <p style="font-size: 12px; color: var(--color-text-muted); margin: 0;">No inventory data available</p>
        </div>
      `}
    </div>
  `;
}

/** Build popup HTML for a customer destination. */
function buildCustomerPopupHTML(route) {
  const shipmentCount = route.shipments?.length || 0;
  const totalCost = route.shipments?.reduce((sum, s) => sum + parseFloat(s.totalCost || 0), 0) || 0;

  return `
    <div style="font-family: var(--font-sans); padding: 12px 14px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #f472b6; display: inline-block;"></span>
        <h3 style="font-size: 13px; font-weight: 700; color: var(--color-text-primary); margin: 0;">Customer Destination</h3>
      </div>
      <p style="font-size: 11px; color: var(--color-text-muted); margin: 0 0 8px;">
        ${route.customer.lat.toFixed(4)}°, ${route.customer.lng.toFixed(4)}°
      </p>
      <div style="font-size: 11px; color: var(--color-text-secondary);">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Shipments</span>
          <span style="font-weight: 600; color: var(--color-text-primary);">${shipmentCount}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Total Cost</span>
          <span style="font-weight: 600; color: var(--color-accent);">₹${totalCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  `;
}

// ─── Main Component ─────────────────────────────────────────

export default function ControlTowerDashboard() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const [warehouses, setWarehouses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);

  /** Fetch warehouse data (detailed inventory) and map data (routes). */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both in parallel
      const [warehouseData, mapData] = await Promise.all([
        api.getWarehouses().catch(() => ({ warehouses: [] })),
        api.getMapData().catch(() => ({ warehouses: [], routes: [] })),
      ]);

      setWarehouses(warehouseData.warehouses || []);
      setRoutes(mapData.routes || []);
    } catch (err) {
      setError(err.message || 'Unable to connect to the server. Check that the backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize MapLibre map once we have data
  useEffect(() => {
    if (loading || error || warehouses.length === 0) return;
    if (!mapContainerRef.current) return;

    // Don't re-create map if already initialized
    if (mapRef.current) {
      // Clear old markers and layers, add new ones
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      removeRouteLayers(mapRef.current);
      addMarkers(mapRef.current, warehouses);
      addRoutes(mapRef.current, routes);
      return;
    }

    // Calculate centroid for initial center
    const avgLat = warehouses.reduce((s, w) => s + w.lat, 0) / warehouses.length;
    const avgLng = warehouses.reduce((s, w) => s + w.lng, 0) / warehouses.length;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [avgLng, avgLat],
      zoom: 4.5,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      addMarkers(map, warehouses);
      addRoutes(map, routes);
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  // We intentionally depend on warehouses/routes as data input
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses, routes, loading, error]);

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

      const popup = new maplibregl.Popup({
        offset: 20,
        closeButton: true,
        closeOnClick: true,
        maxWidth: '320px',
      }).setHTML(buildPopupHTML(wh));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([wh.lng, wh.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (warehouseList.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      warehouseList.forEach((wh) => bounds.extend([wh.lng, wh.lat]));
      // Also include route endpoints in bounds
      routes.forEach((route) => {
        if (route.customer) {
          bounds.extend([route.customer.lng, route.customer.lat]);
        }
      });
      map.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 1000 });
    }
  }

  /** Remove existing route layers and sources from the map. */
  function removeRouteLayers(map) {
    const style = map.getStyle();
    if (!style || !style.layers) return;

    style.layers.forEach((layer) => {
      if (layer.id.startsWith('route-')) {
        map.removeLayer(layer.id);
      }
    });

    Object.keys(style.sources || {}).forEach((sourceId) => {
      if (sourceId.startsWith('route-')) {
        map.removeSource(sourceId);
      }
    });
  }

  /** Add route lines (warehouse → customer) using GeoJSON. */
  function addRoutes(map, routeList) {
    if (!routeList || routeList.length === 0) return;

    routeList.forEach((route, routeIdx) => {
      if (!route.customer || !route.shipments) return;

      const customerLng = route.customer.lng;
      const customerLat = route.customer.lat;

      // Add customer marker
      const customerEl = document.createElement('div');
      customerEl.className = 'customer-marker';

      const customerPopup = new maplibregl.Popup({
        offset: 12,
        closeButton: true,
        closeOnClick: true,
        maxWidth: '280px',
      }).setHTML(buildCustomerPopupHTML(route));

      const customerMarker = new maplibregl.Marker({ element: customerEl })
        .setLngLat([customerLng, customerLat])
        .setPopup(customerPopup)
        .addTo(map);

      markersRef.current.push(customerMarker);

      // Add route line for each shipment
      route.shipments.forEach((shipment, shipIdx) => {
        const sourceId = `route-${routeIdx}-${shipIdx}`;
        const color = ROUTE_COLORS[shipIdx % ROUTE_COLORS.length];

        const geojson = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [shipment.warehouseLng, shipment.warehouseLat],
              [customerLng, customerLat],
            ],
          },
          properties: {
            warehouseName: shipment.warehouseName,
            distanceKm: shipment.distanceKm,
            boxSize: shipment.boxSize,
          },
        };

        // Check if source already exists
        if (map.getSource(sourceId)) {
          map.getSource(sourceId).setData(geojson);
        } else {
          map.addSource(sourceId, { type: 'geojson', data: geojson });
          map.addLayer({
            id: `${sourceId}-line`,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': color,
              'line-width': 2.5,
              'line-opacity': 0.7,
              'line-dasharray': [2, 2],
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          });
        }
      });
    });
  }

  // ─── Computed stats ─────────────────────────────────────
  const activeWarehouses = warehouses.filter((w) => w.active).length;
  const totalSkus = new Set(warehouses.flatMap((w) => (w.inventory || []).map((i) => i.sku))).size;
  const lowStockCount = warehouses.filter(isLowStock).length;
  const activeRoutes = routes.length;

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="page-title mb-2">
          Control Tower
        </h1>
        <p className="page-subtitle">
          Real-time warehouse and shipment monitoring dashboard
        </p>
      </div>

      {/* Quick Stats */}
      {loading ? (
        <SkeletonStats />
      ) : !error && warehouses.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="🏭" label="Active Warehouses" value={activeWarehouses} accentColor="var(--color-accent)" />
          <StatCard icon="📦" label="SKUs Tracked" value={totalSkus} accentColor="var(--color-success)" />
          <StatCard
            icon="⚠️"
            label="Low Stock Alerts"
            value={lowStockCount}
            accentColor={lowStockCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
          />
          <StatCard
            icon="🛤️"
            label="Active Routes"
            value={activeRoutes}
            accentColor="var(--color-accent)"
          />
        </div>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <SkeletonMap />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchData} />
        ) : warehouses.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-12 flex flex-col items-center justify-center" style={{ minHeight: '400px' }}>
            <p className="text-[var(--color-text-muted)]">No warehouse data available.</p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] font-semibold text-sm hover:bg-[var(--color-accent-hover)] transition-colors"
              aria-label="Refresh warehouse data"
            >
              Refresh
            </button>
          </div>
        ) : (
          <>
          <div className="relative glass-card overflow-hidden" style={{ minHeight: '460px' }}>
            <div ref={mapContainerRef} className="w-full" style={{ height: '460px' }} />
            <MapLegend />
            <SelectedOrderPanel route={selectedRoute} onClose={() => setSelectedRoute(null)} />
          </div>

          {/* Recent Orders List — click to select */}
          {routes.length > 0 && (
            <div className="mt-4 glass-card p-4">
              <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                Recent Orders — click to inspect route
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {routes.slice(0, 12).map((route) => {
                  const isSelected = selectedRoute?.orderId === route.orderId;
                  const isSplit = (route.shipments || []).length > 1;
                  return (
                    <button
                      key={route.orderId}
                      onClick={() => setSelectedRoute(isSelected ? null : route)}
                      className={`text-left rounded-lg border p-2.5 transition-all duration-200 ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-glow)]'
                          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] hover:border-[var(--color-border)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                          {(route.shipments || []).slice(0, 3).map((s, idx) => (
                            <span
                              key={idx}
                              className="w-2.5 h-2.5 rounded-full border border-[var(--color-bg-primary)]"
                              style={{ background: ROUTE_COLORS[idx % ROUTE_COLORS.length] }}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-[var(--color-text-primary)] font-medium truncate">
                          {(route.shipments || []).map((s) => s.warehouseName).join(' → ')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {route.shipments?.length || 0} shipment{(route.shipments?.length || 0) !== 1 ? 's' : ''}
                          {isSplit && ' (split)'}
                        </span>
                        <span className="text-[10px] text-[var(--color-accent)] font-semibold">
                          ₹{(route.shipments || []).reduce((sum, s) => sum + parseFloat(s.totalCost || 0), 0).toFixed(2)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
