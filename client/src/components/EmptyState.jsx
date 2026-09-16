/**
 * EmptyState — Reusable empty/placeholder UI
 *
 * Provides a consistent empty state pattern with an icon, heading,
 * description text, and optional action button.
 *
 * @param {{ icon?: React.ReactNode, title: string, description?: string, action?: React.ReactNode, className?: string }} props
 */
export default function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}
    >
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent-glow)] flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[var(--color-text-muted)] max-w-xs mb-4">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
