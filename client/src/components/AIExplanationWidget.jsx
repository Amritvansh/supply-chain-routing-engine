/**
 * AIExplanationWidget — Polished AI Explainability Experience
 *
 * Displays Gemini AI or deterministic fallback explanations for
 * routing decisions. Supports single and multi-shipment orders.
 *
 * Uses explicit inline spacing so global CSS reset never collapses padding.
 */
import { useState, useCallback, useEffect } from 'react';
import { getExplanation } from '../lib/apiClient';

function SourceBadge({ source }) {
  const isGemini = source === 'gemini';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: isGemini
          ? 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(168,85,247,0.18))'
          : 'rgba(100, 116, 139, 0.14)',
        color: isGemini ? '#818cf8' : 'var(--color-text-muted)',
        border: isGemini
          ? '1px solid rgba(129, 140, 248, 0.35)'
          : '1px solid var(--color-border)',
      }}
    >
      <span>{isGemini ? '✦' : '⚙'}</span>
      <span>{isGemini ? 'Gemini AI' : 'Computed Summary'}</span>
    </span>
  );
}

function MetaChip({ icon, label, value }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 500,
        background: 'var(--color-surface-chip, var(--color-bg-hover))',
        border: '1px solid var(--color-border-subtle)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <span style={{ fontSize: 11 }}>{icon}</span>
      {label && <span style={{ color: 'var(--color-text-muted)' }}>{label}:</span>}
      <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{value}</strong>
    </span>
  );
}

function ExplanationBlock({ title, explanation, source, index }) {
  const isGemini = source === 'gemini';
  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: 12,
        background: 'var(--color-surface-subtle, var(--color-bg-primary))',
        border: '1px solid var(--color-border)',
        borderLeft: `3.5px solid ${isGemini ? '#818cf8' : '#64748b'}`,
        marginTop: index > 0 ? 12 : 0,
      }}
    >
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            {title}
          </h4>
          <SourceBadge source={source} />
        </div>
      )}
      <p style={{ fontSize: 13.5, color: 'var(--color-text-primary)', lineHeight: 1.7, margin: 0 }}>
        {explanation}
      </p>
    </div>
  );
}

function ExplanationSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
      <div className="animate-shimmer" style={{ width: '38%', height: 14, borderRadius: 6 }} />
      <div className="animate-shimmer" style={{ width: '100%', height: 15, borderRadius: 6 }} />
      <div className="animate-shimmer" style={{ width: '92%', height: 15, borderRadius: 6 }} />
      <div className="animate-shimmer" style={{ width: '68%', height: 15, borderRadius: 6 }} />
    </div>
  );
}

export default function AIExplanationWidget({ orderId, autoFetch = false }) {
  const [state, setState] = useState('idle'); // idle | loading | success | error
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState('');

  const fetchExplanation = useCallback(async (forceRefresh = false) => {
    if (!orderId) return;
    setState('loading');
    setErrorMsg('');
    setErrorCode('');
    try {
      const result = await getExplanation(orderId, forceRefresh);
      setData(result);
      setState('success');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load explanation.');
      setErrorCode(err.code || '');
      setState('error');
    }
  }, [orderId]);

  useEffect(() => {
    if (autoFetch && orderId) {
      fetchExplanation(false);
    }
  }, [autoFetch, orderId, fetchExplanation]);

  const cardShell = {
    borderRadius: 14,
    padding: '20px 22px',
    background: 'var(--color-bg-card-solid)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-card)',
    fontFamily: 'var(--font-sans)',
  };

  if (state === 'idle') {
    return (
      <div style={cardShell}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(129, 140, 248, 0.14)', color: '#818cf8',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>✦</div>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                AI Routing Explanation
              </h3>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                {orderId ? 'Ready to explain deterministic warehouse selection' : 'Awaiting order…'}
              </p>
            </div>
          </div>
          {orderId && (
            <button
              onClick={() => fetchExplanation(false)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--color-accent-gradient)', color: '#fff',
                fontSize: 12, fontWeight: 600,
              }}
            >
              ✦ Generate Explanation
            </button>
          )}
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div style={cardShell} role="status">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'rgba(129, 140, 248, 0.14)', color: '#818cf8',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
            }}>✦</div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Generating AI Explanation…
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600 }}>Analyzing routes</span>
        </div>
        <ExplanationSkeleton />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={{ ...cardShell, borderColor: 'rgba(239, 68, 68, 0.45)' }} role="alert">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f87171' }}>⚠ AI Explanation Error</span>
          <button
            onClick={() => fetchExplanation(true)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.12)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            ↻ Retry
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>{errorMsg}</p>
        {errorCode && (
          <code style={{ display: 'inline-block', marginTop: 8, fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
            {errorCode}
          </code>
        )}
      </div>
    );
  }

  const isMultiShipment = data?.multiShipment === true && Array.isArray(data?.explanations);
  const overallSource = data?.source;
  const isGemini = overallSource === 'gemini';

  return (
    <div
      style={{
        ...cardShell,
        borderColor: isGemini ? 'rgba(129, 140, 248, 0.35)' : 'var(--color-border)',
        boxShadow: isGemini ? '0 8px 32px rgba(99, 102, 241, 0.1)' : 'var(--shadow-card)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', paddingBottom: 14, marginBottom: 16,
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: isGemini
              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
              : 'rgba(100, 116, 139, 0.16)',
            color: isGemini ? '#ffffff' : 'var(--color-text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700,
            boxShadow: isGemini ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none',
          }}>
            {isGemini ? '✦' : '⚙'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                Routing Decision Rationale
              </h3>
              {isMultiShipment && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: 'rgba(59, 130, 246, 0.14)', color: '#60a5fa',
                }}>
                  {data.explanations.length} Shipments
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {isGemini
                ? 'Live natural-language synthesis powered by Google Gemini'
                : 'Deterministic template summary (fallback mode)'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SourceBadge source={overallSource} />
          <button
            onClick={() => fetchExplanation(true)}
            title="Regenerate live explanation with Gemini AI"
            style={{
              padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--color-border)', background: 'var(--color-bg-hover)',
              color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <span>↻</span>
            <span>Regenerate</span>
          </button>
        </div>
      </div>

      {/* Single explanation */}
      {!isMultiShipment && (
        <ExplanationBlock
          explanation={data?.explanation}
          source={overallSource}
          index={0}
        />
      )}

      {/* Multi-shipment explanations */}
      {isMultiShipment && data.explanations.map((exp, idx) => (
        <ExplanationBlock
          key={exp.shipmentId || idx}
          index={idx}
          title={`Shipment ${exp.shipmentIndex + 1}${exp.warehouseName ? ` — ${exp.warehouseName}` : ''}`}
          explanation={exp.explanation}
          source={exp.source}
        />
      ))}

      {/* Meta Chips Footer */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        marginTop: 16, paddingTop: 14,
        borderTop: '1px solid var(--color-border-subtle)',
      }}>
        {data?.modelUsed && data.modelUsed !== 'n/a' && (
          <MetaChip icon="🧠" label="Model" value={data.modelUsed} />
        )}
        {data?.latencyMs != null && (
          <MetaChip icon="⚡" label="Latency" value={`${data.latencyMs}ms`} />
        )}
        {data?.generatedAt && (
          <MetaChip icon="🕐" value={new Date(data.generatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} />
        )}
        <MetaChip
          icon={data?.cached ? '💾' : '✨'}
          value={data?.cached ? 'Cached' : 'Freshly Generated'}
        />
      </div>
    </div>
  );
}
