// Прибор v0.26: свои сайты на день (extraSites.grants). Как и repro_youtube.js,
// проверяет сам код: функции решения вырезаются из файла as-is и гоняются по
// сценариям.
//
// Главный вопрос: может ли выдача на один сайт открыть что-нибудь ещё — соседний
// домен, почту на корне платформы, магазин расширений, разделы chess.com. Второй:
// закрывается ли она сама — по календарю, по норме, пустым файлом. Третий: может ли
// мусор в файле с сервера превратиться в «открыто всё».
const fs = require('fs');
const P = process.env.SCRIPT_PATH || (__dirname + '/11_unified_chess_control.js');
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
function line(marker) {
  const found = lines.find(l => l.includes(marker));
  if (!found) throw new Error('line not found: ' + marker);
  return found;
}

const settings = slice('const SCHEDULE_WEEKLY = {', 'const CONFIG = JSON.parse');
const paths = slice('const REMOTE_CONFIG_PATHS = [', '    ];') + '\n    ];';
const NAMES = ['pad2', 'formatDateKey', 'parseTimeString', 'minutesToTimeString', 'getCurrentMinutes',
  'clonePlain', 'getValueByPath', 'setValueByPath', 'syncDerivedConfig', 'applyRemoteConfig',
  'getUnlockedWindowsForDate', 'getDailyTarget', 'readValue', 'readNumber', 'trackerKeys',
  'hostMatches', 'isDailyTaskTargetReached', 'getYoutubeUnlockWindowsForDate',
  'getActiveYoutubeUnlockWindow', 'isYoutubeGrantActiveNow', 'getQuickLinks',
  'normalizeExtraSiteHost', 'getExtraSiteGrantsForDate', 'getActiveExtraSiteGrants',
  'extraSiteGrantCovers', 'getExtraSiteUnlockNow', 'isExtraSiteUnlockedNow'];

const harness = `
${settings}
const CONFIG = JSON.parse(JSON.stringify(LOCAL_CONFIG));
let HOST = 'wordwall.net';
let IS_FRAME = false;
let TOP_HOST = '';
const COURSE_ID = String(CONFIG.storage.courseId);
let STORE = {};
let NOW = new Date();
const RealDate = Date;
function GM_getValue(k, d) { return Object.prototype.hasOwnProperty.call(STORE, k) ? STORE[k] : d; }
function log() {}
${line('const EXTRA_SITE_HOST_RE')}
${paths}
${NAMES.map(fn).join('\n\n')}
module.exports = {
  CONFIG, applyRemoteConfig, getExtraSiteUnlockNow, isExtraSiteUnlockedNow,
  getExtraSiteGrantsForDate, getQuickLinks, trackerKeys, normalizeExtraSiteHost,
  setHost: (h) => { HOST = h; IS_FRAME = false; TOP_HOST = h; },
  setFrame: (h, top) => { HOST = h; IS_FRAME = true; TOP_HOST = top; },
  setStore: (k, v) => { STORE[k] = v; },
  clearStore: () => { STORE = {}; }
};
`;
fs.writeFileSync(__dirname + '/.extracted_extra_sites_probe.js', harness);
const M = require(__dirname + '/.extracted_extra_sites_probe.js');

let fails = 0, total = 0;
function check(name, actual, expected) {
  total++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { fails++; console.log('❌ ' + name + '\n   ожидалось ' + JSON.stringify(expected) + '\n   получено  ' + JSON.stringify(actual)); }
  else console.log('✅ ' + name + ' → ' + JSON.stringify(actual));
}

// Среда 07.10.2026.
const DAY = '2026-10-07';
const TOMORROW = '2026-10-08';
const at = (h, m = 0) => new Date(2026, 9, 7, h, m, 0);
const solved = (n) => M.setStore(M.trackerKeys(DAY).racerSolved, n);
const openOn = (host, when = at(17)) => { M.setHost(host); return M.getExtraSiteUnlockNow(when); };

console.log('\n── 1. Заводское состояние: своих сайтов нет ──');
M.applyRemoteConfig(null);
check('выдач нет', M.CONFIG.extraSites.grants, []);
check('wordwall.net закрыт', openOn('wordwall.net'), null);

console.log('\n── 2. Файл от бота: wordwall и Teams на сегодня и завтра ──');
check('применилось', M.applyRemoteConfig({
  extraSites: { grants: [
    { host: 'wordwall.net', dates: [DAY, TOMORROW], afterTaskTarget: false },
    { host: 'teams.cloud.microsoft', dates: [DAY, TOMORROW], afterTaskTarget: false }
  ] }
}), true);
check('wordwall.net открыт', openOn('wordwall.net'), 'site');
check('www.wordwall.net открыт (поддомен)', openOn('www.wordwall.net'), 'site');
check('teams.cloud.microsoft открыт', openOn('teams.cloud.microsoft'), 'site');
check('вход login.microsoftonline.com открыт спутником', openOn('login.microsoftonline.com'), 'companion');
check('вход login.live.com открыт спутником', openOn('login.live.com'), 'companion');
check('завтра тоже открыт', openOn('wordwall.net', new Date(2026, 9, 8, 17)), 'site');
check('послезавтра закрыт', openOn('wordwall.net', new Date(2026, 9, 9, 17)), null);

console.log('\n── 3. Выдача не протекает на соседей ──');
check('evilwordwall.net', openOn('evilwordwall.net'), null);
check('wordwall.net.evil.com', openOn('wordwall.net.evil.com'), null);
check('outlook.cloud.microsoft (сосед Teams)', openOn('outlook.cloud.microsoft'), null);
check('microsoftonline.com без login.', openOn('microsoftonline.com'), null);
check('x.login.microsoftonline.com (спутник — только точно)', openOn('x.login.microsoftonline.com'), null);
check('vk.com', openOn('vk.com'), null);

console.log('\n── 4. Шахматные хосты слой пропускает мимо ──');
M.applyRemoteConfig({ extraSites: { grants: [
  { host: 'chess.com', dates: [DAY] }, { host: 'lichess.org', dates: [DAY] }
] } });
check('www.chess.com не открывается слоем (фильтр разделов цел)', openOn('www.chess.com'), null);
check('lichess.org не открывается слоем', openOn('lichess.org'), null);

console.log('\n── 5. Корни платформ — только точный хост ──');
M.applyRemoteConfig({ extraSites: { grants: [{ host: 'google.com', dates: [DAY] }] } });
check('google.com открыт', openOn('google.com'), 'site');
check('mail.google.com закрыт', openOn('mail.google.com'), null);
check('www.google.com открыт (www. — тот же сайт)', openOn('www.google.com'), 'site');
check('chromewebstore.google.com закрыт', openOn('chromewebstore.google.com'), null);
M.applyRemoteConfig({ extraSites: { grants: [{ host: 'microsoft.com', dates: [DAY] }] } });
check('microsoftedge.microsoft.com (дополнения Edge) закрыт', openOn('microsoftedge.microsoft.com'), null);

console.log('\n── 6. «Только после нормы задач» ──');
M.clearStore();
M.applyRemoteConfig({ extraSites: { grants: [{ host: 'wordwall.net', dates: [DAY], afterTaskTarget: true }] } });
check('норма не решена — закрыт', openOn('wordwall.net'), null);
solved(100000);
check('норма решена — открыт', openOn('wordwall.net'), 'site');
M.clearStore();

console.log('\n── 7. Мусор из файла не открывает ничего ──');
const garbage = ['', ' ', 'com', '.net', 'net.', '*.net', 'a b.com', 'https://wordwall.net/', null, 42, {}];
M.applyRemoteConfig({ extraSites: { grants: garbage.map(host => ({ host, dates: [DAY] })) } });
check('выдач после разбора 0', M.getExtraSiteGrantsForDate(at(17)).length, 0);
['wordwall.net', 'example.com', 'net', 'a.b'].forEach(h => check(`${h} закрыт`, openOn(h), null));
M.applyRemoteConfig({ extraSites: { grants: 'wordwall.net' } });
check('grants строкой вместо списка — ничего', openOn('wordwall.net'), null);
M.applyRemoteConfig({ extraSites: { grants: [{ host: 'wordwall.net', dates: DAY }] } });
check('dates строкой вместо списка — ничего', openOn('wordwall.net'), null);
check('www. срезается при разборе', M.normalizeExtraSiteHost(' WWW.WordWall.net '), 'wordwall.net');

console.log('\n── 8. Ядро (exactOnly, companions) удалённо НЕ подменяется ──');
M.applyRemoteConfig({ extraSites: {
  grants: [{ host: 'google.com', dates: [DAY] }],
  exactOnly: [],
  companions: { 'google.com': ['chromewebstore.google.com'] }
} });
check('exactOnly остался заводским', M.CONFIG.extraSites.exactOnly.includes('google.com'), true);
check('спутники остались заводскими', M.CONFIG.extraSites.companions['google.com'], undefined);
check('chromewebstore.google.com закрыт', openOn('chromewebstore.google.com'), null);

console.log('\n── 9. Пустой файл {} закрывает обратно ──');
M.applyRemoteConfig({ extraSites: { grants: [{ host: 'wordwall.net', dates: [DAY] }] } });
check('до: открыт', openOn('wordwall.net'), 'site');
M.applyRemoteConfig({});
check('после {}: закрыт', openOn('wordwall.net'), null);

console.log('\n── 10. Блок-экран говорит, куда можно ──');
// Ссылки блок-экрана считаются от СЕГОДНЯ, а не от DAY: с зашитой датой проверка
// краснела сама по себе с 08.10 (найдено 10.10 при выпуске v0.27.0).
const TODAY_KEY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
M.applyRemoteConfig({ extraSites: { grants: [
  { host: 'wordwall.net', dates: [TODAY_KEY] }, { host: 'teams.cloud.microsoft', dates: [TODAY_KEY] }
] } });
M.setHost('example.com');
const links = M.getQuickLinks();
check('первые ссылки — открытые сайты, в порядке выдачи', links.slice(0, 2).map(l => l[1]),
  ['https://wordwall.net/', 'https://teams.cloud.microsoft/']);

console.log('\n── 11. Структура: порядок проверок и гейт ──');
{
  const body = src.slice(src.indexOf('function initUrlBlocker()'));
  const blocked = body.indexOf('CONFIG.urlBlocker.blockedHosts');
  const extra = body.indexOf('getExtraSiteUnlockNow()');
  const allowed = body.indexOf('CONFIG.urlBlocker.allowedHosts');
  check('после блок-листа', extra > blocked && blocked > 0, true);
  check('до списка разрешённых', extra > 0 && extra < allowed, true);
  const gates = src.match(/!isYoutubeUnlockedNow\(\) && !isExtraSiteUnlockedNow\(\) &&/g) || [];
  check('гейт трекера пропускает открытый сайт (оба места)', gates.length, 2);
  const tick = src.slice(src.indexOf('function initTimeBlocker()'));
  check('тик расписания обновляет слой', tick.indexOf('refreshExtraSitesUnlockState()') > 0, true);
}

console.log('\n── 12. Фрейм внутри открытого сайта (v0.26.1) ──');
M.applyRemoteConfig({ extraSites: { grants: [{ host: 'teams.cloud.microsoft', dates: [DAY] }] } });
const frameOn = (host, top, when = at(17)) => { M.setFrame(host, top); return M.getExtraSiteUnlockNow(when); };
check('Файлы Teams (sharepoint) во фрейме Teams открыты', frameOn('educastur-my.sharepoint.com', 'teams.cloud.microsoft'), 'frame');
check('служебный фрейм CDN Teams открыт', frameOn('teams.public.onecdn.static.microsoft', 'teams.cloud.microsoft'), 'frame');
check('тот же sharepoint ВЕРХНЕЙ страницей закрыт', openOn('educastur-my.sharepoint.com'), null);
check('фрейм внутри НЕоткрытого сайта закрыт', frameOn('educastur-my.sharepoint.com', 'example.com'), null);
check('фрейм, чей верх неизвестен, закрыт', frameOn('educastur-my.sharepoint.com', ''), null);
check('фрейм внутри страницы входа (спутник) закрыт', frameOn('cdn.example.net', 'login.microsoftonline.com'), null);
check('шахматный фрейм внутри Teams — своими правилами', frameOn('www.chess.com', 'teams.cloud.microsoft'), null);
check('назавтра фрейм закрыт вместе с сайтом', frameOn('educastur-my.sharepoint.com', 'teams.cloud.microsoft', new Date(2026, 9, 8, 17)), null);
{
  const body = src.slice(src.indexOf('function initUrlBlocker()'));
  check('блок-лист раньше слоя — ютуб во фрейме не откроется',
    body.indexOf('CONFIG.urlBlocker.blockedHosts') < body.indexOf('getExtraSiteUnlockNow()'), true);
}

console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
process.exit(fails ? 1 : 0);
