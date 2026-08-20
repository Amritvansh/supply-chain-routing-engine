/**
 * OrderSimulator — Week 3: Full checkout + flash-sale + hybrid demo
 *
 * Demonstrates the Hybrid Architecture:
 *   SYNCHRONOUS: checkout → deterministic routing → instant result
 *   ASYNCHRONOUS: result rendered → GET /explain → AI explanation arrives later
 *
 * The UI MUST NOT wait for Gemini before showing the order confirmation.
 *
 * Sections:
 *   1. Checkout Form (customer location, SKU selection, multi-item)
 *   2. Checkout Result (immediate deterministic display)
 *   3. AI Explanation Widget (async, after result renders)
 *   4. Hybrid Architecture Demo Panel (2-step indicator)
 *   5. Flash Sale Simulator (server-side stress test)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../lib/apiClient';
import AIExplanationWidget from '../components/AIExplanationWidget';

// ─── Preset Indian Cities ───────────────────────────────────
const PRESET_CITIES = [
  { name: 'Mumbai', lat: 19.076, lng: 72.877 },
  { name: 'Bangalore', lat: 12.972, lng: 77.594 },
  { name: 'Chennai', lat: 13.083, lng: 80.270 },
  { name: 'Hyderabad', lat: 17.385, lng: 78.487 },
  { name: 'Kolkata', lat: 22.573, lng: 88.364 },
  { name: 'Pune', lat: 18.520, lng: 73.857 },
  { name: 'Jaipur', lat: 26.912, lng: 75.787 },
  { name: 'Ahmedabad', lat: 23.023, lng: 72.571 },
];

// ─── Sub-components ─────────────────────────────────────────

function SectionCard({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle, accentColor = 'var(--color-accent)' }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
        <span style={{ color: accentColor }}>{icon}</span>
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function StatBlock({ label, value, unit, accentColor = 'var(--color-accent)' }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 text-center">
      <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: accentColor }}>
        {value}
        {unit && <span className="text-xs text-[var(--color-text-muted)] ml-1">{unit}</span>}
      </p>
    </div>
  );
}

/** Error message banner with contextual styling per HTTP status. */
function CheckoutErrorBanner({ error, retryCountdown }) {
  if (!error) return null;

  const is409 = error.status === 409;
  const is429 = error.status === 429;
  const is400 = error.status === 400;

  let icon, title, borderColor;
  if (is409) {
    icon = '🚫';
    title = error.code === 'NO_ELIGIBLE_WAREHOUSE' ? 'No Eligible Warehouse' : 'Insufficient Stock';
    borderColor = 'var(--color-warning)';
  } else if (is429) {
    icon = '⏳';
    title = 'Checkout Temporarily Busy';
    borderColor = 'var(--color-warning)';
  } else if (is400) {
    icon = '⚠️';
    title = 'Validation Error';
    borderColor = 'var(--color-warning)';
  } else {
    icon = '❌';
    title = 'Server Error';
    borderColor = 'var(--color-danger)';
  }

  return (
    <div
      className="rounded-lg border p-4 animate-fade-in"
      style={{ borderColor }}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{icon}</span>
        <div className="min-w-0">
          <h3 className="font-semibold text-[var(--color-text-primary)] text-sm">{title}</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {error.message || 'An unexpected error occurred.'}
          </p>
          {is429 && retryCountdown > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full border-2 border-[var(--color-warning)] flex items-center justify-center">
                <span className="text-xs font-bold text-[var(--color-warning)]">{retryCountdown}</span>
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">
                Retry available in {retryCountdown}s
              </span>
            </div>
          )}
          {error.code && (
            <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-primary)]">
              {error.code}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Hybrid Architecture demo panel — two-step visual indicator. */
function HybridDemoPanel({ checkoutDone, checkoutTimestamp, explanationDone, explanationTimestamp }) {
  return (
    <SectionCard>
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
        </svg>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
          Hybrid Architecture Demo
        </h3>
      </div>

      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Order correctness does NOT depend on Gemini AI. The checkout result appears instantly,
        and the AI explanation is generated separately.
      </p>

      <div className="space-y-3">
        {/* Step 1: Deterministic Checkout */}
        <div className="flex items-center gap-3">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
              checkoutDone
                ? 'bg-[var(--color-success)] text-[var(--color-bg-primary)]'
                : 'border-2 border-[var(--color-border)] text-[var(--color-text-muted)]'
            }`}
          >
            {checkoutDone ? '✓' : '1'}
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${checkoutDone ? 'text-[var(--color-success)]' : 'text-[var(--color-text-secondary)]'}`}>
              Deterministic checkout completed
            </p>
            {checkoutDone && checkoutTimestamp && (
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {new Date(checkoutTimestamp).toLocaleTimeString()} — synchronous, no AI dependency
              </p>
            )}
          </div>
        </div>

        {/* Connector */}
        <div className="ml-3.5 w-px h-4 bg-[var(--color-border)]" />

        {/* Step 2: Async AI Explanation */}
        <div className="flex items-center gap-3">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
              explanationDone
                ? 'bg-[var(--color-accent)] text-[var(--color-bg-primary)]'
                : checkoutDone
                ? 'border-2 border-[var(--color-accent)] text-[var(--color-accent)] animate-pulse'
                : 'border-2 border-[var(--color-border)] text-[var(--color-text-muted)]'
            }`}
          >
            {explanationDone ? '✓' : '2'}
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${
              explanationDone
                ? 'text-[var(--color-accent)]'
                : checkoutDone
                ? 'text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)]'
            }`}>
              {explanationDone
                ? 'AI explanation received'
                : checkoutDone
                ? 'AI explanation generating…'
                : 'AI explanation (pending checkout)'}
            </p>
            {explanationDone && explanationTimestamp && (
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {new Date(explanationTimestamp).toLocaleTimeString()} — asynchronous, decoupled from checkout
              </p>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Main Component ─────────────────────────────────────────

export default function OrderSimulator() {
  // === SKU Loading ===
  const [availableSkus, setAvailableSkus] = useState([]);
  const [skuLoading, setSkuLoading] = useState(true);

  // === Checkout Form ===
  const [selectedCity, setSelectedCity] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');
  const [items, setItems] = useState([{ sku: '', qty: 1 }]);

  // === Checkout State ===
  const [checkoutState, setCheckoutState] = useState('idle'); // idle | loading | success | error
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const retryTimerRef = useRef(null);

  // === Hybrid Demo Tracking ===
  const [checkoutTimestamp, setCheckoutTimestamp] = useState(null);
  const [explanationDone, setExplanationDone] = useState(false);
  const [explanationTimestamp, setExplanationTimestamp] = useState(null);

  // === Flash Test ===
  const [flashSku, setFlashSku] = useState('');
  const [flashQty, setFlashQty] = useState(1);
  const [flashConcurrency, setFlashConcurrency] = useState(10);
  const [flashState, setFlashState] = useState('idle'); // idle | loading | success | error
  const [flashResult, setFlashResult] = useState(null);
  const [flashError, setFlashError] = useState(null);

  // ─── Load available SKUs from warehouses ──────────────────
  useEffect(() => {
    let cancelled = false;
    api.getWarehouses()
      .then((data) => {
        if (cancelled) return;
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
      .catch(() => {
        // SKUs will be empty — user can still type a SKU manually
      })
      .finally(() => {
        if (!cancelled) setSkuLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ─── Cleanup retry timer ──────────────────────────────────
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    };
  }, []);

  // ─── Form Helpers ─────────────────────────────────────────

  const getCustomerCoords = useCallback(() => {
    if (selectedCity === 'custom') {
      const lat = parseFloat(customLat);
      const lng = parseFloat(customLng);
      if (isNaN(lat) || isNaN(lng)) return null;
      return { lat, lng };
    }
    const city = PRESET_CITIES.find((c) => c.name === selectedCity);
    return city ? { lat: city.lat, lng: city.lng } : null;
  }, [selectedCity, customLat, customLng]);

  const addItem = () => {
    setItems((prev) => [...prev, { sku: '', qty: 1 }]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const isFormValid = () => {
    const coords = getCustomerCoords();
    if (!coords) return false;
    const validItems = items.filter((i) => i.sku && i.qty > 0);
    return validItems.length > 0;
  };

  // ─── Checkout Handler ─────────────────────────────────────

  const handleCheckout = async () => {
    const coords = getCustomerCoords();
    if (!coords) {
      setCheckoutError({ message: 'Please select a valid customer location.', status: 400 });
      setCheckoutState('error');
      return;
    }

    const validItems = items.filter((i) => i.sku && i.qty > 0);
    if (validItems.length === 0) {
      setCheckoutError({ message: 'Please add at least one item with a valid SKU and quantity.', status: 400 });
      setCheckoutState('error');
      return;
    }

    // Generate a FRESH idempotency key for each new order attempt
    const idempotencyKey = crypto.randomUUID();

    setCheckoutState('loading');
    setCheckoutError(null);
    setCheckoutResult(null);
    setCheckoutTimestamp(null);
    setExplanationDone(false);
    setExplanationTimestamp(null);
    setRetryCountdown(0);
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);

    try {
      const result = await api.checkout({
        customerLat: coords.lat,
        customerLng: coords.lng,
        items: validItems.map((i) => ({ sku: i.sku, qty: parseInt(i.qty, 10) })),
        idempotencyKey,
      });

      setCheckoutResult(result);
      setCheckoutState('success');
      setCheckoutTimestamp(Date.now());
    } catch (err) {
      setCheckoutError(err);
      setCheckoutState('error');

      // 429 countdown
      if (err.status === 429) {
        const retryAfter = parseInt(err.retryAfter, 10) || 5;
        setRetryCountdown(retryAfter);
        retryTimerRef.current = setInterval(() => {
          setRetryCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(retryTimerRef.current);
              retryTimerRef.current = null;
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    }
  };

  // ─── Flash Test Handler ───────────────────────────────────

  const handleFlashTest = async () => {
    if (!flashSku) {
      setFlashError({ message: 'Please select a SKU for the flash test.' });
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

  // ─── AI Explanation callback (for hybrid demo panel) ──────

  const handleExplanationLoaded = useCallback(() => {
    setExplanationDone(true);
    setExplanationTimestamp(Date.now());
  }, []);

  // ─── Derived ──────────────────────────────────────────────
  const orderId = checkoutResult?.order?.id;
  const isReplay = checkoutResult?.replay === true;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-1">
          Order Simulator
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Simulate checkout orders and test the hybrid routing engine
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ════════════════ LEFT COLUMN: Checkout Form ════════════════ */}
        <div className="space-y-6">
          <SectionCard>
            <SectionHeader
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                </svg>
              }
              title="Checkout Simulator"
              subtitle="Select a customer location, add items, and place an order"
            />

            {/* Customer Location */}
            <div className="space-y-3 mb-5">
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Customer Location
              </label>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors"
                id="customer-location"
              >
                <option value="">Select a city…</option>
                {PRESET_CITIES.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name} ({city.lat}°, {city.lng}°)
                  </option>
                ))}
                <option value="custom">Custom coordinates…</option>
              </select>

              {selectedCity === 'custom' && (
                <div className="grid grid-cols-2 gap-3 animate-fade-in">
                  <input
                    type="number"
                    step="any"
                    placeholder="Latitude"
                    value={customLat}
                    onChange={(e) => setCustomLat(e.target.value)}
                    className="h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                    id="custom-lat"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Longitude"
                    value={customLng}
                    onChange={(e) => setCustomLng(e.target.value)}
                    className="h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                    id="custom-lng"
                  />
                </div>
              )}
            </div>

            {/* Items */}
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Order Items
                </label>
                <button
                  type="button"
                  onClick={addItem}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-[var(--color-accent)] bg-[var(--color-accent-glow)] hover:bg-[var(--color-accent)] hover:text-[var(--color-bg-primary)] transition-colors duration-200"
                  id="add-item-btn"
                >
                  + Add Item
                </button>
              </div>

              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-start animate-fade-in">
                  <select
                    value={item.sku}
                    onChange={(e) => updateItem(index, 'sku', e.target.value)}
                    className="flex-1 h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                    id={`item-sku-${index}`}
                  >
                    <option value="">
                      {skuLoading ? 'Loading SKUs…' : 'Select SKU…'}
                    </option>
                    {availableSkus.map((s) => (
                      <option key={s.sku} value={s.sku}>
                        {s.name} ({s.sku})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={item.qty}
                    onChange={(e) => updateItem(index, 'qty', e.target.value)}
                    className="w-20 h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                    id={`item-qty-${index}`}
                    placeholder="Qty"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="w-10 h-10 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)] transition-colors duration-200 shrink-0"
                      aria-label={`Remove item ${index + 1}`}
                      id={`remove-item-${index}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Submit */}
            <button
              onClick={handleCheckout}
              disabled={!isFormValid() || checkoutState === 'loading'}
              className="w-full py-3 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] font-semibold text-sm hover:bg-[var(--color-accent-hover)] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg-card)]"
              id="place-order-btn"
            >
              {checkoutState === 'loading' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing Checkout…
                </span>
              ) : (
                'Place Order'
              )}
            </button>
          </SectionCard>
        </div>

        {/* ════════════════ RIGHT COLUMN: Results ════════════════ */}
        <div className="space-y-6">
          {/* ─── Error State ─── */}
          {checkoutState === 'error' && (
            <CheckoutErrorBanner error={checkoutError} retryCountdown={retryCountdown} />
          )}

          {/* ─── Checkout Result ─── */}
          {checkoutState === 'success' && checkoutResult && (
            <>
              <SectionCard className="animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-success)] flex items-center justify-center text-[var(--color-bg-primary)] text-sm font-bold">
                      ✓
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--color-success)]">
                        {isReplay ? 'Order Retrieved (Replay)' : 'Order Confirmed'}
                      </h3>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-mono">
                        {orderId}
                      </p>
                    </div>
                  </div>
                  {isReplay && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] uppercase">
                      Idempotent Replay
                    </span>
                  )}
                </div>

                {/* Shipments */}
                {(checkoutResult.shipments || []).map((shipment, idx) => (
                  <div key={shipment.id || idx} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        {checkoutResult.shipments.length > 1 ? `Shipment ${idx + 1}` : 'Shipment'}
                      </h4>
                      {shipment.box_size && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-accent-glow)] text-[var(--color-accent)]">
                          📦 {shipment.box_size}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-[var(--color-text-muted)] text-xs">Warehouse</span>
                        <p className="text-[var(--color-text-primary)] font-medium">
                          {shipment.warehouse_name || shipment.warehouse_id?.slice(0, 8) || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[var(--color-text-muted)] text-xs">Distance</span>
                        <p className="text-[var(--color-text-primary)] font-medium">
                          {parseFloat(shipment.distance_km).toFixed(1)} km
                        </p>
                      </div>
                      <div>
                        <span className="text-[var(--color-text-muted)] text-xs">Shipping Cost</span>
                        <p className="text-[var(--color-text-primary)] font-medium">
                          ₹{parseFloat(shipment.total_cost).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Cost Breakdown */}
                {checkoutResult.costBreakdown && (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 mb-3">
                    <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                      Cost Breakdown
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-muted)]">Distance Cost</span>
                        <span className="text-[var(--color-text-primary)] font-medium">₹{checkoutResult.costBreakdown.distanceCost?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-muted)]">Packaging Cost</span>
                        <span className="text-[var(--color-text-primary)] font-medium">₹{checkoutResult.costBreakdown.packagingCost?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-muted)]">Depletion Penalty</span>
                        <span className={`font-medium ${checkoutResult.costBreakdown.depletionPenalty > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'}`}>
                          ₹{checkoutResult.costBreakdown.depletionPenalty?.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-[var(--color-border)] pt-2">
                        <span className="text-[var(--color-text-primary)] font-semibold">Total</span>
                        <span className="text-[var(--color-accent)] font-bold">₹{checkoutResult.costBreakdown.totalCost?.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Packing Info */}
                {checkoutResult.packing && (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 mb-3">
                    <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                      Packing
                    </h4>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <span className="px-2.5 py-1 rounded-lg bg-[var(--color-accent-glow)] text-[var(--color-accent)] text-xs font-semibold">
                        {checkoutResult.packing.status === 'SPLIT_SHIPMENT' ? '📦 Split Shipment' : `📦 ${checkoutResult.packing.boxSize}`}
                      </span>
                      {checkoutResult.packing.totalVolumeCm3 != null && (
                        <span className="text-[var(--color-text-muted)] text-xs">
                          Vol: {checkoutResult.packing.totalVolumeCm3.toLocaleString()} cm³
                        </span>
                      )}
                      {checkoutResult.packing.totalWeightKg != null && (
                        <span className="text-[var(--color-text-muted)] text-xs">
                          Wt: {checkoutResult.packing.totalWeightKg} kg
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Alternatives */}
                {checkoutResult.alternatives && checkoutResult.alternatives.length > 0 && (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                    <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                      Rejected Alternatives
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="text-left py-2 px-2 text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">Warehouse</th>
                            <th className="text-right py-2 px-2 text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">Dist</th>
                            <th className="text-right py-2 px-2 text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">Penalty</th>
                            <th className="text-right py-2 px-2 text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {checkoutResult.alternatives.map((alt, i) => (
                            <tr key={alt.warehouseId || i} className="border-b border-[var(--color-border)] last:border-b-0">
                              <td className="py-2 px-2 text-[var(--color-text-secondary)]">{alt.name}</td>
                              <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">{alt.distanceKm?.toFixed(1)} km</td>
                              <td className="py-2 px-2 text-right text-[var(--color-warning)]">₹{alt.penalty}</td>
                              <td className="py-2 px-2 text-right text-[var(--color-text-primary)] font-medium">₹{alt.totalCost?.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* Async AI Explanation — fires AFTER deterministic result */}
              <AIExplanationWidgetWrapper
                orderId={orderId}
                onLoaded={handleExplanationLoaded}
              />

              {/* Hybrid Architecture Demo Panel */}
              <HybridDemoPanel
                checkoutDone={true}
                checkoutTimestamp={checkoutTimestamp}
                explanationDone={explanationDone}
                explanationTimestamp={explanationTimestamp}
              />
            </>
          )}

          {/* ─── Idle / Placeholder ─── */}
          {checkoutState === 'idle' && (
            <SectionCard>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent-glow)] flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H18.75m-7.5-2.625h6.375c.621 0 1.125.504 1.125 1.125v1.5m0 0h.75m-6-3H6.375a1.125 1.125 0 0 0-1.125 1.125v3.659M18.75 12.75h.008v.008h-.008v-.008Zm-.375-3h.008v.008h-.008V9.75Z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
                  Ready to Route
                </h3>
                <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
                  Select a customer location, add items, and place an order to see the deterministic routing engine in action.
                </p>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {/* ════════════════ FLASH SALE SIMULATOR ════════════════ */}
      <div className="mt-8">
        <SectionCard>
          <SectionHeader
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
            }
            title="Flash Sale Simulator"
            subtitle="Stress-test the server-side checkout path with concurrent requests"
            accentColor="var(--color-warning)"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            {/* SKU */}
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                SKU
              </label>
              <select
                value={flashSku}
                onChange={(e) => setFlashSku(e.target.value)}
                className="w-full h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-warning)] focus:border-transparent"
                id="flash-sku"
              >
                <option value="">Select SKU…</option>
                {availableSkus.map((s) => (
                  <option key={s.sku} value={s.sku}>
                    {s.name} ({s.sku})
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                Quantity per Order
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={flashQty}
                onChange={(e) => setFlashQty(e.target.value)}
                className="w-full h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-warning)] focus:border-transparent"
                id="flash-qty"
              />
            </div>

            {/* Concurrency */}
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                Concurrency (1–50)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={flashConcurrency}
                onChange={(e) => setFlashConcurrency(e.target.value)}
                className="w-full h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-warning)] focus:border-transparent"
                id="flash-concurrency"
              />
            </div>
          </div>

          <button
            onClick={handleFlashTest}
            disabled={!flashSku || flashState === 'loading'}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg border-2 border-[var(--color-warning)] text-[var(--color-warning)] font-semibold text-sm hover:bg-[var(--color-warning)] hover:text-[var(--color-bg-primary)] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--color-warning)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg-card)]"
            id="flash-test-btn"
          >
            {flashState === 'loading' ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Running Flash Sale…
              </span>
            ) : (
              '⚡ Simulate Flash Sale'
            )}
          </button>

          {/* Flash Test Error */}
          {flashState === 'error' && flashError && (
            <div className="mt-4 rounded-lg border border-[var(--color-danger)] p-3 text-sm text-[var(--color-danger)]" role="alert">
              {flashError.message || 'Flash test failed.'}
            </div>
          )}

          {/* Flash Test Results */}
          {flashState === 'success' && flashResult && (
            <div className="mt-5 animate-fade-in">
              <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                Server-Side Results
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatBlock
                  label="Successful"
                  value={flashResult.successCount}
                  accentColor="var(--color-success)"
                />
                <StatBlock
                  label="Rate Limited (429)"
                  value={flashResult.rateLimited429Count}
                  accentColor="var(--color-warning)"
                />
                <StatBlock
                  label="Conflict (409)"
                  value={flashResult.conflict409Count}
                  accentColor="var(--color-danger)"
                />
                <StatBlock
                  label="Avg Latency"
                  value={flashResult.avgLatencyMs?.toFixed(1)}
                  unit="ms"
                  accentColor="var(--color-accent)"
                />
                <StatBlock
                  label="P95 Latency"
                  value={flashResult.p95LatencyMs?.toFixed(1)}
                  unit="ms"
                  accentColor="var(--color-accent)"
                />
              </div>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-3 text-center">
                All metrics generated by the server via the real ACID checkout path — no simulated data.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ─── AIExplanationWidget Wrapper ────────────────────────────
// Wraps the existing widget to detect when the explanation loads
// and notify the parent (for the hybrid demo panel).

function AIExplanationWidgetWrapper({ orderId, onLoaded }) {
  const [loaded, setLoaded] = useState(false);
  const observerRef = useRef(null);
  const containerRef = useRef(null);

  // Monitor the widget for state changes by observing DOM mutations
  // This avoids modifying the AIExplanationWidget component itself.
  useEffect(() => {
    if (!containerRef.current || loaded) return;

    const checkForSuccess = () => {
      const container = containerRef.current;
      if (!container) return false;
      // The widget shows source badges when in success state
      const text = container.textContent || '';
      if (text.includes('AI Explanation') && (text.includes('Computed Summary') || text.includes('✦'))) {
        // Check if it's actually showing the explanation text (not just the heading)
        const hasExplanation = container.querySelector('p[class*="leading-relaxed"]');
        if (hasExplanation) {
          return true;
        }
      }
      return false;
    };

    // Check immediately
    if (checkForSuccess()) {
      setLoaded(true);
      onLoaded?.();
      return;
    }

    // Observe mutations
    observerRef.current = new MutationObserver(() => {
      if (checkForSuccess()) {
        setLoaded(true);
        onLoaded?.();
        observerRef.current?.disconnect();
      }
    });

    observerRef.current.observe(containerRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [orderId, loaded, onLoaded]);

  // Reset when orderId changes
  useEffect(() => {
    setLoaded(false);
  }, [orderId]);

  return (
    <div ref={containerRef}>
      <AIExplanationWidget orderId={orderId} autoFetch={true} />
    </div>
  );
}
