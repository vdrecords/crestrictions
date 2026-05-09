# Chess Control — родительский фильтр для chess.com / lichess.org

Tampermonkey-userscript: ребёнок может тренировать **задачи** + играть только **Блиц (от 3+0) / Рапид / Классику**. Всё остальное — Bullet, варианты шахмат (Chess960, Crazyhouse, Atomic, etc.), correspondence, соцка (форумы, клубы, переписка) — заблокировано двумя слоями: path-whitelist + DOM/CSS-фильтр.

**Версия:** см. `@version` в `cc.user.js` (актуально 0.4.0).

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

### Lichess.org
- `/inbox`, `/team`, `/forum`, `/blog`, `/ublog`, `/coach`, `/player`, `/players`, `/patron`, `/timeline`
- `/tv`, `/video`, `/streamer`, `/broadcast`
- `/games/search`, `/swiss`, `/simul`
- `/@/<username>` (профили)

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

- **0.5.0** (2026-05-09) — `/play/computer` поддержка: универсальный submit-button (`.footer .lobby__start__button` ловит `--hook` / `--ai` / `--friend`), auto-switch с активного «Отсутствует»/«По переписке» на «По часам», variant-check на submit (блокировка не-стандартных шахмат), CSS-скрытие «Бросить вызов другу» на лобби. Memory-rule: перед запросом DOM у тебя — curl-проверка URL на 200
- **0.4.0** (2026-05-09) — фильтр модалки создания игры на chess.com (Bullet/Daily секции + перехват кнопки), фильтр hook-модалки на lichess (variant/correspondence/Bullet пресеты + submit-guard), парсинг времени турниров через `data-glyph` и `tsht-variant`/`tsht-short`/regex, расписание 12:00, цели по дням, `/swiss` и `/simul` в block
- **0.3.0** (2026-05-09) — path-whitelist для chess.com и lichess.org (default-deny), нормализация i18n-префиксов (`/ru/`, `/en-US/`), классика добавлена в allowedGameTypes
- **0.2.0** (2026-05-09) — whitelist хостов сужен до chess.com / lichess.org, удалён ChessKing, удалён tournamentMode, удалён backdoor `window.unifiedChessControl`, remoteConfig отключён, универсальный regex для `/training/*`
- **0.1.0** — единый сборный userscript на основе исходных 01-10
