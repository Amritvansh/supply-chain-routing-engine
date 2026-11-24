/**
 * Multi-Language Configuration & Native Flash-Sale Host Guide Translations
 * Supports English + 7 major Indian languages:
 *   en (English), hi (Hindi), ta (Tamil), te (Telugu),
 *   mr (Marathi), bn (Bengali), gu (Gujarati), kn (Kannada)
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', symbol: 'A', region: 'Default' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', symbol: 'अ', region: 'उत्तर भारत' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', symbol: 'த', region: 'தமிழ்நாடு' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', symbol: 'తె', region: 'తెలంగాణ / AP' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', symbol: 'म', region: 'महाराष्ट्र' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', symbol: 'ব', region: 'পশ্চিমবঙ্গ' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', symbol: 'ગુ', region: 'ગુજરાત' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', symbol: 'ಕ', region: 'ಕರ್ನಾಟಕ' },
];

export const FLASH_SALE_I18N = {
  en: {
    guideTitle: 'Host Guide: What to Do & Metric Meanings',
    howToUseTitle: 'What Host Needs to Do (3 Simple Steps)',
    steps: [
      '1. Pick a product in Target SKU whose stock resilience you want to test.',
      '2. Set Qty / Order (units per buyer) and Concurrency (simultaneous buyers hitting checkout together, e.g. 10–30).',
      '3. Click "Run Flash-Sale Test" — this fires real concurrent ACID checkouts (Redis SKU lock + PostgreSQL) to check if your stock & servers survive peak flash-sale traffic.',
    ],
    metricsTitle: 'What Each Result Means',
    metrics: [
      { key: 'Success (200)', desc: 'Orders safely confirmed with zero overselling.' },
      { key: '429 Rate-Limited', desc: 'Too many simultaneous buyers on the same SKU — Redis lock/rate-limiter shielded DB from overload.' },
      { key: '409 Conflict', desc: 'Warehouse stock ran out mid-burst! Host Action: Restock this SKU in Inventory or spread stock across more hubs.' },
      { key: 'AVG / P95 ms', desc: 'Average vs slowest-5% checkout speed. Under 500ms means fast, healthy checkout.' },
    ],
    verdictConflict: (n, sku) => `Action Required: ${n} buyer(s) failed with 409 Out-of-Stock on "${sku}". Go to Inventory and add stock or distribute across warehouses.`,
    verdictRateLimited: (succ, rl) => `Traffic Shield Active: ${succ} order(s) passed safely and ${rl} burst request(s) were throttled (429) by Redis locks — zero overselling.`,
    verdictHealthy: (succ, p95) => `Healthy Capacity: All ${succ} concurrent orders cleared cleanly (P95: ${p95}ms) with zero stock conflicts.`,
  },
  hi: {
    guideTitle: 'होस्ट गाइड: क्या करना है और नतीजों का मतलब',
    howToUseTitle: 'होस्ट को क्या करना है (3 आसान स्टेप्स)',
    steps: [
      '1. Target SKU में वो प्रोडक्ट चुनें जिसकी फ्लैश-सेल क्षमता (स्टॉक और लॉक) चेक करनी है।',
      '2. Qty / Order (प्रति ग्राहक मात्रा) और Concurrency (एक साथ ऑर्डर करने वाले ग्राहक, जैसे 10–30) सेट करें।',
      '3. "Run Flash-Sale Test" दबाएं — यह असली Redis लॉक और PostgreSQL ट्रांज़ैक्शन पर एक साथ ट्रैफ़िक भेजकर टेस्ट करेगा।',
    ],
    metricsTitle: 'हर नंबर का मतलब और होस्ट का काम',
    metrics: [
      { key: 'Success (200)', desc: 'इतने ऑर्डर बिना किसी गड़बड़ी या ओवरसेलिंग के सफलतापूर्वक बुक हुए।' },
      { key: '429 Rate-Limited', desc: 'एक ही समय में बहुत सारे खरीदार आए — Redis लॉक / रेट-लिमिटर ने सर्वर को क्रैश होने से बचाया।' },
      { key: '409 Conflict', desc: 'वेयरहाउस में स्टॉक खत्म हो गया! होस्ट एक्शन: Inventory पेज पर जाकर इस SKU का स्टॉक बढ़ाएं।' },
      { key: 'AVG / P95 ms', desc: 'औसत और सबसे धीमे 5% ऑर्डर का समय। 500ms से कम का मतलब सिस्टम तेज़ और स्वस्थ है।' },
    ],
    verdictConflict: (n, sku) => `तुरंत एक्शन लें: "${sku}" के लिए ${n} ऑर्डर स्टॉक खत्म (409) होने से फेल हुए। Inventory में जाकर स्टॉक बढ़ाएं।`,
    verdictRateLimited: (succ, rl) => `ट्रैफ़िक शील्ड सक्रिय: ${succ} ऑर्डर सुरक्षित पास हुए और ${rl} अतिरिक्त रिक्वेस्ट Redis लॉक से रोकी गईं (429) — शून्य ओवरसेलिंग।`,
    verdictHealthy: (succ, p95) => `सिस्टम पूरी तरह स्वस्थ: सभी ${succ} एक साथ आए ऑर्डर बिना किसी स्टॉक समस्या के (P95: ${p95}ms) पूरे हुए।`,
  },
  ta: {
    guideTitle: 'ஹோஸ்ட் வழிகாட்டி: என்ன செய்ய வேண்டும் & அளவீடுகள்',
    howToUseTitle: 'ஹோஸ்ட் செய்ய வேண்டிய 3 படிகள்',
    steps: [
      '1. Target SKU-வில் சோதனை செய்ய வேண்டிய பொருளைத் தேர்ந்தெடுக்கவும்.',
      '2. Qty / Order (ஒரு ஆர்டருக்கான அளவு) மற்றும் Concurrency (ஒரே நேரத்தில் வரும் வாடிக்கையாளர்கள், எ.கா. 10–30) அமைக்கவும்.',
      '3. "Run Flash-Sale Test" அழுத்தவும் — உண்மையான Redis பூட்டு மற்றும் PostgreSQL வழியாக போக்குவரத்து சோதனை நடக்கும்.',
    ],
    metricsTitle: 'ஒவ்வொரு மதிப்பின் அர்த்தம்',
    metrics: [
      { key: 'Success (200)', desc: 'அதிகப்படியான விற்பனை இல்லாமல் வெற்றிகரமாக உறுதி செய்யப்பட்ட ஆர்டர்கள்.' },
      { key: '429 Rate-Limited', desc: 'ஒரே நேரத்தில் அதிக கோரிக்கைகள் — Redis பூட்டு தரவுத்தளத்தைப் பாதுகாத்தது.' },
      { key: '409 Conflict', desc: 'கிடங்கில் இருப்பு முடிந்துவிட்டது! ஹோஸ்ட் செயல்: Inventory பக்கத்தில் பங்கு சேர்க்கவும்.' },
      { key: 'AVG / P95 ms', desc: 'சராசரி மற்றும் மெதுவான 5% ஆர்டர் வேகம். 500ms-க்கு கீழ் சிறந்தது.' },
    ],
    verdictConflict: (n, sku) => `நடவடிக்கை தேவை: "${sku}" க்கு ${n} ஆர்டர்கள் கையிருப்பு இல்லாமல் (409) தோல்வியடைந்தன. Inventory-யில் கையிருப்பை நிரப்பவும்.`,
    verdictRateLimited: (succ, rl) => `பாதுகாப்பு செயலில்: ${succ} ஆர்டர்கள் வெற்றிகரமாக முடிந்தன, ${rl} கோரிக்கைகள் Redis மூலம் கட்டுப்படுத்தப்பட்டன (429).`,
    verdictHealthy: (succ, p95) => `சிறப்பான செயல்திறன்: அனைத்து ${succ} ஆர்டர்களும் சிக்கலின்றி முடிந்தன (P95: ${p95}ms).`,
  },
  te: {
    guideTitle: 'హోస్ట్ గైడ్: ఏమి చేయాలి & ఫలితాల అర్థం',
    howToUseTitle: 'హోస్ట్ చేయవలసిన 3 సులభమైన దశలు',
    steps: [
      '1. Target SKU లో మీరు పరీక్షించాల్సిన ఉత్పత్తిని ఎంచుకోండి.',
      '2. Qty / Order మరియు Concurrency (ఒకేసారి వచ్చే కొనుగోలుదారులు, ఉదా. 10–30) సెట్ చేయండి.',
      '3. "Run Flash-Sale Test" క్లిక్ చేయండి — ఇది నిజమైన Redis లాక్ మరియు PostgreSQL ద్వారా లోడ్ టెస్ట్ చేస్తుంది.',
    ],
    metricsTitle: 'ప్రతి సంఖ్య అర్థం & హోస్ట్ చర్య',
    metrics: [
      { key: 'Success (200)', desc: 'ఓవర్‌సెల్లింగ్ లేకుండా విజయవంతంగా పూర్తయిన ఆర్డర్లు.' },
      { key: '429 Rate-Limited', desc: 'ఒకేసారి ఎక్కువ మంది రావడంతో Redis లాక్ సిస్టమ్‌ను కాపాడింది.' },
      { key: '409 Conflict', desc: 'స్టాక్ అయిపోయింది! హోస్ట్ చర్య: Inventory పేజీలో ఈ SKU స్టాక్ పెంచండి.' },
      { key: 'AVG / P95 ms', desc: 'సగటు మరియు గరిష్ట చెక్అవుట్ సమయం. 500ms కంటే తక్కువ ఉంటే ఆరోగ్యకరం.' },
    ],
    verdictConflict: (n, sku) => `చర్య అవసరం: "${sku}" కోసం ${n} ఆర్డర్లు స్టాక్ లేక (409) విఫలమయ్యాయి. Inventory లో స్టాక్ పెంచండి.`,
    verdictRateLimited: (succ, rl) => `ట్రాఫిక్ రక్షణ: ${succ} ఆర్డర్లు సురక్షితంగా పూర్తయ్యాయి, ${rl} అభ్యర్థనలు (429) Redis ద్వారా నియంత్రించబడ్డాయి.`,
    verdictHealthy: (succ, p95) => `ఆరోగ్యకరమైన సామర్థ్యం: మొత్తం ${succ} ఆర్డర్లు ఎలాంటి లోపం లేకుండా పూర్తయ్యాయి (P95: ${p95}ms).`,
  },
  mr: {
    guideTitle: 'होस्ट मार्गदर्शक: काय करावे आणि आकड्यांचा अर्थ',
    howToUseTitle: 'होस्टने करावयाच्या ३ सोप्या पायऱ्या',
    steps: [
      '1. Target SKU मधून ज्या उत्पादनाची क्षमता तपासायची आहे ते निवडा.',
      '2. Qty / Order आणि Concurrency (एकाच वेळी ऑर्डर करणारे ग्राहक, उदा. १०–३०) निवडा.',
      '3. "Run Flash-Sale Test" वर क्लिक करा — खरी Redis लॉक आणि PostgreSQL तपासणी सुरू होईल.',
    ],
    metricsTitle: 'प्रत्येक निकालाचा अर्थ',
    metrics: [
      { key: 'Success (200)', desc: 'ओव्हरसेलिंगशिवाय सुरक्षितपणे पूर्ण झालेल्या ऑर्डर्स.' },
      { key: '429 Rate-Limited', desc: 'अचानक गर्दीमुळे Redis लॉकने डेटाबेस सुरक्षित ठेवला.' },
      { key: '409 Conflict', desc: 'वेअरहाऊसमधील स्टॉक संपला! होस्ट कृती: Inventory मध्ये स्टॉक वाढवा.' },
      { key: 'AVG / P95 ms', desc: 'सरासरी आणि धीम्या ५% ऑर्डर्सचा वेग. ५००ms पेक्षा कमी म्हणजे उत्तम.' },
    ],
    verdictConflict: (n, sku) => `कृती आवश्यक: "${sku}" साठी ${n} ऑर्डर्स स्टॉक नसल्याने (409) अयशस्वी झाल्या. Inventory मध्ये स्टॉक भरा.`,
    verdictRateLimited: (succ, rl) => `ट्रॅफिक संरक्षण सुरू: ${succ} ऑर्डर्स सुरक्षित पूर्ण झाल्या आणि ${rl} विनंत्या (429) Redis ने नियंत्रित केल्या.`,
    verdictHealthy: (succ, p95) => `उत्कृष्ट क्षमता: सर्व ${succ} ऑर्डर्स कोणत्याही समस्येशिवाय पूर्ण झाल्या (P95: ${p95}ms).`,
  },
  bn: {
    guideTitle: 'হোস্ট গাইড: কী করতে হবে এবং ফলাফলের অর্থ',
    howToUseTitle: 'হোস্টের করণীয় ৩টি সহজ ধাপ',
    steps: [
      '1. Target SKU থেকে যে প্রোডাক্টটি টেস্ট করতে চান তা বেছে নিন।',
      '2. Qty / Order এবং Concurrency (একসাথে কতজন ক্রেতা অর্ডার করবে, যেমন ১০–৩০) সেট করুন।',
      '3. "Run Flash-Sale Test" ক্লিক করুন — আসল Redis লক ও PostgreSQL ট্রানজ্যাকশন টেস্ট হবে।',
    ],
    metricsTitle: 'প্রতিটি সংখ্যার অর্থ',
    metrics: [
      { key: 'Success (200)', desc: 'কোনো ওভারসেলিং ছাড়াই সফলভাবে কনফার্ম হওয়া অর্ডার।' },
      { key: '429 Rate-Limited', desc: 'একসাথে অতিরিক্ত চাপ আসায় Redis লক সিস্টেমকে রক্ষা করেছে।' },
      { key: '409 Conflict', desc: 'স্টক শেষ হয়ে গেছে! হোস্ট অ্যাকশন: Inventory পেজে স্টক বাড়ান।' },
      { key: 'AVG / P95 ms', desc: 'গড় এবং সবচেয়ে ধীর ৫% চেকআউট সময়। ৫০০ms-এর নিচে হলে ভালো।' },
    ],
    verdictConflict: (n, sku) => `পদক্ষেপ প্রয়োজন: "${sku}"-এর ${n}টি অর্ডার স্টক না থাকায় (409) ব্যর্থ হয়েছে। Inventory-তে স্টক যোগ করুন।`,
    verdictRateLimited: (succ, rl) => `ট্রাফিক সুরক্ষা সক্রিয়: ${succ}টি অর্ডার সফল হয়েছে এবং ${rl}টি অতিরিক্ত অনুরোধ (429) Redis দ্বারা নিয়ন্ত্রিত হয়েছে।`,
    verdictHealthy: (succ, p95) => `সিস্টেম সুস্থ: সব ${succ}টি অর্ডার কোনো সমস্যা ছাড়াই সম্পন্ন হয়েছে (P95: ${p95}ms)।`,
  },
  gu: {
    guideTitle: 'હોસ્ટ માર્ગદર્શિકા: શું કરવું અને પરિણામનો અર્થ',
    howToUseTitle: 'હોસ્ટ માટે ૩ સરળ પગલાં',
    steps: [
      '1. Target SKU માંથી જે પ્રોડક્ટ ટેસ્ટ કરવી હોય તે પસંદ કરો.',
      '2. Qty / Order અને Concurrency (એકસાથે આવતા ગ્રાહકો, દા.ત. ૧૦–૩૦) સેટ કરો.',
      '3. "Run Flash-Sale Test" દબાવો — અસલી Redis લોક અને PostgreSQL પર લોડ ટેસ્ટ થશે.',
    ],
    metricsTitle: 'દરેક આંકડાનો અર્થ',
    metrics: [
      { key: 'Success (200)', desc: 'ઓવરસેલિંગ વગર સફળતાપૂર્વક બુક થયેલા ઓર્ડર.' },
      { key: '429 Rate-Limited', desc: 'એકસાથે વધુ ટ્રાફિક આવતાં Redis લોકે સર્વરને સુરક્ષિત રાખ્યું.' },
      { key: '409 Conflict', desc: 'વેરહાઉસમાં સ્ટોક ખલાસ! હોસ્ટ પગલું: Inventory માં સ્ટોક ઉમેરો.' },
      { key: 'AVG / P95 ms', desc: 'સરેરાશ અને ધીમા ૫% ચેકઆઉટનો સમય. ૫૦૦ms થી ઓછું સારું છે.' },
    ],
    verdictConflict: (n, sku) => `પગલું જરૂરી: "${sku}" માટે ${n} ઓર્ડર સ્ટોક ન હોવાથી (409) નિષ્ફળ ગયા. Inventory માં સ્ટોક વધારો.`,
    verdictRateLimited: (succ, rl) => `ટ્રાફિક સુરક્ષા સક્રિય: ${succ} ઓર્ડર સફળ થયા અને ${rl} વિનંતીઓ (429) Redis દ્વારા નિયંત્રિત થઈ.`,
    verdictHealthy: (succ, p95) => `સંપૂર્ણ સ્વસ્થ ક્ષમતા: બધા ${succ} ઓર્ડર કોઈપણ ખામી વગર પૂર્ણ થયા (P95: ${p95}ms).`,
  },
  kn: {
    guideTitle: 'ಹೋಸ್ಟ್ ಮಾರ್ಗದರ್ಶಿ: ಏನು ಮಾಡಬೇಕು ಮತ್ತು ಫಲಿತಾಂಶದ ಅರ್ಥ',
    howToUseTitle: 'ಹೋಸ್ಟ್ ಮಾಡಬೇಕಾದ 3 ಸರಳ ಹಂತಗಳು',
    steps: [
      '1. Target SKU ನಲ್ಲಿ ನೀವು ಪರೀಕ್ಷಿಸಲು ಬಯಸುವ ಉತ್ಪನ್ನವನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
      '2. Qty / Order ಮತ್ತು Concurrency (ಒಟ್ಟಿಗೆ ಬರುವ ಖರೀದಿದಾರರು, ಉದಾ. 10–30) ಹೊಂದಿಸಿ.',
      '3. "Run Flash-Sale Test" ಒತ್ತಿರಿ — ನಿಜವಾದ Redis ಲಾಕ್ ಮತ್ತು PostgreSQL ಮೂಲಕ ಪರೀಕ್ಷೆ ನಡೆಯುತ್ತದೆ.',
    ],
    metricsTitle: 'ಪ್ರತಿ ಸಂಖ್ಯೆಯ ಅರ್ಥ',
    metrics: [
      { key: 'Success (200)', desc: 'ಓವರ್‌ಸೆಲ್ಲಿಂಗ್ ಇಲ್ಲದೆ ಸುರಕ್ಷಿತವಾಗಿ ದೃಢೀಕರಿಸಿದ ಆರ್ಡರ್‌ಗಳು.' },
      { key: '429 Rate-Limited', desc: 'ಒಂದೇ ಸಮಯದಲ್ಲಿ ಹೆಚ್ಚು ವಿನಂತಿಗಳು ಬಂದಾಗ Redis ಲಾಕ್ ಸರ್ವರ್ ಅನ್ನು ರಕ್ಷಿಸಿದೆ.' },
      { key: '409 Conflict', desc: 'ಸ್ಟಾಕ್ ಮುಗಿದಿದೆ! ಹೋಸ್ಟ್ ಕ್ರಮ: Inventory ಪುಟದಲ್ಲಿ ಸ್ಟಾಕ್ ಸೇರಿಸಿ.' },
      { key: 'AVG / P95 ms', desc: 'ಸರಾಸರಿ ಮತ್ತು ನಿಧಾನದ 5% ಚೆಕ್‌ಔಟ್ ವೇಗ. 500ms ಗಿಂತ ಕಡಿಮೆ ಉತ್ತಮ.' },
    ],
    verdictConflict: (n, sku) => `ಕ್ರಮ ಅಗತ್ಯ: "${sku}" ಗಾಗಿ ${n} ಆರ್ಡರ್‌ಗಳು ಸ್ಟಾಕ್ ಇಲ್ಲದೆ (409) ವಿಫಲವಾಗಿವೆ. Inventory ನಲ್ಲಿ ಸ್ಟಾಕ್ ಹೆಚ್ಚಿಸಿ.`,
    verdictRateLimited: (succ, rl) => `ಟ್ರಾಫಿಕ್ ರಕ್ಷಣೆ ಸಕ್ರಿಯ: ${succ} ಆರ್ಡರ್‌ಗಳು ಪೂರ್ಣಗೊಂಡಿವೆ ಮತ್ತು ${rl} ವಿನಂತಿಗಳನ್ನು (429) Redis ತಡೆದಿದೆ.`,
    verdictHealthy: (succ, p95) => `ಆರೋಗ್ಯಕರ ಸಾಮರ್ಥ್ಯ: ಎಲ್ಲಾ ${succ} ಆರ್ಡರ್‌ಗಳು ಯಾವುದೇ ದೋಷವಿಲ್ಲದೆ ಪೂರ್ಣಗೊಂಡಿವೆ (P95: ${p95}ms).`,
  },
};
