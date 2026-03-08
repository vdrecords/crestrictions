// ==UserScript==
// @name         11_unified_chess_control
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  Единый userscript: блокировки, фильтры Chess.com/Lichess, Racer/ChessTempo трекер и контроль сообщений
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        debug: false,

        modules: {
            urlBlocker: true,
            timeBlocker: true,
            tracker: true,
            chessComFilter: true,
            lichessFilter: true,
            messageControl: true
        },

        storage: {
            courseId: 72,
            trackerDateKey: 'unified_chess_control_date',
            unlockStorageKey: 'lichess_racer_unlock_flag',
            progressStorageKey: 'lichess_tracker_data'
        },

        urlBlocker: {
            blockedHosts: [
                'youtube.com',
                'music.youtube.com',
                'chrome.google.com',
                'chromewebstore.google.com',
                'addons.mozilla.org',
                'microsoftedge.microsoft.com',
                'opera.com',
                'addons.opera.com',
                'yandex.ru'
            ],
            allowedHosts: [
                'learn.chessking.com',
                'allcantrip.ru',
                'start.bizon365.ru',
                'worldchess.com',
                'chess.com',
                'lichess.org',
                'chesstempo.com',
                'deepl.com'
            ],
            quickLinks: [
                ['ChessKing', 'https://learn.chessking.com'],
                ['Chess.com', 'https://www.chess.com'],
                ['Lichess', 'https://lichess.org'],
                ['ChessTempo', 'https://chesstempo.com/chess-tactics/']
            ],
            tournamentMode: false,
            tournamentAllowedUrls: [
                'https://learn.chessking.com/learning/course/72',
                'https://www.chess.com/puzzles/battle',
                'https://www.chess.com/puzzles/rush'
            ]
        },

        timeBlocker: {
            warningMinutes: 20,
            weeklyUnlocked: {
                0: [['09:00', '13:00'], ['18:00', '20:00']],
                1: [['09:00', '13:00'], ['18:00', '20:00']],
                2: [['09:00', '13:00'], ['18:00', '20:00']],
                3: [['09:00', '13:00'], ['18:00', '20:00']],
                4: [['09:00', '13:00'], ['18:00', '20:00']],
                5: [['09:00', '13:00'], ['18:00', '20:00']],
                6: [['09:00', '13:00'], ['18:00', '20:00']]
            },
            dateOverrides: {
                '2025-11-16': {
                    patch: [{ index: 0, to: '14:00' }]
                },
                '2025-12-23': {
                    patch: [{ index: 1, from: '16:00' }],
                    extra: [['00:00', '21:00']]
                }
            }
        },

        tracker: {
            weeklyTargets: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
            specialTargets: {
                '2025-12-19': 200
            },
            activeSources: ['lichess', 'chesstempo'],
            preferredSource: 'lichess',
            enableChessComPuzzlesMode: true,
            chessComPuzzlesRoot: '/puzzles',
            showProgressWindow: true,
            processedRaceKeepDays: 7
        },

        chessCom: {
            blockedTournamentKeywords: [
                'Bullet',
                'Live 960',
                '3 Check',
                'King of the Hill',
                'Crazyhouse',
                'Bughouse'
            ],
            blockedTimeLabels: ['1 мин.'],
            blockedSectionLabels: ['Заочные', 'Пуля', 'Последние'],
            staticHideSelectors: [
                'a[href="/variants"]',
                'a[data-nav-link="play"]',
                '.layout-column-two',
                '.tournaments-filter-component',
                '.competition-announcements-competition',
                '.direct-menu-sub-items',
                '.nav-search-form',
                '.toggle-custom-game-component',
                '.live-stats-component',
                'div[data-tab="games"]',
                'div[data-tab="players"]',
                '.tournaments-header-tabs-component .tournament-header-buttons-component',
                '.tournaments-header-tabs-component nav a:not(.tournaments-header-tabs-highlighted)',
                'footer#navigation-footer'
            ]
        },

        lichess: {
            disableOnDates: ['2025-11-16'],
            allowedGameTypes: ['Блиц', 'Рапид', 'Blitz', 'Rapid'],
            boardSelectors: [
                '.round__app__board.main-board',
                '.main-board',
                '.board',
                '.cg-wrap'
            ],
            blockedTrainingPaths: [
                '/training/openings',
                '/training/mate',
                '/training/mateIn1',
                '/training/mateIn2',
                '/training/mateIn3',
                '/training/mateIn4',
                '/training/anastasiaMate',
                '/training/arabianMate',
                '/training/backRankMate',
                '/training/bodenMate',
                '/training/doubleBishopMate',
                '/training/dovetailMate',
                '/training/hookMate',
                '/training/killBoxMate',
                '/training/vukovicMate',
                '/training/smotheredMate',
                '/training/castling',
                '/training/enPassant',
                '/training/promotion',
                '/training/underPromotion',
                '/training/oneMove',
                '/training/short',
                '/training/long'
            ]
        },

        messageControl: {
            tasksPerMessage: 10,
            formSelectors: [
                '.msg-app__convo__post',
                'form.form3.reply',
                'form.form3:not(.reply)',
                'form#team-message-form',
                'form.team-message',
                'form[action*="/team/"][action*="/pm"]',
                'form[action*="/team/"][action*="/messages"]',
                'form[action*="/inbox/"]'
            ]
        }
    };

    const HOST = window.location.hostname.toLowerCase();
    const PATH = window.location.pathname;
    const HREF = window.location.href;
    const COURSE_ID = String(CONFIG.storage.courseId);
    const ACTIVE_SOURCE_SET = new Set(CONFIG.tracker.activeSources);

    const RUNTIME = {
        timeBlocker: {
            blocked: false,
            overlay: null,
            warningTimerEl: null
        },
        tracker: {
            progressWindowInterval: null,
            racerMonitorStarted: false,
            chessTempoMonitorStarted: false,
            chessTempoPuzzleKey: '',
            chessTempoPuzzleCounted: false
        },
        messageControl: {
            formRefreshers: new Set()
        }
    };

    function log(...args) {
        if (CONFIG.debug) {
            console.log('[UnifiedChessControl]', ...args);
        }
    }

    function addStyle(css) {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            return;
        }
        const style = document.createElement('style');
        style.textContent = css;
        document.documentElement.appendChild(style);
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function formatDateKey(date = new Date()) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    function parseTimeString(value) {
        const [hoursRaw, minutesRaw = '0'] = String(value).split(':');
        const hours = Number.parseInt(hoursRaw, 10);
        const minutes = Number.parseInt(minutesRaw, 10);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) {
            throw new Error(`Invalid time string: ${value}`);
        }
        return hours * 60 + minutes;
    }

    function minutesToTimeString(totalMinutes) {
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        return `${pad2(hours)}:${pad2(minutes)}`;
    }

    function getCurrentMinutes(date = new Date()) {
        return date.getHours() * 60 + date.getMinutes();
    }

    function readValue(key, fallback = null) {
        return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
    }

    function writeValue(key, value) {
        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
        }
    }

    function deleteValue(key) {
        if (typeof GM_deleteValue === 'function') {
            GM_deleteValue(key);
        }
    }

    function readNumber(key, fallback = 0) {
        const raw = readValue(key, null);
        const value = Number.parseInt(raw, 10);
        return Number.isNaN(value) ? fallback : value;
    }

    function writeNumber(key, value) {
        writeValue(key, String(Number.isFinite(value) ? value : 0));
    }

    function onReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function debounce(fn, delay) {
        let timer = null;
        return function debounced(...args) {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), delay);
        };
    }

    function observeBody(callback, delay = 120) {
        onReady(() => {
            callback();
            const run = debounce(callback, delay);
            const observer = new MutationObserver(() => run());
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    function safeHide(element) {
        if (!element) return;
        element.style.setProperty('display', 'none', 'important');
    }

    function hostMatches(list, host = HOST) {
        return list.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

    function replaceDocument(title, heading, message, links = []) {
        const linkHtml = links.map(([label, href]) => {
            return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
        }).join('');

        document.open('text/html', 'replace');
        document.write(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f7f5ef;
      color: #231f17;
      font: 16px/1.5 Arial, sans-serif;
    }
    .ucc-blocker {
      width: min(560px, calc(100vw - 32px));
      padding: 32px;
      border: 2px solid #7d2217;
      border-radius: 14px;
      background: #fffaf3;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.12);
      text-align: center;
    }
    .ucc-blocker h1 {
      margin: 0 0 12px;
      font-size: 30px;
      color: #7d2217;
    }
    .ucc-blocker p {
      margin: 0 0 18px;
    }
    .ucc-links {
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }
    .ucc-links a {
      display: block;
      padding: 10px 14px;
      border-radius: 10px;
      background: #efe2cb;
      color: #231f17;
      text-decoration: none;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="ucc-blocker">
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    <div class="ucc-links">${linkHtml}</div>
  </div>
</body>
</html>`);
        document.close();
    }

    function trackerKeys(dateKey) {
        return {
            dailySolved: `daily_solved_${COURSE_ID}_${dateKey}`,
            cachedSolved: `cached_solved_${COURSE_ID}_${dateKey}`,
            cachedUnlock: `cached_unlock_${COURSE_ID}_${dateKey}`,
            racerSolved: `racer_puzzles_${COURSE_ID}_${dateKey}`,
            unlockFlag: `daily_unlock_flag_${COURSE_ID}_${dateKey}`,
            messagesSent: `messages_sent_${COURSE_ID}_${dateKey}`
        };
    }

    function getDailyTarget(date = new Date()) {
        const dateKey = formatDateKey(date);
        if (Object.hasOwn(CONFIG.tracker.specialTargets, dateKey)) {
            return CONFIG.tracker.specialTargets[dateKey];
        }
        const mondayBasedIndex = (date.getDay() + 6) % 7;
        return CONFIG.tracker.weeklyTargets[mondayBasedIndex] || CONFIG.tracker.weeklyTargets[0];
    }

    function persistUnlockFlag(dateKey, granted) {
        const payload = {
            courseId: CONFIG.storage.courseId,
            date: dateKey,
            granted: Boolean(granted),
            key: trackerKeys(dateKey).unlockFlag,
            timestamp: Date.now()
        };
        try {
            window.lichessRacerUnlockData = payload;
        } catch (error) {
            log('persistUnlockFlag window failed', error);
        }
        try {
            localStorage.setItem(CONFIG.storage.unlockStorageKey, JSON.stringify(payload));
        } catch (error) {
            log('persistUnlockFlag localStorage failed', error);
        }
    }

    function setUnlockFlag(dateKey, granted, broadcast = true) {
        const key = trackerKeys(dateKey).unlockFlag;
        const value = granted ? '1' : '0';
        const hasChanged = readValue(key, null) !== value;
        if (hasChanged) {
            writeValue(key, value);
        }
        persistUnlockFlag(dateKey, granted);
        if (broadcast && hasChanged) {
            try {
                window.dispatchEvent(new CustomEvent('lichessRacerUnlockFlag', {
                    detail: { date: dateKey, granted: Boolean(granted), key, courseId: CONFIG.storage.courseId }
                }));
            } catch (error) {
                log('unlock flag event failed', error);
            }
        }
    }

    function publishProgress(dateKey, solved) {
        const payload = {
            solved,
            courseId: CONFIG.storage.courseId,
            date: dateKey,
            key: trackerKeys(dateKey).dailySolved,
            source: 'unified',
            timestamp: Date.now()
        };
        try {
            window.lichessTrackerData = payload;
        } catch (error) {
            log('publishProgress window failed', error);
        }
        try {
            localStorage.setItem(CONFIG.storage.progressStorageKey, JSON.stringify(payload));
        } catch (error) {
            log('publishProgress localStorage failed', error);
        }
        onReady(() => {
            let marker = document.getElementById('lichess-tracker-data');
            if (!marker) {
                marker = document.createElement('div');
                marker.id = 'lichess-tracker-data';
                marker.style.display = 'none';
                document.body.appendChild(marker);
            }
            marker.dataset.solved = String(solved);
            marker.dataset.courseId = COURSE_ID;
            marker.dataset.date = dateKey;
            marker.dataset.key = trackerKeys(dateKey).dailySolved;
        });
        try {
            window.dispatchEvent(new CustomEvent('lichessTrackerUpdate', { detail: payload }));
        } catch (error) {
            log('progress event failed', error);
        }
    }

    function syncTrackerState(dateKey, { broadcast = false } = {}) {
        const keys = trackerKeys(dateKey);
        const target = getDailyTarget(new Date(`${dateKey}T00:00:00`));
        const solved = readNumber(keys.racerSolved, 0);
        const remaining = Math.max(target - solved, 0);
        writeNumber(keys.dailySolved, solved);
        writeNumber(keys.cachedSolved, solved);
        writeNumber(keys.cachedUnlock, remaining);
        if (readValue(keys.messagesSent, null) === null) {
            writeNumber(keys.messagesSent, 0);
        }
        setUnlockFlag(dateKey, remaining === 0, broadcast);
        if (broadcast) {
            publishProgress(dateKey, solved);
        }
        return {
            dateKey,
            solved,
            target,
            remaining,
            unlockGranted: remaining === 0,
            keys
        };
    }

    function cleanupProcessedRaceKeys() {
        if (typeof GM_listValues !== 'function') return;
        const keepAfter = Date.now() - (CONFIG.tracker.processedRaceKeepDays * 24 * 60 * 60 * 1000);
        GM_listValues().forEach((key) => {
            if (!key.startsWith('processed_race_')) return;
            const timestamp = readNumber(key, 0);
            if (timestamp > 0 && timestamp < keepAfter) {
                deleteValue(key);
            }
        });
    }

    function ensureTrackerDate() {
        const todayKey = formatDateKey();
        const savedDateKey = readValue(CONFIG.storage.trackerDateKey, null);
        const keys = trackerKeys(todayKey);
        const target = getDailyTarget();

        if (savedDateKey !== todayKey) {
            writeValue(CONFIG.storage.trackerDateKey, todayKey);
            writeNumber(keys.dailySolved, 0);
            writeNumber(keys.cachedSolved, 0);
            writeNumber(keys.cachedUnlock, target);
            writeNumber(keys.racerSolved, 0);
            writeNumber(keys.messagesSent, 0);
            setUnlockFlag(todayKey, false, false);
            cleanupProcessedRaceKeys();
        } else {
            if (readValue(keys.dailySolved, null) === null) writeNumber(keys.dailySolved, 0);
            if (readValue(keys.cachedSolved, null) === null) writeNumber(keys.cachedSolved, 0);
            if (readValue(keys.cachedUnlock, null) === null) writeNumber(keys.cachedUnlock, target);
            if (readValue(keys.racerSolved, null) === null) writeNumber(keys.racerSolved, 0);
            if (readValue(keys.messagesSent, null) === null) writeNumber(keys.messagesSent, 0);
            if (readValue(keys.unlockFlag, null) === null) setUnlockFlag(todayKey, false, false);
        }

        return todayKey;
    }

    function initUrlBlocker() {
        if (!CONFIG.modules.urlBlocker) return false;

        if (CONFIG.urlBlocker.tournamentMode) {
            const allowed = CONFIG.urlBlocker.tournamentAllowedUrls.some((prefix) => HREF.startsWith(prefix));
            if (!allowed) {
                replaceDocument(
                    'Tournament mode',
                    'Доступ ограничен',
                    'Сейчас разрешены только страницы турнирного режима.',
                    CONFIG.urlBlocker.tournamentAllowedUrls.map((href) => [href, href])
                );
                return true;
            }
            return false;
        }

        if (hostMatches(CONFIG.urlBlocker.blockedHosts)) {
            replaceDocument(
                'Blocked',
                'Страница заблокирована',
                'Этот домен находится в списке явной блокировки.',
                CONFIG.urlBlocker.quickLinks
            );
            return true;
        }

        if (!hostMatches(CONFIG.urlBlocker.allowedHosts)) {
            replaceDocument(
                'Access denied',
                'Доступ закрыт',
                'Этот домен не входит в список разрешённых.',
                CONFIG.urlBlocker.quickLinks
            );
            return true;
        }

        return false;
    }

    function getUnlockedWindowsForDate(date) {
        const rawWindows = (CONFIG.timeBlocker.weeklyUnlocked[date.getDay()] || []).map(([from, to]) => ({
            start: parseTimeString(from),
            end: parseTimeString(to)
        }));

        const override = CONFIG.timeBlocker.dateOverrides[formatDateKey(date)];
        if (override) {
            (override.patch || []).forEach((patch) => {
                const target = rawWindows[patch.index];
                if (!target) return;
                if (patch.from) target.start = parseTimeString(patch.from);
                if (patch.to) target.end = parseTimeString(patch.to);
            });
            (override.extra || []).forEach(([from, to]) => {
                rawWindows.push({ start: parseTimeString(from), end: parseTimeString(to) });
            });
        }

        return rawWindows
            .filter((windowItem) => windowItem.start < windowItem.end)
            .sort((a, b) => a.start - b.start);
    }

    function getNextUnlockDate(now) {
        for (let offset = 0; offset <= 7; offset += 1) {
            const candidateDate = new Date(now);
            candidateDate.setHours(0, 0, 0, 0);
            candidateDate.setDate(candidateDate.getDate() + offset);
            const currentMinutes = offset === 0 ? getCurrentMinutes(now) : -1;
            const windows = getUnlockedWindowsForDate(candidateDate);
            const nextWindow = windows.find((windowItem) => windowItem.start > currentMinutes);
            if (nextWindow) {
                const unlockDate = new Date(candidateDate);
                unlockDate.setMinutes(nextWindow.start);
                return unlockDate;
            }
        }
        return null;
    }

    function ensureTimeOverlay() {
        if (RUNTIME.timeBlocker.overlay) return RUNTIME.timeBlocker.overlay;
        const overlay = document.createElement('div');
        overlay.id = 'ucc-time-blocker-overlay';
        overlay.innerHTML = `
            <div class="ucc-time-blocker-card">
                <h1 id="ucc-time-blocker-title">Время закончилось</h1>
                <p id="ucc-time-blocker-message"></p>
            </div>
        `;
        overlay.style.cssText = [
            'display:none',
            'position:fixed',
            'inset:0',
            'z-index:2147483647',
            'background:rgba(19,16,11,0.94)',
            'align-items:center',
            'justify-content:center',
            'padding:24px',
            'box-sizing:border-box'
        ].join(';');
        onReady(() => document.documentElement.appendChild(overlay));
        RUNTIME.timeBlocker.overlay = overlay;
        return overlay;
    }

    function ensureWarningTimer() {
        if (RUNTIME.timeBlocker.warningTimerEl) return RUNTIME.timeBlocker.warningTimerEl;
        const el = document.createElement('div');
        el.id = 'ucc-time-warning';
        el.style.cssText = [
            'display:none',
            'position:fixed',
            'top:12px',
            'left:12px',
            'z-index:2147483647',
            'padding:10px 14px',
            'border-radius:10px',
            'background:rgba(255, 216, 92, 0.96)',
            'color:#17120d',
            'font:700 14px Arial, sans-serif',
            'box-shadow:0 10px 24px rgba(0,0,0,0.18)'
        ].join(';');
        onReady(() => document.documentElement.appendChild(el));
        RUNTIME.timeBlocker.warningTimerEl = el;
        return el;
    }

    function showBlockedOverlay(message) {
        const overlay = ensureTimeOverlay();
        const messageEl = overlay.querySelector('#ucc-time-blocker-message');
        if (messageEl) messageEl.textContent = message;
        overlay.style.display = 'flex';
        if (!RUNTIME.timeBlocker.blocked) {
            window.stop();
        }
        RUNTIME.timeBlocker.blocked = true;
    }

    function hideBlockedOverlay() {
        const overlay = ensureTimeOverlay();
        overlay.style.display = 'none';
        RUNTIME.timeBlocker.blocked = false;
    }

    function showWarning(text) {
        const warning = ensureWarningTimer();
        warning.textContent = text;
        warning.style.display = 'block';
    }

    function hideWarning() {
        const warning = ensureWarningTimer();
        warning.style.display = 'none';
    }

    function initTimeBlocker() {
        if (!CONFIG.modules.timeBlocker) return;

        addStyle(`
            #ucc-time-blocker-overlay .ucc-time-blocker-card {
                width: min(560px, calc(100vw - 32px));
                padding: 30px 28px;
                border-radius: 18px;
                background: linear-gradient(180deg, #fff9ef 0%, #efe0c3 100%);
                color: #231f17;
                text-align: center;
                box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
                font-family: Arial, sans-serif;
            }
            #ucc-time-blocker-overlay h1 {
                margin: 0 0 12px;
                font-size: 34px;
                color: #7d2217;
            }
            #ucc-time-blocker-overlay p {
                margin: 0;
                font-size: 18px;
            }
        `);

        const applyState = () => {
            const now = new Date();
            const currentMinutes = getCurrentMinutes(now);
            const windows = getUnlockedWindowsForDate(now);
            const activeWindow = windows.find((windowItem) => currentMinutes >= windowItem.start && currentMinutes < windowItem.end) || null;

            if (!activeWindow) {
                const nextUnlock = getNextUnlockDate(now);
                const message = nextUnlock
                    ? (formatDateKey(nextUnlock) === formatDateKey(now)
                        ? `Разблокируется в ${minutesToTimeString(getCurrentMinutes(nextUnlock))}`
                        : `Разблокируется ${pad2(nextUnlock.getDate())}.${pad2(nextUnlock.getMonth() + 1)} в ${minutesToTimeString(getCurrentMinutes(nextUnlock))}`)
                    : 'Следующее окно разблокировки не найдено';
                showBlockedOverlay(message);
                hideWarning();
                return;
            }

            hideBlockedOverlay();
            const minutesLeft = activeWindow.end - currentMinutes;
            if (minutesLeft > 0 && minutesLeft <= CONFIG.timeBlocker.warningMinutes) {
                showWarning(`До блокировки осталось ${minutesLeft} мин.`);
            } else {
                hideWarning();
            }
        };

        applyState();
        window.setInterval(applyState, 60000);
    }

    function createProgressWindow() {
        if (!CONFIG.tracker.showProgressWindow) return null;
        let windowEl = document.getElementById('ucc-progress-window');
        if (windowEl) return windowEl;

        windowEl = document.createElement('div');
        windowEl.id = 'ucc-progress-window';
        windowEl.innerHTML = `
            <div class="ucc-progress-title">Прогресс задач</div>
            <div class="ucc-progress-row">Решено: <strong data-role="solved">0</strong></div>
            <div class="ucc-progress-row">Цель: <strong data-role="target">0</strong></div>
            <div class="ucc-progress-row">Осталось: <strong data-role="remaining">0</strong></div>
        `;
        windowEl.style.cssText = [
            'position:fixed',
            'top:72px',
            'right:18px',
            'z-index:2147483647',
            'min-width:220px',
            'padding:14px 16px',
            'border-radius:14px',
            'background:rgba(24, 92, 168, 0.94)',
            'color:#fff',
            'font:14px/1.45 Arial, sans-serif',
            'box-shadow:0 18px 40px rgba(0,0,0,0.24)'
        ].join(';');
        onReady(() => document.body.appendChild(windowEl));
        return windowEl;
    }

    function updateProgressWindow() {
        if (!CONFIG.tracker.showProgressWindow) return;
        const windowEl = createProgressWindow();
        if (!windowEl) return;
        const state = syncTrackerState(formatDateKey());
        const solvedEl = windowEl.querySelector('[data-role="solved"]');
        const targetEl = windowEl.querySelector('[data-role="target"]');
        const remainingEl = windowEl.querySelector('[data-role="remaining"]');
        if (solvedEl) solvedEl.textContent = String(state.solved);
        if (targetEl) targetEl.textContent = String(state.target);
        if (remainingEl) {
            remainingEl.textContent = String(state.remaining);
            remainingEl.style.color = state.remaining === 0 ? '#9cffb2' : '#ffe17e';
        }
        const titleEl = windowEl.querySelector('.ucc-progress-title');
        if (titleEl) titleEl.textContent = state.remaining === 0 ? 'Цель выполнена' : 'Прогресс задач';
    }

    function ensureProgressHeartbeat() {
        if (RUNTIME.tracker.progressWindowInterval) return;
        RUNTIME.tracker.progressWindowInterval = window.setInterval(updateProgressWindow, 3000);
    }

    function addSolvedPuzzles(count, source = 'unknown') {
        const dateKey = formatDateKey();
        const keys = trackerKeys(dateKey);
        const nextSolved = readNumber(keys.racerSolved, 0) + count;
        writeNumber(keys.racerSolved, nextSolved);
        const state = syncTrackerState(dateKey, { broadcast: true });
        log(`tracker +${count} from ${source}`, state);
        updateProgressWindow();
        return state;
    }

    function getTrainingRedirectTarget() {
        if (CONFIG.tracker.preferredSource === 'chesstempo' && ACTIVE_SOURCE_SET.has('chesstempo')) {
            return 'https://chesstempo.com/chess-tactics/';
        }
        if (ACTIVE_SOURCE_SET.has('lichess')) {
            return 'https://lichess.org/racer';
        }
        if (ACTIVE_SOURCE_SET.has('chesstempo')) {
            return 'https://chesstempo.com/chess-tactics/';
        }
        return 'https://lichess.org/racer';
    }

    function isChessComPuzzlesPage() {
        const allowedHosts = ['chess.com', 'www.chess.com'];
        if (!CONFIG.tracker.enableChessComPuzzlesMode) return false;
        if (!allowedHosts.includes(HOST)) return false;
        const root = CONFIG.tracker.chessComPuzzlesRoot;
        return PATH === root || PATH.startsWith(`${root}/`);
    }

    function initRacerMonitoring() {
        if (RUNTIME.tracker.racerMonitorStarted) return;
        RUNTIME.tracker.racerMonitorStarted = true;

        const processRaceIfReady = () => {
            if (!PATH.startsWith('/racer/') || PATH === '/racer/') return;
            const processedKey = `processed_race_${PATH}`;
            if (readValue(processedKey, null)) return;

            const history = document.querySelector('.puz-history__rounds');
            const raceFinished = history ||
                document.querySelector('.racer__post') ||
                /Гонка завершена|Race finished|Следующая гонка|Сыгранные задачи/.test(document.body.textContent || '');

            if (!raceFinished) return;

            writeValue(processedKey, String(Date.now()));

            let solvedCount = 0;
            if (history) {
                history.querySelectorAll('.puz-history__round').forEach((round) => {
                    if (round.querySelector('good')) solvedCount += 1;
                });
            } else {
                solvedCount = 1;
            }

            if (solvedCount > 0) {
                addSolvedPuzzles(solvedCount, 'lichess-racer');
            }
        };

        observeBody(processRaceIfReady, 150);
        window.setInterval(processRaceIfReady, 1000);
    }

    function getChessTempoPuzzleKey() {
        const puzzleNode = document.querySelector('[data-problem-id], [data-puzzle-id], [data-problemid]');
        if (puzzleNode) {
            const id = puzzleNode.getAttribute('data-problem-id') ||
                puzzleNode.getAttribute('data-puzzle-id') ||
                puzzleNode.getAttribute('data-problemid');
            if (id) return `id:${id}`;
        }
        return `url:${PATH}${window.location.search}${window.location.hash}`;
    }

    function initChessTempoMonitoring() {
        if (RUNTIME.tracker.chessTempoMonitorStarted) return;
        RUNTIME.tracker.chessTempoMonitorStarted = true;

        addStyle(`
            body > header,
            body > nav,
            .ct-appbar,
            .ct-top-nav,
            .ct-top-menu,
            .ct-main-toolbar,
            .ct-nav-bar,
            .ct-navbar {
                display: none !important;
            }
            body {
                padding-top: 0 !important;
            }
        `);

        const refresh = () => {
            const nextKey = getChessTempoPuzzleKey();
            if (nextKey !== RUNTIME.tracker.chessTempoPuzzleKey) {
                RUNTIME.tracker.chessTempoPuzzleKey = nextKey;
                RUNTIME.tracker.chessTempoPuzzleCounted = false;
            }

            const solved = document.querySelector(
                '.ct-problem-result-output.ct-correct, .ct-problem-result.ct-correct, .ct-problem-result .ct-correct, problem-result .ct-correct'
            );
            if (solved && !RUNTIME.tracker.chessTempoPuzzleCounted) {
                RUNTIME.tracker.chessTempoPuzzleCounted = true;
                addSolvedPuzzles(1, 'chesstempo');
            }
        };

        observeBody(refresh, 120);
        window.setInterval(refresh, 1000);
    }

    function initTracker() {
        if (!CONFIG.modules.tracker) return { redirected: false };

        const dateKey = ensureTrackerDate();
        const state = syncTrackerState(dateKey, { broadcast: true });
        const isLichessRacerPage = HOST === 'lichess.org' && (PATH === '/racer' || PATH.startsWith('/racer/'));
        const isChessTempoPage = HOST === 'chesstempo.com' || HOST.endsWith('.chesstempo.com')
            ? PATH === '/chess-tactics' || PATH.startsWith('/chess-tactics/')
            : false;
        const isChessComSourcePage = isChessComPuzzlesPage();
        const isSourcePage =
            (ACTIVE_SOURCE_SET.has('lichess') && isLichessRacerPage) ||
            (ACTIVE_SOURCE_SET.has('chesstempo') && isChessTempoPage) ||
            isChessComSourcePage;

        if (!state.unlockGranted && !isSourcePage) {
            const target = getTrainingRedirectTarget();
            if (HREF !== target) {
                window.location.replace(target);
                return { redirected: true };
            }
        }

        if (isLichessRacerPage && ACTIVE_SOURCE_SET.has('lichess')) {
            onReady(() => {
                createProgressWindow();
                updateProgressWindow();
                ensureProgressHeartbeat();
                initRacerMonitoring();
            });
        }

        if (isChessTempoPage && ACTIVE_SOURCE_SET.has('chesstempo')) {
            onReady(() => {
                createProgressWindow();
                updateProgressWindow();
                ensureProgressHeartbeat();
                initChessTempoMonitoring();
            });
        }

        if (isChessComSourcePage) {
            onReady(() => {
                createProgressWindow();
                updateProgressWindow();
                ensureProgressHeartbeat();
            });
        }

        window.unifiedChessControl = {
            getState: () => syncTrackerState(formatDateKey()),
            addTestPuzzles: (count = 1) => addSolvedPuzzles(count, 'manual'),
            resetProgress: () => {
                const today = formatDateKey();
                const keys = trackerKeys(today);
                writeNumber(keys.racerSolved, 0);
                writeNumber(keys.messagesSent, 0);
                return syncTrackerState(today, { broadcast: true });
            }
        };

        return { redirected: false };
    }

    function initChessComFilter() {
        if (!CONFIG.modules.chessComFilter) return;
        if (HOST !== 'chess.com' && HOST !== 'www.chess.com') return;

        addStyle(
            CONFIG.chessCom.staticHideSelectors
                .map((selector) => `${selector} { display: none !important; }`)
                .join('\n')
        );

        const blockedIcons = [
            '.threecheck',
            '.bullet',
            '.live960',
            '.kingofthehill',
            '.crazyhouse',
            '.bughouse'
        ];

        const applyRules = () => {
            document.querySelectorAll('.tournaments-list-item-component').forEach((row) => {
                const text = (row.innerText || row.textContent || '').trim();
                const hasBlockedKeyword = CONFIG.chessCom.blockedTournamentKeywords.some((keyword) => text.includes(keyword));
                const timeLabel = row.querySelector('.tournaments-list-item-time-label-col');
                const hasBlockedTime = timeLabel && CONFIG.chessCom.blockedTimeLabels.includes(timeLabel.textContent.trim());
                const hasBlockedIcon = blockedIcons.some((selector) => row.querySelector(selector));
                if (hasBlockedKeyword || hasBlockedTime || hasBlockedIcon) {
                    safeHide(row);
                }
            });

            document.querySelectorAll('.time-selector-section-component').forEach((section) => {
                const label = section.querySelector('.time-selector-section-label');
                if (label && CONFIG.chessCom.blockedSectionLabels.includes(label.textContent.trim())) {
                    safeHide(section);
                }
            });

            document.querySelectorAll('.recent-time-section-component').forEach((section) => {
                const label = section.querySelector('.recent-time-section-label');
                if (label && CONFIG.chessCom.blockedSectionLabels.includes(label.textContent.trim())) {
                    safeHide(section);
                }
            });
        };

        observeBody(applyRules, 150);
        onReady(() => {
            [150, 600, 1500].forEach((delay) => window.setTimeout(applyRules, delay));
        });
    }

    function initLichessFilter() {
        if (!CONFIG.modules.lichessFilter) return;
        if (HOST !== 'lichess.org') return;
        if (CONFIG.lichess.disableOnDates.includes(formatDateKey())) return;

        const blockedTrainingSet = new Set(CONFIG.lichess.blockedTrainingPaths);
        if (blockedTrainingSet.has(PATH)) {
            window.location.replace('https://lichess.org/training');
            return;
        }

        addStyle(
            CONFIG.lichess.blockedTrainingPaths
                .map((path) => `a[href="${path}"] { display: none !important; }`)
                .join('\n')
        );

        document.addEventListener('click', (event) => {
            const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!link) return;
            const href = link.getAttribute('href');
            if (!href || !blockedTrainingSet.has(href)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            window.location.href = 'https://lichess.org/training';
        }, true);

        function textHasAllowedType(text) {
            if (!text) return false;
            return CONFIG.lichess.allowedGameTypes.some((type) => text.includes(type));
        }

        function detectGameTypeText() {
            const metaText = document.querySelector('.tour__meta')?.textContent?.trim();
            if (metaText) return metaText;
            const setupText = document.querySelector('.game__meta__infos .setup')?.textContent?.trim();
            if (setupText) return setupText;
            return document.title || '';
        }

        const applyRules = () => {
            document.querySelectorAll('.tour-chart__inner a.tsht, a.tsht').forEach((card) => {
                const iconTitle = card.querySelector('.icon')?.getAttribute('title') || '';
                const text = `${iconTitle} ${card.textContent || ''}`;
                if (!textHasAllowedType(text)) {
                    safeHide(card);
                }
            });

            if (PATH === '/racer' || PATH.startsWith('/racer/')) {
                return;
            }

            const gameTypeText = detectGameTypeText();
            if (!gameTypeText) return;
            if (textHasAllowedType(gameTypeText)) return;

            document.querySelectorAll('button, a.button, a[href], [role="button"]').forEach((control) => {
                const text = (control.textContent || '').trim();
                if (/Участвовать|Join|Join tournament|Participate/.test(text)) {
                    safeHide(control);
                }
            });

            CONFIG.lichess.boardSelectors.forEach((selector) => {
                safeHide(document.querySelector(selector));
            });
        };

        observeBody(applyRules, 150);
        onReady(() => {
            [150, 500, 1200].forEach((delay) => window.setTimeout(applyRules, delay));
        });
    }

    function initMessageControl() {
        if (!CONFIG.modules.messageControl) return;
        if (HOST !== 'lichess.org') return;

        const isMessagePage =
            PATH.startsWith('/inbox/') ||
            PATH.startsWith('/forum/') ||
            /^\/team\/[^/]+\/(pm|pm-all|messages)/.test(PATH) ||
            /^\/team\/[^/]+\/forum\//.test(PATH);

        if (!isMessagePage) return;

        addStyle(`
            .ucc-message-info {
                margin-top: 6px;
                font-size: 12px;
                color: #b42318;
            }
        `);

        function getCounts() {
            const state = syncTrackerState(formatDateKey());
            const sent = readNumber(state.keys.messagesSent, 0);
            const allowed = Math.floor(state.solved / CONFIG.messageControl.tasksPerMessage);
            const remaining = allowed - sent;
            const remainder = state.solved % CONFIG.messageControl.tasksPerMessage;
            const tasksToNext = remainder === 0
                ? CONFIG.messageControl.tasksPerMessage
                : CONFIG.messageControl.tasksPerMessage - remainder;
            return {
                state,
                sent,
                allowed,
                remaining,
                tasksToNext
            };
        }

        function composeInfo(counts) {
            if (!counts.state.unlockGranted) {
                return 'Сообщения закрыты, пока не выполнена дневная цель.';
            }
            if (counts.remaining > 0) {
                return `Доступно сообщений: ${counts.remaining} из ${counts.allowed} (решено ${counts.state.solved} задач)`;
            }
            return `Нет доступных сообщений. Решите ещё ${counts.tasksToNext} задач.`;
        }

        function refreshForms() {
            RUNTIME.messageControl.formRefreshers.forEach((refresh) => refresh());
        }

        function initForm(form) {
            if (!form || form.dataset.uccMessageInit === '1') return;
            const textarea = form.querySelector('textarea');
            const submitButton = form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
            if (!textarea || !submitButton) return;

            const info = document.createElement('div');
            info.className = 'ucc-message-info';
            textarea.insertAdjacentElement('afterend', info);

            const refresh = () => {
                const counts = getCounts();
                const blocked = !counts.state.unlockGranted || counts.remaining <= 0;
                textarea.disabled = blocked;
                submitButton.disabled = blocked;
                info.textContent = composeInfo(counts);
            };

            form.addEventListener('submit', (event) => {
                const counts = getCounts();
                if (!counts.state.unlockGranted || counts.remaining <= 0) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    refresh();
                    return;
                }
                writeNumber(counts.state.keys.messagesSent, counts.sent + 1);
                window.setTimeout(refreshForms, 200);
            }, true);

            form.dataset.uccMessageInit = '1';
            RUNTIME.messageControl.formRefreshers.add(refresh);
            refresh();
        }

        observeBody(() => {
            CONFIG.messageControl.formSelectors.forEach((selector) => {
                document.querySelectorAll(selector).forEach((form) => initForm(form));
            });
        }, 120);

        window.addEventListener('storage', (event) => {
            if (event.key === CONFIG.storage.progressStorageKey || event.key === CONFIG.storage.unlockStorageKey) {
                refreshForms();
            }
        });

        window.addEventListener('lichessTrackerUpdate', refreshForms);
        window.addEventListener('lichessRacerUnlockFlag', refreshForms);
    }

    if (initUrlBlocker()) {
        return;
    }

    initTimeBlocker();

    const trackerResult = initTracker();
    if (trackerResult.redirected) {
        return;
    }

    initChessComFilter();
    initLichessFilter();
    initMessageControl();
})();
