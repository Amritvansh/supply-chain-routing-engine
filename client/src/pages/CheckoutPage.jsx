/**
 * CheckoutPage — Cart review, map location picker, and order placement
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import * as api from '../lib/apiClient';

const CITY_PRESETS = [
  { name: 'Delhi', lat: 28.6139, lng: 77.2090 },
  { name: 'Mumbai', lat: 19.0760, lng: 72.8777 },
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
];

function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

export default function CheckoutPage() {
  const { cartItems, updateQty, removeFromCart, clearCart, cartSubtotal } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Customer details
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // Map / location
  const [lat, setLat] = useState(28.6139);
  const [lng, setLng] = useState(77.2090);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapContainerRef = useRef(null);

  // Quote
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Map initialization ──────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [lng, lat],
      zoom: 10,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    const marker = new maplibregl.Marker({ color: '#10b981', draggable: true })
      .setLngLat([lng, lat])
      .addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLngLat();
      setLat(Math.round(pos.lat * 10000) / 10000);
      setLng(Math.round(pos.lng * 10000) / 10000);
    });

    map.on('click', (e) => {
      const { lat: newLat, lng: newLng } = e.lngLat;
      marker.setLngLat([newLng, newLat]);
      setLat(Math.round(newLat * 10000) / 10000);
      setLng(Math.round(newLng * 10000) / 10000);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => map.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flyToCity(preset) {
    setLat(preset.lat);
    setLng(preset.lng);
    setCity(preset.name);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [preset.lng, preset.lat], zoom: 11, duration: 1200 });
    }
    if (markerRef.current) {
      markerRef.current.setLngLat([preset.lng, preset.lat]);
    }
  }

  // ── Quote calculation ───────────────────────────────────────
  const fetchQuote = useCallback(async () => {
    if (cartItems.length === 0) { setQuote(null); return; }
    setQuoteLoading(true);
    try {
      const data = await api.getQuote({
        customerLat: lat, customerLng: lng,
        items: cartItems.map(i => ({ sku: i.sku, qty: i.qty })),
      });
      setQuote(data);
    } catch { setQuote(null); }
    setQuoteLoading(false);
  }, [lat, lng, cartItems]);

  useEffect(() => {
    const timer = setTimeout(fetchQuote, 600);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  // ── Place order ─────────────────────────────────────────────
  async function handlePlaceOrder() {
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    if (!address.trim()) { setError('Please enter your address.'); return; }
    if (cartItems.length === 0) { setError('Cart is empty.'); return; }

    setError('');
    setSubmitting(true);
    try {
      const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const data = await api.checkout({
        idempotencyKey,
        customerLat: lat,
        customerLng: lng,
        items: cartItems.map(i => ({ sku: i.sku, qty: i.qty })),
        customerName: name.trim(),
        customerPhone: phone.trim(),
        shippingAddress: `${address.trim()}, ${city}, ${state} - ${pincode}`,
        pincode: pincode.trim(),
        totalAmount: quote?.total || cartSubtotal,
      });
      clearCart();
      navigate(`/customer/confirmation/${data.order.id}`);
    } catch (err) {
      setError(err.message || 'Order placement failed. Please try again.');
    }
    setSubmitting(false);
  }

  if (cartItems.length === 0 && !submitting) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)', color: '#e2e8f0', minHeight: '100vh', background: 'var(--color-bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span style={{ fontSize: 48 }}>🛒</span>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Your cart is empty</h2>
        <p style={{ color: '#64748b', fontSize: 14 }}>Add some products to get started!</p>
        <button onClick={() => navigate('/customer/shop')} style={{
          padding: '10px 28px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
          fontSize: 14, fontWeight: 700,
        }}>Browse Products</button>
      </div>
    );
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    background: 'rgba(15,22,41,0.7)', border: '1px solid rgba(51,65,85,0.4)',
    color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'var(--font-sans)',
  };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, display: 'block' };

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: '#e2e8f0', minHeight: '100vh', background: 'var(--color-bg-primary)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 28, letterSpacing: '-0.02em' }}>Checkout</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 28, alignItems: 'start' }}>
          {/* Left: Details & Map */}
          <div>
            {/* Customer Details */}
            <div style={{ background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18, color: '#e2e8f0' }}>Delivery Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div><label style={labelStyle}>Full Name</label><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="John Doe" /></div>
                <div><label style={labelStyle}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="+91 9876543210" /></div>
                <div style={{ gridColumn: '1/-1' }}><label style={labelStyle}>House / Street Address</label><input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} placeholder="123 Main Street" /></div>
                <div><label style={labelStyle}>City</label><input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} placeholder="New Delhi" /></div>
                <div><label style={labelStyle}>State</label><input value={state} onChange={e => setState(e.target.value)} style={inputStyle} placeholder="Delhi" /></div>
                <div><label style={labelStyle}>PIN Code</label><input value={pincode} onChange={e => setPincode(e.target.value)} style={inputStyle} placeholder="110001" /></div>
              </div>
            </div>

            {/* Map */}
            <div style={{ background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)', borderRadius: 14, padding: 20, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Delivery Location</h3>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: '#10b981',
                  background: 'rgba(16,185,129,0.12)', padding: '4px 10px', borderRadius: 6,
                }}>📍 {lat}, {lng}</span>
              </div>

              {/* City presets */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {CITY_PRESETS.map(c => (
                  <button key={c.name} onClick={() => flyToCity(c)} style={{
                    padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(51,65,85,0.4)',
                    background: city === c.name ? 'rgba(16,185,129,0.15)' : 'rgba(15,22,41,0.5)',
                    color: city === c.name ? '#34d399' : '#94a3b8',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                  }}>{c.name}</button>
                ))}
              </div>

              <div ref={mapContainerRef} style={{ width: '100%', height: 300, borderRadius: 10, overflow: 'hidden' }} />
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 8, textAlign: 'center' }}>
                Click on the map or drag the pin to set your delivery location
              </p>
            </div>
          </div>

          {/* Right: Order Summary */}
          <div style={{
            background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
            borderRadius: 14, padding: 24, position: 'sticky', top: 80,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18, color: '#e2e8f0' }}>Order Summary</h3>

            {/* Cart items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {cartItems.map(item => (
                <div key={item.sku} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 8, overflow: 'hidden',
                    background: '#0a0f1a', flexShrink: 0,
                  }}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📦</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                    <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{formatINR(item.price)} × {item.qty}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => item.qty <= 1 ? removeFromCart(item.sku) : updateQty(item.sku, item.qty - 1)} style={{
                      width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(51,65,85,0.4)',
                      background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>−</button>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', width: 20, textAlign: 'center' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.sku, item.qty + 1)} style={{
                      width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(51,65,85,0.4)',
                      background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>+</button>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{formatINR(item.price * item.qty)}</span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(51,65,85,0.3)', marginBottom: 16 }} />

            {/* Pricing */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Subtotal</span>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{formatINR(cartSubtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Delivery Fee</span>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
                  {quoteLoading ? '...' : quote?.deliveryFee != null ? formatINR(quote.deliveryFee) : '—'}
                </span>
              </div>
              {quote?.estimatedDays && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Estimated Delivery</span>
                  <span style={{ fontWeight: 600, color: '#10b981' }}>{quote.estimatedDays} day{quote.estimatedDays > 1 ? 's' : ''}</span>
                </div>
              )}
              <div style={{ height: 1, background: 'rgba(51,65,85,0.3)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 15 }}>Total</span>
                <span style={{ fontWeight: 800, color: '#10b981', fontSize: 18 }}>
                  {quoteLoading ? '...' : quote?.total != null ? formatINR(quote.total) : formatINR(cartSubtotal)}
                </span>
              </div>
            </div>

            {error && <p style={{ color: '#f87171', fontSize: 12, marginTop: 12, textAlign: 'center' }}>{error}</p>}

            <button
              onClick={handlePlaceOrder}
              disabled={submitting || quoteLoading}
              style={{
                width: '100%', marginTop: 20, padding: '13px 0', borderRadius: 10,
                border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 700,
                background: submitting ? '#065f46' : 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white', transition: 'all 0.2s',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
