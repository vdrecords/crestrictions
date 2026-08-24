// End-to-end прибор: настоящий Chrome, поддельная страница lichess.org, реальный
// userscript целиком. Проверяем ДИНАМИКУ: разблокировка включается по норме задач
// без перезагрузки и выключается по окончании окна расписания.
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = fs.readFileSync('/Users/vd/Documents/Claude/tampermonkey/chess-control/crestrictions-main/11_unified_chess_control.js', 'utf8');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ucc-e2e-'));

const HTML = `<!doctype html><html><head><title>Гонка • lichess.org</title></head><body>
<div class="racer">racer</div>
<a href="/inbox">Входящие</a>
<a href="/training/mate">Маты</a>
<a class="lobby__start__button lobby__start__button--friend">Бросить вызов другу</a>
<section class="mchat">чат зрителей</section>
</body></html>`;

// Фиксируем время: понедельник 24.08.2026. START_H задаётся из ENV.
function clockPatch(hour, minute) {
  return `(() => {
    const fixed = new Date(2026, 7, 24, ${hour}, ${minute}, 0).getTime();
    const started = Date.now();
    const Real = Date;
    // Ускоряем ход времени в 60 раз: 1 реальная секунда = 1 минута на часах,
    // иначе закрытие окна расписания пришлось бы ждать вживую.
    function now() { return fixed + (Real.now() - started) * 60; }
    class Mock extends Real {
      constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
      static now() { return now(); }
    }
    window.Date = Mock;
  })();`;
}

const GM_STUB = `(() => {
  window.__store = {};
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: PROFILE,
    args: ['--no-first-run', '--no-default-browser-check']
  });
  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(ok);
    console.log((ok ? '✅ ' : '❌ ') + name + ' → ' + JSON.stringify(actual) + (ok ? '' : ' (ждали ' + JSON.stringify(expected) + ')'));
  };

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().startsWith('https://lichess.org/')) req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    else req.abort();
  });

  // Часы стартуют в 17:00 — до конца вечернего окна (18:00) час «часов»,
  // то есть 60 реальных секунд при ускорении ×60. Тик таймблокера — 10 с реальных.
  await page.evaluateOnNewDocument(clockPatch(17, 0));
  await page.evaluateOnNewDocument(GM_STUB);
  await page.evaluateOnNewDocument(SCRIPT);
  await page.goto('https://lichess.org/racer', { waitUntil: 'domcontentloaded' });
  await sleep(1200);

  const probe = () => ({
    filterCss: (document.getElementById('ucc-lichess-filter-style') || {}).textContent ? 'есть' : 'пусто',
    autoHideCss: (document.getElementById('ucc-autohide-paths-style') || {}).textContent ? 'есть' : 'пусто',
    friendBtnHidden: getComputedStyle(document.querySelector('.lobby__start__button--friend')).display === 'none',
    inboxLinkHidden: getComputedStyle(document.querySelector('a[href="/inbox"]')).display === 'none',
    mateLinkHidden: getComputedStyle(document.querySelector('a[href="/training/mate"]')).display === 'none',
    blocked: getComputedStyle(document.getElementById('ucc-time-blocker-overlay')).display !== 'none',
    unlockLine: (() => {
      const el = document.querySelector('[data-role="unlock-line"]');
      if (!el || el.style.display === 'none') return null;
      return el.textContent.trim();
    })()
  });

  console.log('\n── A. Норма НЕ выполнена, 17:00, окно расписания открыто ──');
  let s = await page.evaluate(probe);
  check('CSS фильтра lichess', s.filterCss, 'есть');
  check('CSS скрытия ссылок на разделы', s.autoHideCss, 'есть');
  check('«Бросить вызов другу» скрыт', s.friendBtnHidden, true);
  check('ссылка на /inbox скрыта', s.inboxLinkHidden, true);
  check('ссылка на /training/mate скрыта', s.mateLinkHidden, true);
  check('блок-экран расписания не показан', s.blocked, false);
  check('строки «разблокировано» нет', s.unlockLine, null);

  console.log('\n── B. Решили норму (300 задач) — ждём тик, страницу НЕ перезагружаем ──');
  const usedKey = await page.evaluate(() => {
    const key = Object.keys(window.__store).find((k) => k.startsWith('racer_puzzles_'));
    window.__store[key] = 300;
    return key + ' = ' + window.__store[key];
  });
  console.log('   ключ счётчика:', usedKey);
  await sleep(11000); // pollIntervalMs таймблокера
  s = await page.evaluate(probe);
  check('CSS фильтра lichess погашен', s.filterCss, 'пусто');
  check('CSS скрытия ссылок погашен', s.autoHideCss, 'пусто');
  check('«Бросить вызов другу» виден', s.friendBtnHidden, false);
  check('ссылка на /inbox видна', s.inboxLinkHidden, false);
  check('ссылка на /training/mate видна', s.mateLinkHidden, false);
  check('в окне прогресса есть строка разблокировки', /открыт полностью/.test(s.unlockLine || ''), true);

  console.log('\n── C. Ждём 18:00 — конец окна расписания ──');
  await sleep(52000);
  s = await page.evaluate(probe);
  const timeNow = await page.evaluate(() => new Date().toTimeString().slice(0, 5));
  console.log('   часы страницы:', timeNow);
  check('блок-экран расписания показан', s.blocked, true);
  check('CSS фильтра вернулся', s.filterCss, 'есть');
  check('CSS скрытия ссылок вернулся', s.autoHideCss, 'есть');
  check('строка разблокировки убрана', s.unlockLine, null);

  console.log('\nОшибки страницы: ' + (errors.length ? errors.join(' | ') : 'нет'));
  results.push(errors.length === 0);

  await browser.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const bad = results.filter((r) => !r).length;
  console.log(bad ? `\n❌ ПРОВАЛЕНО ${bad} из ${results.length}` : `\n✅ ВСЕ ${results.length} ПРОВЕРОК ПРОЙДЕНЫ`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ПРИБОР УПАЛ:', e); process.exit(2); });

setTimeout(() => { console.error('ТАЙМАУТ прибора'); process.exit(3); }, 120000);
