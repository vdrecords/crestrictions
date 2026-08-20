// ==UserScript==
// @name         11_unified_chess_control
// @namespace    http://tampermonkey.net/
// @version      0.17.0
// @description  chess.com/lichess.org: задачи + Blitz≥3+0/Rapid/Classical. v0.12: Bullet-награда — окно 10–60 мин в конце расписания при solved≥400 (динамически растёт +10 мин/+100 задач до cap 60). UI прозрачный для ребёнка (4 состояния), работает в любой день недели, master toggle BULLET_REWARD_ENABLED. v0.12.2: компактный 2-строчный layout. v0.12.3: BULLET_REWARD_FORCE_OPEN_DATES — особые дни, 1 час Bullet гарантирован независимо от решённых задач. v0.12.4: критфикс — доска не скрывается на странице Bullet-партии при открытом окне (textHasAllowedType добавляет 'Пуля'/'Bullet'). v0.12.5: вт/чт вечернее окно сдвинуто на 17:00–20:00 (было 18:00) — +1 час игры в эти дни. v0.12.7: пятница — вечернее окно с 15:30 (было 18:00). v0.12.8: разблокирован просмотр+анализ конкретной партии (chess.com /game/<type>/<id>) — ребёнок может разбирать свои партии с /home; раньше выпадал блок-экран «доступны 3 ссылки» (allow-лист имел только /games мн.ч., не /game ед.ч.). v0.12.9: фикс time-overlay «Разблокируется в HH:MM» — подключается к DOM сразу (не через onReady): window.stop() в showBlockedOverlay прерывал загрузку до DOMContentLoaded → отложенный append не срабатывал и overlay не появлялся (на lichess пропадал, на chess.com мигал) + самовосстановление, если SPA вычистил ноду. НЕ связано с v0.12.8. v0.13.0: критфикс после редизайна lichess — доска больше не пропадает на страницах задач и тренажёров. Проверка типа игры (и скрытие доски через boardSelectors) запускается только там, где есть DOM-маркеры реальной партии или турнира; раньше она шла на любой странице, детект падал на document.title («Задачи • lichess.org») и прятал .main-board/.cg-wrap на /training, /storm, /streak, /analysis, /training/coordinate и мини-доски лобби. Замер headless-Chrome 28.07.2026: до фикса — 6 страниц с невидимой доской, после — 0, при этом Bullet-партия (1+0) по-прежнему блокируется, Блиц 3+0 открыт. v0.12.10: defensive — все обращения к document.body (трекер-маркер, окно прогресса, observeBody, racer-текст) с fallback на documentElement. После window.stop() в заблокированном окне body=null → скрипт падал с 'null.appendChild' ПОСЛЕ показа overlay (overlay не ломался, но доинициализация обрывалась, в консоли ошибка). v0.13.1: вечернее окно сдвинуто на 16:00–18:00 во все дни недели (было 18:00–20:00); длительность та же — 2 часа, сместилось только начало. Предыдущий вариант расписания оставлен закомментированным рядом для быстрого отката. v0.14.0: гонка загрузки при перезапуске браузера — ребёнок успевал отправить сообщение в первые 0.5–2 с, пока Tampermonkey ещё не внедрил скрипт (страница отрисована, блок-экран появлялся позже). Скрипт не может выполниться раньше расширения, поэтому окно закрыто с двух других сторон: (1) installSendGuard — предохранитель отправки в мире страницы (unsafeWindow): fetch, XMLHttpRequest, кадры WebSocket с msgSend/forumPost, sendBeacon, capture-слушатель submit и HTMLFormElement.prototype.submit; решение по URL ЗАПРОСА (deny-лист /inbox, /msg, /forum, /team/*/pm, /ublog, /coach, /@/*/note, chess.com /messages, /service/messages, /forum, /clubs/*/forum) и только для POST/PUT/PATCH/DELETE, поэтому легальные запросы сайтов не страдают. Набор текста занимает секунды — к моменту «Отправить» скрипт уже загружен и режет отправку, даже если блок-экран опоздал. (2) sanitizeBlockedUrl — перед document.write адрес вкладки подменяется на безопасный (/training, /puzzles), поэтому восстановление сессии больше не открывает /inbox повторно. Тумблеры SEND_GUARD_ENABLED и SANITIZE_BLOCKED_URL. Полностью гонку снимает только блокировка на уровне браузера (Chrome policy URLBlocklist) — см. README_RUS.md. v0.15.0: разрешены швейцарские турниры на lichess (были закрыты целиком с 2026-05-09). Открыты /swiss (расписание) и /swiss/<id> (участие), закрыто только создание своего турнира /swiss/new/<team> — симметрично Арене (/tournament/new). Правила отбора те же, что у Арены: строки расписания фильтрует filterSwissRows (UltraBullet ¼+0/½+0 и варианты Atomic/Crazyhouse/960 скрыты всегда, Пуля 1+0/2+1 — только при открытом Bullet-окне), страницу самого турнира — applyRules через новый маркер .swiss__meta (контроль и тип берутся из первого <p>: «30+0 • Классика • Рейтинговый»); при несоответствии прячутся кнопка «Участвовать» и доска. Ссылки на /team в карточках швейцарок по-прежнему скрыты (раздел заблокирован), чат зрителей .mchat — тоже. v0.16.0: Stylus-шторка — третий слой защиты от гонки загрузки при перезапуске браузера (к sendGuard и sanitizeBlockedUrl из v0.14). Парный userstyle curtain.user.css (расширение Stylus, инжект мгновенный даже на холодном старте) прячет контент ВСЕХ сайтов: body display:none + тёмный экран «Загрузка…», пока на <html> нет атрибута data-ucc-armed. Скрипт ставит атрибут (armCurtain) только когда защита реально активна, в трёх точках: (1) конец инициализации — разрешённая страница; (2) replaceDocument — блок-экран: атрибут зашит прямо в записываемый <html> + повторный armCurtain после document.close на случай реинжекта Stylus; (3) showBlockedOverlay — time-блок по расписанию. При редиректе трекера шторка НЕ снимается — контент запрещённой страницы не мелькает до навигации. Если скрипт упал до конца инициализации или Tampermonkey вовсе не внедрился — шторка остаётся (fail-closed): ребёнок видит «Загрузка…», а не живую страницу. Установка userstyle — raw-ссылка на curtain.user.css (см. README). v0.17.0: новая настройка LICHESS_FULL_UNLOCK_DATES (аналог LICHESS_DISABLED_DATES, но шире) — по дате (YYYY-MM-DD) снимает с lichess.org ВООБЩЕ ВСЕ ограничения скрипта: расписание окон, дневную цель задач (не редиректит на /training), фильтр типов игр/турниров, скрытие ссылок на разделы и блокировку отправки сообщений/постов (urlBlocker + sendGuard). Проверяется единой функцией isLichessFullyUnlockedToday() (HOST === lichess.org && дата в списке), подключена во все точки, где раньше был жёсткий блок: initUrlBlocker, initTimeBlocker.applyState, initTracker, initAutoHideBlockedPaths, initLichessFilter, compileSendGuardRules. Chess.com не затрагивается — ограничение только для lichess. На 2026-08-20 добавлена дата в список по просьбе Vladimir.
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
// @grant        unsafeWindow
// @connect      allcantrip.ru
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ═════════════════════════════════════════════════════════════════════════
    // 🟢 НАСТРОЙКИ ДЛЯ РОДИТЕЛЯ
    // Здесь лежит всё, что обычно меняют руками: расписание, дневные цели,
    // минимальный контроль времени, разовые исключения. Технические DOM-
    // селекторы и regex — ниже в LOCAL_CONFIG, их трогать не нужно.
    // ═════════════════════════════════════════════════════════════════════════

    // ─── 1. РАСПИСАНИЕ ОКОН ──────────────────────────────────────────────────
    // Когда ребёнку разрешено играть. Дни недели: 0=Воскресенье ... 6=Суббота.
    // Каждое окно — пара ['HH:MM', 'HH:MM']. Окна можно как добавлять, так
    // и убирать. Вне окон — overlay блокировки.
    // ── ПРЕДЫДУЩЕЕ РАСПИСАНИЕ (действовало 28.07.2026 — 29.07.2026) ──────────
    // Единый вечерний интервал 18:00–20:00 во все дни недели.
    // Чтобы откатиться — раскомментировать этот блок и закомментировать тот,
    // что ниже (активным должен быть ровно ОДИН const SCHEDULE_WEEKLY).
    // Ещё более раннее расписание (вт/чт с 17:00, пт с 15:30) — в истории git.
    // const SCHEDULE_WEEKLY = {
    //     0: [['09:00', '12:00'], ['18:00', '20:00']], // Воскресенье
    //     1: [['09:00', '12:00'], ['18:00', '20:00']], // Понедельник
    //     2: [['09:00', '12:00'], ['18:00', '20:00']], // Вторник
    //     3: [['09:00', '12:00'], ['18:00', '20:00']], // Среда
    //     4: [['09:00', '12:00'], ['18:00', '20:00']], // Четверг
    //     5: [['09:00', '12:00'], ['18:00', '20:00']], // Пятница
    //     6: [['09:00', '12:00'], ['18:00', '20:00']]  // Суббота
    // };

    // ── АКТИВНОЕ РАСПИСАНИЕ (с 29.07.2026) ───────────────────────────────────
    // Единый вечерний интервал 16:00–18:00 во все дни недели (было 18:00–20:00).
    const SCHEDULE_WEEKLY = {
        0: [['09:00', '12:00'], ['16:00', '18:00']], // Воскресенье
        1: [['09:00', '12:00'], ['16:00', '18:00']], // Понедельник
        2: [['09:00', '12:00'], ['16:00', '18:00']], // Вторник
        3: [['09:00', '12:00'], ['16:00', '18:00']], // Среда
        4: [['09:00', '12:00'], ['16:00', '18:00']], // Четверг
        5: [['09:00', '12:00'], ['16:00', '18:00']], // Пятница
        6: [['09:00', '12:00'], ['16:00', '18:00']]  // Суббота
    };

    // ─── 2. РАЗОВЫЕ ПРАВКИ РАСПИСАНИЯ ────────────────────────────────────────
    // По дате (формат YYYY-MM-DD): patch меняет существующее окно по индексу,
    // extra добавляет дополнительное окно к этому дню.
    const SCHEDULE_OVERRIDES = {
        '2025-11-16': { // Продлеваем первое окно
            patch: [{ index: 0, to: '14:00' }]
        },
        '2025-12-23': { // Особое раннее открытие + длинное окно
            patch: [{ index: 1, from: '16:00' }],
            extra: [['00:00', '21:00']]
        },
        '2026-05-09': { // Разовое продление утреннего окна до 13:00
            patch: [{ index: 0, to: '13:00' }]
        }
    };

    // За сколько минут до конца окна показывать предупреждение «скоро блок».
    const SCHEDULE_WARNING_MINUTES = 20;

    // ─── 3. ДНЕВНЫЕ ЦЕЛИ ЗАДАЧ ───────────────────────────────────────────────
    // Сколько задач Lichess Racer надо решить, чтобы разблокировать игру.
    // Индексы по дням недели: [Пн, Вт, Ср, Чт, Пт, Сб, Вс].
    const TASK_TARGETS_WEEKLY = [100, 100, 100, 300, 100, 1000, 1000];

    // Разовые цели по конкретным датам (формат YYYY-MM-DD: число).
    const TASK_TARGETS_SPECIAL = {
        '2025-12-19': 200,
        '2026-05-09': 50  // Разовая цель на сегодня (суббота, обычно 1000)
    };

    // ─── 4. МИНИМАЛЬНЫЙ КОНТРОЛЬ ВРЕМЕНИ ─────────────────────────────────────
    // Всё короче этого — Bullet/UltraBullet → блок. 180 = 3 минуты (Блиц 3+0).
    // Применяется и к chess.com, и к lichess (lichess пересчитывается в минуты).
    const MIN_BASE_TIME_SECONDS = 180;

    // ─── 5. ДАТЫ ОТКЛЮЧЕНИЯ ФИЛЬТРА LICHESS ──────────────────────────────────
    // В эти дни (формат YYYY-MM-DD) фильтр lichess полностью выключен —
    // например, чтобы можно было сыграть «турнирный день» с любыми контролями.
    const LICHESS_DISABLED_DATES = ['2025-11-16'];

    // ─── 5.1 ДАТЫ ПОЛНОГО СНЯТИЯ ОГРАНИЧЕНИЙ С LICHESS (v0.17) ───────────────
    // В эти дни (формат YYYY-MM-DD) с lichess.org снимаются ВООБЩЕ ВСЕ
    // ограничения скрипта: расписание окон (timeBlocker), дневная цель задач
    // (tracker — не редиректит на /training, даже если норма не выполнена),
    // фильтр типов игр/турниров (как LICHESS_DISABLED_DATES), скрытие
    // ссылок на запрещённые разделы, а также блокировка сообщений/форумов
    // (urlBlocker path-фильтр + sendGuard). Lichess.org в эти дни работает
    // как будто скрипта нет вообще. Chess.com в это время продолжает
    // работать по обычным правилам — это ограничение только для lichess.
    // Даты из этого списка НЕ нужно дублировать в LICHESS_DISABLED_DATES —
    // полное снятие уже включает в себя снятие фильтра.
    const LICHESS_FULL_UNLOCK_DATES = ['2026-08-20']; // Сегодня — снят весь контроль на lichess

    // ─── 6. МОДУЛИ (можно по одному отключать) ───────────────────────────────
    const MODULES_ENABLED = {
        urlBlocker: true,      // Общий блокировщик доменов и path
        timeBlocker: true,     // Блокировка по расписанию
        tracker: true,         // Трекер задач + редирект на Racer
        chessComFilter: true,  // Фильтр Chess.com (модалки, турниры)
        lichessFilter: true,   // Фильтр Lichess (модалки, турниры)
        messageControl: true   // Ограничение сообщений (LEGACY)
    };

    // ─── 7. БЫСТРЫЕ ССЫЛКИ ──────────────────────────────────────────────────
    // Кнопки на overlay блокировки — куда можно перейти ребёнку.
    const QUICK_LINKS = [
        ['Chess.com — Задачи', 'https://www.chess.com/puzzles'],
        ['Lichess — Задачи', 'https://lichess.org/training'],
        ['Lichess — Racer', 'https://lichess.org/racer']
    ];

    // ─── 8. ПРОЧИЕ TUNABLE ОПЦИИ ─────────────────────────────────────────────
    const SHOW_PROGRESS_WINDOW = true;          // Плавающее окно прогресса задач
    const ENABLE_CHESSCOM_PUZZLES_MODE = true;  // Считать chess.com /puzzles в прогресс
    const TASKS_PER_MESSAGE = 10;               // Сколько задач = 1 сообщение (LEGACY)

    // ─── 9. НАГРАДА BULLET (v0.12) ───────────────────────────────────────────
    // Bullet (1+0, ~1 мин/партия) обычно блокируется как «отвлекающий формат».
    // Этот блок открывает Bullet-окно В КОНЦЕ дневного расписания, если ребёнок
    // решил достаточно задач Lichess Racer. Окно открывается АВТОМАТИЧЕСКИ —
    // никаких кнопок. По истечении расписания (конец последнего интервала)
    // окно закрывается, активная партия доигрывается, новые партии блокируются.
    //
    // Логика:
    //   solved < threshold        → 0 минут Bullet (недоступен)
    //   solved == threshold       → minutesAtThreshold минут окна в конце дня
    //   solved == threshold + N   → minutesAtThreshold + (N/step) × extraPerStep
    //   max                       → cap минут в день
    //
    // Применяется к ЛЮБОМУ дню недели (будни/особый/выходные одинаково).
    // В будни (цель 100) физически недостижимо 400 решённых — окно не появится.
    // В выходные (цель 1000) после ~40-90% нормы окно открыто на 10-60 мин.
    //
    // Master toggle ENABLED = false полностью отключает всю логику Bullet-окна.
    const BULLET_REWARD_ENABLED = true;              // Master toggle (false = Bullet всегда заблокирован)
    const BULLET_REWARD_THRESHOLD = 400;             // Порог задач для открытия окна
    const BULLET_REWARD_MINUTES_AT_THRESHOLD = 10;   // Длительность окна при достижении порога
    const BULLET_REWARD_EXTRA_MINUTES_PER_STEP = 10; // +N минут за каждые M доп. задач сверх порога
    const BULLET_REWARD_STEP_TASK_COUNT = 100;       // Размер шага (M доп. задач для следующего расширения)
    const BULLET_REWARD_CAP_MINUTES = 60;            // Потолок окна (макс. минут в день)
    const BULLET_REWARD_MIN_BULLET_SECONDS = 60;     // Минимум базы партии в окне (60 = 1+0 разрешён)
    const BULLET_REWARD_DISABLED_DATES = [];         // ['2026-05-15'] — дни когда родитель явно закрывает Bullet
    // ★ Особый день: Bullet-окно открыто на полный час (60 мин в конце расписания) НЕЗАВИСИМО
    //   от количества решённых задач. Используется для дней рождения, праздников, болезней и т.п.
    //   Формат YYYY-MM-DD. disabledDates имеет приоритет (если дата и в том, и в этом списке —
    //   Bullet закрыт). Если ребёнок и так заработал 60 мин по задачам — окно всё равно 60 мин
    //   (не суммируется), просто гарантия что час будет.
    const BULLET_REWARD_FORCE_OPEN_DATES = ['2026-05-09']; // Сегодня — особый день, Bullet час доступен

    // ─── 10. ГОНКА ЗАГРУЗКИ ПРИ СТАРТЕ БРАУЗЕРА (v0.14) ──────────────────────
    // Проблема (Vladimir, 30.07.2026): Tampermonkey стартует не мгновенно. При
    // перезапуске браузера (особенно при восстановлении сессии, когда сразу
    // грузится несколько вкладок) страница успевает отрисоваться на 0.5–2 с
    // раньше скрипта. В это окно ребёнок успевает нажать «Отправить» в переписке,
    // и только потом появляется блок-экран. Скрипт не может выполниться раньше,
    // чем его внедрит расширение, поэтому окно закрывается с двух других сторон:
    //
    //   1) SEND_GUARD_ENABLED — перехват СЕТИ и submit-форм. Ставится самым
    //      первым, до блок-экрана, и режет саму отправку сообщения (fetch, XHR,
    //      WebSocket, sendBeacon, нативный submit формы) независимо от того, с
    //      какой страницы она уходит и успел ли отрисоваться блок-экран.
    //      Набрать текст занимает секунды — за это время скрипт уже загружен,
    //      поэтому нажатие «Отправить» попадает под предохранитель.
    //
    //   2) SANITIZE_BLOCKED_URL — заблокированный адрес не остаётся в истории и
    //      в состоянии вкладки: перед показом блок-экрана URL подменяется на
    //      безопасный (задачи). Из-за этого перезапуск браузера больше не
    //      восстанавливает /inbox повторно — восстанавливается уже страница
    //      задач, и «быстрое открытие заблокированного» приходится делать
    //      заново руками, когда скрипт уже работает.
    //
    // Полностью гонку убирает только блокировка на уровне браузера
    // (Chrome policy URLBlocklist) — см. README_RUS.md, раздел «Гонка загрузки».
    const SEND_GUARD_ENABLED = true;
    const SANITIZE_BLOCKED_URL = true;

    // ═════════════════════════════════════════════════════════════════════════
    // 🔧 ТЕХНИЧЕСКАЯ КОНФИГУРАЦИЯ (DOM-селекторы, regex, паттерны URL)
    // НЕ ТРОГАТЬ без знания DOM сайтов — изменения здесь могут сломать фильтр.
    // ═════════════════════════════════════════════════════════════════════════

    const LOCAL_CONFIG = {
        debug: false, // Включить подробные сообщения в консоли

        modules: MODULES_ENABLED,

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

        // v0.14: предохранитель отправки. Работает по URL ЗАПРОСА (не страницы),
        // поэтому ловит и отправку из виджета на разрешённой странице, и запрос на
        // socket.lichess.org. Список — DENY (а не default-deny как у страниц):
        // блокируем только эндпоинты переписки/постинга, чтобы не поломать
        // легальные POST-запросы сайтов (задачи, партии, телеметрия).
        // Проверяются только методы, меняющие состояние (POST/PUT/PATCH/DELETE):
        // читать переписку и так не даёт path-whitelist, а тут важно «не отправить».
        sendGuard: {
            enabled: SEND_GUARD_ENABLED,
            deny: {
                'lichess.org': [
                    '^/inbox(/|$)',                        // ЛС: /inbox/<user>, /inbox/new
                    '^/msg(/|$)',                          // сокет и REST модуля сообщений
                    '^/forum(/|$)',                         // форум: новая тема, ответ
                    '^/team/[^/]+/(pm|pm-all|message)',    // рассылка по команде
                    '^/team/[^/]+/forum',                  // форум команды
                    '^/ublog(/|$)',                        // блоги (UGC-публикация)
                    '^/coach(/|$)',                        // заявка тренеру = переписка
                    '^/@/[^/]+/note'                       // приватные заметки о игроке
                ],
                'chess.com': [
                    '^/messages',                          // страница/эндпоинт ЛС
                    '^/inbox',
                    '^/service/messages',                  // внутренний API ЛС
                    '^/callback/messages',
                    '^/callback/message',
                    '^/forum',                             // форум
                    '^/clubs/[^/]+/(forum|message)'        // клубы: форум и рассылка
                ]
            },
            // Кадры WebSocket, которые режем по содержимому: lichess отправляет ЛС
            // через сайтовый сокет пакетом {"t":"msgSend","d":{...}} — URL сокета от
            // версии к версии меняется, содержимое кадра стабильнее.
            denyWsPayload: [
                '"t"\\s*:\\s*"msgSend"',
                '"t"\\s*:\\s*"forumPost"'
            ],
            noticeText: 'Отправка сообщений заблокирована родительским контролем.'
        },

        urlBlocker: {
            // v0.14: куда подменять адрес заблокированной страницы, чтобы вкладка
            // не восстановилась на неё при следующем запуске браузера.
            safePaths: {
                'lichess.org': '/training',
                'chess.com': '/puzzles'
            },
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
            quickLinks: QUICK_LINKS,
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
                        '/member', '/users', '/user',
                        // Logout / закрытие аккаунта (v0.7) — родитель один раз залогинил, ребёнок не должен разлогиниваться/удалять профиль
                        '/logout',
                        // Sidebar "Другие" (v0.8) — сборная страница доп.функций, не нужна для тренировок
                        '/other'
                    ],
                    blockRegex: [
                        '^/play/online/new\\?.*\\bdaily=',          // correspondence в block
                        '^/play/online/new\\?.*\\btime=daily',
                        '^/play/online/[A-Za-z0-9]+/?\\?.*\\bdaily=',
                        '^/settings/close',                         // /settings/close-account и любые варианты close*
                        // /insights/<username> — просмотр чужих творческих профилей (Hikaru, GothamChess и т.д.) (v0.8)
                        // Корень /insights (свои данные) остаётся allow.
                        '^/insights/[A-Za-z0-9_-]+'
                    ],
                    allow: [
                        '/', '/home', '/login', '/signup', '/register',
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
                        '^/games/[A-Za-z0-9_-]+(/.*)?$',         // архив/список партий пользователя (мн.ч.: /games/archive, /games/<user>)
                        '^/game/[a-z-]+/[0-9]+(/.*)?$',          // конкретная партия по ID (/game/live|daily|computer/<id>) — просмотр + анализ своей партии (v0.12.8)
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
                        // Швейцарка (v0.15.0, Vladimir 2026-07-30): раздел ОТКРЫТ, закрыто только
                        // создание своего турнира — симметрично Арене (/tournament/new).
                        // /swiss (расписание) и /swiss/<id> (участие) разрешены ниже в allow,
                        // контроль времени и вариант фильтруются filterSwissRows + applyRules.
                        // Раньше весь раздел был закрыт («дольше идёт, потеря времени», 2026-05-09).
                        '/swiss/new',
                        // Симульный сеанс — играется параллельно несколько партий, длится часами
                        '/simul',
                        // Logout / закрытие аккаунта (v0.7). /logout и /account/close редиректят на signup/login,
                        // что ломает текущий залогиненный сеанс. Прямого пути нет, кнопки — также скрыты CSS+DOM-walker.
                        '/logout', '/account/close', '/account/delete',
                        // Студии (v0.8) — UGC-раздел: создание/поиск/листание чужих studies + автор-link на профили,
                        // лайки, follow, комментарии. Слишком много social-элементов чтобы чистить селекторами.
                        // Раздел /learn содержит свою лестницу обучения, /practice есть отдельно — этого достаточно.
                        '/study',
                        // Создание собственного турнира (v0.9.1) — не в scope «играть в правильные шахматы».
                        // /tournament (просмотр) и /tournament/<id> (участие) остаются открытыми.
                        '/tournament/new'
                    ],
                    blockRegex: [
                        '^/@/',                                  // профили /@/<username>
                        '^/games(?:/?$|/(?:search|export))'      // /games главная / поиск (НО /games/<id> — allow ниже)
                    ],
                    allow: [
                        '/', '/login', '/signup', '/account', '/manifest.json',
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
                        // /study убран в v0.8 (UGC раздел, см. block выше)
                        '/learn', '/practice',
                        // Анализ
                        '/analysis', '/editor', '/explorer', '/paste', '/opening',
                        // Турниры Арены (фильтр по типу контроля + варианту через initLichessFilter)
                        '/tournament', '/dgt',
                        // Швейцарские турниры (v0.15.0): /swiss — расписание, /swiss/<id> — участие.
                        // Те же правила, что у Арены: фильтр строк расписания (filterSwissRows)
                        // + проверка контроля/типа на странице турнира (.swiss__meta).
                        // Создание своего турнира (/swiss/new/<team>) остаётся в block выше.
                        '/swiss',
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
            warningMinutes: SCHEDULE_WARNING_MINUTES,
            pollIntervalMs: 10000, // Как часто делать резервную проверку времени
            weeklyUnlocked: SCHEDULE_WEEKLY,
            dateOverrides: SCHEDULE_OVERRIDES
        },

        tracker: {
            weeklyTargets: TASK_TARGETS_WEEKLY,
            specialTargets: TASK_TARGETS_SPECIAL,
            activeSources: ['lichess'], // Источники задач, которые учитываются в прогрессе
            preferredSource: 'lichess', // Куда редиректить по умолчанию до выполнения цели
            enableChessComPuzzlesMode: ENABLE_CHESSCOM_PUZZLES_MODE,
            chessComPuzzlesRoot: '/puzzles', // Корневой путь puzzles на Chess.com
            showProgressWindow: SHOW_PROGRESS_WINDOW,
            processedRaceKeepDays: 7 // Сколько дней хранить отметки обработанных гонок
        },

        bulletReward: {
            enabled: BULLET_REWARD_ENABLED,
            threshold: BULLET_REWARD_THRESHOLD,
            minutesAtThreshold: BULLET_REWARD_MINUTES_AT_THRESHOLD,
            extraMinutesPerStep: BULLET_REWARD_EXTRA_MINUTES_PER_STEP,
            stepTaskCount: BULLET_REWARD_STEP_TASK_COUNT,
            capMinutes: BULLET_REWARD_CAP_MINUTES,
            minBulletSeconds: BULLET_REWARD_MIN_BULLET_SECONDS,
            disabledDates: BULLET_REWARD_DISABLED_DATES,
            forceOpenDates: BULLET_REWARD_FORCE_OPEN_DATES,
            bodyClass: 'ucc-bullet-window-open'
        },

        chessCom: {
            // Минимальный контроль времени в секундах — берётся из USER_SETTINGS наверху.
            minBaseTimeSeconds: MIN_BASE_TIME_SECONDS,
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
            // v0.8: селекторы для модалки игры с компьютером /play/computer
            // (a) noTimerButton — кнопка «Без таймера» (играть без часов = нарушение Blitz≥3+0)
            // (b) variantDropdown — выпадашка вариантов (по дефолту «Классика», но кликом можно сменить на 960/Crazyhouse)
            // (c) botCtaButton — отдельная кнопка «Играть» бот-арены, не пересекается с playButton выше
            playComputerSelectors: {
                noTimerButton: '.mode-selection-container-no-timer-button',
                variantDropdown: '[data-cy="variant-dropdown-button"]',
                botCtaButton: '[data-cy="bot-selection-cta-button"]'
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
            disableOnDates: LICHESS_DISABLED_DATES,
            fullUnlockDates: LICHESS_FULL_UNLOCK_DATES,
            // Минимальная база времени в минутах — авто-зеркало MIN_BASE_TIME_SECONDS.
            minBaseMinutes: Math.floor(MIN_BASE_TIME_SECONDS / 60),
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
            // v0.15.0: строки расписания швейцарок на /swiss.
            // Разметка (проверено curl 2026-07-30):
            //   <table class="slist swisses"><tbody><tr>
            //     <td class="header"><a href="/swiss/<id>"><span class="name">…</span></a></td>
            //     <td class="infos"><span class="rounds">4/5 туров</span>
            //                       <span class="setup">30+0 • Классика • Рейтинговый</span></td>
            // Вариант (Atomic/Crazyhouse/960) на швейцарках подставляется ВМЕСТО типа
            // («3+0 • Crazyhouse • Рейтинговый»), поэтому проверки textHasAllowedType достаточно.
            swissRowClasses: {
                row: 'table.swisses tbody tr',
                setup: 'td.infos .setup'
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
            tasksPerMessage: TASKS_PER_MESSAGE,
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
        'lichess.fullUnlockDates',
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
        // v0.14: на document-start корня может ещё не быть (в замерах headless-Chrome
        // documentElement === null в самый ранний тик) — тогда откладываем до DOM.
        const root = document.documentElement || document.head || document.body;
        if (root) root.appendChild(style);
        else onReady(() => (document.documentElement || document.head || document.body).appendChild(style));
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function formatDateKey(date = new Date()) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    // v0.17: полное снятие ограничений с lichess на дату (LICHESS_FULL_UNLOCK_DATES).
    // Используется во всех модулях, которые могут ограничивать lichess: urlBlocker
    // (path-фильтр), timeBlocker (расписание), tracker (дневная цель задач),
    // lichessFilter (тип игры/турнира), sendGuard (блокировка отправки сообщений).
    // Chess.com этой проверкой не затрагивается — HOST должен быть именно lichess.org.
    function isLichessFullyUnlockedToday() {
        return HOST === 'lichess.org' && CONFIG.lichess.fullUnlockDates.includes(formatDateKey());
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
            observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
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

    // v0.14: заблокированный адрес не должен оставаться адресом вкладки. Сессия
    // браузера восстанавливает именно его, и на старте ребёнок получает 0.5–2 с
    // живой страницы, пока Tampermonkey ещё не внедрил скрипт. Подменяем адрес на
    // безопасный (задачи) ДО document.write: и история, и восстановление сессии
    // получают уже безопасную страницу. Содержимое блок-экрана не меняется.
    // v0.16: снятие Stylus-шторки. Парный userstyle curtain.user.css прячет весь
    // контент на всех сайтах (body display:none + экран «Загрузка…»), пока на
    // <html> нет data-ucc-armed. Атрибут ставится только когда защита реально
    // активна: либо страница прошла все проверки (конец инициализации), либо
    // уже показан блок-экран/overlay. Если скрипт упал раньше — шторка остаётся
    // висеть (fail-closed): лучше вечная «Загрузка…», чем открытая переписка.
    function armCurtain(root) {
        try {
            const el = root || document.documentElement;
            if (el && el.setAttribute) el.setAttribute('data-ucc-armed', '1');
        } catch (error) {
            log('armCurtain: не удалось снять шторку', error);
        }
    }

    function sanitizeBlockedUrl() {
        if (!SANITIZE_BLOCKED_URL) return;
        try {
            const safeByHost = (CONFIG.urlBlocker && CONFIG.urlBlocker.safePaths) || {};
            let safePath = '/';
            Object.keys(safeByHost).forEach((base) => {
                if (HOST === base || HOST.endsWith(`.${base}`)) safePath = safeByHost[base];
            });
            if (window.location.pathname + window.location.search === safePath) return;
            window.history.replaceState(null, '', safePath);
            log('sanitizeBlockedUrl: адрес вкладки подменён на', safePath);
        } catch (error) {
            log('sanitizeBlockedUrl: подмена адреса не удалась', error);
        }
    }

    function replaceDocument(title, heading, message, links = []) {
        const linkHtml = links.map(([label, href]) => {
            return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
        }).join('');

        sanitizeBlockedUrl();
        document.open('text/html', 'replace');
        document.write(`<!DOCTYPE html>
<html lang="ru" data-ucc-armed="1">
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
        // v0.16: document.write снёс старый <html> вместе с атрибутом; в разметке
        // выше data-ucc-armed уже зашит, но если Stylus реинжектнул стиль в новый
        // документ — повторное снятие шторки на актуальном documentElement.
        armCurtain(document.documentElement);
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
                (document.body || document.documentElement).appendChild(marker);
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
        // v0.12: считаем Bullet-окно для UI (всегда, чтобы прозрачно показывать прогресс).
        const bullet = computeBulletReward(solved);
        return {
            dateKey,
            solved,
            target,
            remaining,
            unlockGranted: remaining === 0,
            bullet,
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

    // ═════════════════════════════════════════════════════════════════════════
    // v0.14: ПРЕДОХРАНИТЕЛЬ ОТПРАВКИ — второй слой против гонки загрузки.
    // Блок-экран отвечает за «не открыть», предохранитель — за «не отправить».
    // Важно: патчим объекты МИРА СТРАНИЦЫ (unsafeWindow) — собственный fetch/XHR
    // песочницы Tampermonkey сайту не виден, патч в песочнице ничего не даёт.
    // ═════════════════════════════════════════════════════════════════════════

    function getPageWindow() {
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
        } catch (error) {
            // Песочница не отдала unsafeWindow — работаем с обычным window.
        }
        return window;
    }

    function compileSendGuardRules() {
        const deny = (CONFIG.sendGuard && CONFIG.sendGuard.deny) || {};
        const compiled = {};
        Object.keys(deny).forEach((host) => {
            compiled[host] = (deny[host] || []).map((source) => new RegExp(source));
        });
        // v0.17: полное снятие ограничений с lichess на дату — отправка сообщений/
        // постов на lichess.org (и *.lichess.org, включая socket) больше не режется.
        // Chess.com-правила не трогаем.
        if (isLichessFullyUnlockedToday()) delete compiled['lichess.org'];
        return compiled;
    }

    function sendGuardRulesForHost(compiled, host) {
        for (const base of Object.keys(compiled)) {
            if (host === base || host.endsWith(`.${base}`)) return compiled[base];
        }
        return null;
    }

    function installSendGuard() {
        if (!CONFIG.sendGuard || !CONFIG.sendGuard.enabled) return;

        const page = getPageWindow();
        if (!page) return;
        try {
            if (page.__uccSendGuardInstalled) return; // защита от двойного патча
            page.__uccSendGuardInstalled = true;
        } catch (error) {
            // Не смогли поставить маркер — продолжаем, повторный патч не опасен.
        }

        const compiled = compileSendGuardRules();
        const wsPayloadRules = ((CONFIG.sendGuard.denyWsPayload) || []).map((source) => new RegExp(source));
        const MUTATING_METHOD = /^(POST|PUT|PATCH|DELETE)$/;
        let noticeTimer = null;

        // Ребёнку нужно понимать, почему кнопка «молчит», иначе он решит что баг сайта.
        function showSendBlockedNotice() {
            const text = CONFIG.sendGuard.noticeText;
            if (!text) return;
            const root = document.body || document.documentElement;
            if (!root) return;
            let el = document.getElementById('ucc-send-guard-notice');
            if (!el) {
                el = document.createElement('div');
                el.id = 'ucc-send-guard-notice';
                el.style.cssText = [
                    'position:fixed',
                    'top:12px',
                    'left:50%',
                    'transform:translateX(-50%)',
                    'z-index:2147483647',
                    'max-width:min(520px, calc(100vw - 24px))',
                    'padding:12px 16px',
                    'border-radius:12px',
                    'background:#7d2217',
                    'color:#fff8ef',
                    'font:700 14px/1.4 Arial, sans-serif',
                    'text-align:center',
                    'box-shadow:0 12px 28px rgba(0,0,0,0.28)'
                ].join(';');
                root.appendChild(el);
            } else if (!el.isConnected) {
                root.appendChild(el);
            }
            el.textContent = text;
            el.style.display = 'block';
            window.clearTimeout(noticeTimer);
            noticeTimer = window.setTimeout(() => {
                el.style.display = 'none';
            }, 5000);
        }

        // Решение принимается по URL ЗАПРОСА, а не по URL страницы: отправка может
        // уходить с разрешённой страницы (виджет, попап) и на другой хост
        // (socket.lichess.org). Режем только методы, меняющие состояние.
        function isBlockedRequest(rawUrl, method) {
            const verb = String(method || 'GET').toUpperCase();
            if (!MUTATING_METHOD.test(verb)) return false;
            let parsed;
            try {
                parsed = new URL(String(rawUrl), window.location.href);
            } catch (error) {
                return false;
            }
            const rules = sendGuardRulesForHost(compiled, parsed.hostname.toLowerCase());
            if (!rules || !rules.length) return false;
            const target = normalizePath(parsed.pathname) + (parsed.search || '');
            return rules.some((re) => re.test(target));
        }

        function block(kind, url) {
            log(`sendGuard: заблокирована отправка (${kind})`, url || '');
            showSendBlockedNotice();
        }

        // 1. fetch — основной канал современных SPA.
        const nativeFetch = page.fetch;
        if (typeof nativeFetch === 'function') {
            page.fetch = function guardedFetch(input, init) {
                try {
                    const isRequestObject = input && typeof input === 'object' && 'url' in input;
                    const url = isRequestObject ? input.url : input;
                    const method = (init && init.method) || (isRequestObject && input.method) || 'GET';
                    if (isBlockedRequest(url, method)) {
                        block('fetch', url);
                        return Promise.reject(new Error('Blocked by parental control'));
                    }
                } catch (error) {
                    // Неожиданный тип аргументов не должен ломать легальные запросы.
                }
                return nativeFetch.apply(this, arguments);
            };
        }

        // 2. XMLHttpRequest — старые формы chess.com и часть виджетов.
        const xhrProto = page.XMLHttpRequest && page.XMLHttpRequest.prototype;
        if (xhrProto && typeof xhrProto.open === 'function' && typeof xhrProto.send === 'function') {
            const nativeOpen = xhrProto.open;
            const nativeSend = xhrProto.send;
            xhrProto.open = function guardedXhrOpen(method, url) {
                try {
                    this.__uccBlocked = isBlockedRequest(url, method);
                    this.__uccBlockedUrl = url;
                } catch (error) {
                    this.__uccBlocked = false;
                }
                return nativeOpen.apply(this, arguments);
            };
            xhrProto.send = function guardedXhrSend() {
                if (this.__uccBlocked) {
                    block('xhr', this.__uccBlockedUrl);
                    return undefined; // запрос просто не уходит
                }
                return nativeSend.apply(this, arguments);
            };
        }

        // 3. WebSocket — lichess отправляет ЛС кадром сайтового сокета.
        //    Конструктор НЕ патчим (сокет несёт игру, риск сломать партию),
        //    фильтруем только конкретные кадры по содержимому.
        const nativeWs = page.WebSocket;
        if (typeof nativeWs === 'function' && nativeWs.prototype && wsPayloadRules.length) {
            const nativeWsSend = nativeWs.prototype.send;
            nativeWs.prototype.send = function guardedWsSend(data) {
                try {
                    if (typeof data === 'string' && wsPayloadRules.some((re) => re.test(data))) {
                        block('websocket', data.slice(0, 80));
                        return undefined;
                    }
                } catch (error) {
                    // Бинарные кадры и прочее — пропускаем как есть.
                }
                return nativeWsSend.apply(this, arguments);
            };
        }

        // 4. sendBeacon — «отправить и забыть», иногда используется для форм.
        const pageNavigator = page.navigator;
        if (pageNavigator && typeof pageNavigator.sendBeacon === 'function') {
            const nativeBeacon = pageNavigator.sendBeacon;
            pageNavigator.sendBeacon = function guardedBeacon(url) {
                try {
                    if (isBlockedRequest(url, 'POST')) {
                        block('beacon', url);
                        return false;
                    }
                } catch (error) {
                    // Игнорируем и отправляем как обычно.
                }
                return nativeBeacon.apply(this, arguments);
            };
        }

        // 5. Нативный submit формы — он НЕ проходит ни через fetch, ни через XHR,
        //    поэтому без этого слоя дыра остаётся. Слушатель на document в фазе
        //    capture отменяет отправку раньше обработчиков сайта, даже если скрипт
        //    внедрился позже страницы.
        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (!form || typeof form.getAttribute !== 'function') return;
            const action = form.getAttribute('action') || window.location.href;
            const method = form.getAttribute('method') || 'GET';
            if (!isBlockedRequest(action, method)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            block('submit', action);
        }, true);

        // 6. form.submit() из кода — событие 'submit' при этом не возникает.
        const formProto = page.HTMLFormElement && page.HTMLFormElement.prototype;
        if (formProto && typeof formProto.submit === 'function') {
            const nativeFormSubmit = formProto.submit;
            formProto.submit = function guardedFormSubmit() {
                try {
                    const action = this.getAttribute('action') || window.location.href;
                    const method = this.getAttribute('method') || 'GET';
                    if (isBlockedRequest(action, method)) {
                        block('form.submit', action);
                        return undefined;
                    }
                } catch (error) {
                    // Не мешаем обычным формам.
                }
                return nativeFormSubmit.apply(this, arguments);
            };
        }

        log('sendGuard: предохранитель отправки установлен');
    }

    function initUrlBlocker() {
        if (!CONFIG.modules.urlBlocker) return false;
        if (isLichessFullyUnlockedToday()) return false; // v0.17: снят весь контроль на lichess

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

    // v0.12: возвращает Date конца ПОСЛЕДНЕГО интервала расписания за сегодня
    // (т.е. момент, когда сессия будет полностью закрыта на сегодняшний день).
    // Если на сегодня нет интервалов — возвращает null. Bullet-окно цепляется
    // именно к этому моменту: closeAt = scheduleEnd, openAt = scheduleEnd − earnedMinutes.
    function getLastScheduleEndOfDay(date = new Date()) {
        const windows = getUnlockedWindowsForDate(date);
        if (!windows.length) return null;
        const lastWindow = windows[windows.length - 1];
        const endDate = new Date(date);
        endDate.setHours(0, 0, 0, 0);
        endDate.setMinutes(lastWindow.end);
        return endDate;
    }

    // v0.12: главная функция расчёта Bullet-окна.
    // Логика:
    //   solved < threshold → 0 минут (недоступен)
    //   solved == threshold → minutesAtThreshold минут окна в конце дня
    //   solved == threshold + N×step → minutesAtThreshold + N×extraPerStep (до cap)
    //
    // Окно ВСЕГДА в конце последнего интервала расписания (closeAt = scheduleEnd).
    // openAt динамически отъезжает раньше при увеличении solved.
    // Применимо к ЛЮБОМУ дню недели, включая будни (не привязка к выходным).
    function computeBulletReward(solved, now = new Date()) {
        const cfg = CONFIG.bulletReward || {};
        const result = {
            enabled: false,
            eligible: false,
            earnedMinutes: 0,
            capReached: false,
            nextStepTasks: 0,
            nextStepEarnedMinutes: 0,
            scheduleEnd: null,
            openAt: null,
            closeAt: null,
            isOpen: false,
            minutesUntilOpen: 0,
            secondsLeftInWindow: 0,
            threshold: cfg.threshold || 0,
            cap: cfg.capMinutes || 0,
            forceOpened: false  // v0.12.3: особый день, окно cap-минут гарантировано независимо от solved
        };

        if (!cfg.enabled) return result;

        const dateKey = formatDateKey(now);
        // disabledDates имеет приоритет — родитель явно закрыл Bullet на этот день.
        if (Array.isArray(cfg.disabledDates) && cfg.disabledDates.includes(dateKey)) {
            return result;
        }

        const scheduleEnd = getLastScheduleEndOfDay(now);
        if (!scheduleEnd) return result;
        result.scheduleEnd = scheduleEnd;
        result.closeAt = scheduleEnd;

        result.enabled = true;
        const threshold = cfg.threshold || 400;
        const minutesAtThreshold = cfg.minutesAtThreshold || 10;
        const extraPerStep = cfg.extraMinutesPerStep || 10;
        const stepTaskCount = cfg.stepTaskCount || 100;
        const capMinutes = cfg.capMinutes || 60;

        // v0.12.3: forceOpenDates — особый день, гарантия cap-минут независимо от solved.
        // Перебивает обычный расчёт по задачам. Если ребёнок и так заработал cap по задачам —
        // окно остаётся cap (не суммируется). UI помечает forceOpened=true.
        const isForcedOpen = Array.isArray(cfg.forceOpenDates) && cfg.forceOpenDates.includes(dateKey);

        if (!isForcedOpen && solved < threshold) {
            result.nextStepTasks = threshold - solved;
            result.nextStepEarnedMinutes = minutesAtThreshold;
            return result;
        }

        result.eligible = true;
        if (isForcedOpen) {
            result.forceOpened = true;
            result.earnedMinutes = capMinutes;
            result.capReached = true;
        } else {
            const extraSteps = Math.floor((solved - threshold) / stepTaskCount);
            const rawMinutes = minutesAtThreshold + extraSteps * extraPerStep;
            result.earnedMinutes = Math.min(rawMinutes, capMinutes);
            result.capReached = result.earnedMinutes >= capMinutes;

            if (!result.capReached) {
                const nextThresholdSolved = threshold + (extraSteps + 1) * stepTaskCount;
                result.nextStepTasks = Math.max(0, nextThresholdSolved - solved);
                result.nextStepEarnedMinutes = Math.min(rawMinutes + extraPerStep, capMinutes);
            }
        }

        const openAt = new Date(scheduleEnd.getTime() - result.earnedMinutes * 60 * 1000);
        result.openAt = openAt;

        const nowMs = now.getTime();
        result.isOpen = nowMs >= openAt.getTime() && nowMs < scheduleEnd.getTime();
        result.minutesUntilOpen = Math.max(0, Math.ceil((openAt.getTime() - nowMs) / 60000));
        result.secondsLeftInWindow = result.isOpen
            ? Math.max(0, Math.floor((scheduleEnd.getTime() - nowMs) / 1000))
            : 0;

        return result;
    }

    // v0.12: ставит/снимает body class в зависимости от того, открыто ли Bullet-окно.
    // Класс перекрывает CSS-hide на .tsht-short / .ucc-blocked-tour-bullet
    // (см. initLichessFilter addStyle). Также управляет dynamic minBaseTime для
    // фильтра Bullet на chess.com и lichess. Идемпотентна, безопасна для частых вызовов.
    function applyBulletWindowState() {
        const cfg = CONFIG.bulletReward || {};
        const bodyClass = cfg.bodyClass || 'ucc-bullet-window-open';
        const body = document.body;
        if (!body) return null;

        const dateKey = formatDateKey();
        const solved = readNumber(trackerKeys(dateKey).racerSolved, 0);
        const reward = computeBulletReward(solved);

        if (reward.isOpen) {
            if (!body.classList.contains(bodyClass)) {
                body.classList.add(bodyClass);
            }
        } else {
            if (body.classList.contains(bodyClass)) {
                body.classList.remove(bodyClass);
            }
        }
        return reward;
    }

    function ensureTimeOverlay() {
        if (RUNTIME.timeBlocker.overlay) {
            // v0.12.9: SPA (lichess) может вычистить overlay из DOM — переподключаем,
            // иначе display:flex ставится на отсоединённую ноду и блок не виден.
            const cachedOverlay = RUNTIME.timeBlocker.overlay;
            const rootC = document.documentElement || document.body;
            if (rootC && !cachedOverlay.isConnected) rootC.appendChild(cachedOverlay);
            return cachedOverlay;
        }
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
        // v0.12.9: подключаем СРАЗУ — documentElement существует уже на document-start.
        // Раньше append откладывался через onReady (DOMContentLoaded), но showBlockedOverlay
        // зовёт window.stop(), который прерывает загрузку ДО DOMContentLoaded → callback
        // не срабатывал и overlay не появлялся (баг lichess: «нет надписи Разблокируется…»).
        const overlayRoot = document.documentElement || document.body;
        if (overlayRoot) overlayRoot.appendChild(overlay);
        else onReady(() => (document.documentElement || document.body).appendChild(overlay));
        RUNTIME.timeBlocker.overlay = overlay;
        return overlay;
    }

    function ensureWarningTimer() {
        if (RUNTIME.timeBlocker.warningTimerEl) {
            const cachedWarn = RUNTIME.timeBlocker.warningTimerEl;
            const rootW = document.documentElement || document.body;
            if (rootW && !cachedWarn.isConnected) rootW.appendChild(cachedWarn);
            return cachedWarn;
        }
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
        // v0.12.9: подключаем сразу (тот же фикс гонки window.stop(), что и у overlay).
        const warnRoot = document.documentElement || document.body;
        if (warnRoot) warnRoot.appendChild(el);
        else onReady(() => (document.documentElement || document.body).appendChild(el));
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
        // v0.16: overlay показан — шторку можно снимать, даже если дальнейшая
        // инициализация упадёт после window.stop() (сценарий v0.12.10).
        armCurtain();
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

            if (isLichessFullyUnlockedToday()) { // v0.17: расписание не действует на lichess в этот день
                hideBlockedOverlay();
                hideWarning();
                return;
            }

            const now = new Date();
            const currentMinutes = getCurrentMinutes(now);
            const windows = getUnlockedWindowsForDate(now);
            const activeWindow = windows.find((windowItem) => currentMinutes >= windowItem.start && currentMinutes < windowItem.end) || null;

            // v0.12: Bullet-окно тикает синхронно с проверкой расписания (каждые 10 сек),
            // чтобы открыться/закрыться вовремя даже на страницах без progress-window heartbeat.
            applyBulletWindowState();

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
        // v0.12.2: компактный 2-строчный layout (откат кнопок свернуть/закрыть из v0.12.1).
        // Строка 1 — задачи: «🎯 N/M задач · −R» (или «✅ Цель выполнена (N)»).
        // Строка 2 — Bullet: «⚡ ...» (4 inline-состояния, не показывается если Bullet выключен).
        windowEl.innerHTML = `
            <div class="ucc-progress-row" data-role="tasks-line">🎯 <span data-role="tasks-text">…</span></div>
            <div class="ucc-progress-row" data-role="bullet-line" style="margin-top:6px;display:none">⚡ <span data-role="bullet-text">…</span></div>
        `;
        windowEl.style.cssText = [
            'position:fixed',
            'top:72px',
            'right:18px',
            'z-index:2147483647',
            'max-width:320px',
            'padding:10px 14px',
            'border-radius:12px',
            'background:rgba(24, 92, 168, 0.94)',
            'color:#fff',
            'font:13px/1.4 Arial, sans-serif',
            'box-shadow:0 12px 30px rgba(0,0,0,0.24)'
        ].join(';');
        onReady(() => (document.body || document.documentElement).appendChild(windowEl));
        return windowEl;
    }

    // v0.12: форматирование секунд → "M:SS"
    function formatSecondsAsClock(totalSeconds) {
        const safe = Math.max(0, Math.floor(totalSeconds));
        const m = Math.floor(safe / 60);
        const s = safe % 60;
        return `${m}:${s < 10 ? '0' + s : s}`;
    }

    // v0.12.2: формирует ОДНУ компактную inline-строку для Bullet-блока окна прогресса.
    // 5 состояний: forceOpened (особый день) / открыт сейчас / достижим (окно впереди) / cap / порог не достигнут / выключен.
    function formatBulletStatus(bullet) {
        if (!bullet || !bullet.enabled) {
            return { show: false, text: '' };
        }
        const closeStr = bullet.closeAt ? minutesToTimeString(getCurrentMinutes(bullet.closeAt)) : '';
        const openStr = bullet.openAt ? minutesToTimeString(getCurrentMinutes(bullet.openAt)) : '';

        if (bullet.isOpen) {
            const left = formatSecondsAsClock(bullet.secondsLeftInWindow);
            const prefix = bullet.forceOpened ? '🎁 Особый день · Активен' : 'Активен';
            return { show: true, text: `${prefix} · ${left} до ${closeStr}` };
        }
        if (bullet.eligible) {
            // v0.12.3: forceOpened — особый день, час гарантирован независимо от задач.
            if (bullet.forceOpened) {
                return { show: true, text: `🎁 Особый день · ${openStr}–${closeStr} (${bullet.earnedMinutes} мин)` };
            }
            if (bullet.capReached) {
                return { show: true, text: `${openStr}–${closeStr} (${bullet.earnedMinutes} мин — максимум)` };
            }
            return {
                show: true,
                text: `${openStr}–${closeStr} (${bullet.earnedMinutes} мин) · +${bullet.nextStepTasks} → ${bullet.nextStepEarnedMinutes} мин`
            };
        }
        // Порог не достигнут
        return {
            show: true,
            text: `+${bullet.nextStepTasks} задач → ${bullet.nextStepEarnedMinutes} мин в конце дня`
        };
    }

    function updateProgressWindow() {
        if (!CONFIG.modules.tracker || !CONFIG.tracker.showProgressWindow) return;
        const windowEl = createProgressWindow();
        if (!windowEl) return;

        const state = syncTrackerState(formatDateKey());
        const bullet = state.bullet || { enabled: false };
        const bulletInfo = formatBulletStatus(bullet);
        const tasksDone = state.remaining === 0;

        // v0.12: синхронизируем body class — независимо от visibility, иначе при скрытом окне Bullet-фильтр не сработает.
        applyBulletWindowState();

        // Окно скрывается ТОЛЬКО когда цель выполнена И Bullet-блок неактивен/выключен.
        const showWindow = !tasksDone || bulletInfo.show;
        if (!showWindow) {
            windowEl.style.display = 'none';
            return;
        }
        windowEl.style.display = '';

        // Строка задач: «🎯 N/M задач · −R» либо «✅ Цель выполнена (N)»
        const tasksLine = windowEl.querySelector('[data-role="tasks-line"]');
        const tasksText = windowEl.querySelector('[data-role="tasks-text"]');
        if (tasksLine && tasksText) {
            if (tasksDone) {
                tasksLine.firstChild.nodeValue = '✅ ';
                tasksText.textContent = `Цель выполнена (${state.solved})`;
            } else {
                tasksLine.firstChild.nodeValue = '🎯 ';
                tasksText.innerHTML = `<strong>${state.solved}</strong> / ${state.target} задач · <span style="color:#ffe17e">−${state.remaining}</span>`;
            }
        }

        // Строка Bullet: одна inline-фраза или скрыта целиком
        const bulletLine = windowEl.querySelector('[data-role="bullet-line"]');
        const bulletText = windowEl.querySelector('[data-role="bullet-text"]');
        if (bulletLine && bulletText) {
            if (bulletInfo.show) {
                bulletLine.style.display = '';
                bulletText.textContent = bulletInfo.text;
            } else {
                bulletLine.style.display = 'none';
            }
        }
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
                /Гонка завершена|Race finished|Следующая гонка|Сыгранные задачи/.test((document.body && document.body.textContent) || '');

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
        if (isLichessFullyUnlockedToday()) return { redirected: false }; // v0.17: дневная цель не требуется на lichess в этот день

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

    // v0.10: автогенерация CSS-rule для всех ссылок на блокированные пути.
    // Проходит по policy.block для текущего хоста и для каждого пути генерирует
    // border-aware селекторы, чтобы навигационные ссылки на запрещённые разделы
    // исчезали без отдельной CSS-правки. Border-aware = не ловим false-positive:
    //   `/user`  → совпадает с `/user`, `/user/foo`, `/user?...`, но НЕ с `/users`
    //   `/messages` → совпадает с `/messages`, `/messages/`, `/messages?` — точный border
    // 3 селектора на путь:
    //   a[href$="/PATH"]    — конец URL (точное совпадение или абсолютная ссылка ...domain.com/PATH)
    //   a[href*="/PATH/"]   — путь с подпутем
    //   a[href*="/PATH?"]   — путь с query-string
    // Это покрывает 100% типичной разметки lichess/chess.com (включая абсолютные URL).
    // Регексы из policy.blockRegex не транслируются в CSS — они редкие (insights/<user>,
    // settings/close*) и для них уже есть точечный JS-блок path-policy.
    function initAutoHideBlockedPaths() {
        if (HOST !== 'chess.com' && HOST !== 'www.chess.com' && HOST !== 'lichess.org') return;
        if (isLichessFullyUnlockedToday()) return; // v0.17: ссылки на lichess не прячем в этот день
        const policy = getPathPolicyForHost(HOST);
        if (!policy || !Array.isArray(policy.block) || policy.block.length === 0) return;

        const escapeForCss = (s) => String(s).replace(/"/g, '\\"');
        const selectors = [];
        for (const path of policy.block) {
            const p = escapeForCss(path);
            selectors.push(`a[href$="${p}"]`);   // .../inbox  или /inbox
            selectors.push(`a[href*="${p}/"]`);  // /inbox/foo
            selectors.push(`a[href*="${p}?"]`);  // /inbox?bar=baz
        }
        addStyle(selectors.join(',\n') + ' { display: none !important; }');
    }

    // v0.7: скрываем кнопки «Выйти из аккаунта» и «Удалить/Закрыть аккаунт» на обоих сайтах.
    // Двойная защита поверх path-whitelist (родитель один раз залогинил — ребёнок не должен разлогиниваться/удалять профиль):
    //   1) CSS — селекторы по href/action ловят `<a href="/logout">`, `<form action="/logout">`,
    //      `<a href="/account/close">`, `<a href="/settings/close-account">` и их вариации (HTTPS-абсолютные тоже).
    //   2) DOM-walker — обходит a/button/[role=menuitem]/[role=button] и скрывает по тексту-ярлыку
    //      ("Выйти", "Logout", "Sign out", "Закрыть аккаунт", "Удалить аккаунт", "Close account", "Delete account").
    //      Это страховка от onclick-обработчиков без href и от пунктов dropdown'а без явной семантики.
    //   3) MutationObserver — переобход при rerender (chess.com и lichess SPA-перерисовывают меню профиля динамически).
    function initAccountControlHider() {
        if (HOST !== 'chess.com' && HOST !== 'www.chess.com' && HOST !== 'lichess.org') return;

        const cssSelectors = [
            // /logout (GET-endpoint, который выполняет logout — сразу разлогинит)
            'a[href="/logout"]', 'a[href$="/logout"]', 'a[href*="/logout?"]',
            'a[href$="://www.chess.com/logout"]', 'a[href$="://lichess.org/logout"]',
            'form[action="/logout"]', 'form[action$="/logout"]',
            // chess.com close-account
            'a[href*="/settings/close-account"]', 'a[href*="/settings/close"]',
            // lichess close/delete account
            'a[href="/account/close"]', 'a[href*="/account/close"]',
            'a[href="/account/delete"]', 'a[href*="/account/delete"]',
            'form[action*="/account/close"]', 'form[action*="/account/delete"]'
        ];
        addStyle(cssSelectors.map((s) => `${s} { display: none !important; }`).join('\n'));

        // Регэксп текстов кнопок/ссылок логаута и удаления аккаунта (RU + EN, case-insensitive).
        // \b не работает с кириллицей в JS-regex старых движков — используем границы вручную.
        const TEXT_PATTERN = /(?:^|[\s>])(?:выйти(?:\s+из\s+(?:аккаунта|учётной\s+записи|профиля))?|logout|log\s*out|sign\s*out|закрыть\s+аккаунт|закрыть\s+профиль|удалить\s+аккаунт|удалить\s+профиль|close\s+(?:my\s+)?account|delete\s+(?:my\s+)?account)(?:[\s<.,!?:;]|$)/i;

        const SELECTOR = 'a, button, [role="menuitem"], [role="button"]';

        const isAccountControl = (el) => {
            const text = (el.textContent || '').trim();
            if (text.length < 4 || text.length > 80) return false; // too short / too long → most likely не та кнопка
            return TEXT_PATTERN.test(text);
        };

        const hideEl = (el) => {
            if (el.dataset && el.dataset.uccAccountHidden === '1') return;
            // Скрываем сам элемент. Если это <a> или <button> внутри списка — скрываем родителя <li>/.dropdown-item тоже.
            el.style.setProperty('display', 'none', 'important');
            el.dataset && (el.dataset.uccAccountHidden = '1');
            const parentLi = el.closest('li, [role="menuitem"], .dropdown-item, .nav-item, .menu-item');
            if (parentLi && parentLi !== el) {
                parentLi.style.setProperty('display', 'none', 'important');
            }
        };

        const sweep = () => {
            try {
                const candidates = document.querySelectorAll(SELECTOR);
                for (const el of candidates) {
                    if (isAccountControl(el)) hideEl(el);
                }
            } catch (e) {
                log('AccountControlHider sweep error', e);
            }
        };

        const startObserver = () => {
            sweep();
            try {
                const observer = new MutationObserver(() => {
                    // Дебаунс через requestAnimationFrame: rerender'ы dropdown'ов часто идут пачками.
                    if (RUNTIME.accountHider && RUNTIME.accountHider.scheduled) return;
                    if (!RUNTIME.accountHider) RUNTIME.accountHider = {};
                    RUNTIME.accountHider.scheduled = true;
                    requestAnimationFrame(() => {
                        RUNTIME.accountHider.scheduled = false;
                        sweep();
                    });
                });
                observer.observe(document.body || document.documentElement, {
                    childList: true,
                    subtree: true
                });
            } catch (e) {
                log('AccountControlHider observer error', e);
            }
        };

        if (document.body) {
            startObserver();
        } else {
            document.addEventListener('DOMContentLoaded', startObserver, { once: true });
        }
        // Дополнительные проходы — на случай позднего рендера dropdown'ов.
        [200, 800, 2000, 5000].forEach((delay) => window.setTimeout(sweep, delay));
    }

    function initChessComFilter() {
        if (!CONFIG.modules.chessComFilter) return;
        if (HOST !== 'chess.com' && HOST !== 'www.chess.com') return;

        const cfg = CONFIG.chessCom;
        const ng = cfg.newGameSelectors;
        const pc = cfg.playComputerSelectors || {};

        // CSS: статические + модалка создания партии (Bullet/Daily секции, custom toggle, friend кнопка)
        // + v0.8: модалка /play/computer (no-timer, variant dropdown)
        const baseSelectors = [
            ...cfg.staticHideSelectors,
            ng.dailySection,
            ng.customGameToggle,
            ng.customGameButton,
            ng.friendButton,
            pc.noTimerButton,
            pc.variantDropdown
        ].filter(Boolean);
        addStyle(baseSelectors.map((sel) => `${sel} { display: none !important; }`).join('\n'));
        // v0.12: bulletSection скрыта по умолчанию, но раскрывается при body.ucc-bullet-window-open.
        if (ng.bulletSection) {
            addStyle(`
                ${ng.bulletSection} { display: none !important; }
                body.ucc-bullet-window-open ${ng.bulletSection} { display: revert !important; }
            `);
        }

        const baseMinMinutes = Math.floor((cfg.minBaseTimeSeconds || 180) / 60);
        const blockedTimeLabelSet = new Set((cfg.blockedTimeLabels || []).map((s) => s.trim()));

        // v0.12: динамический эффективный минимум для chess.com.
        // При открытом Bullet-окне снижается до 1 минуты (1+0 разрешён).
        function getEffectiveMinMinutesChessCom() {
            const bullet = applyBulletWindowState();
            if (bullet && bullet.isOpen) {
                const seconds = (CONFIG.bulletReward && CONFIG.bulletReward.minBulletSeconds) || 60;
                return Math.max(1, Math.floor(seconds / 60));
            }
            return baseMinMinutes;
        }

        // v0.11: автопереключение времени, если chess.com помнит Bullet как последний выбор.
        // На /play/online dropdown сверху может показывать «1 мин. (Пуля)» по дефолту — это
        // сохранённый выбор пользователя. Bullet-секция уже скрыта CSS, но текущий selected
        // остаётся Bullet → guardPlayButton при клике даст alert. Лучше сразу программно
        // кликнуть на разрешённую кнопку (3|2 Blitz / 5 мин / 10 мин), чтобы dropdown показал
        // нормальное время. Один раз при появлении модалки.
        // v0.12: при открытом Bullet-окне Bullet-выбор НЕ переключается — оставляем как есть.
        const autoSwitchFromBullet = () => {
            const labelEl = document.querySelector(ng.topTimeDropdownLabel);
            if (!labelEl) return;
            // dataset-флаг чтобы не дёргать клик в каждом applyRules-цикле
            if (labelEl.dataset.uccAutoSwitched === '1') return;
            const effMin = getEffectiveMinMinutesChessCom();
            const label = (labelEl.textContent || '').trim();
            const minutes = parseChessComTimeLabel(label);
            // Если Bullet-окно открыто и минимум стал 1 — не блокируем «Пуля 1+0».
            const bulletAllowed = effMin <= 1;
            const isBlockedKeyword = /день|дн[еяёй]/i.test(label) || (!bulletAllowed && /Пуля|Bullet/i.test(label));
            const isBlocked = isBlockedKeyword || minutes === null || minutes < effMin;
            if (!isBlocked) {
                labelEl.dataset.uccAutoSwitched = '1';
                return;
            }
            // Кандидаты в порядке предпочтения: 3+2 Блиц (минимум-разрешённое), 5 мин, 10 мин Рапид
            const candidateSelectors = [
                '[data-cy="time-selector-category-180|2"]',
                '[data-cy="time-selector-category-300"]',
                '[data-cy="time-selector-category-180"]',
                '[data-cy="time-selector-category-600"]'
            ];
            for (const sel of candidateSelectors) {
                const btn = document.querySelector(sel);
                if (btn && btn.offsetParent !== null) { // visible (не скрыт CSS)
                    btn.click();
                    labelEl.dataset.uccAutoSwitched = '1';
                    return;
                }
            }
        };

        // Перехват клика по кнопке "Начать партию" — если выбран Bullet/Daily, не пускаем.
        // v0.12: при открытом Bullet-окне 1+0 разрешён.
        const guardPlayButton = () => {
            const btn = document.querySelector(ng.playButton);
            if (!btn || btn.dataset.uccPlayGuard === '1') return;
            btn.dataset.uccPlayGuard = '1';
            btn.addEventListener('click', (event) => {
                const effMin = getEffectiveMinMinutesChessCom();
                const label = (document.querySelector(ng.topTimeDropdownLabel)?.textContent || '').trim();
                const minutes = parseChessComTimeLabel(label);
                const bulletAllowed = effMin <= 1;
                const isBlockedKeyword = /день|дн[еяёй]/i.test(label) || (!bulletAllowed && /Пуля|Bullet/i.test(label));
                if (isBlockedKeyword || minutes === null || minutes < effMin) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    const bulletNote = effMin < baseMinMinutes
                        ? '\n(Bullet-окно открыто — разрешён 1 мин.)'
                        : '';
                    window.alert(`Можно играть только Блиц от ${effMin}+0, Рапид и Классику.\nВыберите контроль ${effMin} мин. или больше.${bulletNote}`);
                }
            }, true);
        };

        // v0.8: defense-in-depth для /play/computer кнопки «Играть» (бот-арена).
        // CSS уже скрыл «Без таймера» и variant dropdown, но если рендер задержался и кто-то
        // нажал — проверяем что variant остался «Стандарт/Классика». Сами Bullet-секции
        // тоже скрыты CSS'ом сверху.
        const guardBotCtaButton = () => {
            if (!pc.botCtaButton) return;
            const btn = document.querySelector(pc.botCtaButton);
            if (!btn || btn.dataset.uccBotGuard === '1') return;
            btn.dataset.uccBotGuard = '1';
            btn.addEventListener('click', (event) => {
                const variantLabel = (document.querySelector(`${pc.variantDropdown} .cc-dropdown-button-label`)?.textContent || '').trim();
                const isStandard = !variantLabel || /Стандарт|Standard|Классика|Classical/i.test(variantLabel);
                if (!isStandard) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    window.alert('Можно играть только обычные шахматы (Классика). Варианты типа 960, Crazyhouse, Atomic запрещены.');
                }
            }, true);
        };

        // Скрываем приходящие вызовы (incoming challenges) с короткими/long контролями
        // v0.12: при открытом Bullet-окне Bullet-вызовы НЕ скрываются.
        const filterIncomingChallenges = () => {
            const effMin = getEffectiveMinMinutesChessCom();
            const bulletAllowed = effMin <= 1;
            document.querySelectorAll(ng.incomingChallenge).forEach((card) => {
                const tcText = (card.querySelector('.incoming-challenges-timeclass')?.textContent || '').trim();
                const minutes = parseChessComTimeLabel(tcText);
                const isBlockedKeyword = /день|дн[еяёй]/i.test(tcText) || (!bulletAllowed && /Пуля|Bullet/i.test(tcText));
                if (isBlockedKeyword || minutes === null || minutes < effMin) {
                    safeHide(card);
                }
            });
        };

        // Фильтр строк турниров на /play/online/tournaments
        // v0.12: при открытом Bullet-окне Bullet-турниры НЕ скрываются (минимум падает до 1 мин,
        // ключевые слова Bullet/Пуля и блок-glyph пропускают).
        const filterTournamentRows = () => {
            const effMin = getEffectiveMinMinutesChessCom();
            const bulletAllowed = effMin <= 1;
            const blockedGlyphs = bulletAllowed
                ? cfg.blockedGlyphs.filter((g) => g !== 'game-time-bullet')
                : cfg.blockedGlyphs;
            const blockedKeywords = bulletAllowed
                ? cfg.blockedTournamentKeywords.filter((k) => !/^(Bullet|Пуля)$/i.test(k))
                : cfg.blockedTournamentKeywords;
            const blockedTimeLabels = bulletAllowed
                ? new Set([...blockedTimeLabelSet].filter((t) => !/1\s*(мин|min|\|)/i.test(t)))
                : blockedTimeLabelSet;
            document.querySelectorAll('.tournaments-list-item-component').forEach((row) => {
                const text = (row.innerText || row.textContent || '').trim();
                const eventLabel = (row.querySelector('.tournaments-list-item-event-label')?.textContent || '').trim();
                const timeLabelText = (row.querySelector('.tournaments-list-item-time-label-col')?.textContent || '').trim();
                // Иконка типа: data-glyph на svg внутри iconGlyph
                const iconGlyph = row.querySelector('.tournaments-list-item-iconGlyph [data-glyph]')?.getAttribute('data-glyph') || '';
                const altText = (row.querySelector('.tournaments-list-item-iconGlyph img')?.getAttribute('alt') || '').trim();

                // 1. По иконке (надёжно для не-кастомных турниров)
                if (blockedGlyphs.includes(iconGlyph)) { safeHide(row); return; }
                // 2. По ключевым словам в названии / alt
                const checkText = `${eventLabel} ${altText}`;
                if (blockedKeywords.some((kw) => new RegExp(kw, 'i').test(checkText))) { safeHide(row); return; }
                // 3. По подписи контроля времени
                if (blockedTimeLabels.has(timeLabelText)) { safeHide(row); return; }
                const minutes = parseChessComTimeLabel(timeLabelText);
                if (minutes === null) { safeHide(row); return; } // correspondence или непарсимо
                if (minutes < effMin) { safeHide(row); return; }
                // 4. Старый legacy-keyword по innerText (на всякий случай)
                if (blockedKeywords.some((kw) => new RegExp(kw, 'i').test(text))) {
                    safeHide(row);
                }
            });
        };

        const applyRules = () => {
            if (!CONFIG.modules.chessComFilter) return;
            filterTournamentRows();
            // legacy: section labels (Заочные, Пуля, Последние)
            // v0.12: при открытом Bullet-окне «Пуля» секция остаётся видимой.
            const effMin = getEffectiveMinMinutesChessCom();
            const bulletAllowed = effMin <= 1;
            const sectionLabelsToHide = bulletAllowed
                ? cfg.blockedSectionLabels.filter((l) => !/^Пуля$/i.test(l))
                : cfg.blockedSectionLabels;
            document.querySelectorAll('.time-selector-section-component, .recent-time-section-component').forEach((section) => {
                const label = section.querySelector('.time-selector-section-label, .recent-time-section-label');
                if (label && sectionLabelsToHide.includes(label.textContent.trim())) {
                    safeHide(section);
                }
            });
            filterIncomingChallenges();
            autoSwitchFromBullet();
            guardPlayButton();
            guardBotCtaButton();
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
        if (isLichessFullyUnlockedToday()) return; // v0.17: снят весь контроль на lichess

        // CSS-инъекция: скрываем кнопки лобби, ведущие к запрещённым потокам.
        // «Бросить вызов другу» = форма прямого контакта с конкретным игроком (соцка) → блок.
        // Остаются на лобби только «Создать запрос на игру» и «Сыграть с компьютером».
        // v0.8.2: на /tournament — статичные CSS-правила для .tsht-short (Bullet/UltraBullet/HyperBullet)
        // и .tsht-variant (Atomic/Crazyhouse/960/3check/etc.). До v0.8.2 эти карточки скрывались
        // через safeHide → inline-style → терялись при Vue rerender (обновление participant count) →
        // карточки мигали («то вижу, то пропадают», прецедент 2026-05-09). CSS-класс к таким
        // потерям иммунен: при пересоздании DOM-узла Vue классы сохраняет.
        // .ucc-blocked-tour — class-based hide для custom-турниров (с произвольным X+Y),
        // которые нельзя поймать через .tsht-short (проверка идёт парсером минут).
        addStyle(`
            .lobby__start__button--friend { display: none !important; }
            .tour-chart__inner a.tsht.tsht-short,
            .tour-chart__inner a.tsht.tsht-variant,
            a.tsht.tsht-short,
            a.tsht.tsht-variant,
            .ucc-blocked-tour,
            .ucc-blocked-tour-bullet,
            .ucc-blocked-swiss,
            .ucc-blocked-swiss-bullet { display: none !important; }
            /* v0.12: Bullet-окно открыто → перекрываем default-hide для .tsht-short и .ucc-blocked-tour-bullet
               (короткий контроль ≥1+0). .tsht-variant остаётся скрытым ВСЕГДА (Atomic/Crazyhouse/960 — варианты).
               .ucc-blocked-tour остаётся скрытым ВСЕГДА (UltraBullet ¼+0 / ½+0 / кастомные ниже минимума). */
            body.ucc-bullet-window-open .tour-chart__inner a.tsht.tsht-short,
            body.ucc-bullet-window-open a.tsht.tsht-short,
            body.ucc-bullet-window-open .ucc-blocked-tour-bullet,
            body.ucc-bullet-window-open .ucc-blocked-swiss-bullet { display: revert !important; }
            /* v0.11.1: публичный чат «Чат для зрителей» на партиях/наблюдении.
               <section class="mchat"> содержит ленту чужих сообщений с user-link на профили
               и input «Будьте вежливы в чате!» — соцсоставляющая, скрываем целиком. */
            section.mchat, .mchat { display: none !important; }
        `);
        // v0.10: ссылки на /tournament/new (и любые другие пути из lichess block-list) скрывает initAutoHideBlockedPaths.

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
        const baseMinMinutes = lichessCfg.minBaseMinutes || 3;
        // v0.12: динамический эффективный минимум.
        // Когда Bullet-окно открыто — 1 минута (Bullet 1+0 / 2+1 разрешены).
        // UltraBullet (¼+0, ½+0, ¾+0) НЕ разрешён никогда — там всегда base ≥ 1.
        function getEffectiveMinMinutes() {
            const bullet = applyBulletWindowState();
            if (bullet && bullet.isOpen) {
                const seconds = (CONFIG.bulletReward && CONFIG.bulletReward.minBulletSeconds) || 60;
                return Math.max(1, Math.floor(seconds / 60));
            }
            return baseMinMinutes;
        }

        function textHasAllowedType(text) {
            if (!text) return false;
            const types = lichessCfg.allowedGameTypes.slice();
            // v0.12.4: при открытом Bullet-окне 'Пуля'/'Bullet' тоже считаются разрешёнными.
            // Без этого на странице Bullet-партии (gameType="1+0 • Пуля • Xм") applyRules
            // не пропускал bypass и скрывал доску через boardSelectors. Симметрия с getEffectiveMinMinutes().
            const bullet = applyBulletWindowState();
            if (bullet && bullet.isOpen) {
                types.push('Пуля', 'Bullet');
            }
            return types.some((type) => text.includes(type));
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

        // v0.13.0: страница, где реально идёт партия или турнир (и только там имеет
        // смысл проверять контроль времени / прятать доску).
        //   .game__meta        — сайдбар партии (app/views/game/side.scala), там же .setup «3+0 • Рейтинговая • Блиц»
        //   .round__app/.round__board — приложение партии (у играющего и у зрителя)
        //   .tour__meta, .tour__meta__head — страница турнира /tournament/<id>
        //   .swiss__meta       — страница швейцарки /swiss/<id> (v0.15.0; на списке /swiss
        //                        этого маркера нет — там работает filterSwissRows)
        // Страницы задач (.puzzle__board), тренажёров (.storm__board), анализа
        // (.analyse__board), лобби и списка турниров этих маркеров не имеют → проверка
        // на них не запускается и доска остаётся видимой.
        function hasGameContext() {
            return !!document.querySelector(
                '.game__meta, .round__app, .round__board, .round__app__board, .tour__meta, .tour__meta__head, .swiss__meta'
            );
        }

        function detectGameTypeText() {
            // Главный источник на /tournament/<id>: .tour__meta__head p ("1+0 • Пуля • 27m")
            const metaHead = document.querySelector('.tour__meta__head p')?.textContent?.trim();
            if (metaHead) return metaHead;
            // v0.15.0: /swiss/<id> — первый <p> в .swiss__meta ("30+0 • Классика • Рейтинговый").
            // Второй <p> — «4/5 туров • Швейцарский», времени там нет, поэтому берём именно первый.
            const swissHead = document.querySelector('.swiss__meta section p')?.textContent?.trim();
            if (swissHead) return swissHead;
            const metaText = document.querySelector('.tour__meta')?.textContent?.trim();
            if (metaText) return metaText;
            const setupText = document.querySelector('.game__meta__infos .setup')?.textContent?.trim();
            if (setupText) return setupText;
            return document.title || '';
        }

        // Фильтр карточек турниров на /tournament (расписание).
        // 1. .tsht-variant — варианты (Atomic, Crazyhouse, 960, etc.) → блок чистым CSS-rule (см. addStyle выше)
        // 2. .tsht-short — короткий контроль (Bullet/UltraBullet/HyperBullet) → блок чистым CSS-rule (см. addStyle выше)
        // 3. Парсинг "X+Y" из .text — если X < minMinutes → блок через class .ucc-blocked-tour (устойчиво к Vue rerender)
        // v0.8.2: класс вместо inline-style — Vue при пересоздании DOM-узла сохраняет классы.
        function filterTournamentCards() {
            const tCfg = lichessCfg.tournamentCardClasses;
            // v0.12: при открытом Bullet-окне base 1+ открывается через body.ucc-bullet-window-open.
            // UltraBullet (<1 мин) остаётся блокирован всегда — отдельный класс .ucc-blocked-tour
            // (CSS rule на этот класс не подменяется body-class). Bullet (1-2 мин) → .ucc-blocked-tour-bullet.
            document.querySelectorAll('.tour-chart__inner a.tsht, a.tsht').forEach((card) => {
                // Cases 1 и 2 (tsht-variant / tsht-short) уже скрыты CSS-rule, JS им не нужен.
                if (card.classList.contains(tCfg.variant)) return;
                if (card.classList.contains(tCfg.short)) return;
                if (card.classList.contains('ucc-blocked-tour')) return; // UltraBullet — навсегда
                if (card.classList.contains('ucc-blocked-tour-bullet')) return; // Bullet — открывается окном
                const text = (card.querySelector(tCfg.textInfo)?.textContent || '').trim();
                const minutes = parseLichessTimeFormat(text);
                if (minutes === null) {
                    // Fallback: проверка по имени/иконке (для не-стандартных карточек без X+Y)
                    const iconTitle = card.querySelector('.icon')?.getAttribute('title') || '';
                    const fullText = `${iconTitle} ${card.textContent || ''}`;
                    if (!textHasAllowedType(fullText)) card.classList.add('ucc-blocked-tour');
                    return;
                }
                if (minutes < 1) {
                    // UltraBullet (¼+0, ½+0, ¾+0) — никогда не открываем
                    card.classList.add('ucc-blocked-tour');
                } else if (minutes < baseMinMinutes) {
                    // Bullet (1+0, 2+1) — открывается Bullet-окном через body class
                    card.classList.add('ucc-blocked-tour-bullet');
                }
            });
        }

        // v0.15.0: фильтр строк расписания швейцарок на /swiss.
        // Логика зеркалит filterTournamentCards (Арена), отличие — разметка: не карточки .tsht,
        // а строки таблицы, где контроль и тип лежат в одной подписи .setup «30+0 • Классика • Рейтинговый».
        //   база < 1 мин (UltraBullet ¼+0/½+0)   → .ucc-blocked-swiss        — скрыто всегда
        //   база < minBaseMinutes (Пуля 1+0/2+1) → .ucc-blocked-swiss-bullet — открывается Bullet-окном
        //   тип не из allowedGameTypes (варианты Atomic/Crazyhouse/960, у швейцарок вариант стоит
        //   на месте типа: «3+0 • Crazyhouse») → .ucc-blocked-swiss — скрыто всегда
        // Класс, а не inline-style: список перерисовывается при обновлении числа участников.
        function filterSwissRows() {
            const sCfg = lichessCfg.swissRowClasses;
            if (!sCfg) return;
            document.querySelectorAll(sCfg.row).forEach((row) => {
                if (row.classList.contains('ucc-blocked-swiss')) return;
                if (row.classList.contains('ucc-blocked-swiss-bullet')) return;
                const setupText = (row.querySelector(sCfg.setup)?.textContent || '').trim();
                if (!setupText) return; // строка-заголовок / пустая — не трогаем
                // 1. Вариант шахмат. Проверяем ПО БАЗОВОМУ списку типов (+ Пуля), а не через
                //    textHasAllowedType: иначе «1+0 • Crazyhouse» при открытом Bullet-окне
                //    прошёл бы как обычная Пуля. Вариант скрыт всегда, окно его не открывает.
                const isBulletLabel = /Пуля|Bullet/i.test(setupText);
                const isStandardSpeed = isBulletLabel
                    || lichessCfg.allowedGameTypes.some((type) => setupText.includes(type));
                if (!isStandardSpeed) {
                    row.classList.add('ucc-blocked-swiss');
                    return;
                }
                // 2. Контроль времени
                const minutes = parseLichessTimeFormat(setupText);
                if (minutes === null) {
                    if (!textHasAllowedType(setupText)) row.classList.add('ucc-blocked-swiss');
                    return;
                }
                if (minutes < 1) {
                    row.classList.add('ucc-blocked-swiss');
                } else if (minutes < baseMinMinutes) {
                    row.classList.add('ucc-blocked-swiss-bullet');
                }
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

            // Скрываем пресеты <effectiveMinMinutes (1+0, 2+1) — но при открытом Bullet-окне 1+0 разрешён
            const effMin = getEffectiveMinMinutes();
            modal.querySelectorAll(h.presetButtons).forEach((btn) => {
                const t = (btn.textContent || '').trim();
                const minutes = parseLichessTimeFormat(t);
                if (minutes !== null && minutes < effMin) safeHide(btn);
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
                    const effMinSubmit = getEffectiveMinMinutes();
                    if (Number.isNaN(minutes) || minutes < effMinSubmit) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        const bulletNote = effMinSubmit < baseMinMinutes
                            ? '\n(Bullet-окно открыто — разрешён 1+0.)'
                            : '';
                        window.alert(`Можно играть только Блиц от ${effMinSubmit}+0, Рапид и Классику.\nВыберите минут на партию ≥ ${effMinSubmit}, вкладка «По часам».${bulletNote}`);
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
            filterSwissRows();
            filterHookModal();

            if (PATH === '/racer' || PATH.startsWith('/racer/')) {
                return;
            }

            // v0.13.0: проверка типа игры — ТОЛЬКО на странице партии или турнира.
            // Раньше она шла на любой странице lichess: detectGameTypeText() не находил
            // мету партии, падал на document.title («Задачи • lichess.org»), не видел там
            // «Блиц/Рапид/Классика» → считал страницу запрещённой и прятал доску через
            // boardSelectors (.main-board / .cg-wrap). Итог после редизайна lichess —
            // пустое место вместо доски на /training, /storm, /streak, /analysis,
            // /training/coordinate и мини-доски на лобби (замер 2026-07-28).
            // hasGameContext() — DOM-маркеры реальной партии/турнира, а не список путей:
            // .game__meta / .round__* — страница партии, .tour__meta* — страница турнира.
            if (!hasGameContext()) return;

            const gameTypeText = detectGameTypeText();
            if (!gameTypeText) return;

            // Если на странице есть .tour__meta__head с форматом X+Y — проверяем X.
            // v0.12: при открытом Bullet-окне minMinutes динамически снижается до 1.
            const tourMinutes = parseLichessTimeFormat(gameTypeText);
            const effMin = getEffectiveMinMinutes();
            if (tourMinutes !== null) {
                if (tourMinutes >= effMin && textHasAllowedType(gameTypeText)) return;
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

    // v0.14: предохранитель отправки ставится ПЕРВЫМ — до блок-экрана и до любых
    // таймеров. Если расширение внедрилось с опозданием (перезапуск браузера),
    // страница уже отрисована, и единственное, что ещё можно перехватить, — сама
    // отправка. На заблокированной странице документ всё равно будет заменён ниже.
    installSendGuard();

    if (initUrlBlocker()) {
        return;
    }

    initTimeBlocker();

    const trackerResult = initTracker();
    if (trackerResult.redirected) {
        return;
    }

    initAutoHideBlockedPaths();
    initAccountControlHider();
    initChessComFilter();
    initLichessFilter();

    // v0.16: все проверки пройдены (или блок-экран уже сам снял шторку выше) —
    // убираем Stylus-шторку. В ветке redirect трекера armCurtain НЕ зовётся
    // сознательно: контент страницы не должен мелькать до ухода на Racer.
    armCurtain();
    // initMessageControl(); // LEGACY (v0.3.0+, 2026-05-09): переписка теперь блокируется через path-whitelist
    //                       (/inbox, /forum, /team, /messages, /coach — все падают в block).
    //                       Функция оставлена в коде как backup на случай, если режим
    //                       "10 задач = 1 сообщение" снова потребуется.
})();
