// Прибор v0.26.1: фреймы внутри открытого сайта — в настоящем Chrome.
//
// Журнал 07.10.2026: Teams у ребёнка открылся, но вкладка «Файлы» (фрейм
// educastur-my.sharepoint.com) и служебный фрейм CDN Teams получили блок-экран.
// Логику проверяет repro_extra_sites.js; здесь — то, чего логика не видит:
// заполняет ли браузер location.ancestorOrigins во фрейме чужого домена в момент,
// когда скрипт внедряется на document-start, и что видит человек в итоге.
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');
const fs = require('fs'), os = require('os'), path = require('path');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ucc-frames-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCRIPT_PATH = process.env.SCRIPT_PATH || (__dirname + '/11_unified_chess_control.js');
const RAW = fs.readFileSync(SCRIPT_PATH, 'utf8');
const DAY = '2026-10-07';
const needle = 'const EXTRA_SITES_GRANTS = [];';
if (!RAW.includes(needle)) throw new Error('нет настройки EXTRA_SITES_GRANTS');
const SCRIPT = RAW.replace(needle, `const EXTRA_SITES_GRANTS = ${JSON.stringify([
  { host: 'teams.cloud.microsoft', dates: [DAY], afterTaskTarget: false }
])};`);

const PAGES = {
  'https://teams.cloud.microsoft/': `<!doctype html><html><head><title>Teams</title></head><body>
    <div id="real-page">Teams</div>
    <iframe id="files" src="https://educastur-my.sharepoint.com/files"></iframe>
    <iframe id="yt" src="https://www.youtube.com/embed/xyz"></iframe>
    </body></html>`,
  'https://lichess.org/training': `<!doctype html><html><head><title>Задачи</title></head><body>
    <iframe id="files" src="https://educastur-my.sharepoint.com/files"></iframe></body></html>`
};
const LEAF = `<!doctype html><html><head><title>Содержимое</title></head><body><div id="real-page">ok</div></body></html>`;

const clock = `(() => { const fixed = new Date(2026, 9, 7, 17, 0, 0).getTime(); const Real = Date;
  class Mock extends Real { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } }
  window.Date = Mock; })();`;
const GM = `(() => { window.__store = {};
  window.GM_getValue = (k, d) => { if (k.startsWith('racer_puzzles_')) return 100000; return (k in window.__store) ? window.__store[k] : d; };
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
  window.GM_xmlhttpRequest = () => {}; })();`;

(async () => {
  // Изоляция сайтов выключена, чтобы скрипт внедрялся и во фреймы чужого
  // домена тем же evaluateOnNewDocument. ancestorOrigins от этого не зависит.
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
  async function frameState(page, host) {
    const frame = page.frames().find((f) => f.url().includes(host));
    if (!frame) return { found: false };
    return frame.evaluate(() => ({
      found: true,
      real: !!document.getElementById('real-page'),
      title: document.title,
      queue: (window.__store && window.__store.unified_chess_control_telemetry_queue || [])
        .filter((r) => r.event === 'urlblock').map((r) => ({ verdict: r.verdict, frame: r.frame, top: r.top }))
    })).catch((e) => ({ found: true, error: String(e).slice(0, 80) }));
  }

  console.log('\n── 1. Teams открыт: его фреймы работают, ютуб во фрейме — нет ──');
  let page = await visit('https://teams.cloud.microsoft/');
  check('сама страница Teams открыта', await page.evaluate(() => !!document.getElementById('real-page')), true);
  const files = await frameState(page, 'sharepoint.com');
  check('фрейм «Файлы» (sharepoint) показывает содержимое', files.real, true);
  check('в журнале фрейма метка frame и верхний сайт', (files.queue || [])[0], { verdict: 'allowed', frame: true, top: 'teams.cloud.microsoft' });
  const yt = await frameState(page, 'youtube.com');
  check('ютуб во фрейме Teams закрыт (блок-лист главнее)', yt.real, false);
  await page.close();

  console.log('\n── 2. Тот же sharepoint вне открытого сайта ──');
  // Верх — разрешённая, но НЕ открытая слоем страница (lichess): фрейм там
  // обязан остаться закрытым. Чужой верх не годится — он сам под блок-экраном,
  // и фрейм просто не загрузится, проверять будет нечего.
  page = await visit('https://lichess.org/training');
  const foreign = await frameState(page, 'sharepoint.com');
  check('фрейм внутри разрешённого, но не открытого сайта найден', foreign.found, true);
  check('и закрыт', foreign.real, false);
  await page.close();
  page = await visit('https://educastur-my.sharepoint.com/files');
  check('sharepoint верхней страницей закрыт', await page.evaluate(() => !!document.getElementById('real-page')), false);
  const own = await page.evaluate(() => (window.__store.unified_chess_control_telemetry_queue || [])
    .filter((r) => r.event === 'urlblock').map((r) => ({ verdict: r.verdict, frame: !!r.frame })));
  check('у верхней страницы метки frame нет', own[0], { verdict: 'blocked', frame: false });
  await page.close();

  await browser.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
