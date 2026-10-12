// Репро v0.27.1: заявки в друзья через новый Connect RPC chess.com.
//   12.10.2026 ребёнок принял заявки в друзья, хотя v0.27.0 резала /callback/friend:
//   вкладка «Друзья → Заявки» в левом меню (бандл navigation 2026.10.1) шлёт
//   «Принять все» в chesscom.user_relationships.v1.BulkUserRelationshipsService/
//   BulkAcceptFriendRequestsByUuids, а при флаге accept_friend_user_gateway и
//   одиночное «Принять» — в chesscom.user_gateway.v1.UserGatewayService/
//   AcceptFriendRequest. Оба — POST на https://api.chess.com/rpc/..., fetch.
//   Отклонить/удалить и чтение списка друзей должны проходить.
//
// Запуск:
//   node repro_friends_rpc.mjs                           # все проверки зелёные
//   SCRIPT_PATH=<v0.27.0> node repro_friends_rpc.mjs     # должна краснеть
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

const API = 'https://api.chess.com/rpc/';
const CALLS = [
    // [имя, метод RPC, должен быть отрезан]
    ['bulkAccept', 'chesscom.user_relationships.v1.BulkUserRelationshipsService/BulkAcceptFriendRequestsByUuids', true],
    ['accept', 'chesscom.user_gateway.v1.UserGatewayService/AcceptFriendRequest', true],
    ['send', 'chesscom.user_gateway.v1.UserGatewayService/SendFriendRequest', true],
    ['acceptLink', 'chesscom.user_gateway.v1.UserGatewayService/AcceptFriendLink', true],
    ['bulkCreate', 'chesscom.user_relationships.v1.BulkUserRelationshipsService/BulkCreateFriendRelationship', true],
    ['decline', 'chesscom.user_gateway.v1.UserGatewayService/DeclineFriendRequest', false],
    ['remove', 'chesscom.user_gateway.v1.UserGatewayService/RemoveFriend', false],
    ['listPending', 'chesscom.friends_search.v1.FriendsNavigationService/ListRecentPendingFriends', false],
    ['puzzles', 'chesscom.puzzles.v1.PuzzleService/GetPuzzle', false],
];

// Страница задач (разрешена) с открытой панелью друзей: Connect JSON через fetch,
// как transport бандла (POST, content-type application/json, credentials include).
function friendsPage() {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Puzzles</title></head><body><h1>puzzles</h1>
<script>
window.__net = {};
(async () => {
  await new Promise((r) => setTimeout(r, 300));
  for (const [name, method] of ${JSON.stringify(CALLS.map(([n, m]) => [n, m]))}) {
    await fetch(${JSON.stringify(API)} + method, { method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json', 'connect-protocol-version': '1' },
      body: JSON.stringify({ userUuids: [] }) })
      .then((r) => { window.__net[name] = 'ok ' + r.status; }, () => { window.__net[name] = 'отрезан'; });
  }
  window.__siteDone = true;
})();
</script></body></html>`;
}

const hits = [];
const server = https.createServer(
    { key: fs.readFileSync(`${CERT_DIR}/key.pem`), cert: fs.readFileSync(`${CERT_DIR}/cert.pem`) },
    (req, res) => {
        const path = req.url.split('?')[0];
        const cors = {
            'access-control-allow-origin': 'https://www.chess.com',
            'access-control-allow-credentials': 'true',
            'access-control-allow-headers': 'content-type, connect-protocol-version',
            'access-control-allow-methods': 'POST, OPTIONS',
        };
        req.on('data', () => {});
        req.on('end', () => {
            if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
            if (/^\/rpc\//.test(path)) {
                hits.push(`${req.method} ${req.headers.host} ${path}`);
                res.writeHead(200, { ...cors, 'content-type': 'application/json' });
                return res.end('{}');
            }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(path === '/puzzles' ? friendsPage() : `<!DOCTYPE html><html><head><title>${path}</title></head><body><h1>${path}</h1></body></html>`);
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

// ── Друзья через RPC ─────────────────────────────────────────────────────
const p = await open('/puzzles'); await sleep(4000);
const net = await p.evaluate(() => window.__net || {}).catch(() => ({}));
await p.close();
for (const [name, method, mustBlock] of CALLS) {
    const short = method.split('/')[1];
    if (mustBlock) check(`отрезано: ${short}`, net[name] === 'отрезан', net[name] || 'нет ответа');
    else check(`проходит: ${short}`, /^ok/.test(net[name] || ''), net[name] || 'нет ответа');
}
const leaked = hits.filter((h) => /\/(Send|Accept|BulkAccept|BulkCreate)Friend/.test(h));
check('до api.chess.com не дошло ни одной заявки/принятия', leaked.length === 0, leaked.join(', '));
const guards = queue().filter((r) => r.event === 'guard' && /Friend/.test(JSON.stringify(r.detail || '')));
check('отрезанное записано в журнал (guard)', guards.length >= 5, `строк guard: ${guards.length}`);

await browser.close();
server.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} проверок пройдено`);
process.exit(passed === results.length ? 0 : 1);
