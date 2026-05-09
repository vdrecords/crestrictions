// ==UserScript==
// @name         11_unified_chess_control
// @namespace    http://tampermonkey.net/
// @version      0.6.0
// @description  chess.com/lichess.org: задачи + Blitz≥3+0/Rapid/Classical. Фильтр модалки создания партии, турниров, hook/ai/friend-формы. Bullet/Variants/Daily/Swiss/Simul/соцка — блок path+DOM. Fix: /training/coordinate /daily /dashboard теперь allow
// @author       vdrecords
// @homepage     https://github.com/vdrecords/crestrictions
// @supportURL   https://github.com/vdrecords/crestrictions/issues
// @updateURL    https://raw.githubusercontent.com/vdrecords/crestrictions/main/cc.user.js
// @downloadURL  https://raw.githubusercontent.com/vdrecords/crestrictions/main/cc.user.js
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      allcantrip.ru
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const LOCAL_CONFIG = {
        debug: false, // Включить подробные сообщения в консоли

        modules: {
            urlBlocker: true, // Включить общий блокировщик доменов
            timeBlocker: true, // Включить блокировку по расписанию
            tracker: true, // Включить трекер задач и редиректы
            chessComFilter: true, // Включить фильтр Chess.com
            lichessFilter: true, // Включить фильтр Lichess
            messageControl: true // Включить ограничение сообщений
        },

        storage: {
            courseId: 72, // Общий ID курса для GM-ключей
            trackerDateKey: 'unified_chess_control_date', // Ключ с датой последнего активного дня
            unlockStorageKey: 'lichess_racer_unlock_flag', // Ключ localStorage для флага разблокировки
            progressStorageKey: 'lichess_tracker_data', // Ключ localStorage для опубликованного прогресса
            remoteConfigCacheKey: 'unified_chess_control_remote_config', // Ключ GM-хранилища для последнего удалённого конфига
            remoteConfigMetaKey: 'unified_chess_control_remote_meta' // Ключ GM-хранилища для служебных метаданных удалённого конфига
        },

        remoteConfig: {
            // ВРЕМЕННО ОТКЛЮЧЕНО (2026-05-09): идею удалённого управления допилим позже —
            // тогда добавим HMAC-подпись/whitelist значений и переключим enabled: true.
            enabled: false,
            url: 'https://allcantrip.ru/tm/chess-control-config.json',
            fetchIntervalMs: 60000,
            requestTimeoutMs: 5000
        },

        urlBlocker: {
            blockedHosts: [ // Домены, которые блокируются всегда
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
            allowedHosts: [ // Белый список разрешённых доменов
                'chess.com',
                'lichess.org'
            ],
            quickLinks: [ // Быстрые ссылки на основные разрешённые сайты
                ['Chess.com — Задачи', 'https://www.chess.com/puzzles'],
                ['Lichess — Задачи', 'https://lichess.org/training'],
                ['Lichess — Racer', 'https://lichess.org/racer']
            ],
            // Path-whitelist: внутри разрешённых хостов фильтруем по разделам.
            // Логика: сначала проверяется blockRegex (приоритет), затем allow (точные + префиксы + regex).
            // Что не попало ни в один список — БЛОКИРУЕТСЯ (default-deny).
            // Префикс i18n (/ru/, /en-US/) обрезается перед проверкой.
            allowedPaths: {
                'chess.com': {
                    block: [
                        // Соцка / переписка / коммуникации
                        '/messages', '/friends', '/clubs', '/coaches', '/forum', '/community',
                        '/leaderboard', '/players', '/ratings', '/members',
                        // Watch / стримы / новости
                        '/streamer', '/streamers', '/tv', '/watch', '/events',
                        '/news', '/articles', '/blogs', '/today',
                        // Прочая коммерческая / отвлекающая
                        '/membership', '/votechess', '/computer-chess-championship',
                        '/variants', '/aimchess', '/play/coach', '/play/online/watch',
                        // Профили (доступ к чужим = доступ к кнопке "Написать сообщение")
                        '/member', '/users', '/user'
                    ],
                    blockRegex: [
                        '^/play/online/new\\?.*\\bdaily=',          // correspondence в block
                        '^/play/online/new\\?.*\\btime=daily',
                        '^/play/online/[A-Za-z0-9]+/?\\?.*\\bdaily='
                    ],
                    allow: [
                        '/', '/home', '/login', '/logout', '/signup', '/register',
                        '/settings', '/account', '/manifest.json',
                        // Главное — задачи
                        '/puzzles', '/daily',
                        // Live-игры (фильтр Bullet — отдельным слоем CSS+JS)
                        '/play/online', '/play/online/new', '/play/computer',
                        // Турниры (с фильтром по типу через chessComFilter)
                        '/play/online/tournaments',
                        // Учебные / тренировочные
                        '/lessons', '/learn', '/learn-how-to-play-chess',
                        '/courses', '/practice', '/endgames', '/insights', '/classroom',
                        // Анализ
                        '/analysis', '/openings', '/explorer', '/games',
                        // Доп. полезное
                        '/stats', '/solo-chess', '/vision', '/terms', '/resources',
                        '/themes', '/r2', '/cdn-cgi', '/bundles', '/chesscom-artifacts'
                    ],
                    allowRegex: [
                        '^/games/[A-Za-z0-9_-]+(/.*)?$',         // партия по ID
                        '^/play/online/[A-Za-z0-9]+(/.*)?$'      // лайв-игра по ID
                    ]
                },
                'lichess.org': {
                    block: [
                        // Соцка / переписка
                        '/inbox', '/team', '/forum', '/blog', '/ublog', '/coach',
                        '/player', '/players', '/patron', '/timeline',
                        // Watch / стримы / трансляции
                        '/tv', '/video', '/streamer', '/broadcast',
                        // Просмотр чужих игр / поиск
                        '/games/search',
                        // Швейцарка — обычно сильно дольше идёт, потеря времени (Vladimir 2026-05-09)
                        '/swiss',
                        // Симульный сеанс — играется параллельно несколько партий, длится часами
                        '/simul'
                    ],
                    blockRegex: [
                        '^/@/',                                  // профили /@/<username>
                        '^/games(?:/?$|/(?:search|export))'      // /games главная / поиск (НО /games/<id> — allow ниже)
                    ],
                    allow: [
                        '/', '/login', '/signup', '/logout', '/account', '/manifest.json',
                        '/feed.atom', '/about', '/faq', '/contact', '/help',
                        '/source', '/ads', '/privacy', '/terms-of-service',
                        '/run', '/api', '/fide',
                        // Задачи (универсальный regex /training/* отдельно ниже фильтрует темы)
                        '/training',
                        // Тренажёры скорости
                        '/racer', '/storm', '/streak',
                        // Создание партии / игры (фильтр Bullet применяется отдельно)
                        '/setup', '/play',
                        // Учебные / тренировка (без /coordinate: реальный URL /training/coordinate, см. 2026-05-09 curl-check)
                        '/learn', '/practice', '/study',
                        // Анализ
                        '/analysis', '/editor', '/explorer', '/paste', '/opening',
                        // Турниры Арены (фильтр по типу контроля + варианту через initLichessFilter)
                        '/tournament', '/dgt',
                        // Системные
                        '/assets', '/manifest'
                    ],
                    allowRegex: [
                        '^/games/[A-Za-z0-9]+(/.*)?$',           // партия по ID через /games/
                        '^/[A-Za-z0-9]{8,12}(?:/(?:white|black))?$'  // короткий 8-12-char game ID
                    ]
                }
            }
        },

        timeBlocker: {
            warningMinutes: 20, // За сколько минут показывать предупреждение до блокировки
            pollIntervalMs: 10000, // Как часто делать резервную проверку времени
            weeklyUnlocked: { // Окна разблокировки по дням недели: 0=воскресенье ... 6=суббота
                0: [['09:00', '12:00'], ['18:00', '20:00']], // Воскресенье
                1: [['09:00', '12:00'], ['18:00', '20:00']], // Понедельник
                2: [['09:00', '12:00'], ['18:00', '20:00']], // Вторник
                3: [['09:00', '12:00'], ['18:00', '20:00']], // Среда
                4: [['09:00', '12:00'], ['18:00', '20:00']], // Четверг
                5: [['09:00', '12:00'], ['18:00', '20:00']], // Пятница
                6: [['09:00', '12:00'], ['18:00', '20:00']] // Суббота
            },
            dateOverrides: { // Разовые исключения по датам
                '2025-11-16': { // В этот день продлевается первое окно
                    patch: [{ index: 0, to: '14:00' }] // Изменить первое окно до 14:00
                },
                '2025-12-23': { // В этот день особое раннее открытие и длинное окно
                    patch: [{ index: 1, from: '16:00' }], // Второе окно начинается в 16:00
                    extra: [['00:00', '21:00']] // Дополнительное окно с полуночи до 21:00
                }
            }
        },

        tracker: {
            weeklyTargets: [100, 100, 100, 300, 100, 1000, 1000], // Дневные цели по задачам: Пн..Вс (Vladimir 2026-05-09)
            specialTargets: { // Разовые цели по датам
                '2025-12-19': 200 // Особая цель на 19.12.2025
            },
            activeSources: ['lichess'], // Источники задач, которые учитываются в прогрессе
            preferredSource: 'lichess', // Куда редиректить по умолчанию до выполнения цели
            enableChessComPuzzlesMode: true, // Разрешать раздел puzzles на Chess.com
            chessComPuzzlesRoot: '/puzzles', // Корневой путь puzzles на Chess.com
            showProgressWindow: true, // Показывать плавающее окно прогресса
            processedRaceKeepDays: 7 // Сколько дней хранить отметки обработанных гонок
        },

        chessCom: {
            // Минимальный контроль времени в секундах (всё короче — Bullet, блок).
            // 180 = 3 минуты. Vladimir 2026-05-09: «Блиц от 3+0, всё что ниже — блок».
            minBaseTimeSeconds: 180,
            // Иконки на /play/online/tournaments, всегда блокируем (вне Blitz/Rapid/Classical)
            blockedGlyphs: ['game-time-bullet', 'game-type-960-live', 'game-time-daily'],
            // Селекторы для модалки создания партии на /play/online
            newGameSelectors: {
                bulletSection: '[data-cy="new-game-time-selector-category-bullet"]',
                dailySection: '[data-cy="new-game-time-selector-category-daily"]',
                customGameToggle: '.toggle-custom-game-component',
                customGameButton: '[data-cy="new-game-option-custom-game"]',
                friendButton: '[data-cy="new-game-option-play-a-friend"]',
                tournamentsButton: '[data-cy="new-game-option-tournaments"]',
                playButton: '[data-cy="new-game-index-play"]',
                topTimeDropdownLabel: '[data-cy="new-game-time-selector-button"] .cc-dropdown-button-label',
                incomingChallenge: '.incoming-challenges-challenge'
            },
            blockedTournamentKeywords: [ // Ключевые слова турниров Chess.com для скрытия (case-insensitive)
                // Короткий контроль (Bullet/UltraBullet) — не Blitz/Rapid/Classical
                'Bullet', 'Пуля', 'UltraBullet', 'Ультра-пуля',
                // Варианты шахмат
                'Live 960', '960', 'Chess960', 'Шахматы 960', 'Бобби Фишер',
                '3 Check', 'Шахматы с тремя шахами',
                'King of the Hill', 'Король горы',
                'Crazyhouse', 'Сумасшедший дом',
                'Bughouse', 'Шведки', 'Шведские',
                'Atomic', 'Атомные',
                'Antichess', 'Поддавки', 'Антимат',
                'Horde', 'Орда',
                'Racing Kings', 'Гонка королей'
            ],
            blockedTimeLabels: [ // Подписи короткого контроля времени (Bullet) для скрытия
                '1 мин.', '1 min', '1 | 0', '1 | 1',
                '2 мин.', '2 min', '2 | 1'
            ],
            blockedSectionLabels: ['Заочные', 'Пуля', 'Последние'], // Секции Chess.com для скрытия
            staticHideSelectors: [ // Статические CSS-селекторы для скрытия на Chess.com
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
            disableOnDates: ['2025-11-16'], // Даты, когда фильтр Lichess полностью отключён
            // Минимальная база времени в минутах (всё короче — Bullet/UltraBullet, блок).
            // Vladimir 2026-05-09: «Блиц от 3+0, всё что ниже — блок».
            minBaseMinutes: 3,
            allowedGameTypes: [ // Разрешённые типы игр на Lichess (Блиц / Рапид / Классика)
                'Блиц', 'Рапид', 'Классика', 'Классические',
                'Blitz', 'Rapid', 'Classical', 'SuperBlitz' // SuperBlitz = 3+0, это Blitz
            ],
            // Селекторы для game-setup-модалки (одинаковая структура у hook / ai / friend).
            // Активна на: /?any#hook (создать запрос), /play/computer (с компом), /?friend (с другом).
            // submitButton ловит все три варианта внутри модалки (--hook / --ai / --friend).
            hookSelectors: {
                modal: '.dialog-content.game-setup',
                variantToggle: '.mselect',
                variantName: '.mselect .text .name',
                tabsContainer: '.time-control-tabs .tabs-horiz',
                timePanel: '.time-panel',
                presetButtons: '.preset-btn',
                presetActive: '.preset-btn.active',
                minutesValue: '.sliders-grid > .slider-container:first-child .val-box',
                submitButton: '.footer .lobby__start__button'
            },
            // Классы карточек турниров /tournament
            tournamentCardClasses: {
                card: '.tsht',
                variant: 'tsht-variant',  // всегда блок (Atomic, Crazyhouse, 960, etc.)
                short: 'tsht-short',       // короткий контроль (Bullet/UltraBullet) — блок
                textInfo: '.text'          // содержит "X+Y Рейтинговый"
            },
            boardSelectors: [ // Возможные селекторы доски для скрытия
                '.round__app__board.main-board',
                '.main-board',
                '.board',
                '.cg-wrap'
            ],
            blockedTrainingPaths: [ // Темы training на Lichess, которые нужно скрыть и запретить
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
            tasksPerMessage: 10, // Сколько задач нужно решить для одного сообщения
            formSelectors: [ // Поддерживаемые формы сообщений и форумов на Lichess
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

    const CONFIG = JSON.parse(JSON.stringify(LOCAL_CONFIG));

    const HOST = window.location.hostname.toLowerCase();
    const PATH = window.location.pathname;
    const HREF = window.location.href;
    const COURSE_ID = String(CONFIG.storage.courseId);
    const REMOTE_CONFIG_PATHS = [
        'modules.urlBlocker',
        'modules.timeBlocker',
        'modules.tracker',
        'modules.chessComFilter',
        'modules.lichessFilter',
        'modules.messageControl',
        'timeBlocker.warningMinutes',
        'timeBlocker.pollIntervalMs',
        'timeBlocker.weeklyUnlocked',
        'timeBlocker.dateOverrides',
        'tracker.weeklyTargets',
        'tracker.specialTargets',
        'tracker.activeSources',
        'tracker.preferredSource',
        'tracker.enableChessComPuzzlesMode',
        'tracker.chessComPuzzlesRoot',
        'tracker.showProgressWindow',
        'tracker.processedRaceKeepDays',
        'chessCom.blockedTournamentKeywords',
        'chessCom.blockedTimeLabels',
        'chessCom.blockedSectionLabels',
        'lichess.disableOnDates',
        'lichess.allowedGameTypes',
        'lichess.blockedTrainingPaths',
        'messageControl.tasksPerMessage'
    ];

    const RUNTIME = {
        timeBlocker: {
            blocked: false,
            overlay: null,
            warningTimerEl: null,
            alignedTimerId: null,
            pollIntervalId: null,
            applyState: null
        },
        tracker: {
            progressWindowInterval: null,
            racerMonitorStarted: false,
            enforceGate: null
        },
        messageControl: {
            formRefreshers: new Set(),
            refreshForms: null
        },
        lichess: {
            applyRules: null,
            blockedTrainingStyleEl: null
        },
        chessCom: {
            applyRules: null
        },
        remoteConfig: {
            intervalId: null,
            lastAppliedSignature: '',
            lastFetchTimestamp: 0
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

    function clonePlain(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function getValueByPath(target, path) {
        return path.split('.').reduce((acc, key) => (acc && Object.hasOwn(acc, key) ? acc[key] : undefined), target);
    }

    function setValueByPath(target, path, value) {
        const parts = path.split('.');
        let cursor = target;
        for (let index = 0; index < parts.length - 1; index += 1) {
            const key = parts[index];
            if (!Object.hasOwn(cursor, key) || typeof cursor[key] !== 'object' || cursor[key] === null) {
                cursor[key] = {};
            }
            cursor = cursor[key];
        }
        cursor[parts[parts.length - 1]] = value;
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

    function getActiveSourceSet() {
        return new Set(CONFIG.tracker.activeSources);
    }

    function hostMatches(list, host = HOST) {
        return list.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    }

    // Срезаем i18n-префикс типа /ru/, /en-US/, /pt-BR/ перед path-проверкой.
    // chess.com часто рендерит canonical с локалью: /ru/play/online — это то же что /play/online.
    function normalizePath(path) {
        return path.replace(/^\/[a-z]{2}(?:-[A-Za-z]{2})?(?=\/|$)/i, '') || '/';
    }

    function getPathPolicyForHost(host) {
        const map = CONFIG.urlBlocker.allowedPaths || {};
        if (host === 'chess.com' || host.endsWith('.chess.com')) return map['chess.com'] || null;
        if (host === 'lichess.org' || host.endsWith('.lichess.org')) return map['lichess.org'] || null;
        return null;
    }

    function pathStartsWithEntry(path, entry) {
        if (path === entry) return true;
        if (path.startsWith(entry + '/')) return true;
        if (path.startsWith(entry + '?')) return true;
        return false;
    }

    function isPathAllowedForHost(host, path, search = '') {
        const policy = getPathPolicyForHost(host);
        if (!policy) return true; // хосты вне whitelist уже отсечены hostMatches

        const fullPath = path + (search || '');

        if (Array.isArray(policy.block)) {
            for (const entry of policy.block) {
                if (pathStartsWithEntry(path, entry)) return false;
            }
        }
        if (Array.isArray(policy.blockRegex)) {
            for (const re of policy.blockRegex) {
                if (new RegExp(re).test(fullPath)) return false;
            }
        }

        if (Array.isArray(policy.allow)) {
            for (const entry of policy.allow) {
                if (pathStartsWithEntry(path, entry)) return true;
            }
        }
        if (Array.isArray(policy.allowRegex)) {
            for (const re of policy.allowRegex) {
                if (new RegExp(re).test(path)) return true;
            }
        }

        return false; // default-deny
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

    function applyRemoteConfig(remoteConfig) {
        REMOTE_CONFIG_PATHS.forEach((path) => {
            const localValue = getValueByPath(LOCAL_CONFIG, path);
            if (localValue !== undefined) {
                setValueByPath(CONFIG, path, clonePlain(localValue));
            }
        });

        if (!remoteConfig || typeof remoteConfig !== 'object') {
            return false;
        }

        let changed = false;
        REMOTE_CONFIG_PATHS.forEach((path) => {
            const remoteValue = getValueByPath(remoteConfig, path);
            if (remoteValue === undefined) return;
            setValueByPath(CONFIG, path, clonePlain(remoteValue));
            changed = true;
        });
        return changed;
    }

    function updateLichessBlockedTrainingStyle() {
        if (HOST !== 'lichess.org') return;
        const css = CONFIG.lichess.blockedTrainingPaths
            .map((path) => `a[href="${path}"] { display: none !important; }`)
            .join('\n');

        if (!RUNTIME.lichess.blockedTrainingStyleEl) {
            const style = document.createElement('style');
            style.id = 'ucc-lichess-training-style';
            RUNTIME.lichess.blockedTrainingStyleEl = style;
            onReady(() => {
                if (!document.documentElement.contains(style)) {
                    document.documentElement.appendChild(style);
                }
            });
        }

        RUNTIME.lichess.blockedTrainingStyleEl.textContent = css;
    }

    function getRemoteConfigSignature(payload) {
        try {
            return JSON.stringify(payload);
        } catch (error) {
            log('remote config signature failed', error);
            return String(Date.now());
        }
    }

    function handleConfigApplied(source = 'cache') {
        if (initUrlBlocker()) return;
        updateLichessBlockedTrainingStyle();

        if (typeof RUNTIME.timeBlocker.applyState === 'function') {
            if (RUNTIME.timeBlocker.pollIntervalId) {
                window.clearInterval(RUNTIME.timeBlocker.pollIntervalId);
                RUNTIME.timeBlocker.pollIntervalId = window.setInterval(RUNTIME.timeBlocker.applyState, CONFIG.timeBlocker.pollIntervalMs);
            }
            RUNTIME.timeBlocker.applyState();
        }
        if (typeof RUNTIME.tracker.enforceGate === 'function') {
            const redirected = RUNTIME.tracker.enforceGate();
            if (redirected) return;
        }
        if (typeof RUNTIME.chessCom.applyRules === 'function') {
            RUNTIME.chessCom.applyRules();
        }
        if (typeof RUNTIME.lichess.applyRules === 'function') {
            RUNTIME.lichess.applyRules();
        }
        if (typeof RUNTIME.messageControl.refreshForms === 'function') {
            RUNTIME.messageControl.refreshForms();
        }
        const progressWindow = document.getElementById('ucc-progress-window');
        if ((!CONFIG.modules.tracker || !CONFIG.tracker.showProgressWindow) && progressWindow) {
            progressWindow.remove();
        }
        updateProgressWindow();
        log(`config applied from ${source}`);
    }

    function loadCachedRemoteConfig() {
        if (!CONFIG.remoteConfig.enabled) return;
        const cached = readValue(CONFIG.storage.remoteConfigCacheKey, null);
        if (!cached || typeof cached !== 'object') return;
        applyRemoteConfig(cached);
        RUNTIME.remoteConfig.lastAppliedSignature = getRemoteConfigSignature(cached);
        handleConfigApplied('cache');
    }

    function fetchRemoteConfig() {
        if (!CONFIG.remoteConfig.enabled) return;
        if (typeof GM_xmlhttpRequest !== 'function') return;

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${CONFIG.remoteConfig.url}?t=${Date.now()}`,
            timeout: CONFIG.remoteConfig.requestTimeoutMs,
            onload: (response) => {
                if (response.status < 200 || response.status >= 300) {
                    log('remote config HTTP error', response.status);
                    return;
                }

                let parsed;
                try {
                    parsed = JSON.parse(response.responseText);
                } catch (error) {
                    log('remote config JSON parse failed', error);
                    return;
                }

                const signature = getRemoteConfigSignature(parsed);
                if (signature === RUNTIME.remoteConfig.lastAppliedSignature) {
                    RUNTIME.remoteConfig.lastFetchTimestamp = Date.now();
                    return;
                }

                applyRemoteConfig(parsed);
                writeValue(CONFIG.storage.remoteConfigCacheKey, parsed);
                writeValue(CONFIG.storage.remoteConfigMetaKey, {
                    updatedAt: Date.now(),
                    sourceUrl: CONFIG.remoteConfig.url
                });

                RUNTIME.remoteConfig.lastAppliedSignature = signature;
                RUNTIME.remoteConfig.lastFetchTimestamp = Date.now();
                handleConfigApplied('network');
            },
            onerror: (error) => {
                log('remote config request failed', error);
            },
            ontimeout: () => {
                log('remote config request timeout');
            }
        });
    }

    function initRemoteConfig() {
        loadCachedRemoteConfig();
        if (!CONFIG.remoteConfig.enabled) return;
        fetchRemoteConfig();
        if (RUNTIME.remoteConfig.intervalId) return;
        RUNTIME.remoteConfig.intervalId = window.setInterval(fetchRemoteConfig, CONFIG.remoteConfig.fetchIntervalMs);
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

        // Path-уровневая фильтрация внутри разрешённых хостов.
        // Срезаем i18n-префикс ( /ru/, /en-US/ ) → нормализованный path.
        const normalizedPath = normalizePath(PATH);
        if (!isPathAllowedForHost(HOST, normalizedPath, window.location.search)) {
            replaceDocument(
                'Раздел заблокирован',
                'Раздел не разрешён',
                'Сайт открыт, но этот раздел вне списка нужных режимов (задачи и игры с контролем времени Блиц/Рапид/Классика).',
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
            if (!CONFIG.modules.timeBlocker) {
                hideBlockedOverlay();
                hideWarning();
                return;
            }

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
        RUNTIME.timeBlocker.applyState = applyState;

        const scheduleAlignedCheck = () => {
            if (RUNTIME.timeBlocker.alignedTimerId) {
                window.clearTimeout(RUNTIME.timeBlocker.alignedTimerId);
            }
            const delayToNextMinute = 60000 - (Date.now() % 60000) + 50;
            RUNTIME.timeBlocker.alignedTimerId = window.setTimeout(() => {
                applyState();
                scheduleAlignedCheck();
            }, delayToNextMinute);
        };

        scheduleAlignedCheck();

        if (!RUNTIME.timeBlocker.pollIntervalId) {
            RUNTIME.timeBlocker.pollIntervalId = window.setInterval(applyState, CONFIG.timeBlocker.pollIntervalMs);
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                applyState();
            }
        });
        window.addEventListener('focus', applyState);
        window.addEventListener('pageshow', applyState);
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
        if (!CONFIG.modules.tracker || !CONFIG.tracker.showProgressWindow) return;
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

    function initTracker() {
        if (!CONFIG.modules.tracker) return { redirected: false };

        const dateKey = ensureTrackerDate();
        const state = syncTrackerState(dateKey, { broadcast: true });
        const isLichessRacerPage = HOST === 'lichess.org' && (PATH === '/racer' || PATH.startsWith('/racer/'));
        const isChessComSourcePage = isChessComPuzzlesPage();
        const isSourcePage =
            (getActiveSourceSet().has('lichess') && isLichessRacerPage) ||
            isChessComSourcePage;

        const enforceGate = () => {
            if (!CONFIG.modules.tracker) {
                return false;
            }

            const currentState = syncTrackerState(formatDateKey());
            const currentIsLichessRacerPage = HOST === 'lichess.org' && (PATH === '/racer' || PATH.startsWith('/racer/'));
            const currentIsChessComSourcePage = isChessComPuzzlesPage();
            const activeSources = getActiveSourceSet();
            const currentIsSourcePage =
                (activeSources.has('lichess') && currentIsLichessRacerPage) ||
                currentIsChessComSourcePage;

            if (!currentState.unlockGranted && !currentIsSourcePage) {
                const target = getTrainingRedirectTarget();
                if (HREF !== target) {
                    window.location.replace(target);
                    return true;
                }
            }
            return false;
        };

        RUNTIME.tracker.enforceGate = enforceGate;

        if (!state.unlockGranted && !isSourcePage) {
            const target = getTrainingRedirectTarget();
            if (HREF !== target) {
                window.location.replace(target);
                return { redirected: true };
            }
        }

        if (isLichessRacerPage && getActiveSourceSet().has('lichess')) {
            onReady(() => {
                createProgressWindow();
                updateProgressWindow();
                ensureProgressHeartbeat();
                initRacerMonitoring();
            });
        }

        if (isChessComSourcePage) {
            onReady(() => {
                createProgressWindow();
                updateProgressWindow();
                ensureProgressHeartbeat();
            });
        }

        return { redirected: false };
    }

    // Парсит подпись контроля времени с турнирных строк chess.com.
    // Примеры: "1 мин." → 1, "3 мин." → 3, "5 мин." → 5, "10 мин." → 10,
    //          "1 | 0" → 1, "3 | 2" → 3, "10 | 2" → 10, "15 | 10" → 15,
    //          "1 день" / "3 дня" / "7 дней" → null (correspondence, всегда блок)
    // Возвращает базовое время в минутах или null если невозможно распарсить / correspondence.
    function parseChessComTimeLabel(text) {
        if (!text) return null;
        const trimmed = text.trim();
        if (/день|дн[еяёй]/i.test(trimmed)) return null;
        const match = trimmed.match(/^(\d+)/);
        if (!match) return null;
        return parseInt(match[1], 10);
    }

    function initChessComFilter() {
        if (!CONFIG.modules.chessComFilter) return;
        if (HOST !== 'chess.com' && HOST !== 'www.chess.com') return;

        const cfg = CONFIG.chessCom;
        const ng = cfg.newGameSelectors;

        // CSS: статические + модалка создания партии (Bullet/Daily секции, custom toggle, friend кнопка)
        const baseSelectors = [
            ...cfg.staticHideSelectors,
            ng.bulletSection,
            ng.dailySection,
            ng.customGameToggle,
            ng.customGameButton,
            ng.friendButton
        ];
        addStyle(baseSelectors.map((sel) => `${sel} { display: none !important; }`).join('\n'));

        const minMinutes = Math.floor((cfg.minBaseTimeSeconds || 180) / 60);
        const blockedTimeLabelSet = new Set((cfg.blockedTimeLabels || []).map((s) => s.trim()));

        // Перехват клика по кнопке "Начать партию" — если выбран Bullet/Daily, не пускаем.
        const guardPlayButton = () => {
            const btn = document.querySelector(ng.playButton);
            if (!btn || btn.dataset.uccPlayGuard === '1') return;
            btn.dataset.uccPlayGuard = '1';
            btn.addEventListener('click', (event) => {
                const label = (document.querySelector(ng.topTimeDropdownLabel)?.textContent || '').trim();
                const minutes = parseChessComTimeLabel(label);
                const isBlockedKeyword = /Пуля|Bullet|день|дн[еяёй]/i.test(label);
                if (isBlockedKeyword || minutes === null || minutes < minMinutes) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    window.alert(`Можно играть только Блиц от ${minMinutes}+0, Рапид и Классику.\nВыберите контроль 3 мин. или больше.`);
                }
            }, true);
        };

        // Скрываем приходящие вызовы (incoming challenges) с короткими/long контролями
        const filterIncomingChallenges = () => {
            document.querySelectorAll(ng.incomingChallenge).forEach((card) => {
                const tcText = (card.querySelector('.incoming-challenges-timeclass')?.textContent || '').trim();
                const minutes = parseChessComTimeLabel(tcText);
                const isBlockedKeyword = /Пуля|Bullet|день|дн[еяёй]/i.test(tcText);
                if (isBlockedKeyword || minutes === null || minutes < minMinutes) {
                    safeHide(card);
                }
            });
        };

        // Фильтр строк турниров на /play/online/tournaments
        const filterTournamentRows = () => {
            document.querySelectorAll('.tournaments-list-item-component').forEach((row) => {
                const text = (row.innerText || row.textContent || '').trim();
                const eventLabel = (row.querySelector('.tournaments-list-item-event-label')?.textContent || '').trim();
                const timeLabelText = (row.querySelector('.tournaments-list-item-time-label-col')?.textContent || '').trim();
                // Иконка типа: data-glyph на svg внутри iconGlyph
                const iconGlyph = row.querySelector('.tournaments-list-item-iconGlyph [data-glyph]')?.getAttribute('data-glyph') || '';
                const altText = (row.querySelector('.tournaments-list-item-iconGlyph img')?.getAttribute('alt') || '').trim();

                // 1. По иконке (надёжно для не-кастомных турниров)
                if (cfg.blockedGlyphs.includes(iconGlyph)) { safeHide(row); return; }
                // 2. По ключевым словам в названии / alt
                const checkText = `${eventLabel} ${altText}`;
                if (cfg.blockedTournamentKeywords.some((kw) => new RegExp(kw, 'i').test(checkText))) { safeHide(row); return; }
                // 3. По подписи контроля времени
                if (blockedTimeLabelSet.has(timeLabelText)) { safeHide(row); return; }
                const minutes = parseChessComTimeLabel(timeLabelText);
                if (minutes === null) { safeHide(row); return; } // correspondence или непарсимо
                if (minutes < minMinutes) { safeHide(row); return; }
                // 4. Старый legacy-keyword по innerText (на всякий случай)
                if (cfg.blockedTournamentKeywords.some((kw) => new RegExp(kw, 'i').test(text))) {
                    safeHide(row);
                }
            });
        };

        const applyRules = () => {
            if (!CONFIG.modules.chessComFilter) return;
            filterTournamentRows();
            // legacy: section labels (Заочные, Пуля, Последние)
            document.querySelectorAll('.time-selector-section-component, .recent-time-section-component').forEach((section) => {
                const label = section.querySelector('.time-selector-section-label, .recent-time-section-label');
                if (label && cfg.blockedSectionLabels.includes(label.textContent.trim())) {
                    safeHide(section);
                }
            });
            filterIncomingChallenges();
            guardPlayButton();
        };

        RUNTIME.chessCom.applyRules = applyRules;
        observeBody(applyRules, 150);
        onReady(() => {
            [150, 600, 1500].forEach((delay) => window.setTimeout(applyRules, delay));
        });
    }

    function initLichessFilter() {
        if (!CONFIG.modules.lichessFilter) return;
        if (HOST !== 'lichess.org') return;
        if (CONFIG.lichess.disableOnDates.includes(formatDateKey())) return;

        // CSS-инъекция: скрываем кнопки лобби, ведущие к запрещённым потокам.
        // «Бросить вызов другу» = форма прямого контакта с конкретным игроком (соцка) → блок.
        // Остаются на лобби только «Создать запрос на игру» и «Сыграть с компьютером».
        addStyle(`
            .lobby__start__button--friend { display: none !important; }
        `);

        // Универсальный фильтр /training/*: разрешены корень, /training/themes,
        // встроенные учебные тренажёры (coordinate, daily, dashboard/<rating>, history),
        // и конкретные задачи /training/<numeric-id>.
        // Любая новая тематическая тема (/training/mate, /training/openings, etc.)
        // автоматически блокируется. Прецедент 2026-05-09 (curl-проверка):
        // /coordinate сам по себе → 404, реальный URL /training/coordinate → 200.
        const isAllowedTrainingPath = (path) => {
            if (path === '/training' || path === '/training/themes') return true;
            if (path === '/training/coordinate' || path === '/training/daily') return true;
            if (path === '/training/history' || path === '/training/tags') return true;
            if (/^\/training\/dashboard\/\d+$/.test(path)) return true;
            return /^\/training\/\d+$/.test(path);
        };
        const isBlockedTrainingPath = (path) =>
            typeof path === 'string' && path.startsWith('/training/') && !isAllowedTrainingPath(path);

        if (isBlockedTrainingPath(PATH)) {
            window.location.replace('https://lichess.org/training');
            return;
        }

        updateLichessBlockedTrainingStyle();

        document.addEventListener('click', (event) => {
            const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!link) return;
            const href = link.getAttribute('href');
            if (!href || !isBlockedTrainingPath(href)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            window.location.href = 'https://lichess.org/training';
        }, true);

        const lichessCfg = CONFIG.lichess;
        const minMinutes = lichessCfg.minBaseMinutes || 3;

        function textHasAllowedType(text) {
            if (!text) return false;
            return lichessCfg.allowedGameTypes.some((type) => text.includes(type));
        }

        // Парсит "X+Y" из текста карточки турнира на /tournament или /tournament/<id>.
        // Поддерживает дробные базы: ¼+0 (15 сек), ½+0 (30 сек), ¾+0 (45 сек).
        // Возвращает базу в минутах (число) или null если не распарсилось.
        function parseLichessTimeFormat(text) {
            if (!text) return null;
            const match = text.match(/([¼½¾]|\d+)\s*\+\s*\d+/);
            if (!match) return null;
            const baseStr = match[1];
            if (baseStr === '¼') return 0.25;
            if (baseStr === '½') return 0.5;
            if (baseStr === '¾') return 0.75;
            return parseInt(baseStr, 10);
        }

        function detectGameTypeText() {
            // Главный источник на /tournament/<id>: .tour__meta__head p ("1+0 • Пуля • 27m")
            const metaHead = document.querySelector('.tour__meta__head p')?.textContent?.trim();
            if (metaHead) return metaHead;
            const metaText = document.querySelector('.tour__meta')?.textContent?.trim();
            if (metaText) return metaText;
            const setupText = document.querySelector('.game__meta__infos .setup')?.textContent?.trim();
            if (setupText) return setupText;
            return document.title || '';
        }

        // Фильтр карточек турниров на /tournament (расписание).
        // 1. .tsht-variant — варианты (Atomic, Crazyhouse, 960, etc.) → всегда блок
        // 2. .tsht-short — короткий контроль (Bullet/UltraBullet/HyperBullet) → всегда блок
        // 3. Парсинг "X+Y" из .text — если X < minMinutes → блок
        function filterTournamentCards() {
            const tCfg = lichessCfg.tournamentCardClasses;
            document.querySelectorAll('.tour-chart__inner a.tsht, a.tsht').forEach((card) => {
                if (card.classList.contains(tCfg.variant)) { safeHide(card); return; }
                if (card.classList.contains(tCfg.short)) { safeHide(card); return; }
                const text = (card.querySelector(tCfg.textInfo)?.textContent || '').trim();
                const minutes = parseLichessTimeFormat(text);
                if (minutes === null) {
                    // Старый fallback: проверка по имени/иконке
                    const iconTitle = card.querySelector('.icon')?.getAttribute('title') || '';
                    const fullText = `${iconTitle} ${card.textContent || ''}`;
                    if (!textHasAllowedType(fullText)) safeHide(card);
                    return;
                }
                if (minutes < minMinutes) safeHide(card);
            });
        }

        // Фильтр game-setup-модалки (hook / ai / friend — одна структура DOM).
        // На /play/computer модалка открыта по умолчанию, дефолтный таб «Отсутствует» (без часов).
        // Поэтому: скрываем запрещённые табы И программно переключаем на «По часам» если активный — запрещён.
        function filterHookModal() {
            const h = lichessCfg.hookSelectors;
            const modal = document.querySelector(h.modal);
            if (!modal) return;

            // Скрываем variant toggle (только стандартные шахматы; «С позиции», «Atomic», etc. — блок)
            modal.querySelectorAll(h.variantToggle).forEach((el) => safeHide(el));

            // Скрываем tabs: «Игра по переписке» (correspondence) + «Отсутствует» (no-clock = долгие партии).
            // Если активный таб — запрещённый, программно переключаем на «По часам» (один раз).
            let allowedTabBtn = null;
            let needSwitchClock = false;
            modal.querySelectorAll(`${h.tabsContainer} button`).forEach((btn) => {
                const t = (btn.textContent || '').trim();
                const isBlocked = /перепис|correspondence|Отсутствует|Unlimited/i.test(t);
                const isAllowedClock = /час|clock|time/i.test(t) && !isBlocked;
                if (isBlocked) {
                    safeHide(btn);
                    if (btn.classList.contains('active')) needSwitchClock = true;
                }
                if (isAllowedClock) allowedTabBtn = btn;
            });
            if (needSwitchClock && allowedTabBtn && allowedTabBtn.dataset.uccAutoClicked !== '1') {
                allowedTabBtn.dataset.uccAutoClicked = '1';
                try { allowedTabBtn.click(); } catch (err) { log('auto-switch clock tab failed', err); }
            }

            // Скрываем пресеты <minMinutes (1+0, 2+1)
            modal.querySelectorAll(h.presetButtons).forEach((btn) => {
                const t = (btn.textContent || '').trim();
                const minutes = parseLichessTimeFormat(t);
                if (minutes !== null && minutes < minMinutes) safeHide(btn);
            });

            // Перехват submit-кнопок (--hook / --ai / --friend) внутри модалки.
            // Проверка двух условий: вариант = стандартные шахматы И время ≥ minMinutes.
            modal.querySelectorAll(h.submitButton).forEach((submit) => {
                if (submit.dataset.uccHookGuard === '1') return;
                submit.dataset.uccHookGuard = '1';
                submit.addEventListener('click', (event) => {
                    // 1. Variant check
                    const variantName = (modal.querySelector(h.variantName)?.textContent || '').trim();
                    const isStandard = !variantName || /^(шахматы|стандартн|standard)/i.test(variantName);
                    if (!isStandard) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        window.alert(`Можно играть только в стандартные шахматы.\nТекущий вариант: «${variantName}». Смените на «Шахматы».`);
                        return;
                    }
                    // 2. Time check
                    const minutesValueEl = modal.querySelector(h.minutesValue);
                    const valueText = (minutesValueEl?.textContent || '').trim();
                    let minutes = parseFloat(valueText);
                    if (valueText === '¼') minutes = 0.25;
                    else if (valueText === '½') minutes = 0.5;
                    else if (valueText === '¾') minutes = 0.75;
                    if (Number.isNaN(minutes) || minutes < minMinutes) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        window.alert(`Можно играть только Блиц от ${minMinutes}+0, Рапид и Классику.\nВыберите минут на партию ≥ ${minMinutes}, вкладка «По часам».`);
                    }
                }, true);
            });
        }

        const applyRules = () => {
            if (!CONFIG.modules.lichessFilter) return;
            if (isBlockedTrainingPath(PATH)) {
                window.location.replace('https://lichess.org/training');
                return;
            }

            filterTournamentCards();
            filterHookModal();

            if (PATH === '/racer' || PATH.startsWith('/racer/')) {
                return;
            }

            const gameTypeText = detectGameTypeText();
            if (!gameTypeText) return;

            // Если на странице есть .tour__meta__head с форматом X+Y — проверяем X.
            const tourMinutes = parseLichessTimeFormat(gameTypeText);
            if (tourMinutes !== null) {
                if (tourMinutes >= minMinutes && textHasAllowedType(gameTypeText)) return;
            } else if (textHasAllowedType(gameTypeText)) {
                return;
            }

            // Не разрешено: скрываем кнопки участия (на странице турнира)
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

        RUNTIME.lichess.applyRules = applyRules;
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

        RUNTIME.messageControl.refreshForms = refreshForms;

        function initForm(form) {
            if (!form || form.dataset.uccMessageInit === '1') return;
            const textarea = form.querySelector('textarea');
            const submitButton = form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
            if (!textarea || !submitButton) return;

            const info = document.createElement('div');
            info.className = 'ucc-message-info';
            textarea.insertAdjacentElement('afterend', info);

            const refresh = () => {
                if (!CONFIG.modules.messageControl) {
                    textarea.disabled = false;
                    submitButton.disabled = false;
                    info.textContent = 'Ограничение сообщений отключено серверной настройкой.';
                    return;
                }
                const counts = getCounts();
                const blocked = !counts.state.unlockGranted || counts.remaining <= 0;
                textarea.disabled = blocked;
                submitButton.disabled = blocked;
                info.textContent = composeInfo(counts);
            };

            form.addEventListener('submit', (event) => {
                if (!CONFIG.modules.messageControl) {
                    return;
                }
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

    // initRemoteConfig(); // ВРЕМЕННО ОТКЛЮЧЕНО — см. CONFIG.remoteConfig.enabled. Вернёмся к идее, когда добавим HMAC-подпись/whitelist значений.

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
    // initMessageControl(); // LEGACY (v0.3.0+, 2026-05-09): переписка теперь блокируется через path-whitelist
    //                       (/inbox, /forum, /team, /messages, /coach — все падают в block).
    //                       Функция оставлена в коде как backup на случай, если режим
    //                       "10 задач = 1 сообщение" снова потребуется.
})();
