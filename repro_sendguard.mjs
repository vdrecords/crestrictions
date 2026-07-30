// Репро v0.14: предохранитель отправки + подмена адреса заблокированной страницы.
// Стенд: HTTPS-сервер (lichess.org в preload-HSTS, http туда нельзя) + минимальный
// WebSocket-сервер; юзерскрипт внедряется с шимами GM_* на document-start, как TM.
//
// Запуск (сертификат нужен один раз, рядом со скриптом):
//   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 \
//     -subj "/CN=lichess.org" -addext "subjectAltName=DNS:lichess.org,DNS:socket.lichess.org,DNS:www.chess.com"
//   node repro_sendguard.mjs      # ожидается 20/20
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/opt/homebrew/lib/node_modules/');
const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer-core');

const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname); // cert.pem / key.pem рядом
const SCRIPT_PATH = '/Users/vd/Documents/Vibe coding/Tampermonkey/chess control/crestrictions-main/11_unified_chess_control.js';
// Стенд открывает расписание на все сутки: иначе таймблокер зовёт window.stop() и
// документ остаётся без body — тестовой формы просто нет в DOM (проверено 30.07).
const userscript = fs.readFileSync(SCRIPT_PATH, 'utf8').replaceAll("'16:00', '18:00'", "'00:00', '23:59'");

const httpHits = [];   // все не-GET запросы, дошедшие до сервера
const wsFrames = [];   // все текстовые кадры, дошедшие до сервера

const html = (title) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>
<h1>${title}</h1>
<form id="native-form" method="post" action="/inbox/friend"><textarea name="text">привет</textarea><button type="submit">Отправить</button></form>
</body></html>`;

const server = https.createServer(
    { key: fs.readFileSync(`${HERE}/key.pem`), cert: fs.readFileSync(`${HERE}/cert.pem`) },
    (req, res) => {
        if (req.method !== 'GET') {
            httpHits.push(`${req.method} ${req.url}`);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"ok":true}');
            return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html(req.url.startsWith('/inbox') ? 'Инбокс' : 'Задачи'));
    }
);

// Минимальный WebSocket-сервер: рукопожатие + разбор клиентских (маскированных) кадров.
server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    socket.on('data', (buf) => {
        let offset = 0;
        while (offset + 2 <= buf.length) {
            const opcode = buf[offset] & 0x0f;
            const masked = (buf[offset + 1] & 0x80) === 0x80;
            let len = buf[offset + 1] & 0x7f;
            let cursor = offset + 2;
            if (len === 126) { len = buf.readUInt16BE(cursor); cursor += 2; }
            else if (len === 127) { len = Number(buf.readBigUInt64BE(cursor)); cursor += 8; }
            let mask = null;
            if (masked) { mask = buf.subarray(cursor, cursor + 4); cursor += 4; }
            const payload = Buffer.from(buf.subarray(cursor, cursor + len));
            if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
            if (opcode === 0x1) wsFrames.push(payload.toString('utf8'));
            offset = cursor + len;
        }
    });
    socket.on('error', () => {});
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const GM_SHIMS = `
    const unsafeWindow = window;
    function GM_addStyle(css) {
        const s = document.createElement('style'); s.textContent = css;
        const root = document.head || document.documentElement;
        // Tampermonkey в этой ситуации откладывает вставку — эмулируем то же.
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

// Трекер-гейт редиректит на /racer, пока дневная цель не выполнена, — чтобы это не
// уводило со тестовой страницы, ставим флаг разблокировки в localStorage до скрипта.
const UNLOCK = `
    try {
        const today = new Date();
        const key = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        window.localStorage.setItem('lichess_racer_unlock_flag', JSON.stringify({ date: key, granted: true }));
        window.localStorage.setItem('gm:unlock_flag_72_' + key, '1');
    } catch (e) {}
`;

async function newGuardedPage() {
    const p = await browser.newPage();
    await p.evaluateOnNewDocument(UNLOCK + GM_SHIMS + userscript);
    return p;
}

// ── Тест 1: /inbox, скрипт внедрён на document-start (нормальный режим) ──
{
    const p = await newGuardedPage();
    await p.goto('https://lichess.org/inbox/friend', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    const state = await p.evaluate(() => ({
        url: location.pathname,
        blocked: !!document.querySelector('.ucc-blocker'),
        hasForm: !!document.getElementById('native-form'),
    }));
    check('/inbox заменён блок-экраном', state.blocked && !state.hasForm, JSON.stringify(state));
    check('адрес вкладки подменён на /training (сессия не восстановит инбокс)', state.url === '/training', state.url);
    await p.close();
}

// ── Тест 2: разрешённая страница, отправка в инбокс всеми каналами ──
{
    const p = await newGuardedPage();
    await p.goto('https://lichess.org/racer', { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 400));

    const startPath = await p.evaluate(() => location.pathname);
    check('тест идёт на разрешённой странице', startPath === '/racer', p.url());
    check('предохранитель установлен', await p.evaluate(() => !!window.__uccSendGuardInstalled));

    const fetchPost = await p.evaluate(async () => {
        try { await fetch('/inbox/friend', { method: 'POST', body: 'x' }); return 'passed'; }
        catch (e) { return 'rejected'; }
    });
    check('fetch POST /inbox/friend отклонён', fetchPost === 'rejected', fetchPost);

    const xhrPost = await p.evaluate(() => new Promise((resolve) => {
        const x = new XMLHttpRequest();
        x.open('POST', '/inbox/friend');
        x.onload = () => resolve('passed');
        try { x.send('x'); } catch (e) { return resolve('threw'); }
        setTimeout(() => resolve(x.readyState === 1 ? 'not-sent' : 'state-' + x.readyState), 400);
    }));
    check('XHR POST /inbox/friend не ушёл', xhrPost === 'not-sent', xhrPost);

    check('sendBeacon в инбокс отклонён', (await p.evaluate(() => navigator.sendBeacon('/inbox/friend', 'x'))) === false);

    // Реальный сокет: оба кадра уходят в открытое соединение, сервер их считает.
    const wsResult = await p.evaluate(() => new Promise((resolve) => {
        const ws = new WebSocket('wss://socket.lichess.org/msg/v6');
        ws.onopen = () => {
            ws.send(JSON.stringify({ t: 'msgSend', d: { dest: 'friend', text: 'привет' } }));
            ws.send(JSON.stringify({ t: 'move', d: 'e4' }));
            setTimeout(() => resolve('sent-both'), 300);
        };
        ws.onerror = () => resolve('socket-error');
        setTimeout(() => resolve('timeout'), 3000);
    }));
    check('сокет открыт, кадры отправлены', wsResult === 'sent-both', wsResult);
    check('кадр msgSend до сервера не дошёл', !wsFrames.some((f) => f.includes('msgSend')), JSON.stringify(wsFrames));
    check('обычный кадр (ход) до сервера дошёл — игру не сломали', wsFrames.some((f) => f.includes('"move"')), JSON.stringify(wsFrames));

    // Нативный submit формы: не проходит ни через fetch, ни через XHR.
    await p.evaluate(() => document.getElementById('native-form').requestSubmit());
    await new Promise((r) => setTimeout(r, 400));
    check('нативный submit формы отменён (не ушли со страницы)', (await p.evaluate(() => location.pathname)) === startPath, p.url());

    // form.submit() из кода — событие submit не возникает.
    await p.evaluate(() => { try { document.getElementById('native-form').submit(); } catch (e) {} });
    await new Promise((r) => setTimeout(r, 400));
    check('form.submit() из кода отменён', (await p.evaluate(() => location.pathname)) === startPath, p.url());

    // Контроль ложных срабатываний.
    const legitPost = await p.evaluate(async () => {
        try { const r = await fetch('/training/complete', { method: 'POST', body: '{}' }); return r.ok ? 'passed' : 'status-' + r.status; }
        catch (e) { return 'rejected'; }
    });
    check('легальный POST /training/complete прошёл', legitPost === 'passed', legitPost);

    const legitXhr = await p.evaluate(() => new Promise((resolve) => {
        const x = new XMLHttpRequest();
        x.open('POST', '/racer/score');
        x.onload = () => resolve('passed');
        x.onerror = () => resolve('error');
        x.send('{}');
        setTimeout(() => resolve('not-sent'), 400);
    }));
    check('легальный XHR POST /racer/score прошёл', legitXhr === 'passed', legitXhr);

    const legitGet = await p.evaluate(async () => {
        try { const r = await fetch('/inbox/friend', { method: 'GET' }); return r.ok ? 'passed' : 'status-' + r.status; }
        catch (e) { return 'rejected'; }
    });
    check('GET предохранителем не режется (за чтение отвечает блок-экран)', legitGet === 'passed', legitGet);

    const errors = await p.evaluate(() => window.__uccErrors);
    check('без ошибок JS на странице', errors.length === 0, JSON.stringify(errors));
    await p.close();
}

// ── Тест 3: ГОНКА — страница уже отрисована, скрипт приходит позже ──
{
    const p = await browser.newPage();
    await p.goto('https://lichess.org/inbox/friend', { waitUntil: 'load' });
    check('до внедрения инбокс живой (гонка воспроизведена)', await p.evaluate(() => !!document.getElementById('native-form')));

    // Ребёнок успел набрать текст, пока скрипта нет.
    await p.evaluate(() => { document.querySelector('#native-form textarea').value = 'привет, это я'; });
    await p.evaluate(UNLOCK + GM_SHIMS + userscript);
    await new Promise((r) => setTimeout(r, 400));
    const after = await p.evaluate(() => ({
        url: location.pathname,
        blocked: !!document.querySelector('.ucc-blocker'),
        hasForm: !!document.getElementById('native-form'),
    }));
    check('позднее внедрение: инбокс закрыт блок-экраном', after.blocked && !after.hasForm, JSON.stringify(after));
    check('позднее внедрение: адрес подменён', after.url === '/training', after.url);
    await p.close();
}

check('на сервер не пришло ни одной отправки в инбокс', !httpHits.some((h) => h.includes('/inbox')), JSON.stringify(httpHits));

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(`\nИтого: ${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) console.log('Провалено:', failed.map((f) => f.name).join(' | '));
process.exit(failed.length ? 1 : 0);
