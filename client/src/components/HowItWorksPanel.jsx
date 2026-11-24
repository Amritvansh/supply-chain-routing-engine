/**
 * HowItWorksPanel — Professional architecture explainer
 *
 * Sections:
 *   1. Key Insight — AI decoupling banner
 *   2. Request Lifecycle — numbered flow (sync → async boundary)
 *   3. Dual-Path Comparison — side-by-side sync vs async
 *   4. Tech Stack — layered grid
 *   5. Architecture Guarantees — 4 key metrics
 *
 * No API calls. Pure presentational component.
 * All technical claims match the actual implementation.
 */

/* ── Data ─────────────────────────────────────────────────── */
const LIFECYCLE = [
  { n: 1, title: 'Pre-Checkout ML ETA & Quotation', desc: 'Random Forest ML model predicts exact delivery date, delay risk, and on-time confidence score in real time.', phase: 'sync', icon: '⏱️' },
  { n: 2, title: 'Inventory & Warehouse Resolution', desc: 'Checks all active warehouses for stock availability, minimum distance, and active dispatch capacity.', phase: 'sync', icon: '🏭' },
  { n: 3, title: 'Multi-Hub Split Fulfillment', desc: 'If single warehouse lacks complete stock, greedy partition algorithm splits order across optimal hubs minimizing logistics costs.', phase: 'sync', icon: '🔀' },
  { n: 4, title: 'FFD 3D Bin-Packing Optimization', desc: 'First-Fit Decreasing algorithm assigns items into standard volumetric boxes (Small, Medium, Large) by cm³ volume and weight.', phase: 'sync', icon: '📦' },
  { n: 5, title: 'Real-Road Highway Routing (OSRM)', desc: 'Computes authentic highway navigation distances and road curvature geometries rather than simple straight-line air distance.', phase: 'sync', icon: '🛣️' },
  { n: 6, title: 'Distributed Inventory Protection', desc: 'Per-SKU Redis distributed locks (SETNX + Lua compare-and-delete) prevent race conditions and overselling during flash contention.', phase: 'sync', icon: '🔒' },
  { n: 7, title: 'ACID Checkout & Manifest Generation', desc: 'PostgreSQL atomic transaction decrements inventory, persists routing decisions, and prepares printable shipping manifests.', phase: 'sync', icon: '⚡' },
  { n: 8, title: 'Instant Order Confirmation & Tax Invoice', desc: 'Customer receives instant order confirmation, printable tax invoice, and live tracking access. Target: <50ms without AI delay.', phase: 'sync', icon: '✅' },
  { n: 9, title: 'Async AI Explainability & Telemetry', desc: 'Separately and non-blockingly, Google Gemini AI generates natural-language operational audit explanations with circuit breaker fallback.', phase: 'async', icon: '🤖' },
];

const SYNC_STEPS = [
  'Cart & Pre-checkout ML ETA prediction',
  'Eligible warehouse stock resolution',
  'Multi-echelon greedy split partitioning',
  'First-Fit Decreasing (FFD) 3D packaging',
  'OSRM highway navigation & road distance',
  'Per-SKU Redis lock + PostgreSQL ACID commit',
  'Instant order confirmation & tax invoice',
];

const ASYNC_STEPS = [
  'Order renders immediately (<50ms)',
  'Frontend requests AI explainability',
  'Backend forwards routing metrics to Gemini',
  'AI generates natural-language audit rationale',
  'Automatic fallback if AI is slow or offline',
  'Live animated truck simulation on Control Tower map',
];

const TECH = [
  { layer: 'Frontend', name: 'React 19 + Vite', icon: '⚛️', desc: 'Enterprise component SPA, dark/light theme' },
  { layer: 'API Server', name: 'Node.js + Express', icon: '🟢', desc: 'RESTful endpoints, idempotency, rate limiting' },
  { layer: 'Database', name: 'PostgreSQL', icon: '🐘', desc: 'ACID transactions, relational integrity' },
  { layer: 'Cache & Locks', name: 'Redis', icon: '⚡', desc: 'Per-SKU distributed locks, Lua compare-delete' },
  { layer: 'ML Prediction', name: 'Random Forest', icon: '🧠', desc: 'Predictive ETA, on-time score, delay risk' },
  { layer: 'AI Explainability', name: 'Gemini 1.5 Flash', icon: '🤖', desc: 'Async natural-language reasoning & fallback' },
  { layer: 'Highway Routing', name: 'OSRM Engine', icon: '🛣️', desc: 'Real highway network distance & geometries' },
  { layer: 'Interactive Maps', name: 'MapLibre GL', icon: '🗺️', desc: 'Live dispatch fleet animation, vector tiles' },
];

const GUARANTEES = [
  { value: '<50ms', label: 'Checkout Latency', desc: 'Deterministic routing target', color: 'var(--color-success)' },
  { value: 'ACID', label: 'Transaction Safety', desc: 'PostgreSQL + Redis locks', color: 'var(--color-warning)' },
  { value: '0%', label: 'AI Dependency', desc: 'Checkout never waits for AI', color: 'var(--color-accent)' },
  { value: '90%+', label: 'ML ETA Confidence', desc: 'Data-driven delivery predictability', color: 'var(--color-success)' },
  { value: 'Per-SKU', label: 'Lock Granularity', desc: 'No coarse warehouse locks', color: 'var(--color-danger)' },
  { value: '3D FFD', label: 'Bin-Packing', desc: 'Optimized packaging volume', color: 'var(--color-accent)' },
];

/* ── Component ────────────────────────────────────────────── */
export default function HowItWorksPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

      {/* ── 1. Key Insight Banner ────────────────────────── */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid rgba(129,140,248,0.2)', background: 'rgba(129,140,248,0.05)', padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)', lineHeight: 1.4 }}>
              AI explains the decision — AI does NOT make the routing decision.
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              If the Gemini API is slow or unavailable, order correctness and checkout speed are completely unaffected. A deterministic fallback explanation is shown instead.
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Request Lifecycle ─────────────────────────── */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div className="section-header-accent" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Request Lifecycle</h3>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>From customer order to AI explanation — 9 steps</p>
        </div>

        <div style={{ position: 'relative' }}>
          {LIFECYCLE.map((step, i) => {
            const isLast = i === LIFECYCLE.length - 1;
            const isBoundary = i === 8;
            const isSync = step.phase === 'sync';

            return (
              <div key={step.n}>
                {isBoundary && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 14px 16px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 99, border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', whiteSpace: 'nowrap' }}>
                      Async boundary — after checkout renders
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 14 }}>
                  {/* Timeline node */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: isSync ? 'var(--color-success-glow)' : 'var(--color-accent-glow)', border: `1px solid ${isSync ? 'rgba(52,211,153,0.2)' : 'rgba(129,140,248,0.2)'}` }}>
                      {step.icon}
                    </div>
                    {!isLast && (
                      <div style={{ width: 1, flex: 1, minHeight: 12, background: isBoundary ? 'transparent' : 'var(--color-border-subtle)' }} />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ paddingBottom: isLast ? 0 : 16, minWidth: 0 }}>
                    <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Step {String(step.n).padStart(2, '0')}
                      </span>
                      <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '1px 6px', borderRadius: 3, background: isSync ? 'var(--color-success-glow)' : 'var(--color-accent-glow)', color: isSync ? 'var(--color-success)' : 'var(--color-accent)' }}>
                        {isSync ? 'Sync' : 'Async'}
                      </span>
                    </div>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{step.title}</h4>
                    <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{step.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. Dual-Path Architecture ───────────────────── */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div className="section-header-accent" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dual-Path Architecture</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Sync */}
          <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.03)', padding: 16 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <div style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--color-success)', boxShadow: '0 0 6px rgba(52,211,153,0.4)' }} />
              <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Synchronous Path</h4>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SYNC_STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-success)', width: 14, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{s}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--color-border-subtle)' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-success)' }}>Target: &lt;50ms · Zero AI dependency</p>
            </div>
          </div>

          {/* Async */}
          <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid rgba(129,140,248,0.2)', background: 'rgba(129,140,248,0.03)', padding: 16 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <div style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--color-accent)', boxShadow: '0 0 6px rgba(129,140,248,0.4)' }} />
              <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asynchronous Path</h4>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ASYNC_STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-accent)', width: 14, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{s}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--color-border-subtle)' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-accent)' }}>Non-blocking · Decoupled from checkout</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Tech Stack ───────────────────────────────── */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div className="section-header-accent" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Technology Stack</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TECH.map(t => (
            <div key={t.layer} style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)', padding: '14px 10px', textAlign: 'center', transition: 'border-color 0.2s, transform 0.2s', cursor: 'default' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.transform = 'none'; }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{t.icon}</div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{t.name}</p>
              <p style={{ fontSize: 9, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 4 }}>{t.layer}</p>
              <p style={{ fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. Architecture Guarantees ───────────────────── */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div className="section-header-accent" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Architecture Guarantees</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {GUARANTEES.map(g => (
            <div key={g.label} style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)', padding: 14, textAlign: 'center' }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: g.color, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{g.value}</p>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4 }}>{g.label}</p>
              <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>{g.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
