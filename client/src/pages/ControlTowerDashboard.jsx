/**
 * ControlTowerDashboard — Polished Control Tower with KPI cards + Map
 *
 * Integrates MapLibre GL JS with:
 *   - Warehouse markers (healthy vs low-stock) from getWarehouses()
 *   - Route lines (warehouse → customer) from getMapData()
 *   - Customer destination markers
 *   - Interactive popups, legend, and live stats
 *   - Route click → SelectedOrderPanel
 *
 * Data sources:
 *   - GET /api/v1/warehouses          → detailed inventory popups
 *   - GET /api/v1/dashboard/map-data  → route overlays + warehouse health
 *   - GET /api/v1/dashboard/stats     → aggregated KPI stats for cards
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import * as api from '../lib/apiClient';
import OSM_STYLE from '../lib/mapStyles';

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

// ─── SVG Icons for KPI Cards ────────────────────────────────

function WarehouseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M9 21V13h6v8" />
      <path d="M1 21h22" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  );
}

function AtRiskIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function KpiCard({ icon, label, value, accentColor, onClick, isActive, loading }) {
  return (
    <div
      className={`kpi-card ${onClick ? 'kpi-card--clickable' : ''} ${isActive ? 'kpi-card--active' : ''}`}
      style={{ '--kpi-accent': accentColor }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-label={onClick ? `${label}: ${value}. Click to filter.` : undefined}
    >
      <div className="flex items-center gap-3">
        <div
          className="kpi-card__icon"
          style={{ background: `color-mix(in srgb, ${accentColor} 10%, transparent)`, color: accentColor }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="kpi-card__label">{label}</p>
          {loading ? (
            <div className="pt-1">
              <div className="animate-shimmer" style={{ width: 48, height: 20, borderRadius: 4 }} />
            </div>
          ) : (
            <p className="kpi-card__value">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MapLegend({ outageActive }) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute bottom-5 left-5 z-10 glass-card px-3.5 py-2 flex items-center gap-2 transition-all cursor-pointer shadow-lg"
        style={{
          borderRadius: 9999,
          background: 'var(--color-bg-card-solid)',
          border: '1px solid var(--color-border)',
        }}
        title="Open Map Legend"
        aria-label="Expand Map Legend"
      >
        <span className="text-sm">🗺️</span>
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">Legend</span>
        <span className="text-[10px] text-[var(--color-text-muted)]">▲</span>
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-5 left-5 z-10 glass-card p-3.5 shadow-xl animate-fade-in"
      style={{
        width: 250,
        borderRadius: 14,
        background: 'var(--color-bg-card-solid)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.18)',
      }}
      role="region"
      aria-label="Map legend"
    >
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">🗺️</span>
          <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
            Map Legend
          </h4>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer"
          title="Minimize Legend"
          aria-label="Minimize Map Legend"
        >
          ✕
        </button>
      </div>
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
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">Healthy Stock</span>
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
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">Low Stock (≤ {LOW_STOCK_THRESHOLD} units)</span>
        </div>
        {outageActive && (
          <>
            <div className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold shrink-0"
                style={{
                  borderColor: '#ef4444',
                  background: 'rgba(239,68,68,0.25)',
                  color: '#ef4444',
                }}
                aria-hidden="true"
              >
                🚨
              </span>
              <span className="text-xs font-semibold text-red-400">Simulated Outage Hub</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-3.5 h-1.5 rounded-full shrink-0"
                style={{ background: '#f59e0b' }}
                aria-hidden="true"
              />
              <span className="text-xs font-semibold text-amber-400">Failover Backup Route</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded-full border-2 shrink-0"
            style={{
              borderColor: '#f472b6',
              background: 'rgba(244,114,182,0.3)',
            }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">Customer Location</span>
        </div>
        {/* Split-shipment route color legend */}
        <div className="pt-1.5 border-t border-[var(--color-border-subtle)] mt-1.5">
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Shipment Routes</span>
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
          {ROUTE_COLORS.slice(0, 4).map((color, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-1.5 rounded-full shrink-0"
                style={{ background: color }}
                aria-hidden="true"
              />
              <span className="text-[11px] font-medium text-[var(--color-text-secondary)] truncate">
                {idx === 0 ? 'Single/1st' : `Route ${idx + 1}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Selected order detail panel — shown when a route is clicked. */
function SelectedOrderPanel({ route, onClose }) {
  if (!route) return null;
  const shipments = route.shipments || [];
  const totalCost = shipments.reduce((sum, s) => sum + parseFloat(s.totalCost || 0), 0);
  const totalDistance = shipments.reduce((sum, s) => sum + parseFloat(s.distanceKm || 0), 0);
  const isSplit = shipments.length > 1;

  return (
    <div
      className="absolute top-4 right-14 z-10 glass-card p-4 animate-fade-in"
      style={{ width: 300 }}
      role="region"
      aria-label="Selected order details"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="section-title">
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

      {/* Order ID + Status */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-mono truncate" style={{ maxWidth: 180 }}>
          {route.orderId}
        </p>
        <span className={`badge ${route.status === 'SPLIT' ? 'badge--warning' : route.status === 'FAILED' ? 'badge--danger' : 'badge--success'}`}>
          {route.status || 'ROUTED'}
        </span>
      </div>

      {/* Timestamp */}
      {route.createdAt && (
        <p className="text-[10px] text-[var(--color-text-muted)] mb-3">
          {new Date(route.createdAt).toLocaleString()}
        </p>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] p-2 text-center">
          <p className="text-label">Shipments</p>
          <p className="text-value">{shipments.length}</p>
        </div>
        <div className="rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] p-2 text-center">
          <p className="text-label">Total Cost</p>
          <p className="text-value" style={{ color: 'var(--color-accent)' }}>₹{totalCost.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] p-2 text-center">
          <p className="text-label">Distance</p>
          <p className="text-value">{totalDistance.toFixed(1)} km</p>
        </div>
      </div>

      {isSplit && (
        <span className="badge badge--warning mb-3" style={{ display: 'inline-flex' }}>
          Split Shipment — routed from {shipments.length} warehouses
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
                <span className="ml-auto badge badge--accent">
                  📦 {s.boxSize}
                </span>
              )}
              {s.delayRisk && (
                <span className={`badge ${
                  s.delayRisk === 'HIGH' ? 'badge--danger' : s.delayRisk === 'MEDIUM' ? 'badge--warning' : 'badge--success'
                } ${!s.boxSize ? 'ml-auto' : ''}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                  {s.delayRisk}
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="kpi-card animate-shimmer"
          style={{ height: 80 }}
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
function buildPopupHTML(warehouse, isOutageDown = false, isFailoverHub = false) {
  const stockStatus = isLowStock(warehouse);
  const statusLabel = isOutageDown
    ? '🚨 OUTAGE / OFFLINE (Simulated)'
    : isFailoverHub
      ? '⚡ Active Failover Backup Hub'
      : stockStatus
        ? 'Low Stock'
        : 'Healthy';
  const statusColor = isOutageDown
    ? '#ef4444'
    : isFailoverHub
      ? '#38bdf8'
      : stockStatus
        ? 'var(--color-warning)'
        : 'var(--color-success)';

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
  const navigate = useNavigate();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const truckMarkersRef = useRef([]);
  const animFrameRef = useRef(null);
  const [truckSimEnabled, setTruckSimEnabled] = useState(true);

  const [warehouses, setWarehouses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [highlightLowStock, setHighlightLowStock] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // What-If Warehouse Outage Simulator state (100% read-only simulation)
  const [outageMenuOpen, setOutageMenuOpen] = useState(false);
  const [outageLoading, setOutageLoading] = useState(false);
  const [outageError, setOutageError] = useState(null);
  const [outageSim, setOutageSim] = useState(null);
  const [outageModalOpen, setOutageModalOpen] = useState(false);
  const outageMenuRef = useRef(null);
  const hasFittedBoundsRef = useRef(false);
  const routesRef = useRef([]);
  routesRef.current = routes;

  // Close outage dropdown on outside click
  useEffect(() => {
    function handleOutsideClick(e) {
      if (outageMenuRef.current && !outageMenuRef.current.contains(e.target)) {
        setOutageMenuOpen(false);
      }
    }
    if (outageMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [outageMenuOpen]);

  /** Trigger read-only outage simulation for a given warehouse */
  async function handleSimulateOutage(warehouseId) {
    setOutageMenuOpen(false);
    setOutageLoading(true);
    setOutageError(null);
    setSelectedRoute(null);
    try {
      const result = await api.simulateOutage(warehouseId);
      setOutageSim(result);
      setOutageModalOpen(true);
    } catch (err) {
      setOutageError(err.message || 'Failed to simulate warehouse outage.');
    } finally {
      setOutageLoading(false);
    }
  }

  /** Restore all warehouses back to normal state */
  function handleRestoreAllHubs() {
    setOutageModalOpen(false);
    setOutageSim(null);
    setOutageError(null);
  }

  /** Fetch warehouse data (detailed inventory), map data (routes), and KPI stats. */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setStatsLoading(true);
    setError(null);
    try {
      // Fetch all three in parallel
      const [warehouseData, mapData, statsData] = await Promise.all([
        api.getWarehouses().catch(() => ({ warehouses: [] })),
        api.getMapData().catch(() => ({ warehouses: [], routes: [] })),
        api.getDashboardStats().catch(() => null),
      ]);

      // Merge inventory data from getWarehouses into map-data warehouses
      // so popups have detailed SKU inventory even from map-data source
      const inventoryMap = new Map();
      (warehouseData.warehouses || []).forEach((w) => {
        inventoryMap.set(w.id, w);
      });

      const enrichedWarehouses = (warehouseData.warehouses || []).map((w) => {
        // If map-data has health info for this warehouse, merge it
        const mapWh = (mapData.warehouses || []).find((mw) => mw.id === w.id);
        return {
          ...w,
          totalStock: mapWh?.totalStock ?? undefined,
          lowStockSkus: mapWh?.lowStockSkus ?? undefined,
          healthStatus: mapWh?.healthStatus ?? undefined,
        };
      });

      setWarehouses(enrichedWarehouses.length > 0 ? enrichedWarehouses : warehouseData.warehouses || []);
      setRoutes(mapData.routes || []);
      if (statsData) setStats(statsData);
    } catch (err) {
      setError(err.message || 'Unable to connect to the server. Check that the backend is running.');
    } finally {
      setLoading(false);
      setStatsLoading(false);
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
      addMarkers(mapRef.current, warehouses, outageSim);
      addRoutes(mapRef.current, routes, outageSim);
      setTimeout(() => mapRef.current?.resize(), 60);
      return;
    }

    // Calculate centroid for initial center
    const avgLat = warehouses.reduce((s, w) => s + w.lat, 0) / warehouses.length;
    const avgLng = warehouses.reduce((s, w) => s + w.lng, 0) / warehouses.length;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OSM_STYLE,
      center: [avgLng, avgLat],
      zoom: 4.5,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      addMarkers(map, warehouses, outageSim);
      addRoutes(map, routes, outageSim);

      // Add route click handler for all route layers
      map.on('click', (e) => {
        const currentRoutes = routesRef.current || [];
        const features = map.queryRenderedFeatures(e.point, {
          layers: map.getStyle().layers
            .filter((l) => l.id.startsWith('route-') && l.id.endsWith('-line'))
            .map((l) => l.id),
        });
        if (features.length > 0) {
          // Extract route index from layer id (route-{routeIdx}-{shipIdx}-line)
          const layerId = features[0].layer.id;
          const match = layerId.match(/route-(\d+)-/);
          if (match) {
            const routeIdx = parseInt(match[1], 10);
            if (currentRoutes[routeIdx]) {
              setSelectedRoute(currentRoutes[routeIdx]);
            }
          }
        }
      });

      // Change cursor on route hover
      const routeLayerIds = map.getStyle().layers
        .filter((l) => l.id.startsWith('route-') && l.id.endsWith('-line'))
        .map((l) => l.id);

      routeLayerIds.forEach((layerId) => {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      });
    });

    mapRef.current = map;

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      truckMarkersRef.current.forEach((m) => m.remove());
      truckMarkersRef.current = [];
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      hasFittedBoundsRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  // We intentionally depend on warehouses/routes/outageSim as data input
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses, routes, loading, error, outageSim]);

  // Resize map whenever outage drawer toggles
  useEffect(() => {
    const t = setTimeout(() => {
      mapRef.current?.resize();
    }, 80);
    return () => clearTimeout(t);
  }, [outageSim]);

  // Toggle truck marker visibility when simulation switch is pressed
  useEffect(() => {
    truckMarkersRef.current.forEach((m) => {
      const el = m.getElement();
      if (el) el.style.display = truckSimEnabled ? 'flex' : 'none';
    });
  }, [truckSimEnabled]);

  /** Add warehouse markers to the map. */
  function addMarkers(map, warehouseList, activeOutage = null) {
    const failedWhId = activeOutage?.disabledWarehouse?.id;
    const failoverIds = new Set(
      (activeOutage?.affectedOrders || [])
        .filter((o) => o.canReroute && o.newWarehouseId)
        .map((o) => o.newWarehouseId)
    );

    warehouseList.forEach((wh) => {
      const lowStock = isLowStock(wh);
      const isOutageDown = failedWhId === wh.id;
      const isFailoverHub = !isOutageDown && failoverIds.has(wh.id);

      // Create custom marker element
      const el = document.createElement('button');
      if (isOutageDown) {
        el.className = 'warehouse-marker warehouse-marker--outage';
        el.setAttribute('aria-label', `${wh.name} — Simulated Outage / Offline`);
        el.textContent = '🚨';
      } else if (isFailoverHub) {
        el.className = 'warehouse-marker warehouse-marker--failover';
        el.setAttribute('aria-label', `${wh.name} — Active Failover Backup Hub`);
        el.textContent = '⚡';
      } else {
        el.className = `warehouse-marker ${lowStock ? 'warehouse-marker--low-stock' : 'warehouse-marker--healthy'}`;
        el.setAttribute('aria-label', `${wh.name} — ${lowStock ? 'Low Stock' : 'Healthy Stock'}`);
        el.textContent = lowStock ? '▼' : '✓';
      }
      el.setAttribute('tabindex', '0');

      const popup = new maplibregl.Popup({
        offset: 20,
        closeButton: true,
        closeOnClick: true,
        maxWidth: '320px',
      }).setHTML(buildPopupHTML(wh, isOutageDown, isFailoverHub));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([wh.lng, wh.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (warehouseList.length > 1 && !hasFittedBoundsRef.current) {
      hasFittedBoundsRef.current = true;
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
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    truckMarkersRef.current.forEach((m) => m.remove());
    truckMarkersRef.current = [];

    const style = map.getStyle();
    if (!style || !style.layers) return;

    style.layers.forEach((layer) => {
      if (layer.id.startsWith('route-') || layer.id.startsWith('failover-')) {
        map.removeLayer(layer.id);
      }
    });

    Object.keys(style.sources || {}).forEach((sourceId) => {
      if (sourceId.startsWith('route-') || sourceId.startsWith('failover-')) {
        map.removeSource(sourceId);
      }
    });
  }

  /** Add route lines (warehouse → customer) using GeoJSON with real road curvature. */
  function addRoutes(map, routeList, activeOutage = null) {
    if (!routeList || routeList.length === 0) return;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    truckMarkersRef.current.forEach((m) => m.remove());
    truckMarkersRef.current = [];
    const trajectories = [];

    const failedWhId = activeOutage?.disabledWarehouse?.id;
    const affectedByOrderId = new Map();
    if (activeOutage?.affectedOrders) {
      activeOutage.affectedOrders.forEach((ao) => affectedByOrderId.set(ao.orderId, ao));
    }

    routeList.forEach((route, routeIdx) => {
      if (!route.customer || !route.shipments) return;
      if (route.status === 'CANCELLED') return; // Cancelled deliveries are halted, so skip drawing active route on map

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
        const isSeveredByOutage = failedWhId && shipment.warehouseId === failedWhId;
        const sourceId = `route-${routeIdx}-${shipIdx}`;
        const color = isSeveredByOutage ? '#ef4444' : ROUTE_COLORS[shipIdx % ROUTE_COLORS.length];

        const initialCoords = (shipment.coordinates && shipment.coordinates.length > 1)
          ? shipment.coordinates
          : [
              [shipment.warehouseLng, shipment.warehouseLat],
              [customerLng, customerLat],
            ];

        const isRoadRoute = initialCoords.length > 2;

        const makeGeojson = (coords) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
          properties: {
            warehouseName: shipment.warehouseName,
            distanceKm: shipment.distanceKm,
            boxSize: shipment.boxSize,
          },
        });

        // Add or update source
        if (map.getSource(sourceId)) {
          map.getSource(sourceId).setData(makeGeojson(initialCoords));
        } else {
          map.addSource(sourceId, { type: 'geojson', data: makeGeojson(initialCoords) });

          // Subtle glow under the route line
          map.addLayer({
            id: `${sourceId}-glow`,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': color,
              'line-width': isSeveredByOutage ? 3 : (isRoadRoute ? 7 : 4),
              'line-opacity': isSeveredByOutage ? 0.12 : 0.25,
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          });

          // Primary route line (or faint severed red dashed line during outage sim)
          map.addLayer({
            id: `${sourceId}-line`,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': color,
              'line-width': isSeveredByOutage ? 2 : (isRoadRoute ? 3.5 : 2.5),
              'line-opacity': isSeveredByOutage ? 0.35 : 0.9,
              ...(isSeveredByOutage
                ? { 'line-dasharray': [2, 3] }
                : (isRoadRoute ? {} : { 'line-dasharray': [2, 2] })),
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          });
        }

        // Skip placing an active truck on a severed outage route
        if (!isSeveredByOutage) {
          // Create live simulation truck marker
          const truckEl = document.createElement('div');
          truckEl.className = 'simulated-truck-marker';
          truckEl.title = `In Transit: ${shipment.warehouseName} → Delivery Destination\nBox: ${shipment.boxSize || 'Standard'}\nClick to view order`;
          truckEl.style.cssText = `
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: var(--color-bg-card-solid, #ffffff);
            border: 2px solid ${color};
            box-shadow: 0 0 10px ${color}88, 0 3px 8px rgba(0,0,0,0.3);
            display: ${truckSimEnabled ? 'flex' : 'none'};
            align-items: center;
            justify-content: center;
            font-size: 13px;
            cursor: pointer;
            transition: transform 0.15s ease;
            user-select: none;
          `;
          truckEl.innerHTML = '🚚';
          truckEl.addEventListener('mouseenter', () => { truckEl.style.transform = 'scale(1.25)'; });
          truckEl.addEventListener('mouseleave', () => { truckEl.style.transform = 'scale(1)'; });
          truckEl.addEventListener('click', (e) => {
            e.stopPropagation();
            setSelectedRoute(route);
          });

          const truckMarker = new maplibregl.Marker({ element: truckEl })
            .setLngLat(initialCoords[0])
            .addTo(map);

          truckMarkersRef.current.push(truckMarker);

          const traj = {
            id: sourceId,
            coords: initialCoords,
            progress: (shipIdx * 0.35 + routeIdx * 0.25) % 1,
            speed: 0.0006,
            marker: truckMarker,
          };
          trajectories.push(traj);

          // If road coordinates weren't preloaded, fetch them dynamically via OSRM
          if (!isRoadRoute && shipment.warehouseLat && shipment.warehouseLng && customerLat && customerLng) {
            api.getRoadGeometry(shipment.warehouseLat, shipment.warehouseLng, customerLat, customerLng)
              .then((res) => {
                if (res?.coordinates && res.coordinates.length > 2) {
                  traj.coords = res.coordinates;
                  if (map.getSource(sourceId)) {
                    map.getSource(sourceId).setData(makeGeojson(res.coordinates));
                  }
                  if (map.getLayer(`${sourceId}-line`)) {
                    map.setPaintProperty(`${sourceId}-line`, 'line-width', 3.5);
                    map.setPaintProperty(`${sourceId}-line`, 'line-opacity', 0.9);
                    map.setPaintProperty(`${sourceId}-line`, 'line-dasharray', null);
                  }
                  if (map.getLayer(`${sourceId}-glow`)) {
                    map.setPaintProperty(`${sourceId}-glow`, 'line-width', 7);
                    map.setPaintProperty(`${sourceId}-glow`, 'line-opacity', 0.25);
                  }
                }
              })
              .catch(() => {
                // Silently keep straight-line fallback
              });
          }
        }
      });

      // Draw dynamic failover route if this order is affected & reroutable
      const affected = affectedByOrderId.get(route.orderId);
      if (affected && affected.canReroute && affected.roadCoordinates?.length > 1) {
        const failoverSourceId = `failover-${routeIdx}`;
        const failoverGeojson = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: affected.roadCoordinates,
          },
          properties: {
            warehouseName: affected.newHub,
          },
        };

        map.addSource(failoverSourceId, { type: 'geojson', data: failoverGeojson });
        map.addLayer({
          id: `${failoverSourceId}-glow`,
          type: 'line',
          source: failoverSourceId,
          paint: {
            'line-color': '#f59e0b',
            'line-width': 9,
            'line-opacity': 0.28,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: `${failoverSourceId}-line`,
          type: 'line',
          source: failoverSourceId,
          paint: {
            'line-color': '#f59e0b',
            'line-width': 4,
            'line-opacity': 0.95,
            'line-dasharray': [3, 2],
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });

        // Animated failover truck marker
        const failoverTruckEl = document.createElement('div');
        failoverTruckEl.className = 'simulated-truck-marker';
        failoverTruckEl.title = `Failover Re-Route: ${affected.newHub} → Customer (${affected.etaImpact})`;
        failoverTruckEl.style.cssText = `
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: #fffbeb;
          border: 2.5px solid #f59e0b;
          box-shadow: 0 0 14px rgba(245, 158, 11, 0.85), 0 3px 10px rgba(0,0,0,0.35);
          display: ${truckSimEnabled ? 'flex' : 'none'};
          align-items: center;
          justify-content: center;
          font-size: 14px;
          cursor: pointer;
          user-select: none;
        `;
        failoverTruckEl.innerHTML = '⚡';

        const failoverMarker = new maplibregl.Marker({ element: failoverTruckEl })
          .setLngLat(affected.roadCoordinates[0])
          .addTo(map);
        truckMarkersRef.current.push(failoverMarker);

        trajectories.push({
          id: failoverSourceId,
          coords: affected.roadCoordinates,
          progress: (routeIdx * 0.25) % 1,
          speed: 0.0009,
          marker: failoverMarker,
        });
      }
    });

    // Start continuous truck animation loop
    function animateTrucks() {
      trajectories.forEach((t) => {
        if (!t.coords || t.coords.length < 2) return;
        t.progress = (t.progress + t.speed) % 1;
        const totalSegs = t.coords.length - 1;
        const exactIdx = t.progress * totalSegs;
        const idx = Math.floor(exactIdx);
        const frac = exactIdx - idx;
        const p1 = t.coords[idx];
        const p2 = t.coords[Math.min(idx + 1, totalSegs)];
        if (p1 && p2) {
          const lng = p1[0] + (p2[0] - p1[0]) * frac;
          const lat = p1[1] + (p2[1] - p1[1]) * frac;
          t.marker.setLngLat([lng, lat]);
        }
      });
      animFrameRef.current = requestAnimationFrame(animateTrucks);
    }
    animFrameRef.current = requestAnimationFrame(animateTrucks);
  }

  /** Fit map bounds to all markers */
  function handleFitBounds() {
    if (!mapRef.current || warehouses.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    warehouses.forEach((wh) => bounds.extend([wh.lng, wh.lat]));
    routes.forEach((route) => {
      if (route.customer) bounds.extend([route.customer.lng, route.customer.lat]);
    });
    mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 800 });
  }

  // ─── Computed stats (prefer backend /stats, fallback to client-side) ─
  const activeWarehouses = stats?.warehouseHealth?.active ?? warehouses.filter((w) => w.active).length;
  const totalOrders = stats?.totalOrders ?? routes.length;
  const lowStockCount = stats?.warehouseHealth?.lowStock ?? warehouses.filter(isLowStock).length;
  const fulfilledOrders = stats?.ordersByStatus?.fulfilled ?? 0;
  const activeRoutes = routes.length;
  const atRiskCount = stats?.delayRiskSummary?.atRiskCount ?? 0;

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title" style={{ marginBottom: 6 }}>
          Control Tower
        </h1>
        <p className="page-subtitle">
          Real-time warehouse inventory, multi-shipment routes, and active order monitoring
        </p>
      </div>

      {/* KPI Stats */}
      {loading ? (
        <SkeletonStats />
      ) : !error && warehouses.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" style={{ marginBottom: 28 }}>
          <KpiCard
            icon={<WarehouseIcon />}
            label="Active Warehouses"
            value={activeWarehouses}
            accentColor="var(--color-accent)"
            loading={statsLoading}
          />
          <KpiCard
            icon={<PackageIcon />}
            label="Total Orders"
            value={totalOrders}
            accentColor="var(--color-success)"
            loading={statsLoading}
          />
          <KpiCard
            icon={<AlertTriangleIcon />}
            label="Low Stock Alerts"
            value={lowStockCount}
            accentColor={lowStockCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
            onClick={() => setHighlightLowStock((prev) => !prev)}
            isActive={highlightLowStock}
            loading={statsLoading}
          />
          <KpiCard
            icon={<RouteIcon />}
            label="Fulfilled"
            value={fulfilledOrders}
            accentColor="var(--color-success)"
            loading={statsLoading}
          />
          <KpiCard
            icon={<AtRiskIcon />}
            label="At-Risk Shipments"
            value={atRiskCount}
            accentColor={atRiskCount > 0 ? '#ef4444' : 'var(--color-success)'}
            loading={statsLoading}
          />
        </div>
      ) : null}

      <div>
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
          {/* Network Map Section Card — styled exactly as an Analytics.jsx Section */}
          <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 28, borderRadius: 'var(--radius-lg)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-2.5">
                <span style={{ fontSize: 16 }}>🗺️</span>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                    Network Map & Active Routes
                  </h3>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                    {warehouses.length} active fulfillment centers across India • {routes.length} routed deliveries
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {highlightLowStock && lowStockCount > 0 && (
                  <div className="flex items-center gap-1.5 mr-1 animate-fade-in">
                    <span className="badge badge--warning">
                      {lowStockCount} Low-Stock Filtered
                    </span>
                    <button
                      onClick={() => setHighlightLowStock(false)}
                      className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
                <button
                  onClick={handleFitBounds}
                  className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-hover)] text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  aria-label="Fit map to all markers"
                >
                  <svg className="w-3.5 h-3.5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                  Fit All
                </button>
                <button
                  onClick={fetchData}
                  className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-hover)] text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  aria-label="Refresh map data"
                >
                  <svg className="w-3.5 h-3.5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                  </svg>
                  Refresh
                </button>
                <button
                  onClick={() => setTruckSimEnabled(prev => !prev)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
                    truckSimEnabled
                      ? 'border-[var(--color-success)] bg-[var(--color-success-glow)] text-[var(--color-success)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-muted)]'
                  }`}
                  title="Toggle live delivery trucks simulation on map"
                >
                  <span>🚚</span>
                  <span>{truckSimEnabled ? 'Truck Sim: ON' : 'Truck Sim: OFF'}</span>
                </button>

                {/* Outage Simulator Selector */}
                <div className="relative" ref={outageMenuRef}>
                  <button
                    onClick={() => setOutageMenuOpen(prev => !prev)}
                    disabled={outageLoading}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: outageSim ? '1px solid rgba(239, 68, 68, 0.55)' : '1px solid rgba(245, 158, 11, 0.45)',
                      background: outageSim ? 'rgba(239, 68, 68, 0.14)' : 'rgba(245, 158, 11, 0.12)',
                      color: outageSim ? '#f87171' : '#f59e0b',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                    }}
                    title="Simulate a warehouse outage and preview dynamic failover routing"
                  >
                    <span>{outageLoading ? '⏳' : '⚡'}</span>
                    <span>
                      {outageLoading
                        ? 'Simulating…'
                        : outageSim
                          ? `Outage: ${outageSim.disabledWarehouse.name}`
                          : 'Outage Simulator'}
                    </span>
                    <span style={{ fontSize: 10, opacity: 0.75 }}>▾</span>
                  </button>

                  {outageMenuOpen && (
                    <div
                      className="absolute right-0 z-30 animate-fade-in"
                      style={{
                        marginTop: 8,
                        width: 300,
                        padding: 10,
                        borderRadius: 14,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-card-solid)',
                        boxShadow: '0 18px 44px rgba(0, 0, 0, 0.38)',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <div style={{ padding: '6px 10px 10px', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 6 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-primary)', margin: 0 }}>
                          What-If Outage Simulator
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: '3px 0 0' }}>
                          Select a hub to simulate failure (Read-only · Zero DB changes)
                        </p>
                      </div>
                      <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {warehouses.filter(w => w.active !== false).map(wh => {
                          const isCurrentOutage = outageSim?.disabledWarehouse?.id === wh.id;
                          return (
                            <button
                              key={wh.id}
                              onClick={() => handleSimulateOutage(wh.id)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '9px 10px',
                                borderRadius: 8,
                                border: 'none',
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                cursor: 'pointer',
                                background: isCurrentOutage ? 'rgba(239, 68, 68, 0.14)' : 'transparent',
                                color: isCurrentOutage ? '#f87171' : 'var(--color-text-primary)',
                                fontWeight: isCurrentOutage ? 600 : 500,
                              }}
                              onMouseEnter={e => { if (!isCurrentOutage) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                              onMouseLeave={e => { if (!isCurrentOutage) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span className="truncate">Simulate {wh.name} Failure</span>
                              <span style={{
                                fontSize: 10, flexShrink: 0, padding: '2px 7px', borderRadius: 6,
                                background: 'rgba(239, 68, 68, 0.12)', color: '#f87171', fontWeight: 700,
                              }}>
                                {isCurrentOutage ? 'ACTIVE' : 'TEST'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {outageSim && (
                        <div style={{ paddingTop: 8, marginTop: 6, borderTop: '1px solid var(--color-border-subtle)' }}>
                          <button
                            onClick={() => { setOutageMenuOpen(false); handleRestoreAllHubs(); }}
                            style={{
                              width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none',
                              fontSize: 12, fontWeight: 600, background: 'rgba(16, 185, 129, 0.14)',
                              color: '#10b981', cursor: 'pointer', textAlign: 'center',
                            }}
                          >
                            ↺ Restore All Hubs
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {outageSim && (
                  <>
                    <button
                      onClick={() => setOutageModalOpen(true)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(56, 189, 248, 0.45)',
                        background: 'rgba(56, 189, 248, 0.12)',
                        color: '#38bdf8',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                      }}
                    >
                      <span>📊</span>
                      <span>Impact Report</span>
                    </button>
                    <button
                      onClick={handleRestoreAllHubs}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(16, 185, 129, 0.45)',
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: '#10b981',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                      }}
                    >
                      <span>↺</span>
                      <span>Restore All Hubs</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {outageError && (
              <div style={{
                marginBottom: 12, padding: '10px 16px', borderRadius: 10,
                border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)',
                color: '#f87171', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>⚠ {outageError}</span>
                <button onClick={() => setOutageError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 700, marginLeft: 16 }}>✕</button>
              </div>
            )}

            {/* Full-Width Live Network Map (never squished!) */}
            <div className="relative overflow-hidden" style={{ minHeight: '440px', borderRadius: 'var(--radius-md)', border: outageSim ? '1.5px solid rgba(239, 68, 68, 0.55)' : '1px solid var(--color-border)' }}>
              <div ref={mapContainerRef} className="w-full" style={{ height: 'clamp(420px, 52vh, 560px)' }} />
              <MapLegend outageActive={Boolean(outageSim)} />
              <SelectedOrderPanel route={selectedRoute} onClose={() => setSelectedRoute(null)} />

              {/* Compact Floating Outage Status Pill on Map (when modal is minimized/closed) */}
              {outageSim && !outageModalOpen && (
                <div
                  className="animate-fade-in"
                  style={{
                    position: 'absolute',
                    top: 14,
                    left: 14,
                    zIndex: 15,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: 'var(--color-bg-card-solid)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
                  }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 700, color: '#ef4444',
                  }}>
                    🚨 {outageSim.disabledWarehouse.name} OFFLINE
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    {outageSim.summary.totalAffected} order{outageSim.summary.totalAffected !== 1 ? 's' : ''} re-routed
                    {outageSim.summary.totalAffected > 0 ? ` (${outageSim.summary.avgCostIncrease >= 0 ? '+' : ''}₹${outageSim.summary.avgCostIncrease.toFixed(2)})` : ''}
                  </span>
                  <button
                    onClick={() => setOutageModalOpen(true)}
                    style={{
                      padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: 'var(--color-accent-gradient)', color: '#fff',
                      fontSize: 11, fontWeight: 600,
                    }}
                  >
                    📊 View Report
                  </button>
                  <button
                    onClick={handleRestoreAllHubs}
                    style={{
                      padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
                      border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.12)',
                      color: '#10b981', fontSize: 11, fontWeight: 600,
                    }}
                  >
                    ↺ Restore
                  </button>
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════
             *  OUTAGE SIMULATION REPORT POP-UP MODAL (OrderConfirmation style)
             * ═══════════════════════════════════════════════════════ */}
            {outageSim && outageModalOpen && (
              <div
                id="outage-sim-modal-backdrop"
                onClick={(e) => { if (e.target.id === 'outage-sim-modal-backdrop') setOutageModalOpen(false); }}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 9999,
                  backgroundColor: 'rgba(2, 6, 23, 0.72)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px 16px',
                  overflowY: 'auto',
                }}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Warehouse Outage Simulation Report"
                  className="animate-fade-in"
                  style={{
                    width: '100%',
                    maxWidth: 660,
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    background: 'var(--color-bg-card-solid)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 20,
                    padding: '28px 30px',
                    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
                    fontFamily: 'var(--font-sans)',
                    position: 'relative',
                  }}
                >
                  {/* Top Close / Back bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <button
                      onClick={() => setOutageModalOpen(false)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                        background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                        color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600,
                      }}
                    >
                      ← Back to Live Map
                    </button>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '4px 10px', borderRadius: 99,
                      background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.28)',
                    }}>
                      Read-Only Dry Run · Zero DB Changes
                    </span>
                    <button
                      onClick={() => setOutageModalOpen(false)}
                      aria-label="Close outage simulation report"
                      style={{
                        width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                        background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                        color: 'var(--color-text-muted)', fontSize: 15, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Hero Status Section (Order Confirmed style) */}
                  <div style={{ textAlign: 'center', marginBottom: 22 }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%', margin: '0 auto 14px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '2.5px solid #ef4444',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 28,
                      boxShadow: '0 0 24px rgba(239, 68, 68, 0.3)',
                    }}>
                      🚨
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                      Outage Failover Simulated
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                      Dynamic routing engine re-evaluated active deliveries with{' '}
                      <strong style={{ color: '#f87171' }}>{outageSim.disabledWarehouse.name}</strong> offline
                    </p>
                  </div>

                  {/* Simulated Hub Status Strip */}
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.28)',
                    borderRadius: 14,
                    padding: '14px 18px',
                    marginBottom: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f87171', margin: '0 0 3px' }}>
                        Simulated Offline Hub
                      </p>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                        {outageSim.disabledWarehouse.name}
                      </p>
                    </div>
                    <span style={{
                      padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: 'rgba(239, 68, 68, 0.18)', color: '#f87171',
                    }}>
                      ● OFFLINE (SIMULATED)
                    </span>
                  </div>

                  {/* 4 Spacious KPI Summary Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 12,
                    marginBottom: 20,
                  }}>
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>Impacted Orders</p>
                      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>{outageSim.summary.totalAffected}</p>
                    </div>
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>Failover Success</p>
                      <p style={{ fontSize: 22, fontWeight: 800, color: outageSim.summary.canFullyReroute ? '#10b981' : '#f59e0b', margin: 0 }}>
                        {outageSim.summary.totalAffected === 0
                          ? '100%'
                          : `${Math.round((outageSim.summary.rerouteableCount / outageSim.summary.totalAffected) * 100)}%`}
                      </p>
                    </div>
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>Avg Cost Delta</p>
                      <p style={{ fontSize: 20, fontWeight: 800, color: outageSim.summary.avgCostIncrease > 0 ? '#f59e0b' : '#10b981', margin: 0 }}>
                        {outageSim.summary.avgCostIncrease >= 0 ? '+' : ''}₹{outageSim.summary.avgCostIncrease.toFixed(2)}
                      </p>
                    </div>
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>Avg Dist Delta</p>
                      <p style={{ fontSize: 20, fontWeight: 800, color: '#38bdf8', margin: 0 }}>
                        {outageSim.summary.avgDistanceIncrease >= 0 ? '+' : ''}{outageSim.summary.avgDistanceIncrease.toFixed(1)} km
                      </p>
                    </div>
                  </div>

                  {/* Per-Order Breakdown Cards */}
                  {outageSim.affectedOrders.length === 0 ? (
                    <div style={{
                      borderRadius: 14, padding: '20px 22px', textAlign: 'center', marginBottom: 22,
                      background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)',
                    }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#10b981', margin: '0 0 6px' }}>
                        ✓ 100% Network Resilience — Zero Active Orders Impacted
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
                        Abhi {outageSim.disabledWarehouse.name} par koi active in-transit order assigned nahi hai. Baaki {outageSim.healthyWarehouses?.length || 0} backup hubs online hain.
                      </p>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 22 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
                        Dynamic Failover Re-Routing ({outageSim.affectedOrders.length})
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {outageSim.affectedOrders.map((ao) => (
                          <div
                            key={ao.orderId}
                            style={{
                              borderRadius: 14,
                              padding: '16px 18px',
                              background: 'var(--color-surface-subtle, var(--color-bg-primary))',
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                              <span style={{
                                fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                                padding: '3px 9px', borderRadius: 6,
                                background: 'rgba(129, 140, 248, 0.12)', color: 'var(--color-accent)',
                              }}>
                                ORD-{ao.orderId.slice(0, 8)}
                              </span>
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                                background: ao.canReroute ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                                color: ao.canReroute ? '#10b981' : '#f87171',
                              }}>
                                {ao.canReroute ? `✓ Stock ${ao.stockFeasibility}% Available` : '✕ Stock Shortfall'}
                              </span>
                            </div>

                            {ao.canReroute ? (
                              <>
                                {/* Hub Transfer Visual Row */}
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                                  padding: '10px 12px', borderRadius: 10, marginBottom: 12,
                                  background: 'var(--color-bg-hover)',
                                }}>
                                  <span style={{ fontSize: 12, color: '#f87171', textDecoration: 'line-through', fontWeight: 500 }}>
                                    🚨 {ao.originalHub}
                                  </span>
                                  <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>→</span>
                                  <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>
                                    ⚡ {ao.newHub}
                                  </span>
                                </div>

                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(3, 1fr)',
                                  gap: 10,
                                  paddingTop: 10,
                                  borderTop: '1px solid var(--color-border-subtle)',
                                }}>
                                  <div>
                                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Cost Delta</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: ao.costDelta > 0 ? '#f59e0b' : '#10b981' }}>
                                      {ao.costDelta >= 0 ? '+' : ''}₹{ao.costDelta.toFixed(2)}
                                    </span>
                                  </div>
                                  <div>
                                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Distance Delta</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>
                                      {ao.distanceDelta >= 0 ? '+' : ''}{ao.distanceDelta.toFixed(1)} km
                                    </span>
                                  </div>
                                  <div>
                                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>ETA Impact</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                      {ao.etaImpact}
                                    </span>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>
                                ⚠ {ao.reason || 'Insufficient backup stock at alternate hubs'}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setOutageModalOpen(false)}
                      style={{
                        flex: 1, minWidth: 180, padding: '12px 18px', borderRadius: 10, cursor: 'pointer',
                        background: 'var(--color-accent-gradient)', border: 'none', color: '#fff',
                        fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <span>🗺️</span>
                      <span>View Re-Routing on Live Map</span>
                    </button>
                    <button
                      onClick={handleRestoreAllHubs}
                      style={{
                        flex: 1, minWidth: 160, padding: '12px 18px', borderRadius: 10, cursor: 'pointer',
                        background: 'rgba(16, 185, 129, 0.14)', border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#10b981', fontSize: 13, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <span>↺</span>
                      <span>Restore All Hubs</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recent Orders List Card — styled exactly as an Analytics.jsx Section */}
          {routes.length > 0 && (
            <div className="glass-card" style={{ padding: '20px 24px', borderRadius: 'var(--radius-lg)' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ marginBottom: 20 }}>
                <div className="flex items-center gap-2.5">
                  <span style={{ fontSize: 16 }}>📦</span>
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                      Recent Routed Orders
                    </h3>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                      Click any order card to focus its route on the map, or click Details to view full multi-step algorithm analysis
                    </p>
                  </div>
                </div>
                <span className="badge badge--accent self-start sm:self-auto">
                  {routes.length} Active Route{routes.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {routes.slice(0, 12).map((route) => {
                  const isSelected = selectedRoute?.orderId === route.orderId;
                  const isSplit = (route.shipments || []).length > 1;
                  const highestRisk = (route.shipments || []).reduce((acc, s) => {
                    if (s.delayRisk === 'HIGH' || acc === 'HIGH') return 'HIGH';
                    if (s.delayRisk === 'MEDIUM' || acc === 'MEDIUM') return 'MEDIUM';
                    if (s.delayRisk === 'LOW') return acc || 'LOW';
                    return acc;
                  }, null);
                  const riskDotColor = highestRisk === 'HIGH' ? '#ef4444' : highestRisk === 'MEDIUM' ? '#f59e0b' : '#10b981';
                  const totalOrderCost = (route.shipments || []).reduce((sum, s) => sum + parseFloat(s.totalCost || 0), 0);

                  return (
                    <div
                      key={route.orderId}
                      onClick={() => setSelectedRoute(isSelected ? null : route)}
                      className={`text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-glow)] shadow-md'
                          : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-accent)] hover:shadow-sm'
                      }`}
                      style={{ minHeight: 110 }}
                    >
                      {/* Top row: Order badge + risk */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--color-bg-hover)] text-[var(--color-accent)] font-mono">
                            ORD-{route.orderId?.slice(0, 8)}
                          </span>
                          {isSplit && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                              Split
                            </span>
                          )}
                          {route.status === 'CANCELLED' && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 dark:text-red-400">
                              Cancelled
                            </span>
                          )}
                        </div>
                        {highestRisk && (
                          <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: riskDotColor }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: riskDotColor }} />
                            {highestRisk} Risk
                          </span>
                        )}
                      </div>

                      {/* Origin Warehouses */}
                      <div className="flex items-center gap-2 my-1">
                        <div className="flex -space-x-1 shrink-0">
                          {(route.shipments || []).slice(0, 3).map((s, idx) => (
                            <span
                              key={idx}
                              className="w-3 h-3 rounded-full border-2 border-[var(--color-bg-primary)]"
                              style={{ background: ROUTE_COLORS[idx % ROUTE_COLORS.length] }}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-[var(--color-text-primary)] font-semibold truncate">
                          {(route.shipments || []).map((s) => s.warehouseName).join(' + ')}
                        </span>
                      </div>

                      {/* Bottom row: Shipments & Cost & Link */}
                      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-[var(--color-border-subtle)]">
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          📦 {route.shipments?.length || 0} shipment{(route.shipments?.length || 0) !== 1 ? 's' : ''}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--color-success)] font-bold">
                            ₹{totalOrderCost.toFixed(2)}
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/host/orders/${route.orderId}`);
                            }}
                            className="text-[11px] text-[var(--color-accent)] font-semibold hover:underline"
                            title="Open order analysis"
                          >
                            Details →
                          </span>
                        </div>
                      </div>
                    </div>
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
