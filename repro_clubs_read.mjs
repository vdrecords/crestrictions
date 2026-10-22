// Репро v0.27.2: чтение списков «мои клубы» для входа в клубный турнир chess.com.
//   22.10.2026 ребёнка не пустило в турнир /play/tournament/31175879: бандл play
//   2026.10.7 (joinTournament) у клубного турнира сперва ждёт загрузки клубов —
//   GET /callback/clubs/user/admin и /callback/clubs/user/member — а v0.27 резала
//   /callback/clubs любым методом. Сайт бросал «failed to load clubs», «Join» молчал.
//   Теперь эти два GET проходят; запись (POST), вступление в клуб, вызовы клубов,
//   данные клуба и чат — по-прежнему отрезаны.
//
// Запуск:
//   node repro_clubs_read.mjs                            # все проверки зелёные
//   SCRIPT_PATH=<v0.27.1> node repro_clubs_read.mjs      # должна краснеть
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

const CALLS = [
    // [имя, способ, метод, адрес, должен быть отрезан]
    ['member', 'fetch', 'GET', '/callback/clubs/user/member', false],
    ['admin', 'fetch', 'GET', '/callback/clubs/user/admin', false],
    ['memberQuery', 'fetch', 'GET', '/callback/clubs/user/member?_=1', false],
    ['adminXhr', 'xhr', 'GET', '/callback/clubs/user/admin', false],
    ['memberLocale', 'fetch', 'GET', '/ru/callback/clubs/user/member', false],
    ['memberHead', 'fetch', 'HEAD', '/callback/clubs/user/member', false],
    ['memberPost', 'fetch', 'POST', '/callback/clubs/user/member', true],
    ['adminPostXhr', 'xhr', 'POST', '/callback/clubs/user/admin', true],
    ['liveChallenges', 'fetch', 'GET', '/callback/clubs/user/admin/live-challenges', true],
    ['memberSuffix', 'fetch', 'GET', '/callback/clubs/user/memberx', true],
    ['memberDeeper', 'fetch', 'GET', '/callback/clubs/user/member/extra', true],
    ['clubJoin', 'fetch', 'POST', '/callback/club/join/12345', true],
    ['clubData', 'fetch', 'GET', '/callback/club/data/12345', true],
    ['teamSeeks', 'fetch', 'GET', '/callback/clubs/team-match/seeks/12345', true],
    ['multiClub', 'xhr', 'GET', '/callback/clubs/multi-club/challenges/12345', true],
    ['serviceClubs', 'fetch', 'GET', '/service/clubs/list', true],
    ['chat', 'fetch', 'GET', '/service/chat/users/abc', true],
    ['puzzles', 'fetch', 'GET', '/callback/tactics/rated/next', false],
];

// Лобби /play/online (разрешено после нормы): запросы как у бандла play —
// fetch и XHR на тот же хост.
function lobbyPage() {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Play</title></head><body><h1>play</h1>
<script>
window.__net = {};
(async () => {
  await new Promise((r) => setTimeout(r, 300));
  for (const [name, how, method, url] of ${JSON.stringify(CALLS.map(([n, h, m, u]) => [n, h, m, u]))}) {
    if (how === 'xhr') {
      await new Promise((done) => {
        const x = new XMLHttpRequest();
        x.open(method, url);
        x.onload = () => { window.__net[name] = 'ok ' + x.status; done(); };
        x.onerror = () => { window.__net[name] = 'ошибка'; done(); };
        x.send(method === 'GET' ? null : '{}');
        setTimeout(() => { if (!window.__net[name]) window.__net[name] = 'отрезан'; done(); }, 1500);
      });
    } else {
      await fetch(url, { method, credentials: 'include', body: method === 'GET' || method === 'HEAD' ? undefined : '{}' })
        .then((r) => { window.__net[name] = 'ok ' + r.status; }, () => { window.__net[name] = 'отрезан'; });
    }
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
        req.on('data', () => {});
        req.on('end', () => {
            if (/\/(callback|service)\//.test(path)) {
                hits.push(`${req.method} ${path}`);
                res.writeHead(200, { 'content-type': 'application/json' });
                return res.end('{"data":[]}');
            }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(path === '/play/online' ? lobbyPage() : `<!DOCTYPE html><html><head><title>${path}</title></head><body><h1>${path}</h1></body></html>`);
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

// ── Клубы: чтение двух списков открыто, остальное закрыто ─────────────────
const p = await open('/play/online'); await sleep(6000);
const net = await p.evaluate(() => window.__net || {}).catch(() => ({}));
check('лобби /play/online не закрыто блок-экраном', !(await isBlockScreen(p)));
await p.close();
for (const [name, how, method, url, mustBlock] of CALLS) {
    const label = `${method} ${url} (${how})`;
    if (mustBlock) check(`отрезано: ${label}`, net[name] === 'отрезан', net[name] || 'нет ответа');
    else check(`проходит: ${label}`, /^ok/.test(net[name] || ''), net[name] || 'нет ответа');
}
const leaked = hits.filter((h) => /^(POST|PUT|PATCH|DELETE) .*\/clubs?\//.test(h) || /live-challenges|seeks|club\/data|service\/(chat|clubs)/.test(h));
check('до сервера не дошло ни записи в клубы, ни вызовов, ни чата', leaked.length === 0, leaked.join(', '));
const reached = hits.filter((h) => /^(GET|HEAD) \/(ru\/)?callback\/clubs\/user\/(admin|member)$/.test(h));
check('оба списка клубов реально дошли до сервера', reached.length >= 5, `запросов: ${reached.length}`);
const cut = queue().filter((r) => r.event === 'guard');
check('отрезанное по-прежнему пишется в журнал (guard)', cut.length >= 6, `строк guard: ${cut.length}`);

await browser.close();
server.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} проверок пройдено`);
process.exit(passed === results.length ? 0 : 1);
