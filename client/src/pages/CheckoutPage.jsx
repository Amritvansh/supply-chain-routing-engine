/**
 * CheckoutPage — Cart review, map location picker, and order placement
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import * as api from '../lib/apiClient';

import 'maplibre-gl/dist/maplibre-gl.css';

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
  const [lat, setLat] = useState(28.6139); // Default to Delhi
  const [lng, setLng] = useState(77.2090);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapContainerRef = useRef(null);

  // Quote
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef(null);

  // ── Auto-fetch customer location ────────────────────────────
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const rLat = Math.round(latitude * 10000) / 10000;
          const rLng = Math.round(longitude * 10000) / 10000;
          setLat(rLat);
          setLng(rLng);
          if (mapRef.current && markerRef.current) {
            mapRef.current.flyTo({ center: [longitude, latitude], zoom: 15 });
            markerRef.current.setLngLat([longitude, latitude]);
          }
          fetchLocationName(rLat, rLng);
        },
        (err) => console.warn('Geolocation failed', err),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // ── Map initialization ──────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      center: [lng, lat],
      zoom: 15,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    const marker = new maplibregl.Marker({ color: '#10b981', draggable: true })
      .setLngLat([lng, lat])
      .addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLngLat();
      const rLat = Math.round(pos.lat * 10000) / 10000;
      const rLng = Math.round(pos.lng * 10000) / 10000;
      setLat(rLat);
      setLng(rLng);
      fetchLocationName(rLat, rLng);
    });

    map.on('click', (e) => {
      const { lat: newLat, lng: newLng } = e.lngLat;
      marker.setLngLat([newLng, newLat]);
      const rLat = Math.round(newLat * 10000) / 10000;
      const rLng = Math.round(newLng * 10000) / 10000;
      setLat(rLat);
      setLng(rLng);
      fetchLocationName(rLat, rLng);
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

  async function fetchLocationName(latitude, longitude) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`);
      const data = await res.json();
      if (data && data.display_name) {
        setSearchQuery(data.display_name);
      }
      if (data && data.address) {
        const addr = data.address;
        // Auto-fill street address (road + house number + neighbourhood)
        const streetParts = [addr.house_number, addr.road, addr.neighbourhood, addr.suburb].filter(Boolean);
        if (streetParts.length > 0 && !address.trim()) {
          setAddress(streetParts.join(', '));
        }
        // Auto-fill city
        const cityName = addr.city || addr.town || addr.village || addr.county || addr.state_district;
        if (cityName && !city.trim()) {
          setCity(cityName);
        }
        // Auto-fill state
        if (addr.state && !state.trim()) {
          setState(addr.state);
        }
        // Auto-fill PIN code
        if (addr.postcode && !pincode.trim()) {
          setPincode(addr.postcode);
        }
      }
    } catch (err) {
      console.error("Reverse geocoding failed", err);
    }
  }

  function handleSearchInput(e) {
    const val = e.target.value;
    setSearchQuery(val);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (val.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5&countrycodes=in`);
        const data = await res.json();
        setSuggestions(data || []);
        setShowSuggestions(true);
      } catch (err) {
        console.error("Autocomplete failed", err);
      }
    }, 400);
  }

  function handleSelectSuggestion(suggestion) {
    setSearchQuery(suggestion.display_name);
    setShowSuggestions(false);
    
    const newLat = parseFloat(suggestion.lat);
    const newLng = parseFloat(suggestion.lon);
    setLat(newLat);
    setLng(newLng);
    if (mapRef.current && markerRef.current) {
      mapRef.current.flyTo({ center: [newLng, newLat], zoom: 15, duration: 1500 });
      markerRef.current.setLngLat([newLng, newLat]);
    }
    fetchLocationName(newLat, newLng);
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

              <div style={{ position: 'relative', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={searchQuery}
                    onChange={handleSearchInput}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    style={{ ...inputStyle, flex: 1, margin: 0 }}
                    placeholder="Search a location..."
                  />
                </div>
                
                {/* Autocomplete Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    marginTop: 4, background: '#0f1629', border: '1px solid rgba(51,65,85,0.6)',
                    borderRadius: 8, overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                  }}>
                    {suggestions.map((s, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectSuggestion(s)}
                        style={{
                          padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(51,65,85,0.3)',
                          fontSize: 12, color: '#e2e8f0', transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(51,65,85,0.4)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        📍 {s.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Map Container */}

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
              {quote?.mlPrediction ? (
                <div style={{
                  background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginTop: 4,
                  marginBottom: 4,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>Estimated Delivery</span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: (quote.mlPrediction.onTimeConfidence ?? 90) >= 80
                        ? 'rgba(16,185,129,0.15)'
                        : (quote.mlPrediction.onTimeConfidence ?? 90) >= 60
                          ? 'rgba(245,158,11,0.15)'
                          : 'rgba(239,68,68,0.15)',
                      color: (quote.mlPrediction.onTimeConfidence ?? 90) >= 80
                        ? '#10b981'
                        : (quote.mlPrediction.onTimeConfidence ?? 90) >= 60
                          ? '#f59e0b'
                          : '#ef4444',
                    }}>
                      {quote.mlPrediction.onTimeConfidence ?? 90}% on-time
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                    Arriving {quote.mlPrediction.predictedDeliveryFormatted || `${quote.estimatedDays} days`}
                  </div>
                  {quote.mlPrediction.delayRisk === 'HIGH' && (
                    <div style={{ fontSize: 11, color: '#f87171', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>⚠️</span> Possible transit delays expected on this route
                    </div>
                  )}
                  {quote.mlPrediction.featureImportance && quote.mlPrediction.featureImportance.length > 0 && (
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                      Factors: {quote.mlPrediction.featureImportance.join(' • ')}
                    </div>
                  )}
                </div>
              ) : quote?.estimatedDays ? (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Estimated Delivery</span>
                  <span style={{ fontWeight: 600, color: '#10b981' }}>{quote.estimatedDays} day{quote.estimatedDays > 1 ? 's' : ''}</span>
                </div>
              ) : null}
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
