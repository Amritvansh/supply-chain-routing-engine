/**
 * UI Translation Route — Gemini-powered multi-language helper
 *
 * Leaf route strictly for UI label translation (zero DB / routing impact).
 * Supports Indian languages: hi, ta, te, mr, bn, gu, kn (and en).
 */
'use strict';

const { Router } = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/env');
const logger = require('../services/logger');

const router = Router();

const LANG_NAMES = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi (Devanagari script)',
  bn: 'Bengali',
  gu: 'Gujarati',
  kn: 'Kannada',
};

const TRANSLATION_CACHE = new Map();
const MAX_CACHE_SIZE = 5000;
const MODEL_NAME = 'gemini-3.5-flash-lite';

router.post('/', async (req, res) => {
  try {
    const { texts, targetLang } = req.body || {};

    if (!Array.isArray(texts) || texts.length === 0 || !targetLang || !LANG_NAMES[targetLang]) {
      return res.status(400).json({
        error: { message: 'texts (non-empty array) and valid targetLang are required' },
      });
    }

    if (targetLang === 'en') {
      return res.status(200).json({ translations: texts, source: 'identity' });
    }

    const cleanTexts = texts.slice(0, 60).map(t => String(t));
    const results = new Array(cleanTexts.length);
    const missingIndices = [];
    const missingTexts = [];

    cleanTexts.forEach((txt, idx) => {
      const key = `${targetLang}::${txt}`;
      if (TRANSLATION_CACHE.has(key)) {
        results[idx] = TRANSLATION_CACHE.get(key);
      } else {
        missingIndices.push(idx);
        missingTexts.push(txt);
      }
    });

    if (missingTexts.length === 0) {
      return res.status(200).json({ translations: results, source: 'cache' });
    }

    if (!env.GEMINI_API_KEY) {
      missingIndices.forEach((idx, i) => { results[idx] = missingTexts[i]; });
      return res.status(200).json({ translations: results, source: 'fallback' });
    }

    try {
      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });

      const prompt =
        `Translate the following UI strings for a logistics & supply chain web app into ${LANG_NAMES[targetLang]}. ` +
        `Keep technical codes/symbols/numbers/SKUs unchanged (e.g. API, SKU, PDF, UPI, COD, 429, 409, P95, ms, km, ₹). ` +
        `Return ONLY a valid JSON array of translated strings in the exact same order and length (${missingTexts.length}). ` +
        `Input JSON:\n${JSON.stringify(missingTexts)}`;

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const aiRes = await model.generateContent(
        { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        { signal: ctrl.signal }
      );
      clearTimeout(timeout);

      let raw = aiRes.response.text().trim();
      // Strip markdown code fences if present
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed) && parsed.length === missingTexts.length) {
        missingIndices.forEach((origIdx, i) => {
          const translated = typeof parsed[i] === 'string' && parsed[i].trim() ? parsed[i].trim() : missingTexts[i];
          results[origIdx] = translated;
          if (TRANSLATION_CACHE.size >= MAX_CACHE_SIZE) {
            const firstKey = TRANSLATION_CACHE.keys().next().value;
            TRANSLATION_CACHE.delete(firstKey);
          }
          TRANSLATION_CACHE.set(`${targetLang}::${missingTexts[i]}`, translated);
        });
        return res.status(200).json({ translations: results, source: 'gemini' });
      }
    } catch (err) {
      logger.warn({ err: err.message, targetLang }, 'UI translation fallback triggered');
    }

    missingIndices.forEach((idx, i) => { results[idx] = missingTexts[i]; });
    return res.status(200).json({ translations: results, source: 'fallback' });
  } catch {
    return res.status(200).json({ translations: req.body?.texts || [], source: 'fallback' });
  }
});

module.exports = router;
