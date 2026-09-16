/**
 * AIExplanationWidget — Member 3 Week 5: Polished AI explanation experience
 *
 * Displays AI-generated or deterministic-fallback explanations for
 * routing decisions. Supports both single and multi-shipment responses.
 *
 * ARCHITECTURAL NOTE:
 *   This widget is intentionally independently callable — the parent
 *   component decides when to trigger the fetch, preserving the
 *   hybrid architecture's async separation. The checkout result is
 *   never blocked by this widget.
 *
 * Response shapes handled:
 *   Single:  { explanation, source, modelUsed, latencyMs, generatedAt, cached }
 *   Multi:   { explanations: [{ shipmentIndex, shipmentId, warehouseName, explanation, source }],
 *              multiShipment: true, modelUsed, latencyMs, generatedAt, cached }
 *
 * Source badges:
 *   - "gemini"            → "✦ AI Explanation" (accent glow border)
 *   - "fallback_template" → "Computed Summary" (neutral style, not an error)
 *
 * @param {{ orderId: string, autoFetch?: boolean }} props
 */
import { useState, useCallback, useEffect } from 'react';
import { getExplanation } from '../lib/apiClient';

/** Badge for explanation source. */
function SourceBadge({ source }) {
  const isGemini = source === 'gemini';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{
        background: isGemini ? 'var(--color-accent-glow)' : 'rgba(100, 116, 139, 0.15)',
        color: isGemini ? 'var(--color-accent)' : 'var(--color-text-muted)',
      }}
    >
      {isGemini ? '✦ AI Explanation' : '⚙ Computed Summary'}
    </span>
  );
}

/** Meta info item */
function MetaItem({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span style={{ fontSize: 10, opacity: 0.7 }}>{icon}</span>
      {children}
    </span>
  );
}

/** Single explanation block (used for both single and per-shipment rendering). */
function ExplanationBlock({ title, explanation, source, showDivider = false }) {
  return (
    <div className={showDivider ? 'pt-3 mt-3 border-t border-[var(--color-border)]' : ''}>
      {title && (
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            {title}
          </h4>
          <SourceBadge source={source} />
        </div>
      )}
      <p className="text-sm text-[var(--color-text-primary)] leading-relaxed">
        {explanation}
      </p>
    </div>
  );
}

/** Skeleton shimmer for loading state */
function ExplanationSkeleton() {
  return (
    <div className="space-y-3">
      <div className="animate-shimmer" style={{ width: '40%', height: 12, borderRadius: 6 }} />
      <div className="animate-shimmer" style={{ width: '100%', height: 14, borderRadius: 6 }} />
      <div className="animate-shimmer" style={{ width: '90%', height: 14, borderRadius: 6 }} />
      <div className="animate-shimmer" style={{ width: '70%', height: 14, borderRadius: 6 }} />
    </div>
  );
}

export default function AIExplanationWidget({ orderId, autoFetch = false }) {
  const [state, setState] = useState('idle'); // idle | loading | success | error
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState('');

  /** Fetch explanation from the backend. */
  const fetchExplanation = useCallback(async () => {
    if (!orderId) return;
    setState('loading');
    setErrorMsg('');
    setErrorCode('');
    try {
      const result = await getExplanation(orderId);
      setData(result);
      setState('success');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load explanation.');
      setErrorCode(err.code || '');
      setState('error');
    }
  }, [orderId]);

  // Auto-fetch if requested (e.g., from OrderSimulator)
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
          <span className="text-[10px] text-[var(--color-text-muted)] font-medium ml-auto">
            Generating…
          </span>
        </div>
        <ExplanationSkeleton />
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
        <div className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-glow)] p-3 mb-3">
          <p className="text-sm text-[var(--color-danger)] font-medium">
            {errorMsg}
          </p>
          {errorCode && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-primary)]">
              {errorCode}
            </span>
          )}
        </div>
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
  const isMultiShipment = data?.multiShipment === true && Array.isArray(data?.explanations);
  const overallSource = data?.source;
  const isGemini = overallSource === 'gemini';

  return (
    <div
      className="glass-card p-4"
      style={{
        borderColor: isGemini ? 'rgba(99, 102, 241, 0.25)' : undefined,
        boxShadow: isGemini ? '0 0 30px rgba(99, 102, 241, 0.06)' : undefined,
      }}
    >
      {/* Header with overall source badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: isGemini ? 'var(--color-accent)' : 'var(--color-text-muted)',
              boxShadow: isGemini ? '0 0 8px rgba(99, 102, 241, 0.5)' : 'none',
            }}
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            AI Explanation
            {isMultiShipment && (
              <span className="ml-2 text-[10px] font-medium text-[var(--color-text-muted)] normal-case">
                ({data.explanations.length} shipment{data.explanations.length !== 1 ? 's' : ''})
              </span>
            )}
          </h3>
        </div>
        {!isMultiShipment && <SourceBadge source={overallSource} />}
      </div>

      {/* Single explanation */}
      {!isMultiShipment && (
        <p className="text-sm text-[var(--color-text-primary)] leading-relaxed mb-3">
          {data?.explanation}
        </p>
      )}

      {/* Multi-shipment explanations */}
      {isMultiShipment && data.explanations.map((exp, idx) => (
        <ExplanationBlock
          key={exp.shipmentId || idx}
          title={`Shipment ${exp.shipmentIndex + 1}${exp.warehouseName ? ` — ${exp.warehouseName}` : ''}`}
          explanation={exp.explanation}
          source={exp.source}
          showDivider={idx > 0}
        />
      ))}

      {/* Meta info */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-border)] pt-2 mt-3">
        {data?.modelUsed && data.modelUsed !== 'n/a' && (
          <MetaItem icon="🧠">Model: {data.modelUsed}</MetaItem>
        )}
        {data?.latencyMs != null && (
          <MetaItem icon="⚡">{data.latencyMs}ms</MetaItem>
        )}
        {data?.generatedAt && (
          <MetaItem icon="🕐">{new Date(data.generatedAt).toLocaleString()}</MetaItem>
        )}
        {data?.cached && (
          <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] flex items-center gap-1">
            <span style={{ fontSize: 10 }}>💾</span> cached
          </span>
        )}
      </div>
    </div>
  );
}
