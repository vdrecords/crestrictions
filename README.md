# Chess Control — родительский фильтр для chess.com / lichess.org

Tampermonkey-userscript: ребёнок может тренировать **задачи** + играть только **Блиц (от 3+0) / Рапид / Классику**. Всё остальное — Bullet, варианты шахмат (Chess960, Crazyhouse, Atomic, etc.), correspondence, соцка (форумы, клубы, переписка) — заблокировано двумя слоями: path-whitelist + DOM/CSS-фильтр.

**Версия:** см. `@version` в `cc.user.js` (актуально 0.11.1).

---

## Установка

### Шаг 1. Поставить Tampermonkey

- [Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) (если у ребёнка уже не заблокирован Chrome Web Store основным фильтром — иначе установить заранее, до включения скрипта)
- [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/)

### Шаг 2. Открыть raw-ссылку userscript-а в браузере

Tampermonkey автоматически распознаёт `*.user.js` и предлагает установку.

**Полный URL:**

```
https://raw.githubusercontent.com/vdrecords/crestrictions/main/cc.user.js
```

**Альтернатива через github.com (с редиректом на raw):**

```
github.com/vdrecords/crestrictions/raw/main/cc.user.js
```

### Шаг 3. Нажать «Install» в окне Tampermonkey

После установки скрипт включается автоматически. Никаких настроек руками — всё в коде.

### Автообновление

В шапке прописаны `@updateURL` / `@downloadURL` — Tampermonkey раз в день проверяет обновления. После любой моей правки в этом репо — у ребёнка скрипт обновится автоматически.

---

## Короткая ссылка (рекомендации для ручного набора)

Raw URL длинный (70 символов). Чтобы не набирать вручную полный путь, есть три простых пути:

### Вариант A — `bit.ly` (5 минут, проще всего)

1. Регистрация на https://bitly.com (бесплатный аккаунт)
2. Создаёшь bitlink на raw URL
3. Custom slug: `bit.ly/cc-tm` (12 символов) или любой свободный
4. Tampermonkey понимает редиректы — короткой ссылки достаточно

### Вариант B — `allcantrip.ru/cc` (если у тебя есть доступ к веб-серверу)

В nginx / Cloudflare Page Rules / `.htaccess` добавить 301-редирект:

```
location = /cc { return 301 https://raw.githubusercontent.com/vdrecords/crestrictions/main/cc.user.js; }
```

Или Cloudflare Page Rule: `allcantrip.ru/cc` → `https://raw.githubusercontent.com/vdrecords/crestrictions/main/cc.user.js` (Forwarding URL, status 301).

После — набираешь `allcantrip.ru/cc` (16 символов), Tampermonkey следует редиректу и устанавливает скрипт.

### Вариант C — GitHub Pages (самый «бесплатный»)

1. На https://github.com/vdrecords/crestrictions/settings/pages → Source: `main` / `/ (root)` → Save
2. Через 1–2 минуты доступен URL `https://vdrecords.github.io/crestrictions/cc.user.js` (47 символов)
3. Преимущество: на корне можно положить `index.html` с meta-refresh на `cc.user.js`, тогда работает короткая `vdrecords.github.io/crestrictions`

---

## Что внутри скрипта

| Модуль | Делает |
|---|---|
| **urlBlocker** | Whitelist хостов (только chess.com и lichess.org) + path-уровень фильтр (всё кроме задач/учёбы/Blitz-Rapid-Classical → блок) |
| **timeBlocker** | Окна расписания: 09:00–12:00 и 18:00–20:00 каждый день. Вне окон — overlay «Время закончилось» |
| **tracker** | Дневная норма задач Lichess Racer: Пн–Ср=100, Чт=300, Пт=100, Сб–Вс=1000. Пока не выполнил — редирект на `lichess.org/racer` |
| **chessComFilter** | Скрывает Bullet и Daily секции в модалке создания игры; перехват «Начать партию» с alert; фильтр турниров по data-glyph + ключевым словам + контролю времени; incoming challenges с короткими/long контролями скрываются |
| **lichessFilter** | Универсальный regex для блока тематических `/training/<theme>`; фильтр карточек турниров через `tsht-variant` + `tsht-short` + парсинг `X+Y`; перехват submit `.lobby__start__button--hook`; скрытие пресетов <3 мин в hook-модалке; скрытие табов «По переписке»/«Отсутствует» |
| **messageControl** | LEGACY backup — отключён, переписка блокируется через path-whitelist |

---

## Список заблокированных разделов

### Chess.com
- `/play/coach`, `/play/online/watch`, `/play/online/new?daily=*` (correspondence)
- `/messages`, `/friends`, `/clubs`, `/coaches`, `/forum`, `/community`, `/leaderboard`, `/players`, `/ratings`, `/members`
- `/streamer`, `/streamers`, `/tv`, `/watch`, `/events`, `/news`, `/articles`, `/blogs`, `/today`
- `/membership`, `/votechess`, `/computer-chess-championship`, `/variants`, `/aimchess`
- `/member`, `/users`, `/user` (профили)
- `/logout`, `/settings/close*` (выход / удаление аккаунта)
- `/other` (sidebar «Другие» — сборная страница доп.функций)
- `/insights/<username>` (просмотр чужих творческих профилей: Hikaru, GothamChess и т.д. — корень `/insights` для своих метрик остаётся)

### Lichess.org
- `/inbox`, `/team`, `/forum`, `/blog`, `/ublog`, `/coach`, `/player`, `/players`, `/patron`, `/timeline`
- `/tv`, `/video`, `/streamer`, `/broadcast`
- `/games/search`, `/swiss`, `/simul`
- `/@/<username>` (профили)
- `/logout`, `/account/close`, `/account/delete` (выход / удаление аккаунта)
- `/study` (UGC-раздел студий: создание, поиск, листание чужих с автор-link и комментариями)
- `/tournament/new` (создание собственного турнира — `/tournament` и `/tournament/<id>` остаются открытыми)

---

## Тестирование (перед установкой ребёнку)

1. Установить скрипт в свой браузер
2. Зайти на chess.com и lichess.org, проверить:
   - Время блокировки (после 12:00 — overlay)
   - Дневная цель (для текущего дня)
   - Модалка `/play/online` — секции **Пуля** и **Заочные** скрыты, кнопка «Начать партию» с Bullet → alert
   - Модалка hook на lichess (Создать запрос на игру) — пресеты 1+0, 2+1 скрыты, табы «По переписке» / «Отсутствует» скрыты
   - Турниры — Bullet/UltraBullet/Variants/Chess960 скрыты на обоих сайтах
   - `/swiss`, `/simul`, `/inbox`, `/team`, `/forum`, `/clubs`, `/messages`, `/tv`, `/streamer` → «Раздел не разрешён»
3. Если что-то проскочило — открыть DevTools → Inspect → Copy outerHTML проблемного элемента, прислать в issue или в чате с разработчиком

---

## История

- **0.11.1** (2026-05-09) — скрытие публичного чата lichess. CSS `section.mchat, .mchat { display: none !important; }` убирает блок «Чат для зрителей» на страницах партий/наблюдения (содержит ленту чужих сообщений с user-link на профили и input для отправки). Личные сообщения уже блокированы через path-policy `/inbox`; чат партии — отдельный inline-компонент, поэтому отдельный CSS
- **0.11.0** (2026-05-09) — (a) окно «Цель выполнена» теперь полностью исчезает при completed (state.remaining===0 → display:none) вместо того чтобы зависать с зелёным «0» — мотивация дорешать больше не нужна когда всё решено; (b) автопереключение времени на chess.com `/play/online`: если в верхнем dropdown стоит запомненный Bullet/correspondence (chess.com помнит последний выбор пользователя), скрипт программно кликает на первую видимую разрешённую кнопку (3+2 Блиц → 5 мин Блиц → 10 мин Рапид). Раньше ребёнок видел «1 мин. (Пуля)» по дефолту и получал alert при клике «Начать партию» — теперь сразу нормальное время. Datset-флаг `uccAutoSwitched` чтобы не дёргать клик в цикле applyRules
- **0.10.0** (2026-05-09) — `initAutoHideBlockedPaths()`: автогенерация CSS-rule для всех ссылок на пути из block-list. Каждый путь в block теперь автоматически скрывает свои навигационные ссылки на сайте без отдельной CSS-правки. Border-aware селекторы (3 на путь): `a[href$="/PATH"]` (точное окончание + абсолютные URL), `a[href*="/PATH/"]` (с подпутем), `a[href*="/PATH?"]` (с query). Не ловит false-positive: для `/user` не ловит `/users` (потому что `/users` заканчивается на `/users`, не на `/user`). Покрытие: chess.com 31 path → 93 селектора, lichess.org 22 path → 66 селекторов. Бывшая ручная CSS-правка для `/tournament/new` (v0.9.1) удалена — теперь автоматом
- **0.9.1** (2026-05-09) — `/tournament/new` lichess в block (создание собственного турнира). Path `/tournament` и `/tournament/<id>` остаются open для просмотра расписания и участия. Бонусом — CSS `a[href$="/tournament/new"] { display: none }` скрывает зелёную кнопку «+ Создать турнир» в правом верхнем углу страницы расписания, чтобы ребёнок не получал overlay блокировки от случайного клика. Curl-verified: 303→/signup для гостя, 200 для залогиненного
- **0.9.0** (2026-05-09) — структурный рефактор: верх файла теперь `USER SETTINGS` блок (8 секций), ниже — технический `LOCAL_CONFIG`. Родитель крутит расписание / дневные цели / минимум секунд / override-дни / даты отключения lichess / модули / быстрые ссылки в первых ~80 строках, без погружения в DOM-селекторы. Значения 1-в-1 совпадают с pre-refactor (16 ключевых полей проверены через node-репро). `lichess.minBaseMinutes` теперь авто-зеркало `MIN_BASE_TIME_SECONDS / 60` — править минимум в одном месте достаточно
- **0.8.2** (2026-05-09) — fix мигания карточек турниров на `lichess.org/tournament`. Корень: `safeHide()` ставил inline-style `display:none`, который Vue теряет при rerender (обновление participant count, прогресс-баров) → между уничтожением старого узла и пометкой нового через MutationObserver карточка успевала появиться видимой. Решение: (1) статичный CSS-rule `.tour-chart__inner a.tsht.tsht-short, a.tsht.tsht-variant { display: none !important; }` — Bullet/UltraBullet/HyperBullet/Atomic/Crazyhouse/960 скрываются на CSS-уровне, rerender им не страшен; (2) для custom-турниров с произвольным `X+Y` контролем — class-based hide через `.ucc-blocked-tour { display: none !important; }` (устойчив к замене узла, т.к. Vue класс сохраняет даже при пересоздании). JS-фильтр в `filterTournamentCards()` переписан с `safeHide(card)` на `card.classList.add('ucc-blocked-tour')`
- **0.8.1** (2026-05-09) — разовый override расписания: `dateOverrides['2026-05-09'] = { patch: [{ index: 0, to: '13:00' }] }`. Утреннее окно сегодня `09:00-13:00` вместо `09:00-12:00`. Вечернее окно `18:00-20:00` без изменений. Использован существующий механизм `dateOverrides` (там же шаблоны для 2025-11-16 и 2025-12-23)
- **0.8.0** (2026-05-09) — `/play/computer` усиление + блок UGC и чужих профилей. **Path-policy**: chess.com `/other` (sidebar) и `/insights/<username>` (чужие творческие профили — Hikaru/GothamChess) добавлены в block; lichess `/study` целиком в block (UGC-раздел: создание/поиск/листание чужих studies с автором, лайками, комментариями). **chessComFilter**: новые селекторы `playComputerSelectors` — `.mode-selection-container-no-timer-button` (играть бота без часов), `[data-cy="variant-dropdown-button"]` (выбор 960/Crazyhouse/Atomic) — оба скрыты CSS на /play/computer. Defense-in-depth `guardBotCtaButton` на `[data-cy="bot-selection-cta-button"]`: проверяет что вариант остался Стандарт/Классика, иначе alert. Curl-verified: `/other` (200), `/insights/hikaru` (200), `/study` (200), `/study/<id>` (200) — все живые
- **0.7.0** (2026-05-09) — блокировка logout / удаления аккаунта на обоих сайтах. Path-policy: `/logout` (chess.com и lichess), `/account/close`/`/account/delete` (lichess), `/settings/close*` (chess.com через blockRegex). CSS+DOM-walker: `initAccountControlHider()` инжектит селекторы по `href`/`action` (`a[href$="/logout"]`, `form[action*="/logout"]`, `a[href*="/account/close"]`) + MutationObserver обходит a/button/menuitem на тексты «Выйти», «Logout», «Sign out», «Закрыть аккаунт», «Удалить аккаунт», «Close account», «Delete account» и скрывает их (включая родительский `<li>` / `.dropdown-item`). Цель: родитель один раз залогинил — ребёнок не должен случайно или намеренно разлогиниться/удалить профиль. Curl-verified: `/logout` (302→/), `/settings/close-account` (200), `/account/close` (200), `/account/delete` (200), `/auth/logout` (404 — не существует), `/settings/close` (404 — только `close-account`)
- **0.6.0** (2026-05-09) — fix false-block для встроенных тренажёров lichess: `/training/coordinate` (Координаты), `/training/daily` (Задача дня), `/training/dashboard/<rating>` (Панель задач) добавлены в `isAllowedTrainingPath`. Удалён фантомный `/coordinate` из allow chess.com (404 на голом /coordinate, реальный URL — только `/training/coordinate`)
- **0.5.0** (2026-05-09) — `/play/computer` поддержка: универсальный submit-button (`.footer .lobby__start__button` ловит `--hook` / `--ai` / `--friend`), auto-switch с активного «Отсутствует»/«По переписке» на «По часам», variant-check на submit (блокировка не-стандартных шахмат), CSS-скрытие «Бросить вызов другу» на лобби. Memory-rule: перед запросом DOM у тебя — curl-проверка URL на 200
- **0.4.0** (2026-05-09) — фильтр модалки создания игры на chess.com (Bullet/Daily секции + перехват кнопки), фильтр hook-модалки на lichess (variant/correspondence/Bullet пресеты + submit-guard), парсинг времени турниров через `data-glyph` и `tsht-variant`/`tsht-short`/regex, расписание 12:00, цели по дням, `/swiss` и `/simul` в block
- **0.3.0** (2026-05-09) — path-whitelist для chess.com и lichess.org (default-deny), нормализация i18n-префиксов (`/ru/`, `/en-US/`), классика добавлена в allowedGameTypes
- **0.2.0** (2026-05-09) — whitelist хостов сужен до chess.com / lichess.org, удалён ChessKing, удалён tournamentMode, удалён backdoor `window.unifiedChessControl`, remoteConfig отключён, универсальный regex для `/training/*`
- **0.1.0** — единый сборный userscript на основе исходных 01-10
