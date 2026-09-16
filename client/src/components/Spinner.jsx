/**
 * Spinner — Reusable loading indicator
 *
 * Provides consistent animated spinners across the application.
 * Supports three sizes: sm (16px), md (20px), lg (32px).
 *
 * @param {{ size?: 'sm' | 'md' | 'lg', className?: string, color?: string }} props
 */
export default function Spinner({ size = 'md', className = '', color = 'var(--color-accent)' }) {
  const sizeMap = { sm: 16, md: 20, lg: 32 };
  const px = sizeMap[size] || sizeMap.md;

  return (
    <svg
      className={`animate-spin ${className}`}
      style={{ width: px, height: px, color }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
