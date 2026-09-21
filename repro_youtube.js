// Прибор v0.24: разовое разрешение ютуба. Проверяем не пересказ, а сам код —
// функции решения вырезаются из файла as-is и исполняются на сценариях.
//
// Главный вопрос прибора один: может ли разрешение, выданное на ютуб, открыть
// что-нибудь ещё. Второй по важности — закрывается ли оно само: по календарю,
// по концу окна и по невыполненной норме, если норму потребовали.
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
const NAMES = ['pad2', 'formatDateKey', 'parseTimeString', 'minutesToTimeString', 'getCurrentMinutes',
  'clonePlain', 'getValueByPath', 'setValueByPath', 'syncDerivedConfig', 'applyRemoteConfig',
  'getUnlockedWindowsForDate', 'getDailyTarget', 'readValue', 'readNumber', 'trackerKeys',
  'hostMatches', 'isYoutubeHost', 'isDailyTaskTargetReached', 'getYoutubeUnlockWindowsForDate',
  'getActiveYoutubeUnlockWindow', 'isYoutubeGrantActiveNow', 'isYoutubeUnlockedNow'];

const harness = `
${settings}
const CONFIG = JSON.parse(JSON.stringify(LOCAL_CONFIG));
let HOST = 'www.youtube.com';
const COURSE_ID = String(CONFIG.storage.courseId);
let STORE = {};
function GM_getValue(k, d) { return Object.prototype.hasOwnProperty.call(STORE, k) ? STORE[k] : d; }
function log() {}
${paths}
${NAMES.map(fn).join('\n\n')}
module.exports = {
  CONFIG, LOCAL_CONFIG, REMOTE_CONFIG_PATHS, applyRemoteConfig, isYoutubeUnlockedNow,
  isYoutubeGrantActiveNow,
  getYoutubeUnlockWindowsForDate, minutesToTimeString, trackerKeys, formatDateKey,
  setHost: (h) => { HOST = h; },
  setStore: (k, v) => { STORE[k] = v; },
  clearStore: () => { STORE = {}; }
};
`;
fs.writeFileSync(__dirname + '/.extracted_youtube_probe.js', harness);
const M = require(__dirname + '/.extracted_youtube_probe.js');

let fails = 0, total = 0;
function check(name, actual, expected) {
  total++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { fails++; console.log('❌ ' + name + '\n   ожидалось ' + JSON.stringify(expected) + '\n   получено  ' + JSON.stringify(actual)); }
  else console.log('✅ ' + name + ' → ' + JSON.stringify(actual));
}

// Воскресенье 20.09.2026. Заводское расписание дня: 09:00–12:00 и 16:00–18:00.
const DAY = '2026-09-20';
const at = (h, m = 0) => new Date(2026, 8, 20, h, m, 0);
const solved = (n) => M.setStore(M.trackerKeys(DAY).racerSolved, n);

console.log('\n── 1. Заводское состояние: ютуб закрыт всегда ──');
M.applyRemoteConfig(null);
check('дат разрешения нет', M.CONFIG.youtube.unlockDates, []);
check('в окне расписания закрыт', M.isYoutubeUnlockedNow(at(17)), false);
check('вне окна закрыт', M.isYoutubeUnlockedNow(at(21)), false);

console.log('\n── 2. Файл от бота: открыт на сегодня, в рамках окон ──');
check('применилось', M.applyRemoteConfig({
  youtube: { unlockDates: [DAY], unlockWindows: {}, afterTaskTarget: false }
}), true);
check('окна разрешения = окна расписания',
  M.getYoutubeUnlockWindowsForDate(at(17)).map(w => M.minutesToTimeString(w.start) + '-' + M.minutesToTimeString(w.end)),
  ['09:00-12:00', '16:00-18:00']);
check('17:00 — открыт', M.isYoutubeUnlockedNow(at(17)), true);
check('13:00 (между окон) — закрыт', M.isYoutubeUnlockedNow(at(13)), false);
check('21:00 (после расписания) — закрыт', M.isYoutubeUnlockedNow(at(21)), false);
check('завтра — закрыт', M.isYoutubeUnlockedNow(new Date(2026, 8, 21, 17, 0, 0)), false);

console.log('\n── 3. Разрешение не протекает на другие домены ──');
// Ради этой проверки прибор и написан: выдаём разрешение и обходим соседей.
['lichess.org', 'www.chess.com', 'yandex.ru', 'chromewebstore.google.com',
 'youtube.com.evil.ru', 'notyoutube.com'].forEach((host) => {
  M.setHost(host);
  check('закрыт на ' + host, M.isYoutubeUnlockedNow(at(17)), false);
});
M.setHost('m.youtube.com');
check('открыт на m.youtube.com', M.isYoutubeUnlockedNow(at(17)), true);
M.setHost('music.youtube.com');
check('открыт на music.youtube.com', M.isYoutubeUnlockedNow(at(17)), true);
M.setHost('youtu.be');
check('открыт на youtu.be', M.isYoutubeUnlockedNow(at(17)), true);
M.setHost('lichess.org');
check('разрешение ВИДНО с чужого хоста (для ссылки на блок-экране)', M.isYoutubeGrantActiveNow(at(17)), true);
check('но сам чужой хост от этого не открыт', M.isYoutubeUnlockedNow(at(17)), false);
M.setHost('www.youtube.com');

console.log('\n── 4. Персональные часы сужают день ──');
M.applyRemoteConfig({
  youtube: { unlockDates: [DAY], unlockWindows: { [DAY]: [['16:00', '17:00']] }, afterTaskTarget: false }
});
check('16:30 — открыт', M.isYoutubeUnlockedNow(at(16, 30)), true);
check('17:30 — закрыт, хотя окно расписания идёт', M.isYoutubeUnlockedNow(at(17, 30)), false);
check('10:00 — закрыт, часы заданы явно', M.isYoutubeUnlockedNow(at(10)), false);

console.log('\n── 5. «Только после нормы задач» ──');
M.clearStore();
M.applyRemoteConfig({
  youtube: { unlockDates: [DAY], unlockWindows: {}, afterTaskTarget: true }
});
check('норма воскресенья', M.CONFIG.tracker.weeklyTargets[6], 1000);
check('0 решённых — закрыт', M.isYoutubeUnlockedNow(at(17)), false);
solved(999);
check('999 решённых — закрыт', M.isYoutubeUnlockedNow(at(17)), false);
solved(1000);
check('1000 решённых — открыт', M.isYoutubeUnlockedNow(at(17)), true);
check('но вне окна всё равно закрыт', M.isYoutubeUnlockedNow(at(21)), false);
M.clearStore();

console.log('\n── 6. Режим «весь календарный день» — локальный, не из бота ──');
M.applyRemoteConfig({
  youtube: { unlockDates: [DAY], unlockMode: 'always', unlockWindows: {}, afterTaskTarget: false }
});
check('режим с сервера НЕ применился', M.CONFIG.youtube.unlockMode, 'schedule');
check('в белом списке режима нет', M.REMOTE_CONFIG_PATHS.includes('youtube.unlockMode'), false);
check('13:00 всё ещё закрыт', M.isYoutubeUnlockedNow(at(13)), false);
// Правкой самого скрипта режим работает — это локальный тумблер, а не мёртвый код.
M.CONFIG.youtube.unlockMode = 'always';
check('13:00 — открыт', M.isYoutubeUnlockedNow(at(13)), true);
check('23:00 — открыт (закроет расписание, не этот слой)', M.isYoutubeUnlockedNow(at(23)), true);
M.CONFIG.youtube.unlockMode = 'schedule';

console.log('\n── 7. Список хостов удалённо НЕ подменяется ──');
// Единственная по-настоящему опасная строка в этой правке: подменить hosts —
// значит открыть любой сайт одним полем в файле на сервере.
M.applyRemoteConfig({
  youtube: { unlockDates: [DAY], hosts: ['lichess.org', 'yandex.ru', 'mail.google.com'] }
});
check('хосты остались заводскими', M.CONFIG.youtube.hosts, ['youtube.com', 'youtu.be']);
M.setHost('yandex.ru');
check('яндекс так и не открылся', M.isYoutubeUnlockedNow(at(17)), false);
M.setHost('www.youtube.com');
check('в белом списке хостов нет', M.REMOTE_CONFIG_PATHS.includes('youtube.hosts'), false);
['youtube.unlockDates', 'youtube.unlockWindows', 'youtube.afterTaskTarget']
  .forEach(p => check('в белом списке: ' + p, M.REMOTE_CONFIG_PATHS.includes(p), true));

console.log('\n── 8. Пустой файл {} закрывает ютуб обратно ──');
M.applyRemoteConfig({});
check('даты стёрлись', M.CONFIG.youtube.unlockDates, []);
check('закрыт', M.isYoutubeUnlockedNow(at(17)), false);
check('youtube.com остался в блок-листе', M.CONFIG.urlBlocker.blockedHosts.includes('youtube.com'), true);
check('youtube.com не попал в разрешённые домены', M.CONFIG.urlBlocker.allowedHosts, ['chess.com', 'lichess.org']);

console.log('\n── 9. Проверка ютуба стоит ПЕРЕД блок-листом доменов ──');
// Структурно, а не на словах: если строка уедет ниже hostMatches(blockedHosts),
// разрешение перестанет работать молча — блок-экран выпадет раньше.
{
  const body = src.slice(src.indexOf('function initUrlBlocker()'));
  const yt = body.indexOf('isYoutubeUnlockedNow()');
  const blocked = body.indexOf('CONFIG.urlBlocker.blockedHosts');
  const allowed = body.indexOf('CONFIG.urlBlocker.allowedHosts');
  check('до блок-листа', yt > 0 && yt < blocked, true);
  check('до списка разрешённых', yt < allowed, true);
}

console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
process.exit(fails ? 1 : 0);
