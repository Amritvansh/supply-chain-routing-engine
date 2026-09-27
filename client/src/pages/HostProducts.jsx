/**
 * HostProducts — Host Product Catalog Management
 *
 * Full CRUD interface for Host administrators to manage the product catalog.
 * Features:
 *   - Tabular product list with search and category filter
 *   - Add / Edit product modal with form validation
 *   - Delete confirmation dialog
 *   - Toast notifications for success/error feedback
 *   - Shimmer loading states and animated empty state
 *
 * Uses the enterprise dark-mode design tokens from index.css.
 */
import { useState, useEffect, useCallback } from 'react';
import * as api from '../lib/apiClient';

/* ── Constants ───────────────────────────────────────────── */
const EMPTY_FORM = {
  sku: '', name: '', price: '', category: '', description: '',
  weight_kg: '', image_url: '', length_cm: '', width_cm: '', height_cm: '',
};

function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
}

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

/* ── Shimmer row component ───────────────────────────────── */
function ShimmerRows({ count = 5 }) {
  return Array.from({ length: count }, (_, i) => (
    <tr key={i}>
      {[120, 180, 80, 100, 200, 90].map((w, j) => (
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

/* ═══════════════════════════════════════════════════════════ */
/*  HOST PRODUCTS PAGE                                        */
/* ═══════════════════════════════════════════════════════════ */
export default function HostProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [categories, setCategories] = useState([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingSku, setEditingSku] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirmation
  const [deleteSku, setDeleteSku] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  /* ── Fetch products ──────────────────────────────────────── */
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCat !== 'All') params.category = filterCat;
      if (search.trim()) params.q = search.trim();
      const data = await api.getProducts(params);
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    }
    setLoading(false);
  }, [filterCat, search]);

  useEffect(() => {
    const t = setTimeout(fetchProducts, 250);
    return () => clearTimeout(t);
  }, [fetchProducts]);

  /* ── Fetch categories ────────────────────────────────────── */
  useEffect(() => {
    api.getCategories()
      .then(d => setCategories(d.categories || []))
      .catch(() => {});
  }, []);

  /* ── Modal helpers ───────────────────────────────────────── */
  function openAdd() {
    setEditingSku(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  }

  function openEdit(product) {
    setEditingSku(product.sku);
    setForm({
      sku: product.sku,
      name: product.name,
      price: String(product.price),
      category: product.category || '',
      description: product.description || '',
      weight_kg: String(product.dimensions?.weightKg ?? ''),
      image_url: product.imageUrl || '',
      length_cm: String(product.dimensions?.lengthCm ?? ''),
      width_cm: String(product.dimensions?.widthCm ?? ''),
      height_cm: String(product.dimensions?.heightCm ?? ''),
    });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingSku(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  /* ── Save (create / update) ──────────────────────────────── */
  async function handleSave(e) {
    e.preventDefault();
    setFormError('');

    // Validate required
    if (!form.name.trim() || form.price === '' || form.weight_kg === '') {
      setFormError('Name, Price, and Weight are required.');
      return;
    }
    if (!editingSku && !form.sku.trim()) {
      setFormError('SKU is required for new products.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        price: parseFloat(form.price),
        weight_kg: parseFloat(form.weight_kg),
        category: form.category.trim() || 'Electronics',
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        length_cm: form.length_cm ? parseFloat(form.length_cm) : 0,
        width_cm: form.width_cm ? parseFloat(form.width_cm) : 0,
        height_cm: form.height_cm ? parseFloat(form.height_cm) : 0,
      };

      if (editingSku) {
        await api.updateProduct(editingSku, payload);
        setToast({ message: `Product "${form.name}" updated successfully`, type: 'success' });
      } else {
        payload.sku = form.sku.trim();
        await api.createProduct(payload);
        setToast({ message: `Product "${form.name}" created successfully`, type: 'success' });
      }

      closeModal();
      fetchProducts();
    } catch (err) {
      const msg = err.message || 'Something went wrong';
      setFormError(msg);
    }
    setSaving(false);
  }

  /* ── Delete ──────────────────────────────────────────────── */
  async function handleDelete() {
    if (!deleteSku) return;
    setDeleting(true);
    try {
      await api.deleteProduct(deleteSku);
      setToast({ message: `Product "${deleteSku}" deleted`, type: 'success' });
      setDeleteSku(null);
      fetchProducts();
    } catch (err) {
      setToast({ message: err.message || 'Delete failed', type: 'error' });
    }
    setDeleting(false);
  }

  /* ── Derived data ────────────────────────────────────────── */
  const catOptions = ['All', ...categories];

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
          }}>Product</span> Catalog
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>
          Manage your product inventory • {products.length} product{products.length !== 1 ? 's' : ''}
        </p>
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
            placeholder="Search by name or SKU…"
            style={{ ...S.input, paddingLeft: 36 }}
          />
        </div>

        {/* Category filter */}
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          style={{ ...S.input, width: 'auto', minWidth: 140, cursor: 'pointer' }}
        >
          {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

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
          Add Product
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <div style={{ ...S.glass, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                {['SKU', 'Name', 'Price', 'Category', 'Description', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: 'left',
                    fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.8px',
                    color: 'var(--color-text-muted)',
                    background: 'rgba(15,22,41,0.4)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <ShimmerRows />
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '64px 16px', textAlign: 'center' }}>
                    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                      <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="var(--color-text-muted)" strokeWidth={1} style={{ margin: '0 auto 16px', opacity: 0.4 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                      </svg>
                      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 500, margin: 0 }}>
                        No products found
                      </p>
                      <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 4, opacity: 0.6 }}>
                        {search || filterCat !== 'All'
                          ? 'Try adjusting your search or filters'
                          : 'Click "Add Product" to create your first item'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : products.map((p, i) => (
                <tr
                  key={p.sku}
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                    transition: 'background 0.15s',
                    animation: `fadeIn 0.3s ease-out ${i * 0.03}s both`,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <code style={{
                      fontSize: 11, fontWeight: 600,
                      color: 'var(--color-accent)',
                      background: 'var(--color-accent-glow)',
                      padding: '3px 8px', borderRadius: 4,
                    }}>
                      {p.sku}
                    </code>
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {p.name}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--color-success)' }}>
                    {formatINR(p.price)}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      padding: '3px 10px', borderRadius: 999,
                      background: 'rgba(51,65,85,0.35)',
                      color: 'var(--color-text-secondary)',
                    }}>
                      {p.category}
                    </span>
                  </td>
                  <td style={{
                    padding: '14px 16px', color: 'var(--color-text-muted)',
                    maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {p.description || '—'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {/* Edit */}
                      <button
                        onClick={() => openEdit(p)}
                        title="Edit"
                        style={{
                          width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-accent-glow)',
                          border: '1px solid rgba(129,140,248,0.2)',
                          color: 'var(--color-accent)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.15s, transform 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.2)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-accent-glow)'; e.currentTarget.style.transform = 'none'; }}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => setDeleteSku(p.sku)}
                        title="Delete"
                        style={{
                          width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-danger-glow)',
                          border: '1px solid rgba(248,113,113,0.2)',
                          color: 'var(--color-danger)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.15s, transform 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.2)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-danger-glow)'; e.currentTarget.style.transform = 'none'; }}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
            ...S.glass,
            width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
            padding: 0, animation: 'slideUp 0.3s ease-out',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h2 style={{
                fontSize: 18, fontWeight: 700, margin: 0,
                color: 'var(--color-text-primary)',
              }}>
                {editingSku ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-muted)', padding: 4,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSave} style={{ padding: '24px' }}>
              {formError && (
                <div style={{
                  padding: '10px 14px', marginBottom: 16,
                  background: 'var(--color-danger-glow)',
                  border: '1px solid rgba(248,113,113,0.3)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12, color: 'var(--color-danger)', fontWeight: 500,
                }}>
                  {formError}
                </div>
              )}

              {/* Two-column grid for form fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* SKU — only on create */}
                {!editingSku && (
                  <div>
                    <label style={S.label}>SKU *</label>
                    <input
                      name="sku" value={form.sku} onChange={handleChange}
                      placeholder="e.g. SKU-WIDGET-01"
                      style={S.input}
                      onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                    />
                  </div>
                )}

                {/* Name */}
                <div style={!editingSku ? {} : { gridColumn: 'span 2' }}>
                  <label style={S.label}>Product Name *</label>
                  <input
                    name="name" value={form.name} onChange={handleChange}
                    placeholder="Product name"
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                {/* Price */}
                <div>
                  <label style={S.label}>Base Price (₹) *</label>
                  <input
                    name="price" value={form.price} onChange={handleChange}
                    type="number" step="0.01" min="0"
                    placeholder="0.00"
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                {/* Category */}
                <div>
                  <label style={S.label}>Category</label>
                  <input
                    name="category" value={form.category} onChange={handleChange}
                    placeholder="e.g. Electronics"
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                {/* Weight */}
                <div>
                  <label style={S.label}>Weight (kg) *</label>
                  <input
                    name="weight_kg" value={form.weight_kg} onChange={handleChange}
                    type="number" step="0.01" min="0"
                    placeholder="0.00"
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                {/* Image URL */}
                <div>
                  <label style={S.label}>Image URL</label>
                  <input
                    name="image_url" value={form.image_url} onChange={handleChange}
                    placeholder="https://..."
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                {/* Dimensions row */}
                <div>
                  <label style={S.label}>Length (cm)</label>
                  <input
                    name="length_cm" value={form.length_cm} onChange={handleChange}
                    type="number" step="0.1" min="0" placeholder="0"
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                <div>
                  <label style={S.label}>Width (cm)</label>
                  <input
                    name="width_cm" value={form.width_cm} onChange={handleChange}
                    type="number" step="0.1" min="0" placeholder="0"
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                <div>
                  <label style={S.label}>Height (cm)</label>
                  <input
                    name="height_cm" value={form.height_cm} onChange={handleChange}
                    type="number" step="0.1" min="0" placeholder="0"
                    style={S.input}
                    onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>
              </div>

              {/* Description — full width */}
              <div style={{ marginTop: 16 }}>
                <label style={S.label}>Description</label>
                <textarea
                  name="description" value={form.description} onChange={handleChange}
                  rows={3}
                  placeholder="Product description…"
                  style={{ ...S.input, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                <button type="button" onClick={closeModal} style={S.btnGhost}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...S.btnPrimary,
                    opacity: saving ? 0.6 : 1,
                    pointerEvents: saving ? 'none' : 'auto',
                  }}
                >
                  {saving ? 'Saving…' : (editingSku ? 'Update Product' : 'Create Product')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────── */}
      {deleteSku && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={e => { if (e.target === e.currentTarget && !deleting) setDeleteSku(null); }}
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
              Delete Product
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong style={{ color: 'var(--color-text-secondary)' }}>{deleteSku}</strong>?
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setDeleteSku(null)}
                disabled={deleting}
                style={S.btnGhost}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  ...S.btnDanger,
                  opacity: deleting ? 0.6 : 1,
                  pointerEvents: deleting ? 'none' : 'auto',
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────── */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Keyframe animations (injected once) ─────────────── */}
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
