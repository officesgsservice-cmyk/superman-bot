/**
 * СантехПро — Ақылды іздеу серверi
 * 500+ тауар үшін оңтайландырылған
 *
 * Іске қосу: node server.js
 * Каталог жаңарту: catalog.json файлын ауыстырып, серверді қайта іске қосыңыз
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT         = 3001;
const CATALOG_FILE = path.join(__dirname, 'catalog.json');
const MAX_RESULTS  = 15;  // Бір сұрауға максимум тауар

// ══════════════════════════════════════════════════
//  КАТАЛОГТЫ ЖҮКТЕУ
// ══════════════════════════════════════════════════
let CATALOG = {};
let FLAT    = [];   // барлық тауарлардың жазық тізімі

function loadCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) {
    console.warn('⚠️  catalog.json табылмады. convert.js іске қосыңыз.');
    return;
  }
  CATALOG = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));

  // Жазық тізім жасаймыз (іздеу үшін)
  FLAT = [];
  for (const [group, items] of Object.entries(CATALOG)) {
    for (const item of items) {
      FLAT.push({ ...item, group });
    }
  }

  const total = FLAT.length;
  console.log(`📦 Каталог жүктелді: ${Object.keys(CATALOG).length} категорий, ${total} тауар`);
}

loadCatalog();

// Каталог файлы өзгерсе — автоматты қайта жүктеу
fs.watch(CATALOG_FILE, () => {
  console.log('🔄 catalog.json өзгерді, қайта жүктелуде...');
  setTimeout(loadCatalog, 300);
});

// ══════════════════════════════════════════════════
//  АҚЫЛДЫ ІЗДЕУ
//  Клиент сұрауы бойынша тиісті тауарлар іздейді
// ══════════════════════════════════════════════════
function searchProducts(query) {
  if (!query || FLAT.length === 0) return [];

  const q = query.toLowerCase();

  // Іздеу сөздері (синонимдер)
  const synonyms = {
    'кран':        ['кран', 'смеситель', 'кранч'],
    'смеситель':   ['смеситель', 'кран', 'кранч'],
    'унитаз':      ['унитаз', 'toilet', 'туалет'],
    'ванна':       ['ванна', 'ванночка', 'bath'],
    'душ':         ['душ', 'душевой', 'душевая', 'shower'],
    'труба':       ['труба', 'трубы', 'трубопровод'],
    'радиатор':    ['радиатор', 'батарея', 'батареи'],
    'бойлер':      ['бойлер', 'водонагреватель', 'нагреватель'],
    'фитинг':      ['фитинг', 'фитинги', 'муфта', 'тройник'],
    'полотенцесушитель': ['полотенцесушитель', 'сушитель'],
    'зеркало':     ['зеркало', 'айна'],
    // Қазақша синонимдер
    'кранч':       ['кран', 'смеситель'],
    'ваннаа':      ['ванна'],
    'трубалар':    ['труба', 'трубы'],
    'радиаторлар': ['радиатор', 'батарея'],
    'бойлерлер':   ['бойлер', 'водонагреватель'],
  };

  // Іздеу сөздерін кеңейту
  let searchTerms = [q];
  for (const [kk, list] of Object.entries(synonyms)) {
    if (q.includes(kk)) {
      searchTerms = [...searchTerms, ...list];
    }
  }

  // Тауарларды ұпаймен бағалаймыз
  const scored = FLAT.map(item => {
    const nameL  = (item.name   || '').toLowerCase();
    const groupL = (item.group  || '').toLowerCase();
    const artL   = (item.article || '').toLowerCase();
    let score    = 0;

    for (const term of searchTerms) {
      if (nameL.includes(term))  score += 10;
      if (groupL.includes(term)) score += 5;
      if (artL.includes(term))   score += 8;
      // Жеке сөздер бойынша іздеу
      const words = term.split(/\s+/);
      for (const w of words) {
        if (w.length > 2 && nameL.includes(w))  score += 3;
        if (w.length > 2 && groupL.includes(w)) score += 2;
      }
    }
    return { ...item, score };
  });

  return scored
    .filter(i => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);
}

// ══════════════════════════════════════════════════
//  ТАУАРЛАРДЫ МӘТІНГЕ АЙНАЛДЫРУ
// ══════════════════════════════════════════════════
function formatProducts(items) {
  if (!items.length) return "Бұл сұрауға сәйкес тауар табылмады.";
  let text = `Табылды: ${items.length} тауар:\n`;
  let prevGroup = '';
  for (const item of items) {
    if (item.group !== prevGroup) {
      text += `\n${item.group}:\n`;
      prevGroup = item.group;
    }
    text += `  • ${item.name}`;
    if (item.article) text += ` [${item.article}]`;
    text += ` — ${item.price} ₸`;
    if (item.unit && item.unit !== 'дана') text += `/${item.unit}`;
    if (item.stock !== undefined) text += ` (қоймада: ${item.stock})`;
    text += '\n';
  }
  return text;
}

// ══════════════════════════════════════════════════
//  ЖҮЙЕЛІК ПРОМПТ
// ══════════════════════════════════════════════════
function buildSystem(lang, ch) {
  const chLabel = ch === 'wa' ? 'WhatsApp' : 'Instagram';
  const style   = ch === 'wa'
    ? 'Жылы, достық тон. 2-3 эмодзи. Қысқа хабарлама.'
    : 'Заманауи тон. 1-2 эмодзи. Ықшам.';
  const langRule = lang === 'kk'
    ? 'Жауапты ТЕК қазақша жаз. Клиент орысша жазса да — қазақша жауап бер.'
    : 'Отвечай ТОЛЬКО на русском, независимо от языка клиента.';

  const total = FLAT.length;
  const groups = Object.keys(CATALOG).join(', ');

  return `Ты AI-консультант магазина «СТРОЙМАРКЕТ SUPERMAN».
Клиент пишет через ${chLabel}.

О МАГАЗИНЕ:
- Название: СТРОЙМАРКЕТ SUPERMAN
- В наличии ${total}+ товаров
- Категории: ${groups}
- Режим работы: 09:00–20:00, ежедневно
- Адрес: Атырау, мкр. Нурсая, ул. Акбаян, 1А
- Телефон (сотовый): +7 702 000 41 82
- WhatsApp: +7 776 875 39 73
- Если клиент спрашивает адрес или контакты — давай оба номера и адрес

ПРАВИЛА:
- Если в сообщении есть результаты поиска товаров — используй их
- Называй точную цену и артикул из каталога
- Максимум 4-5 предложений
- В конце предложи конкретный следующий шаг
- На вопросы не по теме вежливо откажи

СТИЛЬ: ${style}
ЯЗЫК: ${langRule}`;
}

// ══════════════════════════════════════════════════
//  ТІЛДІ АНЫҚТАУ
// ══════════════════════════════════════════════════
function detectLang(text) {
  if (/[әіңғүұқөһ]/i.test(text)) return 'kk';
  if (/[а-яё]/i.test(text)) return 'ru';
  return 'ru';
}

// ══════════════════════════════════════════════════
//  HTTP СЕРВЕР
// ══════════════════════════════════════════════════
const server = http.createServer((req, res) => {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // /chat — Anthropic API-ға прокси + ақылды іздеу
  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed  = JSON.parse(body);
        const apiKey  = parsed.apiKey;
        const channel = parsed.channel || 'wa';
        delete parsed.apiKey;
        delete parsed.channel;

        // Соңғы хабарламадан іздеу сөзін алу
        const lastMsg = parsed.messages?.slice(-1)[0]?.content || '';
        const found   = searchProducts(lastMsg);
        const lang    = detectLang(lastMsg);

        // System prompt жасау
        let system = buildSystem(lang, channel);

        // Табылған тауарларды қосамыз
        if (found.length > 0) {
          system += '\n\n' + formatProducts(found);
        }

        parsed.system = system;

        const postData = JSON.stringify(parsed);
        const options  = {
          hostname: 'api.anthropic.com',
          path:     '/v1/messages',
          method:   'POST',
          headers: {
            'Content-Type':   'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'x-api-key':      apiKey,
            'anthropic-version': '2023-06-01'
          }
        };

        const proxyReq = https.request(options, proxyRes => {
          let data = '';
          proxyRes.on('data', c => data += c);
          proxyRes.on('end', () => {
            res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(data);
          });
        });

        proxyReq.on('error', err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: err.message } }));
        });

        proxyReq.write(postData);
        proxyReq.end();

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Bad request' } }));
      }
    });
    return;
  }

  // /search?q=... — тауар іздеу (тексеру үшін)
  if (req.method === 'GET' && req.url.startsWith('/search')) {
    const q = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
    const results = searchProducts(q);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ query: q, count: results.length, results }, null, 2));
    return;
  }

  // /catalog — толық каталог
  if (req.method === 'GET' && req.url === '/catalog') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ total: FLAT.length, catalog: CATALOG }, null, 2));
    return;
  }

  // /reload — каталогты қайта жүктеу
  if (req.method === 'POST' && req.url === '/reload') {
    loadCatalog();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, total: FLAT.length }));
    return;
  }

  // / — chatbot HTML
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const filePath = path.join(__dirname, 'chatbot.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('chatbot.html табылмады');
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('✅ СТРОЙМАРКЕТ SUPERMAN — AI Бот запущен!!');
  console.log('');
  console.log('👉 Чат-бот:   http://localhost:' + PORT);
  console.log('🔍 Іздеу:     http://localhost:' + PORT + '/search?q=кран');
  console.log('📋 Каталог:   http://localhost:' + PORT + '/catalog');
  console.log('🔄 Жаңарту:   POST http://localhost:' + PORT + '/reload');
  console.log('');
  console.log('Остановить: Ctrl + C');
  console.log('');
});
