// Репро v0.25.0: «Тактические дуэли» chess.com (/puzzles/battle) идут в дневной
// счётчик задач — но только своя дуэль, просмотр чужой в зачёт не идёт.
//
// Стенд: HTTPS-сервер под именем www.chess.com отдаёт синтетическую страницу дуэли.
// Её «сайт» ведёт себя как бандл chess.com (puzzles.js, 2026.10.1): ходы игрока —
// PUT /service/battle/games/<uuid>/players/<мой uuid>/puzzles, итог дуэли —
// GET /callback/tactics/battles/<uuid> с объектом {id, state, players:{<uuid>:{puzzles:[{state}]}}},
// в конце — модалка #battle-over-modal. Наблюдатель ходов не шлёт, у него двухдосочный вид.
//
// Запуск (сертификат — тот же, что у repro_swiss.mjs; имя хоста не проверяется):
//   node repro_battle.mjs                      # ожидается 7/7
//   SCRIPT_PATH=<старая версия> node repro_battle.mjs   # должна упасть на «своей дуэли»
import https from 'node:https';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/opt/homebrew/lib/node_modules/');
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');

const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname);
const CERT_DIR = process.env.CERT_DIR || HERE;
const SCRIPT_PATH = process.env.SCRIPT_PATH || `${HERE}/11_unified_chess_control.js`;

// Расписание — на все сутки, иначе вне окна таймблокер закрывает страницу.
const SCHEDULE_FROM = "['09:00', '12:00'], ['16:00', '18:00']";
const raw = fs.readFileSync(SCRIPT_PATH, 'utf8');
if (!raw.includes(SCHEDULE_FROM)) throw new Error('не нашёл строку расписания — проверь SCHEDULE_FROM');
const script = raw.replaceAll(SCHEDULE_FROM, "['00:00', '23:59']");

const ME = '11111111-aaaa-4aaa-8aaa-000000000001';
const RIVAL = '22222222-bbbb-4bbb-8bbb-000000000002';
const STRANGER = '33333333-cccc-4ccc-8ccc-000000000003';

const puzzles = (ok, bad) => [
    ...Array.from({ length: ok }, () => ({ state: 'completed', moves: [] })),
    ...Array.from({ length: bad }, () => ({ state: 'failed', moves: [] })),
];

// Дуэли стенда. finalAfter — сколько GET-ов отдавать state:'playing' до 'completed'.
const BATTLES = {
    // 1. Своя дуэль, сайт сам запрашивает итог.
    'aaaaaaaa-0000-4000-8000-000000000001': { players: { [ME]: 17, [RIVAL]: 15 }, finalAfter: 0 },
    // 2. Наблюдение чужой дуэли.
    'aaaaaaaa-0000-4000-8000-000000000002': { players: { [RIVAL]: 35, [STRANGER]: 33 }, finalAfter: 0 },
    // 3. Своя СТАРАЯ дуэль, открытая по ссылке: я среди игроков, но ходов с вкладки нет.
    'aaaaaaaa-0000-4000-8000-000000000003': { players: { [ME]: 21, [RIVAL]: 20 }, finalAfter: 0 },
    // 4. Своя дуэль, сайт итог НЕ запрашивает, первый GET ещё 'playing' — добирает скрипт.
    'aaaaaaaa-0000-4000-8000-000000000004': { players: { [ME]: 9, [RIVAL]: 30 }, finalAfter: 1 },
    // 5. Своя дуэль, API отвечает 500 — запасной путь по модалке.
    'aaaaaaaa-0000-4000-8000-000000000005': { players: { [ME]: 12, [RIVAL]: 8 }, broken: true },
};
const gets = {};

function battleJson(id) {
    const b = BATTLES[id];
    gets[id] = (gets[id] || 0) + 1;
    const state = gets[id] > b.finalAfter ? 'completed' : 'playing';
    const players = {};
    for (const [uuid, ok] of Object.entries(b.players)) {
        players[uuid] = { state: 'completed', details: { id: uuid, username: uuid.slice(0, 4) }, puzzles: puzzles(ok, 2) };
    }
    return { id, shortUuid: id.slice(-6), state, type: 'standard', players };
}

// Синтетический «сайт» дуэли. mode: play | observe | link | silent | broken
function page(id, mode) {
    const b = BATTLES[id];
    const mine = b.players[ME] ?? 0;
    const twoBoards = mode === 'observe' || mode === 'link';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Puzzle Battle - Chess.com</title></head><body>
<div id="board">${twoBoards ? '<div class="battle-two-board-controls-component">Продолжить наблюдение:</div>' : ''}</div>
<div id="battle-over-modal"></div>
<script>
(async () => {
  const id = ${JSON.stringify(id)}, me = ${JSON.stringify(ME)}, mode = ${JSON.stringify(mode)};
  window.context = { user: { uuid: me, username: me.slice(0, 4) } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (mode === 'play' || mode === 'silent' || mode === 'broken') {
    for (let i = 0; i < 4; i += 1) {
      await fetch('/service/battle/games/' + id + '/players/' + me + '/puzzles', {
        method: 'PUT', credentials: 'include', body: JSON.stringify({ moves: [{ move: 'e2e4', moveIndex: 0, puzzleIndex: i }] })
      });
      await sleep(150);
    }
    // Один ход через XHR — у сайта бывают оба транспорта.
    await new Promise((r) => { const x = new XMLHttpRequest(); x.open('PUT', '/service/battle/games/' + id + '/players/' + me + '/puzzles'); x.onloadend = r; x.send('{}'); });
  }
  if (mode === 'play' || mode === 'observe' || mode === 'link') {
    await sleep(300);
    await fetch('https://www.chess.com/callback/tactics/battles/' + id, { credentials: 'include' }).then((r) => r.json());
  }
  await sleep(300);
  document.getElementById('battle-over-modal').innerHTML =
    '<div class="battle-over-modal-component${twoBoards ? ' battle-over-modal-two-boards' : ''}">'
    + '<div class="modal-game-over-user-white"><span class="modal-game-over-user-username">' + me.slice(0, 4) + '</span>'
    + '<span class="modal-game-over-user-points">${mode === 'observe' ? 35 : mine}</span></div></div>';
  window.__siteDone = true;
})();
</script></body></html>`;
}

const PAGES = {
    '/puzzles/battle/own1': ['aaaaaaaa-0000-4000-8000-000000000001', 'play'],
    '/puzzles/battle/obs2': ['aaaaaaaa-0000-4000-8000-000000000002', 'observe'],
    '/puzzles/battle/old3': ['aaaaaaaa-0000-4000-8000-000000000003', 'link'],
    '/puzzles/battle/own4': ['aaaaaaaa-0000-4000-8000-000000000004', 'silent'],
    '/puzzles/battle/own5': ['aaaaaaaa-0000-4000-8000-000000000005', 'broken'],
};

const server = https.createServer(
    { key: fs.readFileSync(`${CERT_DIR}/key.pem`), cert: fs.readFileSync(`${CERT_DIR}/cert.pem`) },
    (req, res) => {
        const path = req.url.split('?')[0];
        const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
        let m = path.match(/^\/(?:callback\/tactics\/battles|service\/battle\/games)\/([^/]+)$/);
        if (m && req.method === 'GET' && BATTLES[m[1]]) {
            if (BATTLES[m[1]].broken) return json(500, { error: 'boom' });
            return json(200, battleJson(m[1]));
        }
        if (req.method === 'PUT') return json(200, {});
        if (PAGES[path]) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            return res.end(page(...PAGES[path]));
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><body><h1>${path}</h1></body></html>`);
    }
);
server.on('error', () => {});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// GM-хранилище — одно на весь прогон (как у Tampermonkey: общее на все вкладки
// и сайты), держим его в node и пробрасываем в страницы через exposeFunction.
const store = {};
const GM_SHIMS = `
    const unsafeWindow = window;
    const __gm = window.__uccGmSeed || {};
    function GM_addStyle(css) {
        const s = document.createElement('style'); s.textContent = css;
        const root = document.head || document.documentElement;
        if (root) root.appendChild(s);
        else document.addEventListener('DOMContentLoaded', () => (document.head || document.documentElement).appendChild(s), { once: true });
        return s;
    }
    function GM_getValue(k, d) { return Object.prototype.hasOwnProperty.call(__gm, k) ? __gm[k] : d; }
    function GM_setValue(k, v) { __gm[k] = v; window.__gmSet(k, v); }
    function GM_deleteValue(k) { delete __gm[k]; window.__gmDel(k); }
    function GM_listValues() { return Object.keys(__gm); }
    function GM_xmlhttpRequest() { /* сеть стенда не нужна */ }
    window.__uccErrors = [];
    window.addEventListener('error', (e) => window.__uccErrors.push(String(e.message)));
`;

const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [`--host-resolver-rules=MAP * 127.0.0.1:${port}`, '--ignore-certificate-errors', '--no-sandbox'],
});

const results = [];
const check = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const solvedToday = () => Object.entries(store)
    .filter(([k]) => k.startsWith('racer_puzzles_'))
    .reduce((sum, [, v]) => sum + Number.parseInt(v, 10), 0);

async function visit(path, waitMs) {
    const p = await browser.newPage();
    await p.exposeFunction('__gmSet', (k, v) => { store[k] = v; });
    await p.exposeFunction('__gmDel', (k) => { delete store[k]; });
    await p.evaluateOnNewDocument(`window.__uccGmSeed = ${JSON.stringify(store)};` + GM_SHIMS + script);
    await p.goto(`https://www.chess.com${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise((r) => setTimeout(r, waitMs));
    const errors = await p.evaluate(() => window.__uccErrors || []).catch(() => ['страница не ответила']);
    await p.close();
    return errors;
}

let before = solvedToday();
let errs = await visit('/puzzles/battle/own1', 4000);
check('своя дуэль: +17 (верно решённые, без ошибок)', solvedToday() - before === 17,
    `было ${before}, стало ${solvedToday()}${errs.length ? ', ошибки: ' + errs.join('; ') : ''}`);

before = solvedToday();
await visit('/puzzles/battle/own1', 4000);
check('та же дуэль открыта ещё раз — повторно не засчитана', solvedToday() === before, `стало ${solvedToday()}`);

before = solvedToday();
await visit('/puzzles/battle/obs2', 8000);
check('наблюдение чужой дуэли — не засчитано', solvedToday() === before, `было ${before}, стало ${solvedToday()}`);

before = solvedToday();
await visit('/puzzles/battle/old3', 8000);
check('своя старая дуэль по ссылке (ходов нет) — не засчитана', solvedToday() === before, `стало ${solvedToday()}`);

before = solvedToday();
await visit('/puzzles/battle/own4', 16000);
check('сайт итог не запросил — скрипт добрал сам: +9', solvedToday() - before === 9,
    `было ${before}, стало ${solvedToday()}, GET-ов итога ${gets['aaaaaaaa-0000-4000-8000-000000000004'] || 0}`);

before = solvedToday();
await visit('/puzzles/battle/own5', 55000);
check('API сломан — засчитано по модалке конца: +12', solvedToday() - before === 12, `было ${before}, стало ${solvedToday()}`);

const battleKeys = Object.keys(store).filter((k) => k.startsWith('processed_battle_')).sort();
check('отметки засчитанных дуэлей — ровно три своих', battleKeys.length === 3, battleKeys.join(', '));

await browser.close();
server.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} проверок пройдено`);
process.exit(passed === results.length ? 0 : 1);
