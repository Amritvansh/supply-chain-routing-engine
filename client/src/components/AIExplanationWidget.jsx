/**
 * AIExplanationWidget — Week 2: Wired to GET /api/v1/orders/:id/explain
 *
 * Displays AI-generated or deterministic-fallback explanations for
 * routing decisions. Supports four states: idle, loading, success, error.
 *
 * ARCHITECTURAL NOTE:
 *   This widget is intentionally independently callable — the parent
 *   component decides when to trigger the fetch, preserving the
 *   hybrid architecture's async separation. The checkout result is
 *   never blocked by this widget.
 *
 * Source badges:
 *   - "gemini"            → "✦ AI Explanation" (accent style)
 *   - "fallback_template" → "Computed Summary" (neutral style, not an error)
 *
 * @param {{ orderId: string, autoFetch?: boolean }} props
 */
import { useState, useCallback, useEffect } from 'react';
import { getExplanation } from '../lib/apiClient';

export default function AIExplanationWidget({ orderId, autoFetch = false }) {
  const [state, setState] = useState('idle'); // idle | loading | success | error
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  /** Fetch explanation from the backend. */
  const fetchExplanation = useCallback(async () => {
    if (!orderId) return;
    setState('loading');
    setErrorMsg('');
    try {
      const result = await getExplanation(orderId);
      setData(result);
      setState('success');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load explanation.');
      setState('error');
    }
  }, [orderId]);

  // Auto-fetch if requested (e.g., from OrderSimulator in Week 3)
  useEffect(() => {
    if (autoFetch && orderId) {
      fetchExplanation();
    }
  }, [autoFetch, orderId, fetchExplanation]);

  // ─── Idle State ─────────────────────────────────────────
  if (state === 'idle') {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-[var(--color-text-muted)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            AI Explanation
          </h3>
        </div>
        {orderId ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-muted)]">
              Explanation available for order
            </p>
            <button
              onClick={fetchExplanation}
              className="px-3 py-1.5 rounded-md bg-[var(--color-accent-glow)] text-[var(--color-accent)] text-xs font-semibold hover:bg-[var(--color-accent)] hover:text-[var(--color-bg-primary)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg-card)]"
              aria-label="Generate routing explanation"
            >
              Generate
            </button>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            Awaiting order…
          </p>
        )}
      </div>
    );
  }

  // ─── Loading State ──────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="glass-card p-4" role="status">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            AI Explanation
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-[var(--color-accent)] animate-spin shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-[var(--color-text-muted)]">
            Generating explanation…
          </p>
        </div>
        <span className="sr-only">Loading routing explanation</span>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="glass-card p-4" style={{ borderColor: 'var(--color-danger)' }} role="alert">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-[var(--color-danger)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            AI Explanation
          </h3>
        </div>
        <p className="text-sm text-[var(--color-danger)] mb-3">
          {errorMsg}
        </p>
        <button
          onClick={fetchExplanation}
          className="px-3 py-1.5 rounded-md bg-red-500/10 text-[var(--color-danger)] text-xs font-semibold hover:bg-red-500/20 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-danger)] focus:ring-offset-1 focus:ring-offset-[var(--color-bg-card)]"
          aria-label="Retry generating explanation"
        >
          Retry
        </button>
      </div>
    );
  }

  // ─── Success State ──────────────────────────────────────
  const isGemini = data?.source === 'gemini';

  return (
    <div className="glass-card p-4">
      {/* Header with source badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: isGemini ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            AI Explanation
          </h3>
        </div>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
          style={{
            background: isGemini ? 'var(--color-accent-glow)' : 'rgba(100, 116, 139, 0.15)',
            color: isGemini ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
        >
          {isGemini ? '✦ AI Explanation' : 'Computed Summary'}
        </span>
      </div>

      {/* Explanation text */}
      <p className="text-sm text-[var(--color-text-primary)] leading-relaxed mb-3">
        {data?.explanation}
      </p>

      {/* Meta info */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-border)] pt-2 mt-2">
        {data?.modelUsed && (
          <span>Model: {data.modelUsed}</span>
        )}
        {data?.latencyMs != null && (
          <span>{data.latencyMs}ms</span>
        )}
        {data?.generatedAt && (
          <span>{new Date(data.generatedAt).toLocaleString()}</span>
        )}
        {data?.cached && (
          <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]">
            cached
          </span>
        )}
      </div>
    </div>
  );
}
