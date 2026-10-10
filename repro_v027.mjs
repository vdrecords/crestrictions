// Репро v0.27.0: пять правок по журналу 26.09–10.10.2026.
//   1. Обычные задачи chess.com с рейтингом идут в норму: 1 за верно решённую с
//      первой попытки (ответ SubmitRatedSolution), без повторов и без второй
//      отправки той же задачи после ошибки.
//   2. Партия по новому адресу /game/<id> открывается.
//   3. Арены/турниры chess.com открыты, но Bullet и варианты закрываются по шапке
//      события; шапки нет 20 с — закрыто.
//   4. Переход внутри сайта (pushState) в закрытый раздел перезагружает страницу
//      и попадает под обычную проверку.
//   5. Чат (/service/chat), клубы и заявки в друзья отрезаны на уровне запросов,
//      включая чтение; отрезанное пишется в журнал событием guard.
//
// Стенд: HTTPS-сервер под именем www.chess.com (как repro_battle.mjs). «Сайт»
// задач ведёт себя как бандл puzzles.js 2026.10.1: Connect JSON через axios —
// XMLHttpRequest.send(Uint8Array) на /rpc/chesscom.puzzles.v1.PuzzleService/
// SubmitRatedSolution?uid=..., ответ {solutionResult: 'SOLUTION_RESULT_CORRECT'|...}.
// Шапка арены — как в бандле play 2026.10.3 (.arena-header-info).
//
// Запуск:
//   node repro_v027.mjs                                  # все проверки зелёные
//   SCRIPT_PATH=<v0.26.1> node repro_v027.mjs            # должна краснеть
import https from 'node:https';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/opt/homebrew/lib/node_modules/');
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');

const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname);
const CERT_DIR = process.env.CERT_DIR || HERE;
const SCRIPT_PATH = process.env.SCRIPT_PATH || `${HERE}/11_unified_chess_control.js`;

const SCHEDULE_FROM = "['09:00', '12:00'], ['16:00', '18:00']";
const raw = fs.readFileSync(SCRIPT_PATH, 'utf8');
if (!raw.includes(SCHEDULE_FROM)) throw new Error('не нашёл строку расписания — проверь SCHEDULE_FROM');
const script = raw.replaceAll(SCHEDULE_FROM, "['00:00', '23:59']");

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const SOLVED_KEY = `racer_puzzles_72_${TODAY}`;
const QUEUE_KEY = 'unified_chess_control_telemetry_queue';

// ── «Сайт» ────────────────────────────────────────────────────────────────
const SUBMIT = '/rpc/chesscom.puzzles.v1.PuzzleService/SubmitRatedSolution?uid=me';
// Ответы сервера на отправки по порядку для каждой задачи.
const ANSWERS = {
    111: ['SOLUTION_RESULT_CORRECT', 'SOLUTION_RESULT_CORRECT'],
    222: ['SOLUTION_RESULT_INCORRECT', 'SOLUTION_RESULT_CORRECT'],
    333: ['SOLUTION_RESULT_CORRECT'],
    444: ['SOLUTION_RESULT_CORRECT'],
};
const answered = {};

function puzzlePage(id, { retry = false, transport = 'xhr', times = 1 } = {}) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Puzzle</title></head><body><div id="board"></div>
<script>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(300);
  for (let i = 0; i < ${times}; i += 1) {
    const body = new TextEncoder().encode(JSON.stringify({ legacyPuzzleId: '${id}', moves: [{ from: 'e2', to: 'e4' }], attemptDuration: '7s'${retry ? ', isRetry: true' : ''} }));
    if (${JSON.stringify(transport)} === 'xhr') {
      await new Promise((r) => { const x = new XMLHttpRequest(); x.open('POST', ${JSON.stringify(SUBMIT)}); x.setRequestHeader('content-type', 'application/json'); x.onloadend = r; x.send(body); });
    } else {
      await fetch(${JSON.stringify(SUBMIT)}, { method: 'POST', body, headers: { 'content-type': 'application/json' } });
    }
    await sleep(200);
  }
  window.__siteDone = true;
})();
</script></body></html>`;
}

// Окно чата и клуба на разрешённой странице. Результат каждого запроса — в window.__net.
function chatPage() {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Home</title></head><body><h1>home</h1>
<script>
window.__net = {};
const tryFetch = (name, url, init) => fetch(url, init).then((r) => { window.__net[name] = 'ok ' + r.status; }, () => { window.__net[name] = 'отрезан'; });
const tryXhr = (name, method, url) => new Promise((resolve) => {
  const x = new XMLHttpRequest(); x.open(method, url);
  x.onload = () => { window.__net[name] = 'ok ' + x.status; resolve(); };
  x.onerror = () => { window.__net[name] = 'ошибка'; resolve(); };
  x.send('{"text":"привет"}');
  setTimeout(() => { if (!window.__net[name]) window.__net[name] = 'отрезан'; resolve(); }, 1500);
});
(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await tryFetch('chatRead', '/service/chat/users/054ad5a4-7d11-11ec-aff2-e7e977e13d05');
  await tryXhr('chatSend', 'POST', '/service/chat/game/live/46859f01-bce9-11f1-8dbb-feb0c301000f/players/messages');
  await tryFetch('clubChat', '/service/chat/club/1023754/participants');
  await tryFetch('clubJoin', '/callback/club/join/628521', { method: 'POST' });
  await tryXhr('clubAdmin', 'GET', '/callback/clubs/user/admin/live-challenges');
  await tryFetch('friend', '/callback/friend/request/429108043', { method: 'POST' });
  await tryFetch('control', '/callback/tactics/stats/user');
  window.__siteDone = true;
})();
</script></body></html>`;
}

// Шапка как в бандле play 2026.10.3: значок tournament-avatar → div.tournament-icon-<класс>,
// у арены строка «вариант - игроки - контроль», у турнира — только «N туров | M игроков».
function arenaPage(kind, title, meta, icon = '') {
    const prefix = kind === 'arena' ? 'arena-header' : 'tournament-header';
    const iconHtml = icon ? `<div class="tournament-icon-component tournament-icon-${icon} tournament-icon-icon-48"></div>` : '';
    const header = title === null ? '' : kind === 'arena'
        ? `<div class="${prefix}-component"><div class="${prefix}-row">${iconHtml}<div class="${prefix}-info">
<div class="${prefix}-header">${title}</div><span>${meta}</span><span>Pairing: Score-based</span><span>Starts in 2m</span></div></div></div>`
        : `<div class="${prefix}-component">${iconHtml}<div class="${prefix}-info"><h4>${title}</h4><span>${meta}</span><span>Starts in 5m</span></div></div>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Arena</title></head><body><div id="app"></div>
<script>setTimeout(() => { document.getElementById('app').innerHTML = ${JSON.stringify(header)}; }, 400);</script></body></html>`;
}

function spaPage() {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Play</title></head><body><h1>play online</h1>
<script>window.__loadMark = Math.random();</script></body></html>`;
}

const PAGES = {
    '/puzzles/problem/111': () => puzzlePage(111, { times: 2 }),
    '/puzzles/problem/222': () => puzzlePage(222, { times: 2 }),
    '/puzzles/problem/333': () => puzzlePage(333, { retry: true }),
    '/puzzles/problem/444': () => puzzlePage(444, { transport: 'fetch' }),
    '/home': chatPage,
    '/play/online': spaPage,
    '/play/arena/100': () => arenaPage('arena', 'Bullet Arena', 'Стандарт - 120 игроков - 1 мин'),
    '/play/arena/200': () => arenaPage('arena', 'Blitz Arena', 'Стандарт - 960 игроков - 3 | 2'),
    '/play/arena/300': () => arenaPage('arena', 'Weekend Arena', 'Chess960 - 50 игроков - 5 мин'),
    '/play/arena/400': () => arenaPage('arena', null, ''),
    '/play/tournament/500': () => arenaPage('tournament', 'Rapid Swiss', '7 туров | 40 игроков', 'rapid'),
    '/play/tournament/501': () => arenaPage('tournament', 'Hourly Swiss', '5 туров | 80 игроков', 'bullet'),
    '/play/tournament/502': () => arenaPage('tournament', 'Club Swiss', 'Chess960 | 5 туров | 12 игроков', 'chess960'),
    '/play/arena/201': () => arenaPage('arena', 'Titled Arena', 'Стандарт - 300 игроков - 1 мин', 'verified'),
    '/play/arena/600': () => arenaPage('arena', 'Hourly Arena', 'Стандарт - 70 игроков - 30 сек'),
};

const hits = [];
const server = https.createServer(
    { key: fs.readFileSync(`${CERT_DIR}/key.pem`), cert: fs.readFileSync(`${CERT_DIR}/cert.pem`) },
    (req, res) => {
        const path = req.url.split('?')[0];
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            if (req.method !== 'GET' || /^\/(service|callback|rpc)\//.test(path)) hits.push(`${req.method} ${path}`);
            const json = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
            if (path.endsWith('/SubmitRatedSolution')) {
                const id = JSON.parse(body || '{}').legacyPuzzleId;
                answered[id] = (answered[id] || 0) + 1;
                const result = (ANSWERS[id] || [])[answered[id] - 1] || 'SOLUTION_RESULT_INCORRECT';
                return json(200, { solutionResult: result, userRatings: [{ ratingType: 'RATING_TYPE_STANDARD', rating: 1500, ratingChange: 5 }], score: 1 });
            }
            if (/^\/(service|callback)\//.test(path)) return json(200, {});
            const make = PAGES[path];
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(make ? make() : `<!DOCTYPE html><html><head><title>${path}</title></head><body><h1>${path}</h1></body></html>`);
        });
    }
);
server.on('error', () => {});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// GM-хранилище одно на весь прогон, норма выполнена (иначе гейт уводит с /play).
const store = { [SOLVED_KEY]: '5000', unified_chess_control_date: TODAY };
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
const solved = () => Number.parseInt(store[SOLVED_KEY], 10);
const queue = () => (Array.isArray(store[QUEUE_KEY]) ? store[QUEUE_KEY] : []);

async function open(path) {
    const p = await browser.newPage();
    await p.exposeFunction('__gmSet', (k, v) => { store[k] = v; });
    await p.exposeFunction('__gmDel', (k) => { delete store[k]; });
    await p.evaluateOnNewDocument(`window.__uccGmSeed = ${JSON.stringify(store)};` + GM_SHIMS + script);
    await p.goto(`https://www.chess.com${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isBlockScreen = (p) => p.evaluate(() => !!document.querySelector('.ucc-blocker') || /Раздел не разрешён|турнир закрыт|Доступ закрыт/i.test(document.body ? document.body.innerText : '')).catch(() => false);

// ── 1. Задачи с рейтингом ─────────────────────────────────────────────────
let before = solved();
let p = await open('/puzzles/problem/111'); await sleep(2500); await p.close();
check('задача решена верно (XHR, тело Uint8Array): +1, вторая отправка той же не считается', solved() - before === 1, `было ${before}, стало ${solved()}`);

before = solved();
p = await open('/puzzles/problem/222'); await sleep(2500); await p.close();
check('ошибка, потом верная вторая отправка той же задачи: 0', solved() === before, `стало ${solved()}`);

before = solved();
p = await open('/puzzles/problem/333'); await sleep(2000); await p.close();
check('повтор задачи (isRetry): 0', solved() === before, `стало ${solved()}`);

before = solved();
p = await open('/puzzles/problem/444'); await sleep(2000); await p.close();
check('задача через fetch: +1', solved() - before === 1, `было ${before}, стало ${solved()}`);

before = solved();
p = await open('/puzzles/problem/111'); await sleep(2500); await p.close();
check('та же задача открыта снова: не засчитана повторно', solved() === before, `стало ${solved()}`);

const counted = queue().filter((r) => r.event === 'puzzle' && r.verdict === 'counted').length;
check('в журнале — события puzzle (засчитано 2)', counted === 2, `counted=${counted}`);

// ── 5. Чат, клубы, друзья ─────────────────────────────────────────────────
hits.length = 0;
p = await open('/home'); await sleep(5000);
const net = await p.evaluate(() => window.__net || {}).catch(() => ({}));
const notice = await p.evaluate(() => { const el = document.getElementById('ucc-send-guard-notice'); return el ? el.style.display : 'нет'; }).catch(() => '?');
await p.close();
for (const [name, what] of [['chatRead', 'чтение разговора /service/chat/users'], ['chatSend', 'сообщение в чат партии'],
    ['clubChat', 'чат клуба'], ['clubJoin', 'вступление в клуб'], ['clubAdmin', 'вызовы своего клуба (GET)'], ['friend', 'заявка в друзья']]) {
    check(`отрезано: ${what}`, net[name] === 'отрезан', net[name] || 'нет ответа');
}
check('контроль: обычный запрос задач проходит', /^ok/.test(net.control || ''), net.control || 'нет');
const leaked = hits.filter((h) => /chat|club|friend/.test(h));
check('до сервера не дошло ни одного запроса чата/клуба/друзей', leaked.length === 0, leaked.join(', '));
const guards = queue().filter((r) => r.event === 'guard');
check('отрезанное записано в журнал (guard)', guards.length >= 6, `строк guard: ${guards.length}`);

// ── 2. Партия по новому адресу ───────────────────────────────────────────
p = await open('/game/185017881024'); await sleep(1500);
check('партия /game/<id> открывается', !(await isBlockScreen(p)));
await p.close();

// ── 4. Переходы внутри сайта ─────────────────────────────────────────────
p = await open('/play/online'); await sleep(1500);
const mark1 = await p.evaluate(() => window.__loadMark);
await p.evaluate(() => history.pushState({}, '', '/play/arena/200'));
await sleep(1500);
const mark2 = await p.evaluate(() => window.__loadMark).catch(() => null);
check('pushState в разрешённый раздел: без перезагрузки', mark1 === mark2);
await p.evaluate(() => history.pushState({}, '', '/member/hikaru')).catch(() => {});
await sleep(3000);
check('pushState в чужой профиль: перезагрузка и блок-экран', await isBlockScreen(p),
    `адрес ${await p.evaluate(() => location.pathname).catch(() => '?')}`);
await p.close();

// ── 3. Арены и турниры ───────────────────────────────────────────────────
for (const [path, want, what] of [
    ['/play/arena/100', true, 'Bullet-арена 1 мин'],
    ['/play/arena/200', false, 'блиц-арена 3|2 (960 игроков — не вариант)'],
    ['/play/arena/300', true, 'арена Chess960'],
    ['/play/tournament/500', false, 'турнир со значком rapid'],
    ['/play/tournament/501', true, 'турнир со значком bullet'],
    ['/play/tournament/502', true, 'турнир Chess960'],
    ['/play/arena/201', true, 'арена со значком verified, по строке 1 мин'],
    ['/play/arena/600', true, 'арена 30 сек'],
]) {
    p = await open(path); await sleep(3000);
    const blocked = await isBlockScreen(p);
    check(`${what}: ${want ? 'закрыта' : 'открыта'}`, blocked === want, blocked ? 'блок-экран' : 'страница открыта');
    await p.close();
}
p = await open('/play/arena/400'); await sleep(5000);
const early = await isBlockScreen(p);
await sleep(18000);
const late = await isBlockScreen(p);
check('арена без шапки: сразу не закрыта, через 20 с — закрыта', !early && late, `5 с: ${early}, 23 с: ${late}`);
await p.close();

await browser.close();
server.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} проверок пройдено`);
process.exit(passed === results.length ? 0 : 1);
