// Прибор v0.24.1: шторка Stylus обязана сниматься на РАЗРЕШЁННОЙ странице.
//
// Инцидент 20.09.2026. Ребёнку открыли ютуб (сперва грубо — выключили модуль
// urlBlocker целиком, потом разрешением v0.24), а он увидел «⏳ Загрузка…» и
// больше ничего. Журнал решений показывал за этот заход ровно одну строку
// (prime) — и ни блокировки, ни разворота, ни ошибки.
//
// Причина: скрипт живёт в 'use strict', а предохранитель отправки ставил
// перехват голым присваиванием `page.fetch = ...`. Там, где интринсик объявлен
// неперезаписываемым, это TypeError, который уносил ВСЮ инициализацию — вместе
// с armCurtain, снимающим шторку. До v0.24 этого не видел никто: любой сайт
// вне chess.com и lichess закрывался блок-экраном, а он ставит атрибут сам.
//
// Прибор меряет ровно одно: стоит ли на <html> атрибут data-ucc-armed, по
// которому парный userstyle решает, показывать страницу или «Загрузка…».
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');
const fs = require('fs'), os = require('os'), path = require('path');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ucc-curtain-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SCRIPT_PATH переопределяется, чтобы прогнать прибор против ПРЕДЫДУЩЕЙ версии
// и убедиться, что она падает — иначе зелёный результат ничего не доказывает.
const SCRIPT_PATH = process.env.SCRIPT_PATH || (__dirname + '/11_unified_chess_control.js');
const RAW = fs.readFileSync(SCRIPT_PATH, 'utf8');
const DAY = '2026-09-20';

function seed(name, value) {
  const needle = `const ${name} = [];`;
  if (!RAW.includes(needle)) throw new Error('не нашёл настройку ' + name);
  return RAW.replace(needle, `const ${name} = ${JSON.stringify(value)};`);
}
const SCRIPT_YT = seed('YOUTUBE_UNLOCK_DATES', [DAY]);

const HTML = `<!doctype html><html><head><title>страница</title></head><body>
<div id="real-page">контент</div></body></html>`;

// Заморозка интринсика — то, что делают сайты с жёсткой политикой (frozen
// intrinsics, Trusted Types) и часть расширений. Ставится ДО юзерскрипта.
const FREEZE = (names) => `(() => { ${names.map((n) => {
  const owner = n === 'sendBeacon' ? 'navigator' : 'window';
  return `try { Object.defineProperty(${owner}, '${n}', { value: ${owner}.${n}, writable: false, configurable: false }); } catch (e) {}`;
}).join(' ')} })();`;

function clockPatch(h, m) {
  return `(() => { const fixed = new Date(2026, 8, 20, ${h}, ${m}, 0).getTime(); const Real = Date;
    class Mock extends Real { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } }
    window.Date = Mock; })();`;
}
const GM_STUB = (solved) => `(() => { window.__store = {}; window.__solved = ${solved};
  window.GM_getValue = (k, d) => { if (k.startsWith('racer_puzzles_') || k.startsWith('daily_solved_') || k.startsWith('cached_solved_')) return window.__solved; return (k in window.__store ? window.__store[k] : d); };
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store); })();`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: PROFILE, args: ['--no-first-run', '--no-default-browser-check'] });
  let fails = 0, total = 0;
  const check = (n, a, e) => { total++; const ok = JSON.stringify(a) === JSON.stringify(e);
    if (!ok) fails++;
    console.log((ok ? '✅ ' : '❌ ') + n + ' → ' + JSON.stringify(a) + (ok ? '' : ' (ждали ' + JSON.stringify(e) + ')')); };

  async function visit({ url, host, script, freeze = [], solved = 1000, hour = 17 }) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
    await page.setRequestInterception(true);
    page.on('request', (r) => r.url().startsWith(host) ? r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML }) : r.abort());
    if (freeze.length) await page.evaluateOnNewDocument(FREEZE(freeze));
    await page.evaluateOnNewDocument(clockPatch(hour, 0));
    await page.evaluateOnNewDocument(GM_STUB(solved));
    await page.evaluateOnNewDocument(script);
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(1500);
    const out = await page.evaluate(() => ({
      armed: document.documentElement.getAttribute('data-ucc-armed'),
      realPage: !!document.getElementById('real-page'),
      blocker: (document.querySelector('.ucc-blocker h1') || {}).textContent || null,
      links: [...document.querySelectorAll('.ucc-links a')].map((a) => a.textContent)
    })).catch(() => ({ armed: null, realPage: false, blocker: '(ушли со страницы)' }));
    await page.close();
    return { ...out, errors };
  }

  console.log('\n── 1. Ютуб разрешён, fetch заморожен — ровно случай 20.09 ──');
  let r = await visit({ url: 'https://www.youtube.com/', host: 'https://www.youtube.com/', script: SCRIPT_YT, freeze: ['fetch'] });
  check('шторка снята', r.armed, '1');
  check('контент виден', r.realPage, true);
  check('инициализация не упала', r.errors, []);

  console.log('\n── 2. Заморожены все перехватываемые точки сразу ──');
  r = await visit({ url: 'https://www.youtube.com/', host: 'https://www.youtube.com/',
    script: SCRIPT_YT, freeze: ['fetch', 'sendBeacon', 'WebSocket', 'XMLHttpRequest'] });
  check('шторка снята', r.armed, '1');
  check('контент виден', r.realPage, true);

  console.log('\n── 3. Регрессия: обычная разрешённая страница lichess ──');
  r = await visit({ url: 'https://lichess.org/training', host: 'https://lichess.org/', script: SCRIPT_YT });
  check('шторка снята', r.armed, '1');
  check('контент виден', r.realPage, true);

  console.log('\n── 4. Регрессия: закрытая страница по-прежнему закрыта ──');
  // Блок-экран шторку снимает сам — иначе вместо объяснения ребёнок увидит «Загрузка…».
  // solved: 0 обязательно. При выполненной норме включается награда — свободный
  // lichess, — и /inbox открыт законно; прибор ловил бы не то, что проверяет.
  r = await visit({ url: 'https://lichess.org/inbox', host: 'https://lichess.org/', script: SCRIPT_YT, solved: 0 });
  check('блок-экран показан', r.blocker, 'Раздел не разрешён');
  check('шторка снята и на нём', r.armed, '1');
  r = await visit({ url: 'https://www.youtube.com/', host: 'https://www.youtube.com/', script: RAW, freeze: ['fetch'] });
  check('ютуб БЕЗ разрешения закрыт', r.blocker, 'Страница заблокирована');
  check('шторка снята и на нём', r.armed, '1');

  console.log('\n── 4б. Поиск открывается вместе с ютубом, остальной гугл — нет ──');
  // Ребёнок не набирает адрес целиком: слово из адресной строки уходит в поиск,
  // и блок-экран выпадал на google.com (журнал 21.09, 09:05 — за всё утро ни
  // одного обращения к youtube.com). С v0.24.3 поиск ходит вместе с ютубом.
  r = await visit({ url: 'https://www.google.com/search?q=youtube', host: 'https://www.google.com/', script: SCRIPT_YT });
  check('поиск открыт, пока действует разрешение', [r.blocker, r.realPage], [null, true]);
  r = await visit({ url: 'https://www.google.com/search?q=youtube', host: 'https://www.google.com/', script: RAW });
  check('без разрешения поиск закрыт', r.blocker, 'Доступ закрыт');

  // А вот сосед по *.google.com обязан остаться закрытым: там почта, диск и
  // магазин расширений, которым родительский контроль и сносят. Заодно это
  // единственное место, где видно ссылку-дорогу на блок-экране.
  r = await visit({ url: 'https://mail.google.com/', host: 'https://mail.google.com/', script: SCRIPT_YT });
  check('почта закрыта и при действующем разрешении', r.blocker, 'Доступ закрыт');
  check('и блок-экран показывает дорогу к ютубу', r.links && r.links[0], 'YouTube — сегодня открыт');
  r = await visit({ url: 'https://mail.google.com/', host: 'https://mail.google.com/', script: RAW });
  check('без разрешения ссылки на ютуб нет', (r.links || []).some((t) => t.includes('YouTube')), false);

  console.log('\n── 5. Регрессия: предохранитель отправки жив там, где нужен ──');
  // На хосте с правилами отправки замороженный интринсик — отказ последней линии,
  // и страница обязана остаться под шторкой, а не открыться.
  // Снова solved: 0 — при свободном lichess правила отправки сняты, и упавший
  // предохранитель там ничего не стоит (это и есть штатное поведение).
  r = await visit({ url: 'https://lichess.org/training', host: 'https://lichess.org/', solved: 0,
    script: SCRIPT_YT.replace("function patchSlot(owner, key, make, label) {",
                              "function patchSlot(owner, key, make, label) { throw new Error('проверка: предохранитель не встал');") });
  check('lichess остаётся закрытым при отказе предохранителя', r.armed, null);

  await browser.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ПРИБОР УПАЛ:', e); process.exit(2); });
setTimeout(() => { console.error('ТАЙМАУТ'); process.exit(3); }, 170000);
