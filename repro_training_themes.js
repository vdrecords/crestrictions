// Прибор v0.28.6: темы задач lichess открываются после дневной нормы.
//
// Просьба сына 18.11.2026: решил норму — пусть откроется /training/themes и
// можно заходить внутрь темы (/training/fork, /training/mateIn2 …) и решать.
// До нормы — как раньше: трекер уводит с любых задач на /racer (норма решается там).
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');
const fs = require('fs'), os = require('os'), path = require('path');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ucc-themes-'));
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


const THEMES = `<!doctype html><html><head><title>Темы • lichess.org</title></head><body><div id="real-page">
  <a id="l-mate" href="/training/mateIn2">Мат в 2</a><a id="l-fork" href="/training/fork">Вилка</a></div></body></html>`;
const LEAF = `<!doctype html><html><head><title>x</title></head><body><div id="real-page">ok</div></body></html>`;

const clock = `(() => { const fixed = new Date(2026, 10, 16, 17, 0, 0).getTime(); const Real = Date;
  class Mock extends Real { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } }
  window.Date = Mock; })();`;
const GM = (solved) => `(() => { window.__store = {}; window.__solved = ${solved};
  window.GM_getValue = (k, d) => { if (k.startsWith('racer_puzzles_')) return window.__solved; return (k in window.__store) ? window.__store[k] : d; };
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
  async function open(url, solved) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (r.resourceType() !== 'document') return r.abort();
      const body = r.url() === 'https://lichess.org/training/themes' ? THEMES : LEAF;
      return r.respond({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body });
    });
    await page.evaluateOnNewDocument(clock);
    await page.evaluateOnNewDocument(GM(solved));
    await page.evaluateOnNewDocument(SCRIPT);
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(2500);
    return page;
  }
  const where = async (url, solved) => { const p = await open(url, solved); const u = p.url(); await p.close(); return u; };
  const links = (p) => p.evaluate(() => ['l-mate', 'l-fork'].map((id) => {
    const a = document.getElementById(id); return !!a && getComputedStyle(a).display !== 'none'; }));

  const DONE = 100000, ZERO = 0;
  for (const [url, solved, want, what] of [
    ['https://lichess.org/training/fork', DONE, 'https://lichess.org/training/fork', 'норма решена: тема «вилка» открыта'],
    ['https://lichess.org/training/mateIn2', DONE, 'https://lichess.org/training/mateIn2', 'норма решена: «мат в 2» (была в чёрном списке) открыта'],
    ['https://lichess.org/training/fork/K69di', DONE, 'https://lichess.org/training/fork/K69di', 'норма решена: задача внутри темы открыта'],
    ['https://lichess.org/training/themes', DONE, 'https://lichess.org/training/themes', 'норма решена: список тем открыт'],
    ['https://lichess.org/training/fork', ZERO, 'https://lichess.org/racer', 'нормы нет: тема → /racer'],
    ['https://lichess.org/training/mateIn2', ZERO, 'https://lichess.org/racer', 'нормы нет: «мат в 2» → /racer'],
    ['https://lichess.org/training/themes', ZERO, 'https://lichess.org/racer', 'нормы нет: список тем → /racer, как раньше'],
    ['https://lichess.org/study', DONE, 'https://lichess.org/study', '/study по-прежнему не открывается (блок-экран)']
  ]) {
    if (url.endsWith('/study')) {
      const p = await open(url, solved);
      check(what, await p.evaluate(() => !!document.getElementById('real-page')), false); await p.close(); continue;
    }
    check(what, await where(url, solved), want);
  }

  // Ссылки на странице тем после нормы: «мат в 2» (раньше прятался CSS) виден, клик ведёт в тему.
  let p = await open('https://lichess.org/training/themes', DONE);
  check('норма решена: ссылки «мат в 2» и «вилка» видны', await links(p), [true, true]);
  await Promise.all([p.waitForNavigation({ timeout: 5000 }).catch(() => {}), p.click('#l-mate')]);
  await sleep(1500);
  check('клик по «мат в 2» после нормы ведёт в тему', p.url(), 'https://lichess.org/training/mateIn2');
  await p.close();

  await browser.close();
  console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
