// Прибор v0.22: воспроизводит вечер 12.09.2026, когда продление окна не работало.
// Родитель продлил вечернее окно до 22:20 и снял норму задач, а ребёнка всё равно
// закрывало блок-экраном и разворачивало на гонку. Здесь ровно та обстановка:
// часы 22:02, заводское окно кончилось в 18:00, в кэше лежит продление с сервера.
// Вопрос прибора один: по чьим настройкам скрипт примет решение.
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');
const fs = require('fs'), os = require('os'), path = require('path');

const SRC = __dirname + '/11_unified_chess_control.js';
const SCRIPT = fs.readFileSync(SRC, 'utf8').replace('debug: false,', 'debug: true,');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ucc-cache-'));

const D = new Date();
const KEY = `${D.getFullYear()}-${String(D.getMonth() + 1).padStart(2, '0')}-${String(D.getDate()).padStart(2, '0')}`;

// То, что лежит на сервере и, значит, в кэше у ребёнка.
const REMOTE = {
  timeBlocker: { dateOverrides: { [KEY]: { patch: [{ index: 0, to: '14:20' }, { index: 1, to: '22:20' }] } } },
  tracker: { weeklyTargets: [20, 20, 20, 20, 20, 20, 20], specialTargets: { [KEY]: 0 } },
  lichess: { fullUnlockDates: [], fullUnlockWindows: {}, disableOnDates: [], fullUnlockTaskDisabledDates: [] },
  bulletReward: { forceOpenDates: [], disabledDates: [] }
};

const HTML = `<!doctype html><html><head><title>Анализ • Chess.com</title></head>
<body><div id="board">доска</div></body></html>`;

const CLOCK = `(() => {
  const fixed = new Date(${D.getFullYear()}, ${D.getMonth()}, ${D.getDate()}, 22, 2, 0).getTime();
  const started = Date.now(); const Real = Date;
  function now() { return fixed + (Real.now() - started); }
  class Mock extends Real {
    constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
    static now() { return now(); }
  }
  window.Date = Mock;
})();`;

// Кэш настроек и метка свежести — ровно то, что пишет сам скрипт после удачной
// загрузки файла. Решённых задач 31 при заводской норме 1000: без кэша гейт
// обязан развернуть, с кэшем норма равна нулю и разворачивать нечего.
const GM = `(() => {
  window.__store = {
    'unified_chess_control_remote_config': ${JSON.stringify(REMOTE)},
    'unified_chess_control_remote_meta': { updatedAt: Date.now(), sourceUrl: 'probe' },
    'racer_puzzles_72_${KEY}': 31
  };
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
  window.GM_addStyle = () => {};
  window.__nav = [];
  // Сеть глушим намеренно: проверяем именно кэш, а не удачу сетевого запроса.
  window.GM_xmlhttpRequest = (o) => { if (o.method === 'GET') window.__nav.push('fetch-config'); };
  const realReplace = window.location.replace.bind(window.location);
  window.__redirects = [];
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', userDataDir: PROFILE,
    args: ['--no-first-run', '--no-default-browser-check']
  });
  let fails = 0, total = 0;
  const check = (name, actual, expected) => {
    total++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) fails++;
    console.log((ok ? '✅ ' : '❌ ') + name + ' → ' + JSON.stringify(actual) + (ok ? '' : ' (ждали ' + JSON.stringify(expected) + ')'));
  };

  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e));

  const navigations = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith('https://www.chess.com/') || u.startsWith('https://lichess.org/')) {
      req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    } else req.abort();
  });

  await page.evaluateOnNewDocument(CLOCK);
  await page.evaluateOnNewDocument(GM);
  await page.evaluateOnNewDocument(SCRIPT);

  console.log('Обстановка: суббота 22:02, заводское окно кончилось в 18:00,');
  console.log('в кэше продление до 22:20 и норма 0, решено 31 задача.\n');

  await page.goto('https://www.chess.com/analysis/game/live/123456789', { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  const url = page.url();
  // Блок-экран ВСЕГДА присутствует в разметке, его лишь прячут стилем. Проверять
  // наличие элемента бессмысленно — меряем то, что реально видит ребёнок.
  const blocked = await page.evaluate(() => {
    const el = document.getElementById('ucc-time-blocker-overlay');
    if (!el) return false;
    const shown = getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    return shown;
  });
  const body = await page.evaluate(() => (document.body && document.body.textContent || '').slice(0, 200));

  console.log('── Куда попали ──');
  check('остались на анализе, не развернуло на гонку', /chess\.com\/analysis/.test(url), true);
  check('блок-экрана расписания нет', blocked, false);
  check('не показан экран «Доступ закрыт»', /Доступ закрыт|Раздел не разрешён|Время истекло/.test(body), false);

  console.log('\n── По чьим настройкам решали ──');
  const primed = logs.filter((l) => l.includes('config primed from cache'));
  check('кэш применён до решений', primed.length > 0, true);

  console.log('\n── Ошибки ──');
  check('ошибок страницы нет', logs.filter((l) => l.startsWith('PAGEERROR')), []);

  await browser.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
  process.exit(fails ? 1 : 0);
})();
