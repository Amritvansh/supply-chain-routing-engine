/**
 * AIExplanationWidget — Placeholder (Week 1)
 *
 * Week 2 will wire this to GET /api/v1/orders/:id/explain,
 * with a loading state and a subtle badge distinguishing
 * 'gemini' vs 'fallback_template' sources.
 *
 * @param {{ orderId: string }} props
 */
export default function AIExplanationWidget({ orderId }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-pulse" />
        <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          AI Explanation
        </h3>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">
        Explanation pending{orderId ? ` for order ${orderId}` : ''}
      </p>
    </div>
  );
}
