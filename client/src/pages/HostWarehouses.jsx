/**
 * HostWarehouses — Host Warehouse Management with Interactive Map
 *
 * Full CRUD interface for Host administrators to manage warehouses.
 * Features:
 *   - Card grid of all warehouses with status badges
 *   - Add / Edit modal with interactive MapLibre GL map
 *   - Click-to-place or drag pin to set lat/lng coordinates
 *   - Soft-delete (deactivate) with confirmation dialog
 *   - Toast notifications and shimmer loading states
 *
 * Uses the enterprise dark-mode design tokens from index.css.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as api from '../lib/apiClient';

/* ── Constants ───────────────────────────────────────────── */
const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

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
  btnDanger: {
    padding: '10px 20px',
    background: 'var(--color-danger)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition: 'transform 0.15s, opacity 0.2s',
  },
};

/* ── Toast notification ──────────────────────────────────── */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === 'success'
    ? 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(16,185,129,0.1))'
    : 'linear-gradient(135deg, rgba(248,113,113,0.15), rgba(239,68,68,0.1))';
  const border = type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)';
  const icon = type === 'success' ? '✓' : '✕';
  const iconColor = type === 'success' ? 'var(--color-success)' : 'var(--color-danger)';

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: bg, border: `1px solid ${border}`,
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 'var(--radius-md)', padding: '14px 20px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      animation: 'slideUp 0.3s ease-out',
      fontFamily: 'var(--font-sans)',
    }}>
      <span style={{ color: iconColor, fontWeight: 700, fontSize: 16 }}>{icon}</span>
      <span style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 500 }}>{message}</span>
    </div>
  );
}

/* ── Interactive Map Picker Component ────────────────────── */
function MapPicker({ lat, lng, onLocationChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [lng || INDIA_CENTER.lng, lat || INDIA_CENTER.lat],
      zoom: lat && lng ? 10 : 4.5,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    const marker = new maplibregl.Marker({ color: '#818cf8', draggable: true })
      .setLngLat([lng || INDIA_CENTER.lng, lat || INDIA_CENTER.lat])
      .addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLngLat();
      onLocationChange(
        Math.round(pos.lat * 10000) / 10000,
        Math.round(pos.lng * 10000) / 10000
      );
    });

    map.on('click', (e) => {
      const { lat: newLat, lng: newLng } = e.lngLat;
      marker.setLngLat([newLng, newLat]);
      onLocationChange(
        Math.round(newLat * 10000) / 10000,
        Math.round(newLng * 10000) / 10000
      );
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker position when lat/lng props change externally (e.g. manual input)
  useEffect(() => {
    if (markerRef.current && lat && lng) {
      const current = markerRef.current.getLngLat();
      if (Math.abs(current.lat - lat) > 0.0001 || Math.abs(current.lng - lng) > 0.0001) {
        markerRef.current.setLngLat([lng, lat]);
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 10, duration: 800 });
      }
    }
  }, [lat, lng]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%', height: 280,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
        }}
      />
      {/* Instruction overlay */}
      <div style={{
        position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        padding: '6px 14px', borderRadius: 999,
        fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500,
        pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        Click to place • Drag pin to adjust
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  HOST WAREHOUSES PAGE                                      */
/* ═══════════════════════════════════════════════════════════ */
export default function HostWarehouses() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', lat: '', lng: '', active: true });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirmation
  const [deleteId, setDeleteId] = useState(null);
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  /* ── Fetch warehouses ────────────────────────────────────── */
  const fetchWarehouses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getWarehouses();
      setWarehouses(data.warehouses || []);
    } catch {
      setWarehouses([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

  /* ── Filtered list ───────────────────────────────────────── */
  const filtered = search.trim()
    ? warehouses.filter(w =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.id.toLowerCase().includes(search.toLowerCase())
      )
    : warehouses;

  /* ── Modal helpers ───────────────────────────────────────── */
  function openAdd() {
    setEditingId(null);
    setForm({ name: '', lat: '', lng: '', active: true });
    setFormError('');
    setShowModal(true);
  }

  function openEdit(wh) {
    setEditingId(wh.id);
    setForm({
      name: wh.name,
      lat: String(wh.lat),
      lng: String(wh.lng),
      active: wh.active,
    });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm({ name: '', lat: '', lng: '', active: true });
    setFormError('');
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function handleMapLocation(lat, lng) {
    setForm(prev => ({ ...prev, lat: String(lat), lng: String(lng) }));
  }

  /* ── Save (create / update) ──────────────────────────────── */
  async function handleSave(e) {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) {
      setFormError('Warehouse name is required.');
      return;
    }
    if (!form.lat || !form.lng) {
      setFormError('Please set coordinates by clicking on the map or entering values.');
      return;
    }

    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setFormError('Invalid coordinates. Lat: -90 to 90, Lng: -180 to 180.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        lat,
        lng,
        active: form.active,
      };

      if (editingId) {
        await api.updateWarehouse(editingId, payload);
        setToast({ message: `Warehouse "${form.name}" updated`, type: 'success' });
      } else {
        await api.createWarehouse(payload);
        setToast({ message: `Warehouse "${form.name}" created`, type: 'success' });
      }

      closeModal();
      fetchWarehouses();
    } catch (err) {
      setFormError(err.message || 'Something went wrong');
    }
    setSaving(false);
  }

  /* ── Delete (deactivate) ─────────────────────────────────── */
  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.deleteWarehouse(deleteId);
      setToast({ message: `Warehouse deactivated`, type: 'success' });
      setDeleteId(null);
      setDeleteName('');
      fetchWarehouses();
    } catch (err) {
      setToast({ message: err.message || 'Delete failed', type: 'error' });
    }
    setDeleting(false);
  }

  /* ── Stats ───────────────────────────────────────────────── */
  const activeCount = warehouses.filter(w => w.active).length;
  const inactiveCount = warehouses.length - activeCount;
  const totalSKUs = warehouses.reduce((sum, w) => sum + (w.inventory?.length || 0), 0);

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em',
          color: 'var(--color-text-primary)', margin: 0,
        }}>
          <span style={{
            background: 'var(--color-accent-gradient)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Warehouse</span> Network
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>
          Manage warehouse locations and coordinates
        </p>
      </div>

      {/* ── Stats Row ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Warehouses', value: warehouses.length, color: 'var(--color-accent)' },
          { label: 'Active', value: activeCount, color: 'var(--color-success)' },
          { label: 'Inactive', value: inactiveCount, color: 'var(--color-danger)' },
          { label: 'SKU Assignments', value: totalSKUs, color: 'var(--color-warning)' },
        ].map(stat => (
          <div key={stat.label} style={{
            ...S.glass, padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 'var(--radius-sm)',
              background: `${stat.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: stat.color, fontWeight: 800, fontSize: 16,
            }}>
              {stat.value}
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div style={{
        ...S.glass, padding: '16px 20px', marginBottom: 24,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200 }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
            width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="var(--color-text-muted)" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search warehouses…"
            style={{ ...S.input, paddingLeft: 36 }}
          />
        </div>

        {/* Add button */}
        <button
          onClick={openAdd}
          style={{ ...S.btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-glow)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Warehouse
        </button>
      </div>

      {/* ── Warehouse Cards Grid ────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ ...S.glass, padding: 24, height: 160 }}>
              <div style={{ width: 160, height: 14, borderRadius: 4, background: 'var(--color-bg-hover)', marginBottom: 12,
                animation: 'shimmer 1.5s infinite', backgroundSize: '200% 100%',
                backgroundImage: 'linear-gradient(90deg, var(--color-bg-hover) 25%, rgba(51,65,85,0.5) 50%, var(--color-bg-hover) 75%)',
              }} />
              <div style={{ width: 120, height: 12, borderRadius: 4, background: 'var(--color-bg-hover)', marginBottom: 8,
                animation: 'shimmer 1.5s infinite 0.2s', backgroundSize: '200% 100%',
                backgroundImage: 'linear-gradient(90deg, var(--color-bg-hover) 25%, rgba(51,65,85,0.5) 50%, var(--color-bg-hover) 75%)',
              }} />
              <div style={{ width: 100, height: 12, borderRadius: 4, background: 'var(--color-bg-hover)',
                animation: 'shimmer 1.5s infinite 0.4s', backgroundSize: '200% 100%',
                backgroundImage: 'linear-gradient(90deg, var(--color-bg-hover) 25%, rgba(51,65,85,0.5) 50%, var(--color-bg-hover) 75%)',
              }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...S.glass, padding: '64px 24px', textAlign: 'center', animation: 'fadeIn 0.5s ease-out' }}>
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="var(--color-text-muted)" strokeWidth={1} style={{ margin: '0 auto 16px', opacity: 0.4 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5.5-1.5-.5M6.75 7.364V3h-3v18m3-13.636 10.5-3.819" />
          </svg>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 500, margin: 0 }}>
            {search ? 'No warehouses match your search' : 'No warehouses yet'}
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 4, opacity: 0.6 }}>
            {search ? 'Try a different search term' : 'Click "Add Warehouse" to get started'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map((wh, i) => (
            <div
              key={wh.id}
              style={{
                ...S.glass, padding: 0, overflow: 'hidden',
                transition: 'transform 0.2s, box-shadow 0.2s',
                animation: `fadeIn 0.3s ease-out ${i * 0.05}s both`,
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-glow), var(--shadow-card)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
            >
              {/* Card header */}
              <div style={{ padding: '20px 20px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, marginBottom: 4 }}>
                      {wh.name}
                    </h3>
                    <span style={{
                      display: 'inline-block', fontSize: 10, fontWeight: 600,
                      padding: '3px 8px', borderRadius: 999,
                      background: wh.active ? 'var(--color-success-glow)' : 'var(--color-danger-glow)',
                      color: wh.active ? 'var(--color-success)' : 'var(--color-danger)',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                      {wh.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {/* Edit */}
                    <button
                      onClick={() => openEdit(wh)}
                      title="Edit"
                      style={{
                        width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-accent-glow)',
                        border: '1px solid rgba(129,140,248,0.2)',
                        color: 'var(--color-accent)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s, transform 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.2)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-accent-glow)'; e.currentTarget.style.transform = 'none'; }}
                    >
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    {/* Deactivate */}
                    {wh.active && (
                      <button
                        onClick={() => { setDeleteId(wh.id); setDeleteName(wh.name); }}
                        title="Deactivate"
                        style={{
                          width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-danger-glow)',
                          border: '1px solid rgba(248,113,113,0.2)',
                          color: 'var(--color-danger)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.15s, transform 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.2)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-danger-glow)'; e.currentTarget.style.transform = 'none'; }}
                      >
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Coordinates + inventory stats */}
              <div style={{ padding: '0 20px 16px' }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="var(--color-text-muted)" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                      {wh.lat.toFixed(4)}, {wh.lng.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Inventory summary */}
                <div style={{
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-bg-hover)', fontSize: 11,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)' }}>
                    <span>SKUs stocked</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>{wh.inventory?.length || 0}</span>
                  </div>
                  {wh.inventory && wh.inventory.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      <span>Total units</span>
                      <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                        {wh.inventory.reduce((s, i) => s + i.availableQty, 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ID footer */}
              <div style={{
                padding: '10px 20px', borderTop: '1px solid var(--color-border-subtle)',
                background: 'rgba(15,22,41,0.3)',
              }}>
                <code style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                  {wh.id}
                </code>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ────────────────────────────────── */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            ...S.glass, width: '100%', maxWidth: 560,
            maxHeight: '90vh', overflowY: 'auto',
            padding: 0, animation: 'slideUp 0.3s ease-out',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                {editingId ? 'Edit Warehouse' : 'Add New Warehouse'}
              </h2>
              <button
                onClick={closeModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSave} style={{ padding: 24 }}>
              {formError && (
                <div style={{
                  padding: '10px 14px', marginBottom: 16,
                  background: 'var(--color-danger-glow)', border: '1px solid rgba(248,113,113,0.3)',
                  borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-danger)', fontWeight: 500,
                }}>
                  {formError}
                </div>
              )}

              {/* Name */}
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Warehouse Name *</label>
                <input
                  name="name" value={form.name} onChange={handleChange}
                  placeholder="e.g. Mumbai Distribution Center"
                  style={S.input}
                  onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                />
              </div>

              {/* Status toggle */}
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Status</label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-bg-input)', border: '1px solid var(--color-border)',
                }}>
                  <input
                    type="checkbox" name="active"
                    checked={form.active} onChange={handleChange}
                    style={{ accentColor: 'var(--color-accent)', width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 13, color: form.active ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                    {form.active ? 'Active' : 'Inactive'}
                  </span>
                </label>
              </div>

              {/* Map Picker */}
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Location (Click map or enter coordinates)</label>
                <MapPicker
                  key={editingId || 'new'}
                  lat={form.lat ? parseFloat(form.lat) : null}
                  lng={form.lng ? parseFloat(form.lng) : null}
                  onLocationChange={handleMapLocation}
                />
              </div>

              {/* Coordinate inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={S.label}>Latitude *</label>
                  <input
                    name="lat" value={form.lat} onChange={handleChange}
                    type="number" step="any" min="-90" max="90"
                    placeholder="e.g. 19.0760"
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                <div>
                  <label style={S.label}>Longitude *</label>
                  <input
                    name="lng" value={form.lng} onChange={handleChange}
                    type="number" step="any" min="-180" max="180"
                    placeholder="e.g. 72.8777"
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                <button type="button" onClick={closeModal} style={S.btnGhost}>Cancel</button>
                <button
                  type="submit" disabled={saving}
                  style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1, pointerEvents: saving ? 'none' : 'auto' }}
                >
                  {saving ? 'Saving…' : (editingId ? 'Update Warehouse' : 'Create Warehouse')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────── */}
      {deleteId && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={e => { if (e.target === e.currentTarget && !deleting) { setDeleteId(null); setDeleteName(''); } }}
        >
          <div style={{
            ...S.glass, padding: 28, maxWidth: 400, width: '100%',
            textAlign: 'center', animation: 'slideUp 0.3s ease-out',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--color-danger-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="var(--color-danger)" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
              Deactivate Warehouse
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
              Are you sure you want to deactivate <strong style={{ color: 'var(--color-text-secondary)' }}>{deleteName}</strong>?
              It will no longer participate in routing.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { setDeleteId(null); setDeleteName(''); }} disabled={deleting} style={S.btnGhost}>
                Cancel
              </button>
              <button
                onClick={handleDelete} disabled={deleting}
                style={{ ...S.btnDanger, opacity: deleting ? 0.6 : 1, pointerEvents: deleting ? 'none' : 'auto' }}
              >
                {deleting ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────── */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Keyframe animations ──────────────────────────────── */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
