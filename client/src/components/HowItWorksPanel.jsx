/**
 * HowItWorksPanel — Member 3 Week 5: Enhanced architecture explainer
 *
 * A step-by-step explanation of the hybrid routing engine
 * designed for demo audiences, evaluators, and portfolio reviewers.
 *
 * Key message: "AI explains the decision; AI does NOT make the routing decision."
 *
 * Sections:
 *   1. Key Insight Banner
 *   2. Dual-Path Architecture Diagram
 *   3. Tech Stack Visual
 *   4. Steps Timeline (sync → async boundary → async)
 *   5. Architecture Summary Stats
 *
 * Steps:
 *   1. Customer places order
 *   2. Deterministic routing engine evaluates warehouses
 *   3. Cost function scores (distance, packaging, depletion)
 *   4. Bin-packing determines packaging / split shipment
 *   5. Redis + PostgreSQL protect inventory during checkout
 *   6. Order confirmation appears immediately
 *   7. Gemini AI explains the decision separately
 */

const STEPS = [
  {
    number: '01',
    title: 'Customer Places Order',
    description: 'A customer selects items and a delivery location, then submits a checkout request.',
    icon: '🛒',
    color: 'var(--color-accent)',
    phase: 'sync',
  },
  {
    number: '02',
    title: 'Routing Engine Evaluates Warehouses',
    description: 'The deterministic routing engine evaluates all active warehouses based on available inventory and distance to the customer.',
    icon: '🏭',
    color: 'var(--color-accent)',
    phase: 'sync',
  },
  {
    number: '03',
    title: 'Cost Function Scores Each Option',
    description: 'Each eligible warehouse is scored using: distance cost (km × 0.5), packaging base cost (box size), and inventory depletion penalty (prevents draining a warehouse to zero).',
    icon: '📐',
    color: 'var(--color-success)',
    phase: 'sync',
  },
  {
    number: '04',
    title: 'Bin-Packing Determines Packaging',
    description: 'Items are packed into the smallest possible box (Small → Medium → Large). If items exceed a single box, the order is split into multiple shipments from different warehouses.',
    icon: '📦',
    color: 'var(--color-success)',
    phase: 'sync',
  },
  {
    number: '05',
    title: 'Redis + PostgreSQL Protect Inventory',
    description: 'Per-SKU Redis locks prevent overselling during concurrent checkouts. A PostgreSQL ACID transaction atomically reserves stock — if any step fails, everything rolls back safely.',
    icon: '🔒',
    color: 'var(--color-warning)',
    phase: 'sync',
  },
  {
    number: '06',
    title: 'Order Confirmation — Instant',
    description: 'The routing result, cost breakdown, and shipment details are returned immediately. No AI involvement at this stage. Target response time: under 50ms.',
    icon: '✅',
    color: 'var(--color-success)',
    phase: 'sync',
  },
  {
    number: '07',
    title: 'Gemini Explains the Decision',
    description: 'Separately and asynchronously, the Gemini AI receives the deterministic routing data and generates a plain-language explanation of why this warehouse was chosen over alternatives.',
    icon: '🤖',
    color: 'var(--color-accent)',
    phase: 'async',
  },
];

const TECH_STACK = [
  { layer: 'Frontend', tech: 'React + Vite', icon: '⚛️', color: 'var(--color-accent)' },
  { layer: 'API Server', tech: 'Node.js + Express', icon: '🟢', color: 'var(--color-success)' },
  { layer: 'Database', tech: 'PostgreSQL', icon: '🐘', color: 'var(--color-accent)' },
  { layer: 'Cache / Locks', tech: 'Redis', icon: '⚡', color: 'var(--color-danger)' },
  { layer: 'AI (Async)', tech: 'Gemini API', icon: '🤖', color: 'var(--color-warning)' },
  { layer: 'Maps', tech: 'MapLibre GL', icon: '🗺️', color: 'var(--color-success)' },
];

export default function HowItWorksPanel() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Key Insight Banner */}
      <div className="glass-card p-6">
        <div
          className="rounded-xl border p-4 mb-6 flex items-start gap-3"
          style={{
            borderColor: 'rgba(99, 102, 241, 0.25)',
            background: 'rgba(99, 102, 241, 0.06)',
          }}
        >
          <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-glow)] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--color-accent)]">
              AI explains the decision — AI does NOT make the routing decision.
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              If the Gemini API is slow or unavailable, order correctness and checkout speed are completely unaffected.
              A deterministic fallback explanation is shown instead.
            </p>
          </div>
        </div>

        {/* ─── Dual-Path Architecture Diagram ─── */}
        <div className="section-header-accent mb-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            Dual-Path Architecture
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
          {/* Synchronous Path */}
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: 'rgba(52, 211, 153, 0.25)', background: 'rgba(52, 211, 153, 0.04)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" style={{ boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
              <h4 className="text-xs font-bold text-[var(--color-success)] uppercase tracking-wider">
                Synchronous Path
              </h4>
            </div>
            <div className="space-y-2">
              {['Customer Order', 'Routing Engine', 'Cost Function', 'Bin-Packing', 'Redis Lock + PG Transaction', 'Instant Confirmation'].map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[var(--color-success)] w-4">{i + 1}.</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">{step}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-[var(--color-border-subtle)]">
              <p className="text-[10px] text-[var(--color-success)] font-semibold">Target: &lt;50ms · Zero AI dependency</p>
            </div>
          </div>

          {/* Asynchronous Path */}
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: 'rgba(99, 102, 241, 0.25)', background: 'rgba(99, 102, 241, 0.04)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[var(--color-accent)]" style={{ boxShadow: '0 0 8px rgba(99,102,241,0.5)' }} />
              <h4 className="text-xs font-bold text-[var(--color-accent)] uppercase tracking-wider">
                Asynchronous Path
              </h4>
            </div>
            <div className="space-y-2">
              {['Checkout completes first', 'Frontend requests explanation', 'Backend calls Gemini API', 'AI generates explanation', 'Fallback if Gemini unavailable', 'Explanation displayed'].map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[var(--color-accent)] w-4">{i + 1}.</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">{step}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-[var(--color-border-subtle)]">
              <p className="text-[10px] text-[var(--color-accent)] font-semibold">Non-blocking · Decoupled from checkout</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tech Stack ─── */}
      <div className="glass-card p-6">
        <div className="section-header-accent mb-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            Tech Stack
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {TECH_STACK.map((item) => (
            <div
              key={item.layer}
              className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] p-3 text-center transition-all duration-200 hover:border-[var(--color-border)] hover:translate-y-[-2px]"
            >
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">{item.tech}</p>
              <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">{item.layer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Steps Timeline ─── */}
      <div className="glass-card p-6">
        <div className="section-header-accent mb-6">
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            Step-by-Step Flow
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            From customer order to AI explanation
          </p>
        </div>

        <div className="relative">
          {STEPS.map((step, idx) => {
            const isLast = idx === STEPS.length - 1;
            const isAsyncBoundary = idx === 6; // Step 7 is async

            return (
              <div key={step.number}>
                {/* Async boundary marker */}
                {isAsyncBoundary && (
                  <div className="flex items-center gap-3 my-4 ml-5">
                    <div className="flex-1 h-px bg-[var(--color-border)]" />
                    <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-3 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                      Asynchronous — after checkout renders
                    </span>
                    <div className="flex-1 h-px bg-[var(--color-border)]" />
                  </div>
                )}

                <div className="flex gap-4">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{
                        background: `${step.color}15`,
                        border: `1.5px solid ${step.color}40`,
                      }}
                    >
                      {step.icon}
                    </div>
                    {!isLast && (
                      <div
                        className="w-px flex-1 my-1"
                        style={{
                          background: isAsyncBoundary
                            ? 'transparent'
                            : `linear-gradient(to bottom, ${step.color}40, var(--color-border))`,
                          minHeight: 16,
                        }}
                      />
                    )}
                  </div>

                  {/* Step content */}
                  <div className={`pb-5 min-w-0 ${isLast ? 'pb-0' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                        Step {step.number}
                      </span>
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          background: step.phase === 'sync' ? 'var(--color-success-glow)' : 'var(--color-accent-glow)',
                          color: step.phase === 'sync' ? 'var(--color-success)' : 'var(--color-accent)',
                        }}
                      >
                        {step.phase === 'sync' ? 'Synchronous' : 'Async'}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                      {step.title}
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Architecture Summary ─── */}
      <div className="glass-card p-6">
        <div className="section-header-accent mb-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            Architecture Guarantees
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] p-3 text-center">
            <p className="text-lg font-bold text-[var(--color-success)]">&lt;50ms</p>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Checkout Target</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] p-3 text-center">
            <p className="text-lg font-bold text-[var(--color-warning)]">ACID</p>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Transaction Safety</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] p-3 text-center">
            <p className="text-lg font-bold text-[var(--color-accent)]">0%</p>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">AI Checkout Dependency</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] p-3 text-center">
            <p className="text-lg font-bold text-[var(--color-danger)]">Per-SKU</p>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Redis Lock Granularity</p>
          </div>
        </div>
      </div>
    </div>
  );
}
