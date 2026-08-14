/**
 * Analytics — Placeholder page (Week 1)
 *
 * Week 4 will add Recharts visualizations: orders per warehouse,
 * routing cost trends, flash-test metrics, and AI explanation source breakdown.
 */
export default function Analytics() {
  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
          Analytics
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Routing performance metrics and operational insights
        </p>
      </div>

      {/* Chart Placeholders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { title: 'Orders Fulfilled per Warehouse', icon: '📊', color: 'var(--color-accent)' },
          { title: 'Average Routing Cost Over Time', icon: '📈', color: 'var(--color-success)' },
          { title: 'Flash-Test Contention Rates', icon: '⚡', color: 'var(--color-warning)' },
          { title: 'AI Explanation Source Breakdown', icon: '🤖', color: 'var(--color-danger)' },
        ].map((chart) => (
          <div
            key={chart.title}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6"
          >
            <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <span>{chart.icon}</span>
              {chart.title}
            </h3>
            <div
              className="h-48 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] flex items-center justify-center"
            >
              <p className="text-[var(--color-text-muted)] text-sm">
                Recharts visualization — Week 4
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
