// Репро v0.15.0: швейцарские турниры на lichess разрешены — но по тем же правилам,
// что и Арена (контроль ≥ minBaseMinutes, только стандартные шахматы, создание своего
// турнира закрыто).
//
// Стенд: HTTPS-сервер отдаёт РЕАЛЬНЫЕ страницы lichess (сохранены curl'ом, русская локаль)
// под именем lichess.org; юзерскрипт внедряется с шимами GM_* на document-start, как TM.
// В каждую страницу турнира дописан маркер доски (.main-board) и кнопка «Участвовать» —
// иначе у анонима их нет и скрывать нечего.
//
// Запуск (сертификат нужен один раз, каталог задаётся CERT_DIR, по умолчанию — рядом):
//   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 \
//     -subj "/CN=lichess.org" -addext "subjectAltName=DNS:lichess.org"
//   FX_DIR=<каталог с фикстурами> node repro_swiss.mjs      # ожидается 16/16
import https from 'node:https';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/opt/homebrew/lib/node_modules/');
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');

const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname);
const CERT_DIR = process.env.CERT_DIR || HERE;
const FX_DIR = process.env.FX_DIR || `${HERE}/fx_swiss`;
// SCRIPT_PATH переопределяется, чтобы прогнать пробу против ПРЕДЫДУЩЕЙ версии скрипта
// и убедиться, что она падает (иначе зелёный результат ничего не доказывает).
const SCRIPT_PATH = process.env.SCRIPT_PATH || `${HERE}/11_unified_chess_control.js`;

// Стенд открывает расписание на все сутки: иначе таймблокер зовёт window.stop() и
// документ остаётся без body (см. repro_sendguard.mjs).
// tracker: false — иначе дневной гейт («решено < цели») уводит с любой страницы на /racer
// и проверять швейцарки не на чем. Трекер к этой правке отношения не имеет.
const rawScript = fs.readFileSync(SCRIPT_PATH, 'utf8')
    .replaceAll("['09:00', '12:00'], ['16:00', '18:00']", "['00:00', '23:59']")
    .replace('tracker: true,', 'tracker: false,');
// Bullet-окно закрыто (обычный режим) и открыто (награда) — два прогона.
const scriptBulletClosed = rawScript.replace(
    'const BULLET_REWARD_ENABLED = true;',
    'const BULLET_REWARD_ENABLED = false;'
);
if (scriptBulletClosed === rawScript) throw new Error('не удалось выключить BULLET_REWARD_ENABLED — проверь строку тумблера');

// Реальные страницы lichess (ru), сохранённые curl'ом 2026-07-30.
const FIXTURES = {
    '/swiss': 'index.html',            // расписание швейцарок
    '/swiss/UoiulDzb': 'classical.html', // 30+0 • Классика — разрешено
    '/swiss/MwpMRYto': 'blitz.html',     // 5+0 • Блиц — разрешено
    '/swiss/e0lJpDmJ': 'bullet.html',    // 1+0 • Пуля — только в Bullet-окно
    '/swiss/NgtR3AxL': 'hyper.html',     // ½+0 • Пуля — запрещено всегда
};

// Маркеры, которых у анонима нет: доска и кнопка участия.
const MARKERS = '<div class="main-board" id="ucc-test-board">board</div>'
    + '<button id="ucc-test-join">Участвовать</button>';

const server = https.createServer(
    {
        key: fs.readFileSync(`${CERT_DIR}/key.pem`),
        cert: fs.readFileSync(`${CERT_DIR}/cert.pem`),
    },
    (req, res) => {
        const path = req.url.split('?')[0];
        const fixture = FIXTURES[path];
        if (fixture) {
            const html = fs.readFileSync(`${FX_DIR}/${fixture}`, 'utf8')
                .replace('</body>', `${MARKERS}</body>`);
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Задачи • lichess.org</title></head>`
            + `<body><h1>${path}</h1>${MARKERS}</body></html>`);
    }
);
server.on('error', () => {});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const GM_SHIMS = `
    const unsafeWindow = window;
    function GM_addStyle(css) {
        const s = document.createElement('style'); s.textContent = css;
        const root = document.head || document.documentElement;
        if (root) root.appendChild(s);
        else document.addEventListener('DOMContentLoaded', () => (document.head || document.documentElement).appendChild(s), { once: true });
        return s;
    }
    function GM_getValue(k, d) { const v = window.localStorage.getItem('gm:' + k); return v === null ? d : v; }
    function GM_setValue(k, v) { window.localStorage.setItem('gm:' + k, String(v)); }
    function GM_deleteValue(k) { window.localStorage.removeItem('gm:' + k); }
    function GM_listValues() { return Object.keys(window.localStorage).filter((k) => k.startsWith('gm:')).map((k) => k.slice(3)); }
    function GM_xmlhttpRequest() { /* удалённый конфиг отключён */ }
    window.__uccErrors = [];
    window.addEventListener('error', (e) => window.__uccErrors.push(String(e.message)));
`;

// Трекер-гейт редиректит на /racer, пока дневная цель не выполнена.
const UNLOCK = `
    try {
        const today = new Date();
        const key = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        window.localStorage.setItem('lichess_racer_unlock_flag', JSON.stringify({ date: key, granted: true }));
        window.localStorage.setItem('gm:unlock_flag_72_' + key, '1');
    } catch (e) {}
`;

const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
        `--host-resolver-rules=MAP * 127.0.0.1:${port}`,
        '--ignore-certificate-errors',
        '--no-sandbox',
    ],
});

const results = [];
const check = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

async function open(url, script) {
    const p = await browser.newPage();
    await p.evaluateOnNewDocument(UNLOCK + GM_SHIMS + script);
    await p.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500)); // applyRules гоняется на 150/500/1200 мс
    return p;
}

// Состояние страницы турнира: показан ли блок-экран, видна ли доска и кнопка участия.
const readTournamentState = (p) => p.evaluate(() => {
    const visible = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null;
    };
    return {
        path: location.pathname,
        blocked: !!document.querySelector('.ucc-blocker'),
        meta: (document.querySelector('.swiss__meta section p')?.textContent || '').trim(),
        board: visible(document.getElementById('ucc-test-board')),
        join: visible(document.getElementById('ucc-test-join')),
        errors: window.__uccErrors || [],
    };
});

// ── 1. Расписание /swiss открывается и фильтруется ──
{
    const p = await open('https://lichess.org/swiss', scriptBulletClosed);
    // Добавляем синтетические строки: вариант шахмат в расписании lichess встречается
    // редко, а проверить его надо. Разметка клонируется у настоящей строки.
    const opened = await p.evaluate(() => ({
        rows: document.querySelectorAll('table.swisses tbody tr').length,
        blocked: !!document.querySelector('.ucc-blocker'),
        url: location.pathname,
        title: document.title,
    }));
    if (opened.rows === 0) {
        // Так падает предыдущая версия (v0.14): /swiss в block-листе → блок-экран,
        // подмена адреса на /training, расписания в DOM нет.
        check('/swiss (расписание) открывается, блок-экрана нет', false,
            `строк расписания 0, blocked=${opened.blocked}, адрес=${opened.url}, title="${opened.title}"`);
        await p.close();
        await browser.close();
        server.close();
        console.log(`\n${results.filter((r) => r.pass).length}/${results.length} проверок пройдено`);
        process.exit(1);
    }
    const rows = await p.evaluate(() => {
        const sample = document.querySelector('table.swisses tbody tr');
        const clone = (setup, id) => {
            const row = sample.cloneNode(true);
            row.id = id;
            row.querySelector('td.infos .setup').textContent = setup;
            sample.parentNode.appendChild(row);
        };
        clone('5+0 • Crazyhouse • Рейтинговый', 'ucc-test-variant');
        clone('1+0 • Crazyhouse • Рейтинговый', 'ucc-test-variant-bullet');
        clone('2+1 • Пуля • Рейтинговый', 'ucc-test-bullet');
        return true;
    });
    if (!rows) throw new Error('нет строк в расписании — фикстура сломана');
    await new Promise((r) => setTimeout(r, 600));

    const state = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.swisses tbody tr').forEach((row) => {
            const setup = (row.querySelector('td.infos .setup')?.textContent || '').trim();
            out.push({
                id: row.id,
                setup,
                hidden: getComputedStyle(row).display === 'none',
                cls: row.className,
            });
        });
        return { blocked: !!document.querySelector('.ucc-blocker'), rows: out };
    });

    check('/swiss (расписание) открывается, блок-экрана нет', !state.blocked);
    const allowed = state.rows.filter((r) => /Рапид|Блиц|Классика/.test(r.setup) && !/Пуля|Crazyhouse/.test(r.setup));
    check('строки Рапид/Блиц/Классика видны', allowed.length > 0 && allowed.every((r) => !r.hidden),
        `${allowed.filter((r) => !r.hidden).length}/${allowed.length}`);
    const bulletRows = state.rows.filter((r) => /Пуля/.test(r.setup));
    check('строки Пуля/UltraBullet скрыты (Bullet-окно закрыто)', bulletRows.length > 0 && bulletRows.every((r) => r.hidden),
        `${bulletRows.filter((r) => r.hidden).length}/${bulletRows.length}`);
    const variant = state.rows.find((r) => r.id === 'ucc-test-variant');
    check('вариант (Crazyhouse 5+0) скрыт навсегда', !!variant && variant.hidden && /ucc-blocked-swiss(?!-bullet)/.test(variant.cls), variant?.cls);
    const variantBullet = state.rows.find((r) => r.id === 'ucc-test-variant-bullet');
    check('вариант с коротким контролем (Crazyhouse 1+0) — класс «навсегда», не bullet',
        !!variantBullet && variantBullet.hidden && !/ucc-blocked-swiss-bullet/.test(variantBullet.cls), variantBullet?.cls);
    const halfRow = state.rows.find((r) => /½/.test(r.setup));
    check('UltraBullet ½+0 — класс «навсегда»', !!halfRow && !/ucc-blocked-swiss-bullet/.test(halfRow.cls), halfRow?.cls);
    await p.close();
}

// ── 2. Страницы конкретных турниров ──
for (const [url, expect] of [
    ['https://lichess.org/swiss/UoiulDzb', { allowed: true, label: '30+0 Классика' }],
    ['https://lichess.org/swiss/MwpMRYto', { allowed: true, label: '5+0 Блиц' }],
    ['https://lichess.org/swiss/e0lJpDmJ', { allowed: false, label: '1+0 Пуля' }],
    ['https://lichess.org/swiss/NgtR3AxL', { allowed: false, label: '½+0 Пуля' }],
]) {
    const p = await open(url, scriptBulletClosed);
    const s = await readTournamentState(p);
    const ok = !s.blocked && s.board === expect.allowed && s.join === expect.allowed;
    check(`страница швейцарки ${expect.label}: ${expect.allowed ? 'доска и «Участвовать» видны' : 'доска и «Участвовать» скрыты'}`,
        ok, `meta="${s.meta}" board=${s.board} join=${s.join} blocked=${s.blocked}`);
    await p.close();
}

// ── 3. Создание своего турнира по-прежнему закрыто ──
{
    const p = await open('https://lichess.org/swiss/new/lichess-swiss', scriptBulletClosed);
    const s = await p.evaluate(() => ({
        blocked: !!document.querySelector('.ucc-blocker'),
        path: location.pathname,
    }));
    check('/swiss/new/<team> — блок-экран', s.blocked, `path=${s.path}`);
    await p.close();
}

// ── 4. Ссылки на /team в карточках швейцарок остаются скрытыми ──
{
    const p = await open('https://lichess.org/swiss/UoiulDzb', scriptBulletClosed);
    const s = await p.evaluate(() => {
        const links = [...document.querySelectorAll('a[href^="/team/"], a[href*="/team/"]')];
        return {
            total: links.length,
            visible: links.filter((a) => getComputedStyle(a).display !== 'none').length,
        };
    });
    check('ссылки на /team на странице швейцарки скрыты', s.total > 0 && s.visible === 0, `${s.total - s.visible}/${s.total}`);
    await p.close();
}

// ── 5. Bullet-окно открыто: 1+0 появляется, ½+0 — нет ──
{
    const p = await open('https://lichess.org/swiss/e0lJpDmJ', rawScript);
    const forced = await p.evaluate(() => {
        // Ставим body-класс окна вручную: сам расчёт окна (solved ≥ 400, конец расписания)
        // тестируется отдельно, здесь проверяется только реакция CSS/правил на открытое окно.
        document.body.classList.add('ucc-bullet-window-open');
        return document.body.classList.contains('ucc-bullet-window-open');
    });
    await new Promise((r) => setTimeout(r, 300));
    const s = await p.evaluate(() => {
        const row = document.createElement('tr');
        row.className = 'ucc-blocked-swiss-bullet';
        const row2 = document.createElement('tr');
        row2.className = 'ucc-blocked-swiss';
        document.body.append(row, row2);
        return {
            bulletRowShown: getComputedStyle(row).display !== 'none',
            ultraRowShown: getComputedStyle(row2).display !== 'none',
        };
    });
    check('Bullet-окно открыто → строка Пули в расписании показывается', forced && s.bulletRowShown);
    check('Bullet-окно открыто → UltraBullet/вариант остаются скрытыми', !s.ultraRowShown);
    await p.close();
}

// ── 6. Регрессия: задачи и Арена не задеты ──
for (const [url, name] of [
    ['https://lichess.org/training', 'задачи /training'],
    ['https://lichess.org/tournament', 'расписание Арены /tournament'],
]) {
    const p = await open(url, scriptBulletClosed);
    const s = await p.evaluate(() => {
        const board = document.getElementById('ucc-test-board');
        return {
            blocked: !!document.querySelector('.ucc-blocker'),
            board: board ? getComputedStyle(board).display !== 'none' : null,
            errors: window.__uccErrors || [],
        };
    });
    check(`регрессия: ${name} — доска видна, ошибок нет`, !s.blocked && s.board === true && s.errors.length === 0,
        `blocked=${s.blocked} board=${s.board} errors=${JSON.stringify(s.errors)}`);
    await p.close();
}

await browser.close();
server.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} проверок пройдено`);
process.exit(passed === results.length ? 0 : 1);
