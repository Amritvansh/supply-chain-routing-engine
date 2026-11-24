/**
 * CheckoutPage — Cart review, map location picker, and order placement
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import * as api from '../lib/apiClient';
import OSM_STYLE from '../lib/mapStyles';

import 'maplibre-gl/dist/maplibre-gl.css';

function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

const DELIVERY_PRESETS = [
  { label: 'New Delhi · 110001', address: '256-A, Connaught Place', landmark: 'Near Rajiv Chowk Metro', city: 'New Delhi', state: 'Delhi', pincode: '110001', lat: 28.6315, lng: 77.2167 },
  { label: 'Mumbai · 400050', address: '14 Linking Road, Bandra West', landmark: 'Opposite National College', city: 'Mumbai', state: 'Maharashtra', pincode: '400050', lat: 19.0596, lng: 72.8295 },
  { label: 'Bengaluru · 560038', address: '100 Feet Road, Indiranagar', landmark: 'Near Indiranagar Metro', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', lat: 12.9784, lng: 77.6408 },
  { label: 'Kolkata · 700091', address: 'Sector V, Salt Lake City', landmark: 'Near Webel More', city: 'Kolkata', state: 'West Bengal', pincode: '700091', lat: 22.5726, lng: 88.4339 },
  { label: 'Jaipur · 302012', address: 'Shilp Colony, Jhotwara', landmark: 'Near Medical Center', city: 'Jaipur', state: 'Rajasthan', pincode: '302012', lat: 26.9445, lng: 75.7438 },
];

function ClearableInput({ value, onChange, onClear, style, ...props }) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        value={value}
        onChange={onChange}
        style={{ ...style, paddingRight: value ? 32 : (style?.paddingRight || 14) }}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          title="Clear field"
          aria-label={`Clear ${props.placeholder || 'field'}`}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--color-bg-hover)',
            color: 'var(--color-text-muted)',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  const { cartItems, updateQty, removeFromCart, clearCart, cartSubtotal } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Customer details
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [addressType, setAddressType] = useState('Home');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState('COD'); // 'COD' | 'UPI' | 'CARD' | 'NET_BANKING'
  const [upiId, setUpiId] = useState('');
  const [cardData, setCardData] = useState({ number: '', name: '', expiry: '', cvv: '' });
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');

  // Payment Gateway Simulator Modals (Option A - Client Sandbox)
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [showCardOtpModal, setShowCardOtpModal] = useState(false);
  const [showNetBankingModal, setShowNetBankingModal] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('123456');
  const [netBankingUserId, setNetBankingUserId] = useState('HDFC-7829103');

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

  // Search & Suggestions
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pinSuggestion, setPinSuggestion] = useState(null);
  const [savedRecentAddress, setSavedRecentAddress] = useState(() => {
    try {
      const raw = localStorage.getItem('recent_delivery_address');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const searchTimeoutRef = useRef(null);

  function applyDeliveryPreset(preset) {
    setAddress(preset.address || '');
    setLandmark(preset.landmark || '');
    setCity(preset.city || '');
    setState(preset.state || '');
    setPincode(preset.pincode || '');
    if (preset.addressType) setAddressType(preset.addressType);
    if (preset.name) setName(preset.name);
    if (preset.phone) setPhone(preset.phone);
    setPinSuggestion(null);
    if (preset.lat && preset.lng) {
      setLat(preset.lat);
      setLng(preset.lng);
      setSearchQuery([preset.address, preset.city, preset.state, preset.pincode].filter(Boolean).join(', '));
      if (mapRef.current && markerRef.current) {
        mapRef.current.flyTo({ center: [preset.lng, preset.lat], zoom: 14, duration: 1200 });
        markerRef.current.setLngLat([preset.lng, preset.lat]);
      }
    }
  }

  function handleClearDeliveryDetails() {
    setName('');
    setPhone('');
    setAddress('');
    setLandmark('');
    setCity('');
    setState('');
    setPincode('');
    setPinSuggestion(null);
  }

  async function handlePincodeChange(val) {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setPincode(clean);
    if (clean.length === 6) {
      const matchedPreset = DELIVERY_PRESETS.find(p => p.pincode === clean);
      if (matchedPreset) {
        setPinSuggestion({
          city: matchedPreset.city,
          state: matchedPreset.state,
          lat: matchedPreset.lat,
          lng: matchedPreset.lng,
          label: `${matchedPreset.city}, ${matchedPreset.state}`,
        });
        return;
      }
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${clean}&countrycodes=in&addressdetails=1&limit=1`);
        const data = await res.json();
        if (data?.[0]?.address) {
          const a = data[0].address;
          const sugCity = a.city || a.town || a.village || a.county || a.state_district || '';
          const sugState = a.state || '';
          if (sugCity || sugState) {
            setPinSuggestion({
              city: sugCity,
              state: sugState,
              lat: parseFloat(data[0].lat),
              lng: parseFloat(data[0].lon),
              label: [sugCity, sugState].filter(Boolean).join(', '),
            });
          }
        }
      } catch {
        // silent ignore
      }
    } else {
      setPinSuggestion(null);
    }
  }

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
      style: OSM_STYLE,
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

  // Autofill test credentials for instant sandbox testing
  function autofillTestCard() {
    setCardData({
      number: '4012 8888 8888 1881',
      name: name.trim() || 'John Doe',
      expiry: '12/28',
      cvv: '842',
    });
  }

  // ── Place order handler: Routes to Bank Simulator or Instant COD ──
  function handlePlaceOrder() {
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    if (!address.trim()) { setError('Please enter your address.'); return; }
    if (cartItems.length === 0) { setError('Cart is empty.'); return; }

    setError('');

    // Cash on Delivery proceeds instantly
    if (paymentMethod === 'COD') {
      executeOrderCheckout({
        method: 'COD',
        label: 'Cash on Delivery (COD)',
        status: 'Pending on Delivery',
      });
      return;
    }

    // UPI opens authentic Sandbox QR & Approval modal
    if (paymentMethod === 'UPI') {
      setShowUpiModal(true);
      return;
    }

    // Card opens 3D Secure OTP verification modal
    if (paymentMethod === 'CARD') {
      const cleanNum = cardData.number.replace(/\s/g, '');
      if (cleanNum.length < 15) {
        setError('Please enter a valid 16-digit Card Number, or click "Autofill Visa Test Card".');
        return;
      }
      if (!cardData.expiry.trim() || !cardData.cvv.trim()) {
        setError('Please enter Card Expiry (MM/YY) and 3-digit CVV.');
        return;
      }
      setShowCardOtpModal(true);
      return;
    }

    // Net Banking opens Bank Gateway authorization modal
    if (paymentMethod === 'NET_BANKING') {
      const prefix = selectedBank.split(' ')[0].toUpperCase();
      setNetBankingUserId(`${prefix}-${Math.floor(1000000 + Math.random() * 9000000)}`);
      setShowNetBankingModal(true);
      return;
    }
  }

  // ── Execute ACID checkout & save official payment receipt ───
  async function executeOrderCheckout(customPaymentInfo) {
    setError('');
    setSubmitting(true);
    try {
      const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const formattedAddress = [
        `[${addressType}] ${address.trim()}`,
        landmark.trim() ? `Near ${landmark.trim()}` : null,
        city.trim(),
        `${state.trim()} - ${pincode.trim()}`
      ].filter(Boolean).join(', ');

      const data = await api.checkout({
        idempotencyKey,
        customerLat: lat,
        customerLng: lng,
        items: cartItems.map(i => ({ sku: i.sku, qty: i.qty })),
        customerName: name.trim(),
        customerPhone: phone.trim(),
        shippingAddress: formattedAddress,
        pincode: pincode.trim(),
        totalAmount: quote?.total || cartSubtotal,
      });

      // Prepare official payment receipt information
      const paymentLabel = customPaymentInfo?.label || (
        paymentMethod === 'COD'
          ? 'Cash on Delivery (COD)'
          : paymentMethod === 'UPI'
            ? `UPI (${upiId.trim() || 'Instant QR Pay'})`
            : paymentMethod === 'CARD'
              ? `Credit/Debit Card (•••• ${cardData.number.replace(/\s/g, '').slice(-4) || '1881'})`
              : `Net Banking (${selectedBank})`
      );

      const paymentInfo = {
        method: customPaymentInfo?.method || paymentMethod,
        label: paymentLabel,
        status: customPaymentInfo?.status || (paymentMethod === 'COD' ? 'Pending on Delivery' : 'Paid Online (Verified)'),
        txRef: 'TXN-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString().slice(-4),
        paidAt: new Date().toISOString(),
        bank: paymentMethod === 'NET_BANKING' ? selectedBank : undefined,
        totalAmount: quote?.total || cartSubtotal,
      };

      try {
        localStorage.setItem(`order_payment_${data.order.id}`, JSON.stringify(paymentInfo));
        localStorage.setItem('recent_delivery_address', JSON.stringify({
          label: `Recent: ${city.trim() || 'Saved'} · ${pincode.trim() || ''}`,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          landmark: landmark.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
          addressType,
          lat,
          lng,
        }));
      } catch {
        // storage fallback
      }

      setShowUpiModal(false);
      setShowCardOtpModal(false);
      setShowNetBankingModal(false);

      clearCart();
      navigate(`/customer/confirmation/${data.order.id}`);
    } catch (err) {
      setError(err.message || 'Order placement failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (cartItems.length === 0 && !submitting) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', minHeight: '100vh', background: 'var(--color-bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span style={{ fontSize: 48 }}>🛒</span>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Your cart is empty</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Add some products to get started!</p>
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
    background: 'var(--color-bg-input)', border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-sans)',
  };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, display: 'block' };

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', minHeight: '100vh', background: 'var(--color-bg-primary)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 28, letterSpacing: '-0.02em' }}>Checkout</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 28, alignItems: 'start' }}>
          {/* Left: Details & Map */}
          <div>
            {/* Customer Details */}
            <div style={{ background: 'var(--color-bg-card-solid)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: 'var(--shadow-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Delivery Details</h3>
                {(name || phone || address || landmark || city || state || pincode) && (
                  <button
                    type="button"
                    onClick={handleClearDeliveryDetails}
                    title="Clear all delivery fields"
                    style={{
                      padding: '4px 10px',
                      borderRadius: 99,
                      border: '1px solid rgba(239,68,68,0.3)',
                      background: 'rgba(239,68,68,0.08)',
                      color: '#f87171',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>✕</span>
                    <span>Clear Details</span>
                  </button>
                )}
              </div>

              {/* Quick Suggestions Bar */}
              <div style={{
                marginBottom: 16, padding: '10px 12px', borderRadius: 10,
                background: 'var(--color-surface-chip)', border: '1px solid var(--color-border-subtle)',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', display: 'block', marginBottom: 7 }}>
                  ✨ Quick Address Suggestions
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {savedRecentAddress && (
                    <button
                      type="button"
                      onClick={() => applyDeliveryPreset(savedRecentAddress)}
                      style={{
                        padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)',
                        color: '#10b981', cursor: 'pointer',
                      }}
                    >
                      🕒 {savedRecentAddress.label}
                    </button>
                  )}
                  {DELIVERY_PRESETS.map(p => (
                    <button
                      key={p.pincode}
                      type="button"
                      onClick={() => applyDeliveryPreset(p)}
                      style={{
                        padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500,
                        border: '1px solid var(--color-border)', background: 'var(--color-bg-card-solid)',
                        color: 'var(--color-text-secondary)', cursor: 'pointer',
                      }}
                    >
                      📍 {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Deliver to:</span>
                  {[
                    { id: 'Home', icon: '🏠', label: 'Home' },
                    { id: 'Work', icon: '🏢', label: 'Work' },
                    { id: 'Other', icon: '📍', label: 'Other' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAddressType(t.id)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        border: addressType === t.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                        background: addressType === t.id ? 'var(--color-accent-glow, rgba(99,102,241,0.15))' : 'var(--color-surface-chip)',
                        color: addressType === t.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <ClearableInput value={name} onChange={e => setName(e.target.value)} onClear={() => setName('')} style={inputStyle} placeholder="John Doe" />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <ClearableInput value={phone} onChange={e => setPhone(e.target.value)} onClear={() => setPhone('')} style={inputStyle} placeholder="+91 9876543210" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>House / Street Address</label>
                  <ClearableInput value={address} onChange={e => setAddress(e.target.value)} onClear={() => setAddress('')} style={inputStyle} placeholder="123 Main Street" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Nearby Landmark (Optional)</label>
                  <ClearableInput
                    value={landmark}
                    onChange={e => setLandmark(e.target.value)}
                    onClear={() => setLandmark('')}
                    style={inputStyle}
                    placeholder="e.g. Near Metro Station / Opposite Apollo Pharmacy"
                  />
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <ClearableInput value={city} onChange={e => setCity(e.target.value)} onClear={() => setCity('')} style={inputStyle} placeholder="New Delhi" />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <ClearableInput value={state} onChange={e => setState(e.target.value)} onClear={() => setState('')} style={inputStyle} placeholder="Delhi" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>PIN Code</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <ClearableInput
                        value={pincode}
                        onChange={e => handlePincodeChange(e.target.value)}
                        onClear={() => { setPincode(''); setPinSuggestion(null); }}
                        style={inputStyle}
                        placeholder="110001"
                      />
                    </div>
                    {pinSuggestion && (
                      <button
                        type="button"
                        onClick={() => {
                          setCity(pinSuggestion.city || city);
                          setState(pinSuggestion.state || state);
                          if (pinSuggestion.lat && pinSuggestion.lng) {
                            setLat(pinSuggestion.lat);
                            setLng(pinSuggestion.lng);
                            if (mapRef.current && markerRef.current) {
                              mapRef.current.flyTo({ center: [pinSuggestion.lng, pinSuggestion.lat], zoom: 14, duration: 1000 });
                              markerRef.current.setLngLat([pinSuggestion.lng, pinSuggestion.lat]);
                            }
                          }
                          setPinSuggestion(null);
                        }}
                        style={{
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                          border: '1px solid rgba(56,189,248,0.4)', background: 'rgba(56,189,248,0.1)',
                          color: '#38bdf8', fontSize: 11, fontWeight: 600,
                        }}
                      >
                        ✨ Fill {pinSuggestion.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Map */}
            <div style={{ background: 'var(--color-bg-card-solid)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 20, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Delivery Location</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: '#10b981',
                    background: 'rgba(16,185,129,0.12)', padding: '4px 10px', borderRadius: 6,
                  }}>📍 {lat}, {lng}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSuggestions([]);
                      setShowSuggestions(false);
                      setLat(28.6139);
                      setLng(77.2090);
                      if (mapRef.current && markerRef.current) {
                        mapRef.current.flyTo({ center: [77.2090, 28.6139], zoom: 13 });
                        markerRef.current.setLngLat([77.2090, 28.6139]);
                      }
                    }}
                    title="Clear location search & reset pin"
                    style={{
                      padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
                      border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)',
                      color: '#f87171', fontSize: 11, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <span>✕</span>
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              <div style={{ position: 'relative', marginBottom: 14 }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    value={searchQuery}
                    onChange={handleSearchInput}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    style={{ ...inputStyle, width: '100%', paddingRight: 34, margin: 0 }}
                    placeholder="Search a location..."
                  />
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); }}
                    title="Clear search"
                    aria-label="Clear location search"
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'var(--color-bg-hover)',
                      color: 'var(--color-text-muted)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: searchQuery ? 1 : 0.45,
                    }}
                  >
                    ✕
                  </button>
                </div>
                
                {/* Autocomplete Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    marginTop: 4, background: 'var(--color-bg-card-solid)', border: '1px solid var(--color-border)',
                    borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow-card)'
                  }}>
                    {suggestions.map((s, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectSuggestion(s)}
                        style={{
                          padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)',
                          fontSize: 12, color: 'var(--color-text-primary)', transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
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
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8, textAlign: 'center' }}>
                Click on the map or drag the pin to set your delivery location
              </p>
            </div>

            {/* Payment Method Card */}
            <div style={{
              background: 'var(--color-bg-card-solid)', border: '1px solid var(--color-border)',
              borderRadius: 14, padding: 22, marginTop: 20, boxShadow: 'var(--shadow-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>💳</span> Payment Method
                </h3>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#10b981',
                  background: 'rgba(16,185,129,0.1)', padding: '3px 8px', borderRadius: 6,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  🔒 256-bit Secure
                </span>
              </div>

              {/* Payment Method Options Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
                {[
                  { id: 'COD', title: 'Cash on Delivery', subtitle: 'Pay cash or UPI at delivery', icon: '💵', badge: 'Default' },
                  { id: 'UPI', title: 'UPI / QR', subtitle: 'GPay, PhonePe, Paytm', icon: '📱', badge: 'Instant' },
                  { id: 'CARD', title: 'Credit / Debit Card', subtitle: 'Visa, Mastercard, RuPay', icon: '💳' },
                  { id: 'NET_BANKING', title: 'Net Banking', subtitle: 'All major Indian banks', icon: '🏦' },
                ].map(opt => {
                  const isSelected = paymentMethod === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setPaymentMethod(opt.id)}
                      style={{
                        padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                        border: isSelected ? '2px solid #10b981' : '1px solid var(--color-border)',
                        background: isSelected ? 'rgba(16,185,129,0.08)' : 'var(--color-surface-chip)',
                        transition: 'all 0.15s ease',
                        position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{opt.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{opt.title}</span>
                        </div>
                        {opt.badge && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                            background: isSelected ? '#10b981' : 'var(--color-border)',
                            color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                          }}>{opt.badge}</span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0, paddingLeft: 26 }}>
                        {opt.subtitle}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Sub-panels for selected payment method */}
              {paymentMethod === 'COD' && (
                <div style={{
                  padding: '12px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.2)', fontSize: 12, color: 'var(--color-text-secondary)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 20 }}>✅</span>
                  <div>
                    <strong style={{ color: '#10b981', display: 'block' }}>Cash on Delivery Selected (Recommended)</strong>
                    <span>No advance payment needed. You can pay cash or scan delivery agent's UPI QR when your package arrives.</span>
                  </div>
                </div>
              )}

              {paymentMethod === 'UPI' && (
                <div style={{ padding: 14, borderRadius: 8, background: 'var(--color-surface-chip)', border: '1px solid var(--color-border)' }}>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Enter UPI ID / VPA</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      value={upiId}
                      onChange={e => setUpiId(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="e.g. yourname@okhdfcbank / 9876543210@paytm"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Quick Handles:</span>
                    {['@okhdfcbank', '@oksbi', '@paytm', '@ybl'].map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => {
                          const base = upiId.split('@')[0] || user?.name?.toLowerCase().replace(/\s/g, '') || 'customer';
                          setUpiId(base + h);
                        }}
                        style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                          background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                          color: 'var(--color-text-secondary)', cursor: 'pointer',
                        }}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {paymentMethod === 'CARD' && (
                <div style={{ padding: 14, borderRadius: 8, background: 'var(--color-surface-chip)', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>Enter Card Details</span>
                    <button
                      type="button"
                      onClick={autofillTestCard}
                      style={{
                        padding: '4px 10px', borderRadius: 6,
                        background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
                        color: '#60a5fa', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span>⚡</span>
                      <span>Autofill Visa Test Card</span>
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={labelStyle}>Card Number</label>
                      <input
                        value={cardData.number}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 16);
                          const formatted = v.match(/.{1,4}/g)?.join(' ') || v;
                          setCardData(prev => ({ ...prev, number: formatted }));
                        }}
                        style={inputStyle}
                        placeholder="4532 •••• •••• 8892"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Name on Card</label>
                      <input
                        value={cardData.name}
                        onChange={e => setCardData(prev => ({ ...prev, name: e.target.value }))}
                        style={inputStyle}
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Expiry (MM/YY)</label>
                      <input
                        value={cardData.expiry}
                        onChange={e => {
                          let v = e.target.value.replace(/\D/g, '').slice(0, 4);
                          if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2);
                          setCardData(prev => ({ ...prev, expiry: v }));
                        }}
                        style={inputStyle}
                        placeholder="MM/YY"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>CVV</label>
                      <input
                        type="password"
                        maxLength={4}
                        value={cardData.cvv}
                        onChange={e => setCardData(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                        style={inputStyle}
                        placeholder="•••"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'NET_BANKING' && (
                <div style={{ padding: 14, borderRadius: 8, background: 'var(--color-surface-chip)', border: '1px solid var(--color-border)' }}>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Select Your Bank</label>
                  <select
                    value={selectedBank}
                    onChange={e => setSelectedBank(e.target.value)}
                    style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
                  >
                    {['HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank', 'Bank of Baroda'].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Right: Order Summary */}
          <div style={{
            background: 'var(--color-bg-card-solid)', border: '1px solid var(--color-border)',
            borderRadius: 14, padding: 24, position: 'sticky', top: 80, boxShadow: 'var(--shadow-card)',
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18, color: 'var(--color-text-primary)' }}>Order Summary</h3>

            {/* Cart items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {cartItems.map(item => (
                <div key={item.sku} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 8, overflow: 'hidden',
                    background: 'var(--color-bg-hover)', flexShrink: 0,
                  }}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📦</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>{formatINR(item.price)} × {item.qty}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => item.qty <= 1 ? removeFromCart(item.sku) : updateQty(item.sku, item.qty - 1)} style={{
                      width: 24, height: 24, borderRadius: 6, border: '1px solid var(--color-border)',
                      background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>−</button>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', width: 20, textAlign: 'center' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.sku, item.qty + 1)} style={{
                      width: 24, height: 24, borderRadius: 6, border: '1px solid var(--color-border)',
                      background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>+</button>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{formatINR(item.price * item.qty)}</span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--color-border-subtle)', marginBottom: 16 }} />

            {/* Pricing */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Subtotal</span>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatINR(cartSubtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Delivery Fee</span>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
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
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>Estimated Delivery</span>
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
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      Factors: {quote.mlPrediction.featureImportance.join(' • ')}
                    </div>
                  )}
                </div>
              ) : quote?.estimatedDays ? (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Estimated Delivery</span>
                  <span style={{ fontWeight: 600, color: '#10b981' }}>{quote.estimatedDays} day{quote.estimatedDays > 1 ? 's' : ''}</span>
                </div>
              ) : null}
              <div style={{ height: 1, background: 'rgba(51,65,85,0.3)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: 15 }}>Total</span>
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
              {submitting
                ? (paymentMethod === 'COD' ? 'Placing Order...' : 'Authorizing Payment...')
                : paymentMethod === 'COD'
                  ? 'Place Order (Cash on Delivery)'
                  : paymentMethod === 'UPI'
                    ? `Pay ${quote?.total != null ? formatINR(quote.total) : formatINR(cartSubtotal)} via UPI & Place Order`
                    : paymentMethod === 'CARD'
                      ? `Pay ${quote?.total != null ? formatINR(quote.total) : formatINR(cartSubtotal)} & Place Order`
                      : 'Proceed to Pay & Place Order'
              }
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
       *  UPI PAYMENT GATEWAY SIMULATOR (OPTION A)
       * ═══════════════════════════════════════════════════════ */}
      {showUpiModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'var(--color-bg-card-solid, #ffffff)', color: 'var(--color-text-primary)',
            borderRadius: 16, padding: '28px 32px', maxWidth: 440, width: '100%',
            boxShadow: 'var(--shadow-card)', border: '1px solid var(--color-border)',
            textAlign: 'center', fontFamily: 'var(--font-sans)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>📱</span>
                <span style={{ fontSize: 16, fontWeight: 800 }}>UPI Payment Gateway</span>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(16,185,129,0.15)', color: '#10b981', textTransform: 'uppercase',
              }}>
                Sandbox Mode
              </span>
            </div>

            {/* Total to Pay */}
            <div style={{
              background: 'var(--color-surface-chip)', borderRadius: 10, padding: '12px 16px',
              border: '1px solid var(--color-border-subtle)', marginBottom: 16,
            }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Amount Payable</span>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                {quote?.total != null ? formatINR(quote.total) : formatINR(cartSubtotal)}
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Merchant: Supply Chain Store Retail</span>
            </div>

            {/* SVG QR Code */}
            <div style={{
              background: '#ffffff', padding: 14, borderRadius: 12, display: 'inline-block',
              border: '2px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', marginBottom: 16,
            }}>
              <svg width="180" height="180" viewBox="0 0 180 180">
                {/* 3 Corner Detection Patterns */}
                <rect x="10" y="10" width="45" height="45" fill="none" stroke="#0f172a" strokeWidth="8" rx="4" />
                <rect x="23" y="23" width="19" height="19" fill="#0f172a" rx="2" />
                <rect x="125" y="10" width="45" height="45" fill="none" stroke="#0f172a" strokeWidth="8" rx="4" />
                <rect x="138" y="23" width="19" height="19" fill="#0f172a" rx="2" />
                <rect x="10" y="125" width="45" height="45" fill="none" stroke="#0f172a" strokeWidth="8" rx="4" />
                <rect x="23" y="138" width="19" height="19" fill="#0f172a" rx="2" />
                {/* Simulated Data Modules Grid */}
                {[
                  [65, 15, 8], [80, 15, 8], [100, 15, 8], [65, 30, 8], [95, 30, 8],
                  [15, 65, 8], [30, 65, 8], [45, 65, 8], [65, 65, 8], [80, 65, 8], [95, 65, 8], [110, 65, 8], [130, 65, 8], [150, 65, 8],
                  [15, 80, 8], [40, 80, 8], [60, 80, 8], [120, 80, 8], [145, 80, 8], [160, 80, 8],
                  [15, 95, 8], [35, 95, 8], [75, 95, 8], [95, 95, 8], [115, 95, 8], [135, 95, 8], [155, 95, 8],
                  [65, 115, 8], [85, 115, 8], [105, 115, 8], [125, 115, 8], [145, 115, 8],
                  [65, 135, 8], [85, 135, 8], [110, 135, 8], [130, 135, 8], [155, 135, 8],
                  [65, 155, 8], [90, 155, 8], [115, 155, 8], [140, 155, 8]
                ].map(([x, y, s], idx) => (
                  <rect key={idx} x={x} y={y} width={s} height={s} fill="#0f172a" rx="1" />
                ))}
                {/* Center UPI Badge */}
                <circle cx="90" cy="90" r="16" fill="#10b981" />
                <text x="90" y="94" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="800">UPI</text>
              </svg>
            </div>

            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 14px' }}>
              Scan via Google Pay, PhonePe, Paytm, or BHIM, or simulate instant approval below:
            </p>

            {/* Simulation Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => executeOrderCheckout({
                  method: 'UPI',
                  label: `UPI (${upiId.trim() || 'Instant QR Pay'})`,
                  status: 'Paid Online (Verified)',
                })}
                style={{
                  width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff',
                  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span>⚡</span>
                <span>{submitting ? 'Verifying Transaction...' : 'Simulate Instant UPI Approval'}</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowUpiModal(false)}
                style={{
                  width: '100%', padding: '9px', borderRadius: 8, background: 'transparent',
                  border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>

            <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 12, opacity: 0.8 }}>
              🔒 100% Client-side sandbox. Zero real money deducted. Zero external data leak.
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
       *  CREDIT CARD 3D SECURE OTP SIMULATOR (OPTION A)
       * ═══════════════════════════════════════════════════════ */}
      {showCardOtpModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'var(--color-bg-card-solid, #ffffff)', color: 'var(--color-text-primary)',
            borderRadius: 16, padding: '28px 32px', maxWidth: 460, width: '100%',
            boxShadow: 'var(--shadow-card)', border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-sans)',
          }}>
            {/* Bank Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>💳</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Visa / Mastercard 3D Secure</h4>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Bank Authorization Simulator</span>
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
              }}>
                🔒 256-bit SSL
              </span>
            </div>

            {/* Transaction Dossier */}
            <div style={{
              background: 'var(--color-surface-chip)', borderRadius: 10, padding: '12px 16px',
              border: '1px solid var(--color-border-subtle)', marginBottom: 18, fontSize: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Merchant:</span>
                <strong style={{ color: 'var(--color-text-primary)' }}>Supply Chain Store Retail</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Card Number:</span>
                <strong style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>
                  •••• •••• •••• {cardData.number.replace(/\s/g, '').slice(-4) || '1881'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, paddingTop: 6, borderTop: '1px dashed var(--color-border)' }}>
                <span>Transaction Amount:</span>
                <span style={{ color: '#10b981' }}>{quote?.total != null ? formatINR(quote.total) : formatINR(cartSubtotal)}</span>
              </div>
            </div>

            {/* OTP Section */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ ...labelStyle, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Enter 6-Digit Bank OTP</span>
                <button
                  type="button"
                  onClick={() => setEnteredOtp('123456')}
                  style={{
                    background: 'none', border: 'none', color: '#60a5fa', fontSize: 11,
                    fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline',
                  }}
                >
                  Fill Demo OTP (123456)
                </button>
              </label>

              <input
                type="text"
                maxLength={6}
                value={enteredOtp}
                onChange={e => setEnteredOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{
                  ...inputStyle, fontSize: 18, fontWeight: 800, letterSpacing: '6px',
                  textAlign: 'center', padding: '10px',
                }}
                placeholder="123456"
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, textAlign: 'center' }}>
                Simulated OTP has been prefilled for instant developer evaluation.
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                disabled={submitting || enteredOtp.length < 4}
                onClick={() => executeOrderCheckout({
                  method: 'CARD',
                  label: `Credit/Debit Card (•••• ${cardData.number.replace(/\s/g, '').slice(-4) || '1881'})`,
                  status: 'Paid Online (Verified)',
                })}
                style={{
                  width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff',
                  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span>🔒</span>
                <span>{submitting ? 'Authorizing with Issuer Bank...' : 'Verify OTP & Authorize Payment'}</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowCardOtpModal(false)}
                style={{
                  width: '100%', padding: '9px', borderRadius: 8, background: 'transparent',
                  border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
       *  NET BANKING PORTAL SIMULATOR (OPTION A)
       * ═══════════════════════════════════════════════════════ */}
      {showNetBankingModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'var(--color-bg-card-solid, #ffffff)', color: 'var(--color-text-primary)',
            borderRadius: 16, padding: '28px 32px', maxWidth: 460, width: '100%',
            boxShadow: 'var(--shadow-card)', border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-sans)',
          }}>
            {/* Bank Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🏦</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{selectedBank} NetBanking</h4>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Secure E-Payment Gateway</span>
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(16,185,129,0.15)', color: '#10b981',
              }}>
                🔒 128-bit SSL
              </span>
            </div>

            {/* Account Details Strip */}
            <div style={{
              background: 'var(--color-surface-chip)', borderRadius: 10, padding: '12px 16px',
              border: '1px solid var(--color-border-subtle)', marginBottom: 18, fontSize: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Debit Account:</span>
                <strong style={{ color: 'var(--color-text-primary)' }}>•••••••• 4891 (Savings)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Beneficiary:</span>
                <strong style={{ color: 'var(--color-text-primary)' }}>Supply Chain Store Ltd</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, paddingTop: 6, borderTop: '1px dashed var(--color-border)' }}>
                <span>Total Debit:</span>
                <span style={{ color: '#10b981' }}>{quote?.total != null ? formatINR(quote.total) : formatINR(cartSubtotal)}</span>
              </div>
            </div>

            {/* User ID field */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ ...labelStyle, marginBottom: 6 }}>Customer ID / User ID</label>
              <input
                value={netBankingUserId}
                onChange={e => setNetBankingUserId(e.target.value)}
                style={inputStyle}
                placeholder="User ID"
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Simulated NetBanking session active for testing.
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => executeOrderCheckout({
                  method: 'NET_BANKING',
                  label: `Net Banking (${selectedBank})`,
                  status: 'Paid Online (Verified)',
                })}
                style={{
                  width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff',
                  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span>🔒</span>
                <span>{submitting ? 'Debiting Account...' : 'Confirm & Authorize Payment'}</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowNetBankingModal(false)}
                style={{
                  width: '100%', padding: '9px', borderRadius: 8, background: 'transparent',
                  border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
