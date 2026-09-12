// Сквозной прибор v0.19: настоящий Chrome, настоящий сетевой запрос к серверу.
// Проверяет ту самую цепочку, ради которой всё делалось: бот пишет файл →
// веб-сервер отдаёт → юзерскрипт забирает и применяет. Ничего не подменяется,
// кроме страницы lichess (её незачем дёргать) и часов.
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = '/Users/vd/Documents/Claude/tampermonkey/chess-control/crestrictions-main/11_unified_chess_control.js';
// debug включаем прямо в тексте: иначе скрипт молчит и о применении конфига
// пришлось бы судить по косвенным признакам.
const SCRIPT = fs.readFileSync(SRC, 'utf8').replace('debug: false,', 'debug: true,');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ucc-remote-'));

const today = new Date();
const KEY = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const HTML = `<!doctype html><html><head><title>Гонка • lichess.org</title></head><body>
<div class="racer">racer</div><a href="/inbox">Входящие</a></body></html>`;

// Часы ставим в середину утреннего окна, чтобы страница жила и модули поднялись.
const CLOCK = `(() => {
  const fixed = new Date(${today.getFullYear()}, ${today.getMonth()}, ${today.getDate()}, 10, 0, 0).getTime();
  const started = Date.now(); const Real = Date;
  function now() { return fixed + (Real.now() - started); }
  class Mock extends Real {
    constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
    static now() { return now(); }
  }
  window.Date = Mock;
})();`;

// GM-хранилище в памяти + НАСТОЯЩИЙ сетевой запрос через Node: GM_xmlhttpRequest
// тем и отличается от fetch, что ходит мимо CORS, и подменять его обычным fetch
// означало бы проверять не то, что работает у ребёнка.
const GM_STUB = `(() => {
  window.__store = { 'racer_puzzles_72_${KEY}': 1500 };
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
  window.GM_addStyle = () => {};
  window.__net = [];
  window.GM_xmlhttpRequest = (opts) => {
    window.__net.push((opts.method || 'GET') + ' ' + opts.url);
    window.__gmFetch(opts.url, opts.method || 'GET', opts.data || null).then((r) => {
      if (r.error) { opts.onerror && opts.onerror(r.error); return; }
      opts.onload && opts.onload({ status: r.status, responseText: r.text });
    });
  };
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

  // Резолвер этой машины держит отрицательный кэш по cfg.allcantrip.ru: адрес
  // спрашивали, когда записи ещё не было, а отрицательный ответ в зоне .RU живёт
  // сутки. Сбросить кэш нельзя без пароля, поэтому запрос идёт сразу на адрес
  // сервера, но с настоящим именем в SNI и заголовке Host — то есть ровно так,
  // как его увидит сервер от браузера ребёнка. Сам DNS проверен отдельно, digом
  // по авторитетному серверу и по публичным резолверам.
  const https = require('https');
  await page.exposeFunction('__gmFetch', async (url, method = 'GET', data = null) => {
    const parsed = new URL(url);
    const headers = { Host: parsed.hostname, 'User-Agent': 'Mozilla/5.0 UCC-e2e-probe' };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    return new Promise((resolve) => {
      const req = https.request({
        host: '45.88.173.160',
        servername: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method,
        headers,
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, text: body }));
      });
      req.on('error', (e) => resolve({ error: String(e) }));
      req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
      if (data) req.write(data);
      req.end();
    });
  });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().startsWith('https://lichess.org/')) {
      req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    } else req.abort();
  });

  await page.evaluateOnNewDocument(CLOCK);
  await page.evaluateOnNewDocument(GM_STUB);
  await page.evaluateOnNewDocument(SCRIPT);

  await page.goto('https://lichess.org/racer', { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  console.log('── Запрос к серверу ──');
  const net = await page.evaluate(() => window.__net || []);
  check('скрипт сходил на сервер', net.length > 0, true);
  check('адрес верный', /^GET https:\/\/cfg\.allcantrip\.ru\/tm\/chess-control-config\.json\?t=\d+$/.test(net[0] || ''), true);

  console.log('\n── Что ответил сервер ──');
  const applied = logs.filter((l) => l.includes('config applied'));
  console.log('  журнал скрипта:', applied.length ? applied.join(' | ') : '(тишина)');
  const httpErr = logs.filter((l) => l.includes('remote config HTTP error') || l.includes('request failed') || l.includes('parse failed'));
  check('сетевых ошибок нет', httpErr, []);

  console.log('\n── Применение настроек с сервера ──');
  const state = await page.evaluate(() => {
    const w = window;
    return { probe: w.__cfgProbe || null };
  });
  // Значение читаем из живого CONFIG через отладочную строку журнала: скрипт
  // пишет «config applied from network» только когда содержимое реально
  // отличалось от уже применённого.
  check('конфиг применён из сети', applied.some((l) => l.includes('network')), true);

  console.log('\n── Журнал решений ──');
  const posted = net.filter((u) => u.startsWith('POST'));
  check('телеметрия ушла на сервер', posted.length > 0, true);
  const queued = await page.evaluate(() => (window.__store || {})['unified_chess_control_telemetry_queue'] || []);
  console.log('  событий собрано за загрузку:', Array.isArray(queued) ? queued.length : '?');
  console.log('  события:', JSON.stringify((Array.isArray(queued) ? queued : []).map((e) => e.event + ':' + (e.verdict || ''))));

  console.log('\n── Ошибки страницы ──');
  const errs = logs.filter((l) => l.startsWith('PAGEERROR'));
  check('ошибок нет', errs, []);

  await browser.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
  process.exit(fails ? 1 : 0);
})();
