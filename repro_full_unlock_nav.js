// Прибор №2: навигационные сценарии (urlBlocker + гейт трекера) в настоящем Chrome.
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');
const fs = require('fs'), os = require('os'), path = require('path');
const SCRIPT = fs.readFileSync('/Users/vd/Documents/Claude/tampermonkey/chess-control/crestrictions-main/11_unified_chess_control.js', 'utf8');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ucc-e2e2-'));
const HTML = `<!doctype html><html><head><title>lichess.org</title></head><body><div id="real-page">настоящая страница lichess</div></body></html>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clockPatch(y, mo, d, h) {
  return `(() => { const fixed = new Date(${y}, ${mo}, ${d}, ${h}, 0, 0).getTime(); const Real = Date;
    class Mock extends Real { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } }
    window.Date = Mock; })();`;
}
const GM_STUB = (solved) => `(() => { window.__store = {}; window.__solved = ${solved};
  window.GM_getValue = (k, dflt) => { if (k.startsWith('racer_puzzles_') || k.startsWith('daily_solved_') || k.startsWith('cached_solved_')) return window.__solved; return (k in window.__store ? window.__store[k] : dflt); };
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store); })();`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: PROFILE, args: ['--no-first-run', '--no-default-browser-check'] });
  const res = [];
  const check = (n, a, e) => { const ok = JSON.stringify(a) === JSON.stringify(e); res.push(ok); console.log((ok ? '✅ ' : '❌ ') + n + ' → ' + JSON.stringify(a) + (ok ? '' : ' (ждали ' + JSON.stringify(e) + ')')); };

  async function visit({ date, hour, solved, url }) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (r) => r.url().startsWith('https://lichess.org/') ? r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML }) : r.abort());
    await page.evaluateOnNewDocument(clockPatch(date[0], date[1], date[2], hour));
    await page.evaluateOnNewDocument(GM_STUB(solved));
    await page.evaluateOnNewDocument(SCRIPT);
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(1500);
    const out = await page.evaluate(() => ({
      url: location.pathname,
      heading: (document.querySelector('.ucc-blocker h1') || {}).textContent || null,
      filterStyleEl: !!document.getElementById('ucc-lichess-filter-style'),
      timeOverlayEl: !!document.getElementById('ucc-time-blocker-overlay'),
      href: location.href,
      timeOverlay: (() => { const el = document.getElementById('ucc-time-blocker-overlay'); return !!el && getComputedStyle(el).display !== 'none'; })(),
      realPage: !!document.getElementById('real-page'),
      filterCss: (document.getElementById('ucc-lichess-filter-style') || {}).textContent ? 'есть' : 'пусто'
    }));
    await page.close();
    return out;
  }

  const UNLOCK_DAY = [2026, 7, 20];   // 20.08.2026 — дата в LICHESS_FULL_UNLOCK_DATES (чт)
  const NORMAL_DAY = [2026, 7, 24];   // 24.08.2026 — обычный понедельник

  console.log('\n── D. Особый день, 17:00 (внутри окна), задач 0 ──');
  let r = await visit({ date: UNLOCK_DAY, hour: 17, solved: 0, url: 'https://lichess.org/inbox' });
  check('/inbox открыт (раздел не заблокирован)', r.realPage && !r.heading, true);
  check('блок-экран расписания не показан', r.timeOverlay, false);
  check('фильтр lichess снят', r.filterCss, 'пусто');
  r = await visit({ date: UNLOCK_DAY, hour: 17, solved: 0, url: 'https://lichess.org/training' });
  check('нет редиректа на /racer при невыполненной норме', r.url, '/training');

  console.log('\n── E. Тот же особый день, 08:00 (ВНЕ окна расписания) ──');
  r = await visit({ date: UNLOCK_DAY, hour: 8, solved: 0, url: 'https://lichess.org/inbox' });
  check('/inbox закрыт', r.heading, 'Раздел не разрешён');
  // Блок-экран расписания на /training в закрытые часы этим прибором не измеряется:
  // скрипт здесь внедряется РАНЬШЕ, чем это делает Tampermonkey (documentElement ещё
  // null), и документ рвётся на редиректе трекера. Отдельный A/B (ab.js) показал, что
  // v0.17.2 и v0.18.0 в этом сценарии ведут себя ОДИНАКОВО — регрессии нет.

  console.log('\n── F. Обычный день, 17:00, норма (300) НЕ выполнена ──');
  r = await visit({ date: NORMAL_DAY, hour: 17, solved: 0, url: 'https://lichess.org/inbox' });
  check('/inbox закрыт', r.heading, 'Раздел не разрешён');
  r = await visit({ date: NORMAL_DAY, hour: 17, solved: 0, url: 'https://lichess.org/training' });
  check('редирект на /racer работает', r.url, '/racer');

  console.log('\n── G. Обычный день, 17:00, норма ВЫПОЛНЕНА (награда) ──');
  r = await visit({ date: NORMAL_DAY, hour: 17, solved: 300, url: 'https://lichess.org/inbox' });
  check('/inbox открыт', r.realPage && !r.heading, true);
  check('фильтр lichess снят', r.filterCss, 'пусто');
  r = await visit({ date: NORMAL_DAY, hour: 22, solved: 300, url: 'https://lichess.org/inbox' });
  check('в 22:00 (вне окна) /inbox снова закрыт', r.heading, 'Раздел не разрешён');

  await browser.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const bad = res.filter((x) => !x).length;
  console.log(bad ? `\n❌ ПРОВАЛЕНО ${bad} из ${res.length}` : `\n✅ ВСЕ ${res.length} ПРОВЕРОК ПРОЙДЕНЫ`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ПРИБОР УПАЛ:', e); process.exit(2); });
setTimeout(() => { console.error('ТАЙМАУТ'); process.exit(3); }, 180000);
