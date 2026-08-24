// Прибор: вырезаем из скрипта настройки + чистые функции решения и проверяем их
// на реальных сценариях (без DOM). Ничего не переписываем — код берётся as-is.
const fs = require('fs');
const P = '/Users/vd/Documents/Claude/tampermonkey/chess-control/crestrictions-main/11_unified_chess_control.js';
const src = fs.readFileSync(P, 'utf8');
const lines = src.split('\n');

function slice(fromMarker, toMarker) {
  const a = lines.findIndex(l => l.includes(fromMarker));
  const b = lines.findIndex((l, i) => i > a && l.includes(toMarker));
  if (a < 0 || b < 0) throw new Error('marker not found: ' + fromMarker + ' / ' + toMarker);
  return lines.slice(a, b).join('\n');
}

// 1) весь блок настроек родителя + LOCAL_CONFIG
const settings = slice('const SCHEDULE_WEEKLY = {', 'const CONFIG = JSON.parse');

// 2) нужные функции — вырезаем по имени целиком (от объявления до строки '    }')
function fn(name) {
  const start = lines.findIndex(l => l.startsWith('    function ' + name + '('));
  if (start < 0) throw new Error('fn not found: ' + name);
  let end = start;
  while (end < lines.length && lines[end] !== '    }') end++;
  return lines.slice(start, end + 1).join('\n');
}
const NAMES = ['pad2','formatDateKey','parseTimeString','minutesToTimeString','getCurrentMinutes',
  'readNumber','readValue','trackerKeys','getDailyTarget','getUnlockedWindowsForDate',
  'getFullUnlockTaskThreshold','isLichessFullUnlockEarnedByTasks','getLichessFullUnlockReason',
  'getFullUnlockWindowsForDate','getActiveFullUnlockWindow','getFullUnlockEndLabel',
  'isLichessFullyUnlockedNow'];

const harness = `
${settings}
const CONFIG = JSON.parse(JSON.stringify(LOCAL_CONFIG));
let HOST = 'lichess.org';
const COURSE_ID = String(CONFIG.storage.courseId);
let STORE = {};
function GM_getValue(k, d) { return Object.prototype.hasOwnProperty.call(STORE, k) ? STORE[k] : d; }
${NAMES.map(fn).join('\n\n')}
module.exports = { CONFIG, setHost: (h) => { HOST = h; }, setStore: (s) => { STORE = s; },
  keyFor: (dateKey) => trackerKeys(dateKey).racerSolved,
  getDailyTarget, getLichessFullUnlockReason, isLichessFullyUnlockedNow,
  getFullUnlockEndLabel, getActiveFullUnlockWindow, getUnlockedWindowsForDate };
`;
fs.writeFileSync(__dirname + '/.extracted_probe.js', harness);
const M = require(__dirname + '/.extracted_probe.js');

// ── сценарии ────────────────────────────────────────────────────────────────
let fails = 0, total = 0;
function check(name, actual, expected) {
  total++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { fails++; console.log('❌ ' + name + '\n   ожидалось ' + JSON.stringify(expected) + ', получено ' + JSON.stringify(actual)); }
  else console.log('✅ ' + name + ' → ' + JSON.stringify(actual));
}
// понедельник 2026-08-24, расписание 09:00–12:00 и 16:00–18:00, норма Пн = 100
const D = (h, m, day = 24) => new Date(2026, 7, day, h, m, 0);
const KEY = (day = 24) => M.keyFor('2026-08-' + String(day).padStart(2, '0'));

console.log('\n── Норма дня (Пн 24.08) ──');
check('дневная норма', M.getDailyTarget(D(10, 0)), 300);

console.log('\n── 1. Разблокировка по дате учитывает расписание ──');
M.CONFIG.lichess.fullUnlockDates = ['2026-08-24'];
M.setStore({});
check('08:30 (до окна) — заблокировано', M.isLichessFullyUnlockedNow(D(8, 30)), false);
check('10:00 (утреннее окно) — открыто', M.isLichessFullyUnlockedNow(D(10, 0)), true);
check('13:00 (перерыв) — заблокировано', M.isLichessFullyUnlockedNow(D(13, 0)), false);
check('17:00 (вечернее окно) — открыто', M.isLichessFullyUnlockedNow(D(17, 0)), true);
check('18:00 (конец окна) — заблокировано', M.isLichessFullyUnlockedNow(D(18, 0)), false);
check('23:00 (ночь) — заблокировано', M.isLichessFullyUnlockedNow(D(23, 0)), false);
check('подпись «до»', M.getFullUnlockEndLabel(D(17, 0)), '18:00');
check('соседний день не открыт', M.isLichessFullyUnlockedNow(D(17, 0, 25)), false);

console.log('\n── 1b. Режим always = поведение v0.17 (весь день) ──');
M.CONFIG.lichess.fullUnlockMode = 'always';
check('23:00 при always — открыто', M.isLichessFullyUnlockedNow(D(23, 0)), true);
check('подпись «до» отсутствует', M.getFullUnlockEndLabel(D(23, 0)), null);
M.CONFIG.lichess.fullUnlockMode = 'schedule';

console.log('\n── 1c. Персональное окно на дату перебивает расписание ──');
M.CONFIG.lichess.fullUnlockWindows = { '2026-08-24': [['16:30', '17:00']] };
check('10:00 (окно расписания, но не персональное)', M.isLichessFullyUnlockedNow(D(10, 0)), false);
check('16:45 (персональное окно)', M.isLichessFullyUnlockedNow(D(16, 45)), true);
check('подпись «до»', M.getFullUnlockEndLabel(D(16, 45)), '17:00');
M.CONFIG.lichess.fullUnlockWindows = {};

console.log('\n── 2. Разблокировка как награда за задачи ──');
M.CONFIG.lichess.fullUnlockDates = [];   // особых дней нет
M.setStore({});
check('0 задач, 17:00 — закрыто', M.isLichessFullyUnlockedNow(D(17, 0)), false);
M.setStore({ [KEY()]: 299 });
check('299 задач (норма 300) — закрыто', M.isLichessFullyUnlockedNow(D(17, 0)), false);
M.setStore({ [KEY()]: 300 });
check('300 задач — ОТКРЫТО', M.isLichessFullyUnlockedNow(D(17, 0)), true);
check('причина = tasks', M.getLichessFullUnlockReason(D(17, 0)), 'tasks');
check('но 13:00 (вне окна) — закрыто', M.isLichessFullyUnlockedNow(D(13, 0)), false);
check('и 23:00 (ночь) — закрыто', M.isLichessFullyUnlockedNow(D(23, 0)), false);
M.setStore({ [KEY()]: 450 });
check('450 задач — открыто', M.isLichessFullyUnlockedNow(D(17, 0)), true);
check('задачи вчерашнего дня не переносятся', M.isLichessFullyUnlockedNow(D(17, 0, 25)), false);

console.log('\n── 2b. Отдельный порог и стоп-лист дат ──');
M.CONFIG.lichess.fullUnlockTaskThreshold = 150;
M.setStore({ [KEY()]: 100 });
check('порог 150, решено 100 — закрыто', M.isLichessFullyUnlockedNow(D(17, 0)), false);
M.setStore({ [KEY()]: 150 });
check('порог 150 ниже нормы 300, решено 150 — открыто', M.isLichessFullyUnlockedNow(D(17, 0)), true);
M.CONFIG.lichess.fullUnlockTaskThreshold = null;
M.CONFIG.lichess.fullUnlockTaskDisabledDates = ['2026-08-24'];
M.setStore({ [KEY()]: 1000 });
check('дата в стоп-листе награды — закрыто', M.isLichessFullyUnlockedNow(D(17, 0)), false);
M.CONFIG.lichess.fullUnlockDates = ['2026-08-24'];
check('...но особый день родителя всё равно открывает', M.isLichessFullyUnlockedNow(D(17, 0)), true);
M.CONFIG.lichess.fullUnlockTaskDisabledDates = [];
M.CONFIG.lichess.fullUnlockDates = [];

console.log('\n── 2c. Мастер-тумблер награды ──');
M.CONFIG.lichess.fullUnlockOnTaskTarget = false;
M.setStore({ [KEY()]: 1000 });
check('награда выключена — закрыто', M.isLichessFullyUnlockedNow(D(17, 0)), false);
M.CONFIG.lichess.fullUnlockOnTaskTarget = true;

console.log('\n── 3. Chess.com не затрагивается ──');
M.setHost('www.chess.com');
M.setStore({ [KEY()]: 1000 });
check('chess.com при выполненной норме — контроль на месте', M.isLichessFullyUnlockedNow(D(17, 0)), false);
M.setHost('lichess.org');

console.log('\n── 4. Разовая правка расписания (SCHEDULE_OVERRIDES) тянется в разблокировку ──');
M.CONFIG.timeBlocker.dateOverrides['2026-08-24'] = { patch: [{ index: 1, to: '18:30' }] };
M.setStore({ [KEY()]: 1000 });
check('18:15 при продлённом окне — открыто', M.isLichessFullyUnlockedNow(D(18, 15)), true);
check('подпись «до»', M.getFullUnlockEndLabel(D(18, 15)), '18:30');

console.log('\n' + (fails ? '❌ ПРОВАЛЕНО ' + fails + ' из ' + total : '✅ ВСЕ ' + total + ' ПРОВЕРОК ПРОЙДЕНЫ'));
process.exit(fails ? 1 : 0);
