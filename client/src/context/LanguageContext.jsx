/**
 * LanguageContext — Global Multi-Language Support (English + 7 Indian Languages)
 *
 * Features:
 *   - Persists chosen language in localStorage ('app_language')
 *   - Provides an Astrotalk-inspired Language Selector Modal accessible globally
 *   - Safely translates visible DOM Text nodes via MutationObserver + Gemini batch API
 *     WITHOUT inserting wrapper <font>/<span> nodes (100% React reconciliation safe)
 *   - Skips maps, charts, inputs, code/IDs, numbers, currency, and [data-no-translate]
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { SUPPORTED_LANGUAGES } from '../lib/translations';
import { translateTexts } from '../lib/apiClient';
import storage from '../lib/storage';

const LanguageContext = createContext(null);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SVG']);

function shouldSkipText(text, parentEl) {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;
  // Skip pure numbers, currency, coordinates, UUIDs, short codes, dates
  if (/^[\d\s.,:%+\-–—₹$€•·|/()°×]+$/.test(trimmed)) return true;
  if (/^(ORD|INV|TXN|MNF|PIN|SKU)-/i.test(trimmed)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;
  if (!/[A-Za-z]/.test(trimmed)) return true;

  let el = parentEl;
  while (el && el.nodeType === 1) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.getAttribute('data-no-translate') === 'true') return true;
    if (
      el.classList?.contains('maplibregl-map') ||
      el.classList?.contains('recharts-wrapper') ||
      el.classList?.contains('recharts-surface')
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function loadLangCache(lang) {
  try {
    const raw = localStorage.getItem(`ui_i18n_cache_${lang}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLangCache(lang, cacheObj) {
  try {
    localStorage.setItem(`ui_i18n_cache_${lang}`, JSON.stringify(cacheObj));
  } catch {
    // storage quota ignored
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => storage.getItem('app_language') || 'en');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [translating, setTranslating] = useState(false);

  // Track original English text per Text node safely in a WeakMap
  const nodeMetaRef = useRef(new WeakMap());
  const cacheRef = useRef({});
  const isMutatingRef = useRef(false);

  const setLang = useCallback((code) => {
    setLangState(code);
    storage.setItem('app_language', code);
    setPickerOpen(false);
  }, []);

  const currentLanguage = SUPPORTED_LANGUAGES.find(l => l.code === lang) || SUPPORTED_LANGUAGES[0];

  // Safe DOM text-node translation engine
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const metaMap = nodeMetaRef.current;

    // Restore original English text immediately when switching back to 'en'
    function restoreEnglish() {
      isMutatingRef.current = true;
      try {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const meta = metaMap.get(node);
          if (meta && node.nodeValue !== meta.en) {
            node.nodeValue = meta.en;
            meta.lastTranslated = meta.en;
          }
        }
      } finally {
        isMutatingRef.current = false;
      }
    }

    if (lang === 'en') {
      restoreEnglish();
      setTranslating(false);
      return;
    }

    if (!cacheRef.current[lang]) {
      cacheRef.current[lang] = loadLangCache(lang);
    }

    let debounceTimer = null;
    let cancelled = false;

    async function scanAndTranslate() {
      if (cancelled) return;
      const langCache = cacheRef.current[lang] || {};
      const nodesToApply = [];
      const missingSet = new Set();

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const val = node.nodeValue;
        if (!val) continue;

        let meta = metaMap.get(node);
        // If this node hasn't been seen OR React re-rendered a new English string into it
        if (!meta) {
          if (shouldSkipText(val, node.parentElement)) continue;
          meta = { en: val, lastTranslated: val };
          metaMap.set(node, meta);
        } else if (val !== meta.lastTranslated && val !== meta.en) {
          if (shouldSkipText(val, node.parentElement)) continue;
          meta.en = val;
          meta.lastTranslated = val;
        }

        const trimmed = meta.en.trim();
        if (!trimmed) continue;

        if (langCache[trimmed]) {
          nodesToApply.push({ node, meta, translated: langCache[trimmed] });
        } else {
          missingSet.add(trimmed);
          nodesToApply.push({ node, meta, key: trimmed });
        }
      }

      // Apply already-cached translations immediately
      if (nodesToApply.length > 0) {
        isMutatingRef.current = true;
        try {
          for (const item of nodesToApply) {
            if (item.translated) {
              const leading = item.meta.en.match(/^\s*/)?.[0] || '';
              const trailing = item.meta.en.match(/\s*$/)?.[0] || '';
              const nextVal = `${leading}${item.translated}${trailing}`;
              if (item.node.nodeValue !== nextVal) {
                item.node.nodeValue = nextVal;
                item.meta.lastTranslated = nextVal;
              }
            }
          }
        } finally {
          isMutatingRef.current = false;
        }
      }

      // Fetch missing strings via Gemini backend in chunks of 45
      const missing = Array.from(missingSet);
      if (missing.length === 0) return;

      setTranslating(true);
      try {
        for (let i = 0; i < missing.length; i += 45) {
          if (cancelled) break;
          const chunk = missing.slice(i, i + 45);
          const res = await translateTexts(chunk, lang);
          if (cancelled) break;
          if (Array.isArray(res?.translations)) {
            chunk.forEach((src, idx) => {
              const tr = res.translations[idx];
              if (tr && typeof tr === 'string') {
                langCache[src] = tr;
              }
            });
            cacheRef.current[lang] = langCache;
            saveLangCache(lang, langCache);

            // Apply newly fetched translations
            isMutatingRef.current = true;
            try {
              for (const item of nodesToApply) {
                if (!item.key) continue;
                const tr = langCache[item.key];
                if (tr) {
                  const leading = item.meta.en.match(/^\s*/)?.[0] || '';
                  const trailing = item.meta.en.match(/\s*$/)?.[0] || '';
                  const nextVal = `${leading}${tr}${trailing}`;
                  if (item.node.nodeValue !== nextVal) {
                    item.node.nodeValue = nextVal;
                    item.meta.lastTranslated = nextVal;
                  }
                }
              }
            } finally {
              isMutatingRef.current = false;
            }
          }
        }
      } catch {
        // Silent fallback — keep English without throwing UI error
      } finally {
        if (!cancelled) setTranslating(false);
      }
    }

    // Initial scan + observe DOM updates from React page navigation
    scanAndTranslate();

    const observer = new MutationObserver(() => {
      if (isMutatingRef.current) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scanAndTranslate, 160);
    });

    observer.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [lang]);

  return (
    <LanguageContext.Provider
      value={{
        lang,
        setLang,
        currentLanguage,
        languages: SUPPORTED_LANGUAGES,
        pickerOpen,
        openPicker: () => setPickerOpen(true),
        closePicker: () => setPickerOpen(false),
        translating,
      }}
    >
      {children}

      {/* Astrotalk-Style Visual Language Selector Modal */}
      {pickerOpen && (
        <div
          id="language-picker-backdrop"
          data-no-translate="true"
          onClick={(e) => { if (e.target.id === 'language-picker-backdrop') setPickerOpen(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(2, 6, 23, 0.72)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 16px',
            overflowY: 'auto',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose App Language"
            className="animate-fade-in"
            style={{
              width: '100%',
              maxWidth: 560,
              background: 'var(--color-bg-card-solid)',
              border: '1px solid var(--color-border)',
              borderRadius: 20,
              padding: '26px 28px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: 'var(--color-accent-gradient)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>🌐</div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                    Choose Your Language
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                    Instant website & guide translation across 8 languages
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPickerOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                  background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)', fontSize: 15, fontWeight: 700,
                }}
              >✕</button>
            </div>

            {/* 2x4 Native Language Grid (Astrotalk style) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}>
              {SUPPORTED_LANGUAGES.map((item) => {
                const isActive = lang === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setLang(item.code)}
                    style={{
                      padding: '16px 12px',
                      borderRadius: 14,
                      cursor: 'pointer',
                      textAlign: 'center',
                      position: 'relative',
                      border: isActive ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                      background: isActive ? 'var(--color-accent-glow)' : 'var(--color-surface-subtle, var(--color-bg-primary))',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isActive && (
                      <span style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'var(--color-accent)', color: '#fff',
                        fontSize: 10, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>✓</span>
                    )}
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', margin: '0 auto 8px',
                      background: isActive ? 'var(--color-accent-gradient)' : 'var(--color-bg-hover)',
                      color: isActive ? '#fff' : 'var(--color-text-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 800,
                    }}>
                      {item.symbol}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {item.native}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {item.name}
                    </div>
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', margin: 0 }}>
              ✨ Powered by Gemini AI + Instant Native Dictionary • Zero effect on orders or routing engine
            </p>
          </div>
        </div>
      )}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within <LanguageProvider>');
  return ctx;
}
