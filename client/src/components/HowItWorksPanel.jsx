/**
 * HowItWorksPanel — Week 4: Plain-language architecture explainer
 *
 * A step-by-step explanation of the hybrid routing engine
 * designed for demo audiences, evaluators, and portfolio reviewers.
 *
 * Key message: "AI explains the decision; AI does NOT make the routing decision."
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

export default function HowItWorksPanel() {
  return (
    <div className="glass-card p-6 animate-fade-in">
      {/* Header */}
      <div className="mb-6 section-header-accent">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          How This Works
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          A hybrid architecture: deterministic math makes the routing decision, AI explains it afterward
        </p>
      </div>

      {/* Key Insight Banner */}
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

      {/* Steps Timeline */}
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

      {/* Architecture Summary */}
      <div className="mt-6 pt-4 border-t border-[var(--color-border)]">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        </div>
      </div>
    </div>
  );
}
