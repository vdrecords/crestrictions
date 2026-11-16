// Прибор v0.28.3: партии lichess по новому адресу /game/<id>.
//
// Журнал 16.11.2026: lichess перенёс партии на /game/<id> (12 знаков у игрока,
// 8 у зрителя). Блиц 3+0, найденный в лобби, получил блок-экран «раздел не в
// списке разрешённых» и был брошен. Проверяем в настоящем Chrome: блиц на новом
// адресе открыт, пуля — доска спрятана, как на старом адресе.
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');
const fs = require('fs'), os = require('os'), path = require('path');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ucc-game-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCRIPT_PATH = process.env.SCRIPT_PATH || (__dirname + '/11_unified_chess_control.js');
// Награда за норму на сервере выключена (fullUnlockOnTaskTarget: false), а заводская
// при засчитанной норме открывает lichess целиком — стенд мерил бы свободный день.
const REWARD_ON = 'const LICHESS_FULL_UNLOCK_ON_TASK_TARGET = true;';
const RAW = fs.readFileSync(SCRIPT_PATH, 'utf8');
if (!RAW.includes(REWARD_ON)) throw new Error('нет заводской награды за норму');
// Награда пулей на сервере тоже выключена (bulletReward.enabled: false), а заводская
// при 17:00 и засчитанной норме открыла бы пулю — проверять было бы нечего.
const BULLET_ON = 'const BULLET_REWARD_ENABLED = true;';
if (!RAW.includes(BULLET_ON)) throw new Error('нет заводской награды пулей');
const SCRIPT = RAW.replace(REWARD_ON, 'const LICHESS_FULL_UNLOCK_ON_TASK_TARGET = false;')
  .replace(BULLET_ON, 'const BULLET_REWARD_ENABLED = false;');

const game = (setup) => `<!doctype html><html><head><title>Партия • lichess.org</title></head><body>
  <div id="real-page"><main class="round"><div class="round__app"><div class="round__app__board main-board"><div class="cg-wrap" id="board">доска</div></div></div>
  <aside class="game__meta"><section><div class="game__meta__infos"><div class="setup">${setup}</div></div></section></aside></main></div></body></html>`;
const PAGES = {
  'https://lichess.org/game/0wlBpELzurgL': game('3+0 • Рейтинговая • Блиц'),
  'https://lichess.org/game/0wlBpELz': game('3+0 • Рейтинговая • Блиц'),
  'https://lichess.org/game/AAAAbbbbCCCC': game('1+0 • Рейтинговая • Пуля'),
  'https://lichess.org/0wlBpELzurgL': game('3+0 • Рейтинговая • Блиц'),
  'https://lichess.org/AAAAbbbbCCCC': game('1+0 • Рейтинговая • Пуля')
};
const LEAF = `<!doctype html><html><head><title>x</title></head><body><div id="real-page">ok</div></body></html>`;

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
    args: ['--no-first-run', '--no-default-browser-check'] });
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
    const st = await page.evaluate(() => {
      const b = document.getElementById('board');
      return { open: !!document.getElementById('real-page'),
        board: !!b && getComputedStyle(b).display !== 'none' && getComputedStyle(b.parentElement).display !== 'none' };
    }).catch((e) => ({ error: String(e).slice(0, 80) }));
    await page.close();
    return st;
  }
  const cases = [
    ['https://lichess.org/game/0wlBpELzurgL', { open: true, board: true }, 'блиц 3+0, игрок, новый адрес'],
    ['https://lichess.org/game/0wlBpELz', { open: true, board: true }, 'блиц 3+0, зритель, новый адрес'],
    ['https://lichess.org/game/AAAAbbbbCCCC', { open: true, board: false }, 'пуля 1+0, новый адрес — доска спрятана'],
    ['https://lichess.org/0wlBpELzurgL', { open: true, board: true }, 'блиц, старый адрес'],
    ['https://lichess.org/AAAAbbbbCCCC', { open: true, board: false }, 'пуля, старый адрес — доска спрятана'],
    ['https://lichess.org/game/export/0wlBpELz', { open: false, board: false }, '/game/export закрыт'],
    ['https://lichess.org/game/0wlBpELzurgL/extra', { open: false, board: false }, '/game/<id>/вглубь закрыт']
  ];
  for (const [url, want, what] of cases) check(what, await visit(url), want);
  await browser.close();
  console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
