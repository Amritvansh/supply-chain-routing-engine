/**
 * ControlTowerDashboard — Placeholder page (Week 1)
 *
 * Week 2 will integrate Mapbox GL JS with warehouse markers,
 * routing paths, and live order tracking.
 */
export default function ControlTowerDashboard() {
  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
          Control Tower
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Real-time warehouse and shipment monitoring dashboard
        </p>
      </div>

      {/* Map Placeholder */}
      <div
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-12 flex flex-col items-center justify-center min-h-[400px]"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, var(--color-accent-glow), transparent 70%)' }}
      >
        <div className="w-16 h-16 rounded-full bg-[var(--color-accent-glow)] flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          Geospatial View Coming Soon
        </h2>
        <p className="text-[var(--color-text-secondary)] text-center max-w-md">
          The interactive Mapbox map will display warehouse locations, inventory levels,
          and live shipment routing paths here in Week 2.
        </p>
      </div>

      {/* Quick Stats Placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {[
          { label: 'Active Warehouses', value: '—', icon: '🏭' },
          { label: 'Active Shipments', value: '—', icon: '📦' },
          { label: 'Avg Routing Cost', value: '—', icon: '💰' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 flex items-center gap-4 hover:border-[var(--color-accent)] transition-colors duration-200"
          >
            <span className="text-2xl">{stat.icon}</span>
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">{stat.label}</p>
              <p className="text-xl font-semibold text-[var(--color-text-primary)]">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
