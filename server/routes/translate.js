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
const MODEL_NAME = 'gemini-1.5-flash';

const STATIC_DICT = {
  hi: {
    'Supply Chain': 'सप्लाई चेन',
    'Routing Engine': 'राउटिंग इंजन',
    'Control Tower': 'कंट्रोल टावर',
    'All Orders': 'सभी ऑर्डर',
    'Analytics': 'एनालिटिक्स',
    'Products': 'उत्पाद',
    'Warehouses': 'वेयरहाउस',
    'Inventory': 'इन्वेंट्री',
    'How It Works': 'यह कैसे काम करता है',
    'Operations': 'संचालन',
    'Network & Catalog': 'नेटवर्क और कैटलॉग',
    'System': 'सिस्टम',
    'Change': 'बदलें',
    'Refresh': 'रिफ्रेश',
    'Back to All Orders': 'सभी ऑर्डर पर वापस जाएं',
    'Export Shipping Manifest & Invoice': 'शिपिंग मेनिफेस्ट और इनवॉइस डाउनलोड करें',
    'Order Analysis': 'ऑर्डर विश्लेषण',
    'Customer': 'ग्राहक',
    'CUSTOMER': 'ग्राहक',
    'Phone': 'फ़ोन',
    'PHONE': 'फ़ोन',
    'Address': 'पता',
    'ADDRESS': 'पता',
    'PIN Code': 'पिन कोड',
    'PIN CODE': 'पिन कोड',
    'Location': 'स्थान',
    'LOCATION': 'स्थान',
    'Items': 'आइटम',
    'ITEMS': 'आइटम',
    'product': 'उत्पाद',
    'products': 'उत्पाद',
    'Order Items': 'ऑर्डर किए गए आइटम',
    'Product': 'उत्पाद',
    'PRODUCT': 'उत्पाद',
    'Category': 'श्रेणी',
    'CATEGORY': 'श्रेणी',
    'Qty': 'मात्रा',
    'QTY': 'मात्रा',
    'Unit Price': 'प्रति इकाई मूल्य',
    'UNIT PRICE': 'प्रति इकाई मूल्य',
    'Weight': 'वजन',
    'WEIGHT': 'वजन',
    'Dimensions': 'आयाम',
    'DIMENSIONS': 'आयाम',
    'Line Total': 'कुल मूल्य',
    'LINE TOTAL': 'कुल मूल्य',
    'Algorithm Analysis': 'एल्गोरिदम विश्लेषण',
    '5-Step Routing Engine': '5-चरणीय राउटिंग इंजन',
    'Total Shipments': 'कुल शिपमेंट',
    'TOTAL SHIPMENTS': 'कुल शिपमेंट',
    'Total Items': 'कुल आइटम',
    'TOTAL ITEMS': 'कुल आइटम',
    'Delivery Cost': 'डिलीवरी लागत',
    'DELIVERY COST': 'डिलीवरी लागत',
    'Split Shipment': 'विभाजित शिपमेंट',
    'SPLIT SHIPMENT': 'विभाजित शिपमेंट',
    'Shipment Details': 'शिपमेंट विवरण',
    'Road Distance': 'सड़क दूरी',
    'Shipping Cost': 'शिपिंग लागत',
    'Shipped At': 'भेजने का समय',
    'Routed': 'राउटेड (सफल)',
    'Split Routed': 'विभाजित राउटेड',
    'MULTI_WAREHOUSE_SPLIT': 'मल्टी-वेयरहाउस स्प्लिट',
  },
};

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
      missingIndices.forEach((idx, i) => {
        const text = missingTexts[i];
        results[idx] = STATIC_DICT[targetLang]?.[text] || text;
      });
      return res.status(200).json({ translations: results, source: 'dictionary_fallback' });
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
