// Прибор v0.28.2: проверка Cloudflare (Turnstile) на входе lichess/chess.com.
//
// Журнал 16.11.2026: на lichess.org/login фрейм challenges.cloudflare.com
// получал блок-экран «домен не в списке разрешённых», lichess писал
// «Captcha error: 300030», войти по паролю было нельзя. Проверяем в настоящем
// Chrome (ancestorOrigins заполняет браузер): фрейм внутри шахматного сайта
// работает, верхней страницей и внутри чужого фрейма — закрыт.
// Вход по ссылке на почту (/auth/magic-link) правка не трогает: это верхняя
// страница lichess, фильтр разделов прежний. Здесь его не проверить — без кэша
// настроек скрипт откладывает запрет раздела до ответа сети, а сети в приборе нет.
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');
const fs = require('fs'), os = require('os'), path = require('path');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ucc-cf-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCRIPT_PATH = process.env.SCRIPT_PATH || (__dirname + '/11_unified_chess_control.js');
const SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');
const CF = 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/f/av0/rc/abc';

const PAGES = {
  'https://lichess.org/login': `<!doctype html><html><head><title>Sign in • lichess.org</title></head><body>
    <div id="real-page">login</div><iframe id="cf" src="${CF}"></iframe></body></html>`,
  'https://www.chess.com/login': `<!doctype html><html><head><title>Log In - Chess.com</title></head><body>
    <div id="real-page">login</div><iframe id="cf" src="${CF}"></iframe></body></html>`,
  'https://lichess.org/training': `<!doctype html><html><head><title>Задачи</title></head><body>
    <div id="real-page">training</div><iframe id="other" src="https://example.org/frame"></iframe></body></html>`,
  'https://example.org/frame': `<!doctype html><html><head><title>Чужой</title></head><body>
    <div id="real-page">x</div><iframe id="cf" src="${CF}"></iframe></body></html>`
};
const LEAF = `<!doctype html><html><head><title>Turnstile</title></head><body><div id="real-page">ok</div></body></html>`;

// 17:00 понедельника 16.11.2026 — внутри заводского окна 16:00–18:00, норма выполнена.
const clock = `(() => { const fixed = new Date(2026, 10, 16, 17, 0, 0).getTime(); const Real = Date;
  class Mock extends Real { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } }
  window.Date = Mock; })();`;
const GM = `(() => { window.__store = {};
  window.GM_getValue = (k, d) => { if (k.startsWith('racer_puzzles_')) return 100000; return (k in window.__store) ? window.__store[k] : d; };
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
  window.GM_xmlhttpRequest = () => {}; })();`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: PROFILE,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-site-isolation-trials',
      '--disable-features=IsolateOrigins,site-per-process'] });
  let fails = 0, total = 0;
  const check = (n, a, e) => { total++; const ok = JSON.stringify(a) === JSON.stringify(e);
    if (!ok) fails++;
    console.log((ok ? '✅ ' : '❌ ') + n + ' → ' + JSON.stringify(a) + (ok ? '' : ' (ждали ' + JSON.stringify(e) + ')')); };

  async function visit(url) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const body = PAGES[r.url()] || (r.resourceType() === 'document' ? LEAF : null);
      if (!body) return r.abort();
      return r.respond({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body });
    });
    await page.evaluateOnNewDocument(clock);
    await page.evaluateOnNewDocument(GM);
    await page.evaluateOnNewDocument(SCRIPT);
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(2500);
    return page;
  }
  const state = (frame) => frame.evaluate(() => ({
    real: !!document.getElementById('real-page'),
    reasons: (window.__store && window.__store.unified_chess_control_telemetry_queue || [])
      .filter((r) => r.event === 'urlblock').map((r) => r.reason)
  })).catch((e) => ({ error: String(e).slice(0, 80) }));
  const cfFrame = (page) => page.frames().find((f) => f.url().startsWith('https://challenges.cloudflare.com/'));

  console.log('\n── 1. Вход lichess: проверка Cloudflare во фрейме работает ──');
  let page = await visit('https://lichess.org/login');
  check('страница входа открыта', (await state(page.mainFrame())).real, true);
  let f = cfFrame(page);
  check('фрейм Cloudflare найден', !!f, true);
  let s = f ? await state(f) : {};
  check('фрейм Cloudflare показывает содержимое', s.real, true);
  check('в журнале фрейма — служебный фрейм', (s.reasons || [])[0], 'служебный фрейм шахматного сайта');
  await page.close();

  console.log('\n── 2. Вход chess.com: то же ──');
  page = await visit('https://www.chess.com/login');
  f = cfFrame(page);
  s = f ? await state(f) : {};
  check('фрейм Cloudflare на chess.com показывает содержимое', s.real, true);
  await page.close();

  console.log('\n── 3. Cloudflare верхней страницей — закрыт ──');
  page = await visit(CF);
  s = await state(page.mainFrame());
  check('challenges.cloudflare.com вкладкой закрыт', s.real, false);
  check('причина', (s.reasons || [])[0], 'домен не в списке разрешённых');
  await page.close();

  console.log('\n── 4. Cloudflare во фрейме чужого фрейма на lichess — закрыт ──');
  // Верх — lichess, но непосредственный родитель — чужой сайт; ancestorOrigins
  // последним элементом даёт верх. Чужой фрейм сам закрыт, вложенный в него
  // Cloudflare не загрузится вовсе — достаточно, что чужой фрейм закрыт.
  page = await visit('https://lichess.org/training');
  const other = page.frames().find((fr) => fr.url().startsWith('https://example.org/'));
  check('чужой фрейм на lichess закрыт', other ? (await state(other)).real : false, false);
  await page.close();

  await browser.close();
  console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
