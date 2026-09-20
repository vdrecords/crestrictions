// Прибор v0.19: удалённый конфиг. Проверяем НЕ пересказ, а сам код скрипта —
// функции вырезаются из файла as-is и исполняются на подготовленных сценариях.
// Отвечает на четыре вопроса:
//   1. накладывается ли файл с сервера поверх локальных настроек;
//   2. возвращает ли пустой файл {} всё к заводским значениям;
//   3. доехали ли до CONFIG поля, которых в белом списке не было до v0.19
//      (награда Bullet и минимальный контроль времени);
//   4. пересчитывается ли производное lichess.minBaseMinutes.
const fs = require('fs');
const P = __dirname + '/11_unified_chess_control.js';
const src = fs.readFileSync(P, 'utf8');
const lines = src.split('\n');

function slice(fromMarker, toMarker) {
  const a = lines.findIndex(l => l.includes(fromMarker));
  const b = lines.findIndex((l, i) => i > a && l.includes(toMarker));
  if (a < 0 || b < 0) throw new Error('marker not found: ' + fromMarker);
  return lines.slice(a, b).join('\n');
}
function fn(name) {
  const start = lines.findIndex(l => l.startsWith('    function ' + name + '('));
  if (start < 0) throw new Error('fn not found: ' + name);
  let end = start;
  while (end < lines.length && lines[end] !== '    }') end++;
  return lines.slice(start, end + 1).join('\n');
}

const settings = slice('const SCHEDULE_WEEKLY = {', 'const CONFIG = JSON.parse');
const paths = slice('const REMOTE_CONFIG_PATHS = [', '    ];') + '\n    ];';
const NAMES = ['pad2','formatDateKey','parseTimeString','minutesToTimeString','getCurrentMinutes',
  'clonePlain','getValueByPath','setValueByPath','syncDerivedConfig','applyRemoteConfig',
  'getUnlockedWindowsForDate','getDailyTarget','readNumber','readValue','trackerKeys'];

const harness = `
${settings}
const CONFIG = JSON.parse(JSON.stringify(LOCAL_CONFIG));
let HOST = 'lichess.org';
const COURSE_ID = String(CONFIG.storage.courseId);
let STORE = {};
function GM_getValue(k, d) { return Object.prototype.hasOwnProperty.call(STORE, k) ? STORE[k] : d; }
function log() {}
${paths}
${NAMES.map(fn).join('\n\n')}
module.exports = { CONFIG, LOCAL_CONFIG, REMOTE_CONFIG_PATHS, applyRemoteConfig,
  getUnlockedWindowsForDate, getDailyTarget, minutesToTimeString };
`;
fs.writeFileSync(__dirname + '/.extracted_remote_probe.js', harness);
const M = require(__dirname + '/.extracted_remote_probe.js');

let fails = 0, total = 0;
function check(name, actual, expected) {
  total++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { fails++; console.log('❌ ' + name + '\n   ожидалось ' + JSON.stringify(expected) + '\n   получено  ' + JSON.stringify(actual)); }
  else console.log('✅ ' + name + ' → ' + JSON.stringify(actual));
}
const win = (d) => M.getUnlockedWindowsForDate(d).map(w => M.minutesToTimeString(w.start) + '-' + M.minutesToTimeString(w.end));

// Суббота 12.09.2026. Заводское: окна 09:00–12:00 и 16:00–18:00, норма 1000.
const SAT = new Date(2026, 8, 12, 17, 0, 0);

console.log('\n── 1. Заводское состояние (файла ещё нет) ──');
M.applyRemoteConfig(null);
check('окна субботы', win(SAT), ['09:00-12:00','16:00-18:00']);
check('норма субботы', M.getDailyTarget(SAT), 1000);
check('минимум chess.com', M.CONFIG.chessCom.minBaseTimeSeconds, 180);
check('минимум lichess', M.CONFIG.lichess.minBaseMinutes, 3);
check('пуля: особых дней нет', M.CONFIG.bulletReward.forceOpenDates, []);
check('разовых продлений нет', Object.keys(M.CONFIG.timeBlocker.dateOverrides), []);
check('разовых норм нет', Object.keys(M.CONFIG.tracker.specialTargets), []);
check('свободных дней нет', M.CONFIG.lichess.fullUnlockDates, []);

console.log('\n── 2. Файл от бота: продление до 21:23 + норма 150 ──');
const fromBot = {
  timeBlocker: { dateOverrides: { '2026-09-12': { patch: [{ index: 1, to: '21:23' }] } } },
  tracker: { specialTargets: { '2026-09-12': 150 } },
  lichess: { fullUnlockDates: [], fullUnlockWindows: {}, disableOnDates: [], fullUnlockTaskDisabledDates: [] },
  bulletReward: { forceOpenDates: ['2026-09-12'], disabledDates: [] }
};
check('применилось', M.applyRemoteConfig(fromBot), true);
check('вечернее окно продлено', win(SAT), ['09:00-12:00','16:00-21:23']);
check('норма снижена', M.getDailyTarget(SAT), 150);
check('час пули выдан', M.CONFIG.bulletReward.forceOpenDates, ['2026-09-12']);

console.log('\n── 3. Новые поля v0.19 (до неё удалённо не управлялись) ──');
check('порог пули с сервера',
  M.applyRemoteConfig({ bulletReward: { threshold: 120 }, chessCom: { minBaseTimeSeconds: 300 } }) &&
  M.CONFIG.bulletReward.threshold, 120);
check('минимум chess.com', M.CONFIG.chessCom.minBaseTimeSeconds, 300);
check('минимум lichess пересчитан', M.CONFIG.lichess.minBaseMinutes, 5);

console.log('\n── 4. Пустой файл {} = полный откат к заводским ──');
M.applyRemoteConfig({});
check('окна вернулись', win(SAT), ['09:00-12:00','16:00-18:00']);
check('норма вернулась', M.getDailyTarget(SAT), 1000);
check('порог пули вернулся', M.CONFIG.bulletReward.threshold, 400);
check('минимум chess.com вернулся', M.CONFIG.chessCom.minBaseTimeSeconds, 180);
check('минимум lichess вернулся', M.CONFIG.lichess.minBaseMinutes, 3);

console.log('\n── 5. Ядро запрета удалённо НЕ управляется ──');
const attack = {
  urlBlocker: { allowedHosts: ['youtube.com','lichess.org','chess.com'], blockedHosts: [] },
  sendGuard: { enabled: false },
  lichess: { blockedTrainingPaths: [] },
  // v0.24: список хостов ютуба — такое же ядро запрета, как домены выше.
  youtube: { hosts: ['lichess.org','mail.google.com','yandex.ru'] }
};
M.applyRemoteConfig(attack);
check('домены не подменились', M.CONFIG.urlBlocker.allowedHosts, ['chess.com','lichess.org']);
check('блок-лист цел', M.CONFIG.urlBlocker.blockedHosts.includes('youtube.com'), true);
check('предохранитель отправки цел', M.CONFIG.sendGuard.enabled, true);
check('закрытые темы целы', M.CONFIG.lichess.blockedTrainingPaths.length > 0, true);
check('типы игр целы', M.CONFIG.lichess.allowedGameTypes.includes('Блиц'), true);
check('хосты ютуба целы', M.CONFIG.youtube.hosts, ['youtube.com','youtu.be']);

console.log('\n── 6. Белый список содержит то, что обещано ──');
const need = ['bulletReward.forceOpenDates','bulletReward.disabledDates','bulletReward.threshold',
  'chessCom.minBaseTimeSeconds','timeBlocker.dateOverrides','tracker.specialTargets',
  'lichess.fullUnlockDates','lichess.fullUnlockWindows'];
need.forEach(p => check('в списке: ' + p, M.REMOTE_CONFIG_PATHS.includes(p), true));
const forbidden = ['urlBlocker.allowedHosts','urlBlocker.allowedPaths','urlBlocker.blockedHosts',
  'sendGuard.enabled','lichess.blockedTrainingPaths','lichess.allowedGameTypes',
  'chessCom.blockedTournamentKeywords','timeBlocker.warningMinutes','messageControl.tasksPerMessage',
  'youtube.hosts','youtube.unlockMode'];
forbidden.forEach(p => check('НЕ в списке: ' + p, M.REMOTE_CONFIG_PATHS.includes(p), false));

console.log('\n── 7. Граница: список = ровно то, чем управляет бот ──');
const BOT_MANAGES = [
  'modules.urlBlocker','modules.timeBlocker','modules.tracker','modules.chessComFilter',
  'modules.lichessFilter','modules.messageControl',
  'timeBlocker.weeklyUnlocked','timeBlocker.dateOverrides',
  'tracker.weeklyTargets','tracker.specialTargets','tracker.activeSources',
  'tracker.preferredSource','tracker.enableChessComPuzzlesMode','tracker.showProgressWindow',
  'chessCom.minBaseTimeSeconds',
  'bulletReward.enabled','bulletReward.threshold','bulletReward.minutesAtThreshold',
  'bulletReward.extraMinutesPerStep','bulletReward.stepTaskCount','bulletReward.capMinutes',
  'bulletReward.minBulletSeconds','bulletReward.disabledDates','bulletReward.forceOpenDates',
  'lichess.disableOnDates','lichess.fullUnlockDates','lichess.fullUnlockMode',
  'lichess.fullUnlockWindows','lichess.fullUnlockOnTaskTarget','lichess.fullUnlockTaskThreshold',
  'lichess.fullUnlockTaskDisabledDates',
  'youtube.unlockDates','youtube.unlockWindows','youtube.afterTaskTarget',
  'telemetry.enabled'
].sort();
check('список совпадает поле в поле', [...M.REMOTE_CONFIG_PATHS].sort(), BOT_MANAGES);

console.log('\n── 7б. Дубли ключей в правилах путей ──');
// В литерале объекта повторный ключ молча затирает первый. Один такой дубль уже
// случился в v0.23: правила для команд были написаны, прошли ревью глазами и не
// работали, а проверки при этом зеленели — по другой причине. Ловим структурно.
{
  const srcText = fs.readFileSync(P, 'utf8');
  const sectionStart = srcText.indexOf('allowedPaths: {');
  const sectionEnd = srcText.indexOf('quickLinks', sectionStart) > 0
    ? srcText.indexOf('safePaths', sectionStart) : srcText.length;
  const section = srcText.slice(sectionStart, srcText.indexOf('\n        },', sectionStart));
  ['chess.com', 'lichess.org'].forEach((host) => {
    const from = section.indexOf(`'${host}': {`);
    const to = section.indexOf("': {", from + host.length + 6);
    const body = section.slice(from, to > 0 ? to : section.length);
    ['block:', 'blockRegex:', 'allow:', 'allowRegex:'].forEach((key) => {
      const count = (body.match(new RegExp('\\n\\s+' + key.replace(':', ':'), 'g')) || []).length;
      check(`${host}: ключ ${key} ровно один`, count <= 1, true);
    });
  });
}

console.log('\n── 8. Порядок инициализации (v0.22) ──');
// Структурная проверка, а не рассуждение: кэш настроек обязан применяться
// РАНЬШЕ модулей, принимающих решения. Именно этот порядок был сломан в v0.19,
// и стоил родителю вечера «почему продление окна не работает».
const at = (needle) => lines.findIndex((l) => l.trim().startsWith(needle));
const prime = at('primeConfigFromCache();');
const guard = at('installSendGuard();');
const urlb  = at('if (initUrlBlocker()) {');
const timeb = at('initTimeBlocker();');
const track = at('const trackerResult = initTracker();');
const net   = at('initRemoteConfig();');
check('кэш применяется до предохранителя отправки', prime > 0 && prime < guard, true);
check('кэш применяется до блокировщика адресов', prime < urlb, true);
check('кэш применяется до расписания', prime < timeb, true);
check('кэш применяется до гейта трекера', prime < track, true);
check('сеть опрашивается ПОСЛЕ решений', net > track, true);

console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
process.exit(fails ? 1 : 0);
