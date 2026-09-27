/**
 * CustomerShop — Product catalog with search, category filters, and add-to-cart
 */
import { useState, useEffect, useCallback } from 'react';
import * as api from '../lib/apiClient';
import { useCart } from '../context/CartContext';

const CATEGORIES = ['All', 'Smartphones', 'Laptops', 'Audio', 'Monitors', 'Peripherals'];

function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
}

export default function CustomerShop() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [addedSku, setAddedSku] = useState(null);
  const { addToCart } = useCart();

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (category !== 'All') params.category = category;
      if (search.trim()) params.q = search.trim();
      const data = await api.getProducts(params);
      setProducts(data.products || []);
    } catch { setProducts([]); }
    setLoading(false);
  }, [category, search]);

  useEffect(() => {
    const timer = setTimeout(fetchProducts, 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  function handleAdd(product) {
    addToCart(product, 1);
    setAddedSku(product.sku);
    setTimeout(() => setAddedSku(null), 1200);
  }

  const stockBadge = (p) => {
    if (p.stockStatus === 'OUT_OF_STOCK') return <span style={{ color: '#f87171', fontSize: 11, fontWeight: 600 }}>Out of Stock</span>;
    if (p.stockStatus === 'LOW_STOCK') return <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 600 }}>Only {p.totalStock} left</span>;
    return <span style={{ color: '#34d399', fontSize: 11, fontWeight: 600 }}>In Stock</span>;
  };

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: '#e2e8f0', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(6,95,70,0.12))',
        borderBottom: '1px solid rgba(16,185,129,0.15)',
        padding: '48px 24px 40px', textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
          <span style={{ background: 'linear-gradient(135deg, #34d399, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Premium Tech</span>{' '}
          Store
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>
          Optimized routing • Lightning-fast delivery • Best prices
        </p>

        {/* Search */}
        <div style={{ maxWidth: 480, margin: '24px auto 0', position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#64748b" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search products..."
            style={{
              width: '100%', padding: '12px 16px 12px 40px',
              background: 'rgba(15,22,41,0.7)', border: '1px solid rgba(51,65,85,0.4)',
              borderRadius: 10, color: '#e2e8f0', fontSize: 14,
              outline: 'none', fontFamily: 'var(--font-sans)',
            }}
          />
        </div>
      </div>

      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
        {/* Category pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} style={{
              padding: '7px 16px', borderRadius: 20,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: category === c ? '1px solid #10b981' : '1px solid rgba(51,65,85,0.4)',
              background: category === c ? 'rgba(16,185,129,0.15)' : 'rgba(15,22,41,0.5)',
              color: category === c ? '#34d399' : '#94a3b8',
              transition: 'all 0.2s',
            }}>{c}</button>
          ))}
        </div>

        {/* Product Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>
            <div className="auth-spinner" style={{ margin: '0 auto 12px' }} />
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>No products found.</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}>
            {products.map(p => (
              <div key={p.sku} style={{
                background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
                borderRadius: 14, overflow: 'hidden',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(16,185,129,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* Image */}
                <div onClick={() => setSelectedProduct(p)} style={{
                  height: 200, background: '#0a0f1a', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  ) : (
                    <span style={{ fontSize: 48 }}>📦</span>
                  )}
                </div>

                <div style={{ padding: '16px 18px 18px' }}>
                  {/* Category badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: '#10b981', background: 'rgba(16,185,129,0.1)',
                    padding: '3px 8px', borderRadius: 4,
                  }}>{p.category}</span>

                  <h3 onClick={() => setSelectedProduct(p)} style={{
                    fontSize: 15, fontWeight: 700, margin: '10px 0 6px',
                    color: '#e2e8f0', lineHeight: 1.3,
                  }}>{p.name}</h3>

                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{formatINR(p.price)}</span>
                    {stockBadge(p)}
                  </div>

                  {/* Add to cart */}
                  <button
                    onClick={() => handleAdd(p)}
                    disabled={p.stockStatus === 'OUT_OF_STOCK'}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 8,
                      border: 'none', cursor: p.stockStatus === 'OUT_OF_STOCK' ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
                      background: addedSku === p.sku ? '#059669' : p.stockStatus === 'OUT_OF_STOCK' ? '#1e293b' : 'linear-gradient(135deg, #10b981, #059669)',
                      color: p.stockStatus === 'OUT_OF_STOCK' ? '#475569' : 'white',
                      transition: 'all 0.3s',
                      transform: addedSku === p.sku ? 'scale(0.97)' : 'scale(1)',
                    }}
                  >
                    {addedSku === p.sku ? '✓ Added!' : p.stockStatus === 'OUT_OF_STOCK' ? 'Unavailable' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div onClick={() => setSelectedProduct(null)} style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0f1629', border: '1px solid rgba(51,65,85,0.5)',
            borderRadius: 16, maxWidth: 560, width: '100%', overflow: 'hidden',
          }}>
            {selectedProduct.imageUrl && (
              <img src={selectedProduct.imageUrl} alt={selectedProduct.name} style={{ width: '100%', height: 260, objectFit: 'cover' }} />
            )}
            <div style={{ padding: 24 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                color: '#10b981', background: 'rgba(16,185,129,0.1)',
                padding: '3px 8px', borderRadius: 4,
              }}>{selectedProduct.category}</span>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '12px 0 6px', color: '#e2e8f0' }}>{selectedProduct.name}</h2>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 16px' }}>{selectedProduct.description}</p>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>SKU: <span style={{ color: '#94a3b8' }}>{selectedProduct.sku}</span></div>
                {selectedProduct.dimensions && (
                  <>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Size: <span style={{ color: '#94a3b8' }}>{selectedProduct.dimensions.lengthCm}×{selectedProduct.dimensions.widthCm}×{selectedProduct.dimensions.heightCm} cm</span></div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Weight: <span style={{ color: '#94a3b8' }}>{selectedProduct.dimensions.weightKg} kg</span></div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: '#10b981' }}>{formatINR(selectedProduct.price)}</span>
                {stockBadge(selectedProduct)}
              </div>

              <button
                onClick={() => { handleAdd(selectedProduct); setSelectedProduct(null); }}
                disabled={selectedProduct.stockStatus === 'OUT_OF_STOCK'}
                style={{
                  width: '100%', marginTop: 18, padding: '12px 0', borderRadius: 10,
                  border: 'none', cursor: selectedProduct.stockStatus === 'OUT_OF_STOCK' ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 700,
                  background: selectedProduct.stockStatus === 'OUT_OF_STOCK' ? '#1e293b' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: selectedProduct.stockStatus === 'OUT_OF_STOCK' ? '#475569' : 'white',
                }}
              >
                {selectedProduct.stockStatus === 'OUT_OF_STOCK' ? 'Unavailable' : 'Add to Cart'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
