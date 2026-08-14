/**
 * OrderSimulator — Placeholder page (Week 1)
 *
 * Week 3 will add checkout form, flash-sale simulation button,
 * and the AIExplanationWidget integration.
 */
export default function OrderSimulator() {
  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
          Order Simulator
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Simulate checkout orders and test the routing engine
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Checkout Form Placeholder */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
            Checkout Simulator
          </h2>
          <div className="space-y-4">
            <div className="h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)]" />
            <div className="h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)]" />
            <div className="h-10 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)]" />
            <button
              disabled
              className="w-full py-2.5 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] font-semibold opacity-50 cursor-not-allowed"
            >
              Place Order (Week 3)
            </button>
          </div>
        </div>

        {/* Flash Sale Placeholder */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[var(--color-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
            </svg>
            Flash Sale Simulator
          </h2>
          <p className="text-[var(--color-text-secondary)] text-sm mb-6">
            Stress-test the routing engine with concurrent checkout requests.
            Results will show success rate, latency, and contention metrics.
          </p>
          <button
            disabled
            className="w-full py-2.5 rounded-lg border border-[var(--color-warning)] text-[var(--color-warning)] font-semibold opacity-50 cursor-not-allowed"
          >
            Simulate Flash Sale (Week 3)
          </button>
        </div>
      </div>
    </div>
  );
}
