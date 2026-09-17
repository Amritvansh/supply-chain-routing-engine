/**
 * OrderSimulator — Member 2 Week 5: Premium Customer Ordering Experience
 *
 * Demonstrates the Hybrid Architecture:
 *   SYNCHRONOUS: checkout → deterministic routing → instant result
 *   ASYNCHRONOUS: result rendered → GET /explain → AI explanation arrives later
 *
 * The UI MUST NOT wait for Gemini before showing the order confirmation.
 *
 * Sections:
 *   1. Customer Location Selection
 *   2. Product Catalog (cards from warehouse inventory)
 *   3. Interactive Cart Panel
 *   4. Checkout Result (immediate deterministic display)
 *   5. AI Explanation Widget (async, after result renders)
 *   6. Hybrid Architecture Demo Panel (2-step indicator)
 *   7. Flash Sale Simulator (server-side stress test)
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as api from '../lib/apiClient';
import AIExplanationWidget from '../components/AIExplanationWidget';

// ─── Preset Indian Cities ───────────────────────────────────
const PRESET_CITIES = [
  { name: 'Mumbai', lat: 19.076, lng: 72.877, icon: '🏙️' },
  { name: 'Bangalore', lat: 12.972, lng: 77.594, icon: '💻' },
  { name: 'Chennai', lat: 13.083, lng: 80.270, icon: '🌊' },
  { name: 'Hyderabad', lat: 17.385, lng: 78.487, icon: '🏛️' },
  { name: 'Kolkata', lat: 22.573, lng: 88.364, icon: '🌉' },
  { name: 'Pune', lat: 18.520, lng: 73.857, icon: '🏔️' },
  { name: 'Jaipur', lat: 26.912, lng: 75.787, icon: '🏰' },
  { name: 'Ahmedabad', lat: 23.023, lng: 72.571, icon: '🏗️' },
];

// ─── Product category icons ────────────────────────────────
const SKU_ICONS = {
  'SKU-001': '📦', 'SKU-002': '🔧', 'SKU-003': '⚙️', 'SKU-004': '🔩',
  'SKU-005': '🧰', 'SKU-006': '🔌', 'SKU-007': '💡', 'SKU-008': '🔋',
};

function getSkuIcon(sku) {
  return SKU_ICONS[sku] || '📦';
}

// ─── SVG Icon Components ────────────────────────────────────

function IconCart() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    </svg>
  );
}

function IconFlash() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  );
}

function IconLocation() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
    </svg>
  );
}

function IconPackage() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  );
}

function IconSpinner({ className = 'w-4 h-4' }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H18.75m-7.5-2.625h6.375c.621 0 1.125.504 1.125 1.125v1.5m0 0h.75m-6-3H6.375a1.125 1.125 0 0 0-1.125 1.125v3.659M18.75 12.75h.008v.008h-.008v-.008Zm-.375-3h.008v.008h-.008V9.75Z" />
    </svg>
  );
}


// ─── Sub-components ─────────────────────────────────────────

function SectionCard({ children, className = '' }) {
  return (
    <div className={`glass-card p-6 ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle, accentColor = 'var(--color-accent)', action }) {
  return (
    <div className="mb-5 section-header-accent">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <span style={{ color: accentColor }}>{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {subtitle && (
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function StatBlock({ label, value, unit, accentColor = 'var(--color-accent)' }) {
  return (
    <div className="stat-card text-center">
      <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1 font-semibold">{label}</p>
      <p className="text-2xl font-extrabold tracking-tight" style={{ color: accentColor }}>
        {value}
        {unit && <span className="text-xs text-[var(--color-text-muted)] ml-1 font-medium">{unit}</span>}
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

// ─── Step Flow Indicator ────────────────────────────────────

function ShoppingFlowIndicator({ hasLocation, hasItems, isCheckingOut }) {
  const steps = [
    { label: 'Location', done: hasLocation, active: !hasLocation },
    { label: 'Products', done: hasItems, active: hasLocation && !hasItems },
    { label: 'Cart', done: hasItems && hasLocation, active: hasItems && hasLocation && !isCheckingOut },
    { label: 'Checkout', done: isCheckingOut, active: hasItems && hasLocation },
  ];

  return (
    <div className="os-flow">
      {steps.map((step, i) => (
        <span key={step.label}>
          <span className={`os-flow__step ${step.done ? 'os-flow__step--done' : step.active ? 'os-flow__step--active' : ''}`}>
            <span className="os-flow__dot" />
            {step.label}
          </span>
          {i < steps.length - 1 && <span className="os-flow__sep" />}
        </span>
      ))}
    </div>
  );
}

// ─── Skeleton Product Card ──────────────────────────────────

function SkeletonProductCard() {
  return (
    <div className="os-skeleton-card">
      <div className="os-skeleton-card__img" />
      <div className="os-skeleton-card__body">
        <div className="os-skeleton-bar" style={{ width: '70%' }} />
        <div className="os-skeleton-bar" style={{ width: '40%' }} />
        <div className="os-skeleton-bar" style={{ width: '100%', marginTop: 12 }} />
        <div className="os-skeleton-bar" style={{ width: '100%', height: 36, marginTop: 12 }} />
      </div>
    </div>
  );
}

/** Product card in the catalog grid */
function ProductCard({ product, onAddToCart, cartQty }) {
  const inCart = cartQty > 0;
  const stockPct = Math.min(100, (product.totalAvailable / 100) * 100);
  const stockLevel = product.totalAvailable > 20 ? 'high' : product.totalAvailable > 0 ? 'mid' : 'low';

  return (
    <div
      className={`os-product-card ${inCart ? 'os-product-card--in-cart' : ''}`}
      id={`product-card-${product.sku}`}
    >
      {/* Image Area */}
      <div className="os-product-card__img">
        {getSkuIcon(product.sku)}
        {inCart && (
          <span className="os-product-card__cart-badge">
            ✓ {cartQty} in cart
          </span>
        )}
      </div>

      {/* Body */}
      <div className="os-product-card__body">
        <h3 className="os-product-card__name" title={product.name}>
          {product.name}
        </h3>
        <span className="os-product-card__sku">{product.sku}</span>

        {/* Stock Bar */}
        <div className="os-product-card__stock">
          <div className="os-product-card__stock-bar">
            <div
              className={`os-product-card__stock-fill os-product-card__stock-fill--${stockLevel}`}
              style={{ width: `${product.totalAvailable > 0 ? Math.max(8, stockPct) : 0}%` }}
            />
          </div>
          <span className="os-product-card__stock-text" title={product.totalAvailable > 0 ? `${product.totalAvailable} units across ${product.warehouseCount} warehouse${product.warehouseCount !== 1 ? 's' : ''}` : 'Currently out of stock'}>
            {product.totalAvailable > 0
              ? `${product.totalAvailable} · ${product.warehouseCount} warehouse${product.warehouseCount !== 1 ? 's' : ''}`
              : 'Out of stock'}
          </span>
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={() => onAddToCart(product)}
          disabled={product.totalAvailable <= 0}
          className={`os-product-card__add-btn ${inCart ? 'os-product-card__add-btn--added' : ''}`}
          aria-label={inCart ? `${product.name} added to cart (${cartQty})` : `Add ${product.name} to cart`}
          id={`add-to-cart-${product.sku}`}
        >
          {inCart ? <><IconCheck /> Added</> : <><IconPlus /> Add to Cart</>}
        </button>
      </div>
    </div>
  );
}

/** Cart item row */
function CartItem({ item, onUpdateQty, onRemove }) {
  return (
    <div className="os-cart-item animate-fade-in" id={`cart-item-${item.sku}`}>
      {/* Icon */}
      <div className="os-cart-item__icon">
        {getSkuIcon(item.sku)}
      </div>

      {/* Info */}
      <div className="os-cart-item__info">
        <p className="os-cart-item__name">{item.name}</p>
        <p className="os-cart-item__sku">{item.sku}</p>
      </div>

      {/* Quantity Stepper */}
      <div className="os-qty-stepper">
        <button
          onClick={() => onUpdateQty(item.sku, item.qty - 1)}
          disabled={item.qty <= 1}
          className="os-qty-stepper__btn"
          aria-label={`Decrease quantity of ${item.name}`}
          id={`qty-minus-${item.sku}`}
        >
          <IconMinus />
        </button>
        <input
          type="number"
          min="1"
          max="999"
          value={item.qty}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 1) onUpdateQty(item.sku, val);
          }}
          className="os-qty-stepper__value"
          id={`qty-input-${item.sku}`}
        />
        <button
          onClick={() => onUpdateQty(item.sku, item.qty + 1)}
          className="os-qty-stepper__btn"
          aria-label={`Increase quantity of ${item.name}`}
          id={`qty-plus-${item.sku}`}
        >
          <IconPlus />
        </button>
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(item.sku)}
        className="os-cart-remove"
        aria-label={`Remove ${item.name} from cart`}
        id={`remove-item-${item.sku}`}
      >
        <IconTrash />
      </button>
    </div>
  );
}

/** City selector card */
function CityPill({ city, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`os-city-pill ${isSelected ? 'os-city-pill--selected' : ''}`}
      aria-label={`Deliver to ${city.name} (${city.lat}°N, ${city.lng}°E)`}
      aria-pressed={isSelected}
      id={`city-${city.name.toLowerCase()}`}
    >
      <span className="os-city-pill__icon">{city.icon}</span>
      <span className="os-city-pill__name">{city.name}</span>
      <span className="os-city-pill__coords">{city.lat}°N, {city.lng}°E</span>
    </button>
  );
}


// ─── Main Component ─────────────────────────────────────────

export default function OrderSimulator() {
  // === Tab State ===
  const [activeTab, setActiveTab] = useState('checkout'); // checkout | flash

  // === SKU/Warehouse Loading ===
  const [warehouseData, setWarehouseData] = useState([]);
  const [skuLoading, setSkuLoading] = useState(true);
  const [skuError, setSkuError] = useState(null);

  // === Customer Location ===
  const [selectedCity, setSelectedCity] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');

  // === Cart ===
  const [cart, setCart] = useState([]); // [{ sku, name, qty }]

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

  // ─── Derived: product catalog from warehouses ──────────────
  const productCatalog = useMemo(() => {
    const skuMap = new Map();
    (warehouseData || []).forEach((w) => {
      (w.inventory || []).forEach((inv) => {
        if (skuMap.has(inv.sku)) {
          const existing = skuMap.get(inv.sku);
          existing.totalAvailable += (inv.availableQty || 0);
          existing.warehouseCount += 1;
        } else {
          skuMap.set(inv.sku, {
            sku: inv.sku,
            name: inv.name || inv.sku,
            totalAvailable: inv.availableQty || 0,
            warehouseCount: 1,
          });
        }
      });
    });
    return [...skuMap.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [warehouseData]);

  // ─── Load warehouse data ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setSkuLoading(true);
    setSkuError(null);
    api.getWarehouses()
      .then((data) => {
        if (cancelled) return;
        setWarehouseData(data.warehouses || []);
      })
      .catch((err) => {
        if (!cancelled) setSkuError(err.message || 'Failed to load products.');
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

  // ─── Location Helpers ─────────────────────────────────────

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

  // ─── Cart Helpers ─────────────────────────────────────────

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.sku === product.sku);
      if (existing) {
        return prev.map((c) => c.sku === product.sku ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { sku: product.sku, name: product.name, qty: 1 }];
    });
  }, []);

  const updateCartQty = useCallback((sku, newQty) => {
    if (newQty < 1) return;
    setCart((prev) => prev.map((c) => c.sku === sku ? { ...c, qty: newQty } : c));
  }, []);

  const removeFromCart = useCallback((sku) => {
    setCart((prev) => prev.filter((c) => c.sku !== sku));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const cartItemCount = useMemo(() => cart.reduce((sum, c) => sum + c.qty, 0), [cart]);
  const getCartQty = useCallback((sku) => {
    const item = cart.find((c) => c.sku === sku);
    return item ? item.qty : 0;
  }, [cart]);

  const isFormValid = useCallback(() => {
    const coords = getCustomerCoords();
    return coords !== null && cart.length > 0;
  }, [getCustomerCoords, cart]);

  // ─── Checkout Handler ─────────────────────────────────────

  const handleCheckout = async () => {
    const coords = getCustomerCoords();
    if (!coords) {
      setCheckoutError({ message: 'Please select a valid customer location.', status: 400 });
      setCheckoutState('error');
      return;
    }

    if (cart.length === 0) {
      setCheckoutError({ message: 'Please add at least one item to your cart.', status: 400 });
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
        items: cart.map((c) => ({ sku: c.sku, qty: parseInt(c.qty, 10) })),
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

  // ─── New Order (reset) ────────────────────────────────────
  const handleNewOrder = () => {
    setCheckoutState('idle');
    setCheckoutResult(null);
    setCheckoutError(null);
    setCheckoutTimestamp(null);
    setExplanationDone(false);
    setExplanationTimestamp(null);
    setCart([]);
    setSelectedCity('');
    setCustomLat('');
    setCustomLng('');
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
        <h1 className="page-title mb-1">
          Order Simulator
        </h1>
        <p className="page-subtitle mb-4">
          Browse products, build your cart, and experience the hybrid routing engine
        </p>
        {activeTab === 'checkout' && checkoutState !== 'success' && (
          <ShoppingFlowIndicator
            hasLocation={!!getCustomerCoords()}
            hasItems={cart.length > 0}
            isCheckingOut={checkoutState === 'loading'}
          />
        )}
      </div>

      {/* ─── Tab Switcher ─── */}
      <div className="os-tab-bar mb-6" style={{ display: 'inline-flex' }}>
        <button
          onClick={() => setActiveTab('checkout')}
          className={`os-tab ${activeTab === 'checkout' ? 'os-tab--active' : ''}`}
          id="tab-checkout"
        >
          <IconCart />
          Checkout
          {cartItemCount > 0 && (
            <span className="os-tab__badge">
              {cartItemCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('flash')}
          className={`os-tab os-tab--flash ${activeTab === 'flash' ? 'os-tab--active' : ''}`}
          id="tab-flash"
        >
          <IconFlash />
          Flash Sale
        </button>
      </div>

      {/* ════════════════ CHECKOUT TAB ════════════════ */}
      {activeTab === 'checkout' && (
        <>
          {/* If checkout succeeded, show the result view */}
          {checkoutState === 'success' && checkoutResult ? (
            <div className="space-y-6 animate-fade-in">
              {/* ─── Order Confirmation ─── */}
              <div className="glass-card overflow-hidden animate-fade-in">
                {/* Success Header */}
                <div className="os-result-header">
                  <div className="os-result-header__check">✓</div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-[var(--color-success)]">
                      {isReplay ? 'Order Retrieved (Idempotent Replay)' : 'Order Confirmed & Routed'}
                    </h2>
                    <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                      {orderId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isReplay && (
                      <span className="badge badge--neutral">Replay</span>
                    )}
                    <span className="badge badge--success">
                      {checkoutResult.order?.status || 'ROUTED'}
                    </span>
                  </div>
                </div>

                {/* Order Meta */}
                <div className="os-result-meta">
                  <div className="os-result-meta__item">
                    <p className="os-result-meta__label">Customer Location</p>
                    <p className="os-result-meta__value">
                      {selectedCity && selectedCity !== 'custom' ? selectedCity : `${checkoutResult.order?.customer_lat}°, ${checkoutResult.order?.customer_lng}°`}
                    </p>
                  </div>
                  <div className="os-result-meta__item">
                    <p className="os-result-meta__label">Items Ordered</p>
                    <p className="os-result-meta__value">
                      {(checkoutResult.items || []).length} SKU{(checkoutResult.items || []).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="os-result-meta__item">
                    <p className="os-result-meta__label">Shipments</p>
                    <p className="os-result-meta__value">
                      {(checkoutResult.shipments || []).length}
                    </p>
                  </div>
                  <div className="os-result-meta__item">
                    <p className="os-result-meta__label">Order Time</p>
                    <p className="os-result-meta__value">
                      {checkoutResult.order?.created_at
                        ? new Date(checkoutResult.order.created_at).toLocaleTimeString()
                        : new Date(checkoutTimestamp).toLocaleTimeString()
                      }
                    </p>
                  </div>
                </div>

                <div className="px-6 pb-6 space-y-4">
                  {/* Order Items */}
                  {(checkoutResult.items || []).length > 0 && (
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                      <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                        Ordered Items
                      </h4>
                      <div className="space-y-2">
                        {checkoutResult.items.map((item, idx) => (
                          <div key={item.id || idx} className="flex items-center gap-3">
                            <span className="text-lg">{getSkuIcon(item.sku)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[var(--color-text-primary)] font-medium">
                                {item.skuName || item.sku}
                              </p>
                              <p className="text-[10px] font-mono text-[var(--color-text-muted)]">{item.sku}</p>
                            </div>
                            <span className="text-sm font-semibold text-[var(--color-accent)]">
                              ×{item.qty}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shipments */}
                  {(checkoutResult.shipments || []).map((shipment, idx) => (
                    <div key={shipment.id || idx} className="os-shipment-card" style={{ animationDelay: `${idx * 100}ms` }}>
                      <div className="os-shipment-card__header">
                        <div className="flex items-center gap-2">
                          <IconTruck />
                          <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                            {checkoutResult.shipments.length > 1 ? `Shipment ${idx + 1} of ${checkoutResult.shipments.length}` : 'Shipment Details'}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          {shipment.box_size && (
                            <span className="badge badge--accent">
                              📦 {shipment.box_size}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="os-shipment-card__body">
                        <div>
                          <p className="os-shipment-card__metric-label">Warehouse</p>
                          <p className="os-shipment-card__metric-value">
                            {shipment.warehouse_name || shipment.warehouse_id?.slice(0, 8) || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="os-shipment-card__metric-label">Distance</p>
                          <p className="os-shipment-card__metric-value">
                            {parseFloat(shipment.distance_km).toFixed(1)} km
                          </p>
                        </div>
                        <div>
                          <p className="os-shipment-card__metric-label">Shipping Cost</p>
                          <p className="os-shipment-card__metric-value">
                            ₹{parseFloat(shipment.total_cost).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      {shipment.id && (
                        <p className="text-[10px] font-mono text-[var(--color-text-muted)] px-4 pb-3 pt-0 border-t border-[var(--color-border-subtle)]" style={{ paddingTop: 8, marginTop: -1 }}>
                          Shipment ID: {shipment.id}
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Cost Breakdown */}
                  {checkoutResult.costBreakdown && (
                    <div className="os-cost-breakdown">
                      <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                        Cost Breakdown
                      </h4>
                      <div className="os-cost-breakdown__row">
                        <span className="os-cost-breakdown__label">Distance Cost</span>
                        <span className="os-cost-breakdown__value">₹{checkoutResult.costBreakdown.distanceCost?.toFixed(2)}</span>
                      </div>
                      <div className="os-cost-breakdown__row">
                        <span className="os-cost-breakdown__label">Packaging Cost</span>
                        <span className="os-cost-breakdown__value">₹{checkoutResult.costBreakdown.packagingCost?.toFixed(2)}</span>
                      </div>
                      <div className="os-cost-breakdown__row">
                        <span className="os-cost-breakdown__label">Depletion Penalty</span>
                        <span className={`os-cost-breakdown__value ${checkoutResult.costBreakdown.depletionPenalty > 0 ? 'os-cost-breakdown__value--warning' : ''}`}>
                          ₹{checkoutResult.costBreakdown.depletionPenalty?.toFixed(2)}
                        </span>
                      </div>
                      <div className="os-cost-breakdown__row os-cost-breakdown__row--total">
                        <span className="os-cost-breakdown__label" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Total Routing Cost</span>
                        <span className="os-cost-breakdown__value os-cost-breakdown__value--accent">₹{checkoutResult.costBreakdown.totalCost?.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Packing Info */}
                  {checkoutResult.packing && (
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                      <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                        Packing Details
                      </h4>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className="badge badge--accent">
                          {checkoutResult.packing.status === 'SPLIT_SHIPMENT' ? '📦 Split Shipment' : `📦 ${checkoutResult.packing.boxSize}`}
                        </span>
                        {checkoutResult.packing.totalVolumeCm3 != null && (
                          <span className="text-[var(--color-text-muted)] text-xs flex items-center gap-1">
                            Volume: {checkoutResult.packing.totalVolumeCm3.toLocaleString()} cm³
                          </span>
                        )}
                        {checkoutResult.packing.totalWeightKg != null && (
                          <span className="text-[var(--color-text-muted)] text-xs flex items-center gap-1">
                            Weight: {checkoutResult.packing.totalWeightKg} kg
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
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Warehouse</th>
                              <th style={{ textAlign: 'right' }}>Distance</th>
                              <th style={{ textAlign: 'right' }}>Penalty</th>
                              <th style={{ textAlign: 'right' }}>Total Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {checkoutResult.alternatives.map((alt, i) => (
                              <tr key={alt.warehouseId || i}>
                                <td className="text-[var(--color-text-secondary)]">{alt.name}</td>
                                <td style={{ textAlign: 'right' }} className="text-[var(--color-text-muted)]">{alt.distanceKm?.toFixed(1)} km</td>
                                <td style={{ textAlign: 'right' }} className="text-[var(--color-warning)]">₹{alt.penalty}</td>
                                <td style={{ textAlign: 'right' }} className="text-[var(--color-text-primary)] font-medium">₹{alt.totalCost?.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>

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

              {/* Place New Order button */}
              <div className="flex justify-center">
                <button
                  onClick={handleNewOrder}
                  className="btn-secondary px-6 py-2.5 flex items-center gap-2"
                  id="new-order-btn"
                >
                  <IconCart />
                  Place New Order
                </button>
              </div>
            </div>
          ) : (
            /* ─── Shopping View (Location + Products + Cart) ─── */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ════════════════ LEFT/MIDDLE: Location + Products ════════════════ */}
              <div className="lg:col-span-2 space-y-6">
                {/* ─── Step 1: Customer Location ─── */}
                <SectionCard>
                  <SectionHeader
                    icon={<IconLocation />}
                    title="Delivery Location"
                    subtitle="Where should we ship your order?"
                  />

                  {/* City Pills Grid */}
                  <div className="os-city-grid mb-3">
                    {PRESET_CITIES.map((city) => (
                      <CityPill
                        key={city.name}
                        city={city}
                        isSelected={selectedCity === city.name}
                        onClick={() => setSelectedCity(city.name)}
                      />
                    ))}
                  </div>

                  {/* Custom Location Button */}
                  <button
                    onClick={() => setSelectedCity(selectedCity === 'custom' ? '' : 'custom')}
                    className={`os-city-pill ${selectedCity === 'custom' ? 'os-city-pill--selected' : ''}`}
                    style={{ flexDirection: 'row', gap: 8, width: '100%', justifyContent: 'center', padding: '10px 16px' }}
                    id="city-custom"
                  >
                    <span className="os-city-pill__icon">📍</span>
                    <span className="os-city-pill__name">Custom Coordinates</span>
                  </button>

                  {selectedCity === 'custom' && (
                    <div className="os-coord-inputs">
                      <div className="os-coord-group">
                        <label htmlFor="custom-lat">Latitude</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="-90 to 90"
                          value={customLat}
                          onChange={(e) => setCustomLat(e.target.value)}
                          id="custom-lat"
                        />
                      </div>
                      <div className="os-coord-group">
                        <label htmlFor="custom-lng">Longitude</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="-180 to 180"
                          value={customLng}
                          onChange={(e) => setCustomLng(e.target.value)}
                          id="custom-lng"
                        />
                      </div>
                    </div>
                  )}

                  {selectedCity && selectedCity !== 'custom' && (
                    <div className="mt-3 flex items-center gap-2 animate-fade-in">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {(() => {
                          const city = PRESET_CITIES.find(c => c.name === selectedCity);
                          return city ? `Delivering to ${selectedCity} — ${city.lat}°N, ${city.lng}°E` : '';
                        })()}
                      </span>
                    </div>
                  )}
                </SectionCard>

                {/* ─── Step 2: Product Catalog ─── */}
                <SectionCard>
                  <SectionHeader
                    icon={<IconPackage />}
                    title="Product Catalog"
                    subtitle={skuLoading ? 'Loading products from warehouses…' : `${productCatalog.length} products available`}
                  />

                  {/* Loading: Skeleton Cards */}
                  {skuLoading && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <SkeletonProductCard key={n} />
                      ))}
                    </div>
                  )}

                  {/* Error State */}
                  {skuError && (
                    <div className="rounded-lg border border-[var(--color-danger)] p-6 text-center" role="alert">
                      <div className="os-empty-products__icon mx-auto" style={{ background: 'var(--color-danger-glow)' }}>
                        <span>⚠️</span>
                      </div>
                      <p className="text-sm text-[var(--color-danger)] mb-3 font-medium">{skuError}</p>
                      <button
                        onClick={() => window.location.reload()}
                        className="btn-secondary px-4 py-2 text-xs"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* Empty Catalog */}
                  {!skuLoading && !skuError && productCatalog.length === 0 && (
                    <div className="os-empty-products">
                      <div className="os-empty-products__icon">📦</div>
                      <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">No products found</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        No inventory was found in any warehouse. Check your backend connection.
                      </p>
                    </div>
                  )}

                  {/* Product Grid */}
                  {!skuLoading && !skuError && productCatalog.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                      {productCatalog.map((product) => (
                        <ProductCard
                          key={product.sku}
                          product={product}
                          onAddToCart={addToCart}
                          cartQty={getCartQty(product.sku)}
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              {/* ════════════════ RIGHT: Cart Panel ════════════════ */}
              <div className="lg:col-span-1 space-y-6">
                <div className="lg:sticky lg:top-8">
                  <div className="os-cart-panel">
                    {/* Header */}
                    <div className="os-cart-panel__header">
                      <div className="os-cart-panel__title">
                        <IconCart />
                        Your Cart
                        {cart.length > 0 && (
                          <span className="os-cart-panel__count">{cartItemCount}</span>
                        )}
                      </div>
                      {cart.length > 0 && (
                        <button
                          onClick={clearCart}
                          className="os-cart-panel__clear"
                          id="clear-cart-btn"
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    {/* Empty Cart */}
                    {cart.length === 0 && (
                      <div className="os-empty-cart">
                        <div className="os-empty-cart__icon">
                          <svg className="w-7 h-7 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                          </svg>
                        </div>
                        <p className="os-empty-cart__title">
                          Your cart is empty
                        </p>
                        <p className="os-empty-cart__subtitle">
                          Browse products and add items to get started
                        </p>
                      </div>
                    )}

                    {/* Cart Items */}
                    {cart.length > 0 && (
                      <div className="os-cart-panel__items">
                        {cart.map((item) => (
                          <CartItem
                            key={item.sku}
                            item={item}
                            onUpdateQty={updateCartQty}
                            onRemove={removeFromCart}
                          />
                        ))}
                      </div>
                    )}

                    {/* Footer: Summary + Checkout */}
                    <div className="os-cart-panel__footer">
                      {/* Location Warning */}
                      {cart.length > 0 && !getCustomerCoords() && (
                        <div className="os-location-warning mb-4">
                          <span>📍</span>
                          <p className="os-location-warning__text">
                            Select a delivery location before checkout
                          </p>
                        </div>
                      )}

                      {/* Order Summary */}
                      {cart.length > 0 && (
                        <div className="os-order-summary">
                          <div className="os-order-summary__row">
                            <span className="os-order-summary__label">Items</span>
                            <span className="os-order-summary__value">{cartItemCount}</span>
                          </div>
                          <div className="os-order-summary__row">
                            <span className="os-order-summary__label">Unique SKUs</span>
                            <span className="os-order-summary__value">{cart.length}</span>
                          </div>
                          {getCustomerCoords() && (
                            <div className="os-order-summary__row">
                              <span className="os-order-summary__label">Delivery</span>
                              <span className="os-order-summary__value" style={{ color: 'var(--color-success)' }}>
                                {selectedCity !== 'custom' ? selectedCity : 'Custom'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Checkout Button */}
                      <button
                        onClick={handleCheckout}
                        disabled={!isFormValid() || checkoutState === 'loading'}
                        className="os-checkout-btn"
                        id="place-order-btn"
                      >
                        {checkoutState === 'loading' ? (
                          <>
                            <IconSpinner />
                            Processing Checkout…
                          </>
                        ) : (
                          <>
                            <IconTruck />
                            Place Order
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Error State Below Cart */}
                  {checkoutState === 'error' && (
                    <div className="mt-4">
                      <CheckoutErrorBanner error={checkoutError} retryCountdown={retryCountdown} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════ FLASH SALE TAB ════════════════ */}
      {activeTab === 'flash' && (
        <div className="space-y-6 animate-fade-in">
          <div className="os-flash-panel">
            <SectionHeader
              icon={<IconFlash />}
              title="Flash Sale Simulator"
              subtitle="Stress-test the server-side checkout path with concurrent requests"
              accentColor="var(--color-warning)"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              {/* SKU */}
              <div className="os-flash-input-group">
                <label htmlFor="flash-sku">Target SKU</label>
                <select
                  value={flashSku}
                  onChange={(e) => setFlashSku(e.target.value)}
                  className="w-full h-10 rounded-lg px-3 text-sm"
                  style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  id="flash-sku"
                >
                  <option value="">{skuLoading ? 'Loading SKUs…' : 'Select SKU…'}</option>
                  {productCatalog.map((s) => (
                    <option key={s.sku} value={s.sku}>
                      {s.name} ({s.sku})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div className="os-flash-input-group">
                <label htmlFor="flash-qty">Qty per Order</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={flashQty}
                  onChange={(e) => setFlashQty(e.target.value)}
                  className="w-full h-10 rounded-lg px-3 text-sm text-center"
                  id="flash-qty"
                />
              </div>

              {/* Concurrency */}
              <div className="os-flash-input-group">
                <label htmlFor="flash-concurrency">Concurrency (1–50)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={flashConcurrency}
                  onChange={(e) => setFlashConcurrency(e.target.value)}
                  className="w-full h-10 rounded-lg px-3 text-sm text-center"
                  id="flash-concurrency"
                />
              </div>
            </div>

            {/* Validation */}
            {flashSku && (
              <div className="mb-4 flex items-center gap-2 animate-fade-in">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                <span className="text-xs text-[var(--color-text-muted)]">
                  Will fire {flashConcurrency || 10} concurrent checkout attempts for {flashQty || 1}× {flashSku}
                </span>
              </div>
            )}

            <button
              onClick={handleFlashTest}
              disabled={!flashSku || flashState === 'loading'}
              className="os-flash-btn"
              id="flash-test-btn"
            >
              {flashState === 'loading' ? (
                <span className="flex items-center gap-2">
                  <IconSpinner />
                  Running Flash Sale…
                </span>
              ) : (
                '⚡ Simulate Flash Sale'
              )}
            </button>

            {/* Flash Test Error */}
            {flashState === 'error' && flashError && (
              <div className="mt-4 rounded-lg border border-[var(--color-danger)] p-4" role="alert">
                <div className="flex items-start gap-2">
                  <span className="text-sm">❌</span>
                  <p className="text-sm text-[var(--color-danger)]">{flashError.message || 'Flash test failed.'}</p>
                </div>
              </div>
            )}

            {/* Flash Test Results */}
            {flashState === 'success' && flashResult && (
              <div className="mt-6 animate-fade-in">
                <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                  Server-Side Concurrency Results
                </h4>

                {/* Result summary bar */}
                {(() => {
                  const total = (flashResult.successCount || 0) + (flashResult.rateLimited429Count || 0) + (flashResult.conflict409Count || 0);
                  const successPct = total > 0 ? ((flashResult.successCount || 0) / total * 100) : 0;
                  const ratePct = total > 0 ? ((flashResult.rateLimited429Count || 0) / total * 100) : 0;
                  const conflictPct = total > 0 ? ((flashResult.conflict409Count || 0) / total * 100) : 0;
                  return (
                    <div className="mb-5">
                      <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--color-bg-primary)' }}>
                        {successPct > 0 && (
                          <div style={{ width: `${successPct}%`, background: 'var(--color-success)', transition: 'width 0.5s ease' }} />
                        )}
                        {ratePct > 0 && (
                          <div style={{ width: `${ratePct}%`, background: 'var(--color-warning)', transition: 'width 0.5s ease' }} />
                        )}
                        {conflictPct > 0 && (
                          <div style={{ width: `${conflictPct}%`, background: 'var(--color-danger)', transition: 'width 0.5s ease' }} />
                        )}
                      </div>
                      <div className="flex justify-between mt-1.5 text-[10px] text-[var(--color-text-muted)]">
                        <span style={{ color: 'var(--color-success)' }}>✓ {flashResult.successCount} success</span>
                        <span style={{ color: 'var(--color-warning)' }}>⏳ {flashResult.rateLimited429Count} rate-limited</span>
                        <span style={{ color: 'var(--color-danger)' }}>⚠ {flashResult.conflict409Count} conflict</span>
                      </div>
                    </div>
                  );
                })()}

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
          </div>
        </div>
      )}
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
