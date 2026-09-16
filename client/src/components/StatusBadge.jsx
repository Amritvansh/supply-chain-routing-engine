/**
 * StatusBadge — Reusable semantic badge
 *
 * Provides consistent status indication across the application.
 * Variants: success, warning, danger, accent, neutral
 *
 * @param {{ variant?: string, children: React.ReactNode, className?: string, icon?: React.ReactNode }} props
 */

const VARIANT_STYLES = {
  success: {
    background: 'var(--color-success-glow)',
    color: 'var(--color-success)',
  },
  warning: {
    background: 'var(--color-warning-glow)',
    color: 'var(--color-warning)',
  },
  danger: {
    background: 'var(--color-danger-glow)',
    color: 'var(--color-danger)',
  },
  accent: {
    background: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
  },
  neutral: {
    background: 'rgba(100, 116, 139, 0.15)',
    color: 'var(--color-text-muted)',
  },
};

export default function StatusBadge({ variant = 'neutral', children, className = '', icon }) {
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${className}`}
      style={styles}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
