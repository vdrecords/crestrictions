// Прибор: правила разделов на обоих сайтах. Отвечает на вопрос «что ребёнку
// открыто, а что закрыто» по самому коду, а не по памяти о том, как задумывали.
// Список случаев растёт по мере находок в журнале решений.
const fs = require('fs');
const P = __dirname + '/11_unified_chess_control.js';
const lines = fs.readFileSync(P, 'utf8').split('\n');
const slice = (a, b) => { const i = lines.findIndex(l => l.includes(a)); const j = lines.findIndex((l, k) => k > i && l.includes(b)); return lines.slice(i, j).join('\n'); };
const fn = (n) => { const s = lines.findIndex(l => l.startsWith('    function ' + n + '(')); let e = s; while (e < lines.length && lines[e] !== '    }') e++; return lines.slice(s, e + 1).join('\n'); };
fs.writeFileSync(__dirname + '/.extracted_paths.js', `
${slice('const SCHEDULE_WEEKLY = {', 'const CONFIG = JSON.parse')}
const CONFIG = JSON.parse(JSON.stringify(LOCAL_CONFIG));
${['getPathPolicyForHost', 'pathStartsWithEntry', 'isPathAllowedForHost'].map(fn).join('\n\n')}
module.exports = { isPathAllowedForHost, CONFIG };
`);
const M = require(__dirname + '/.extracted_paths.js');

let fails = 0, total = 0;
const t = (host, path, want, what) => {
  total++;
  const got = M.isPathAllowedForHost(host, path, '');
  const ok = got === want;
  if (!ok) fails++;
  console.log(`  ${ok ? '✅' : '❌'} ${got ? '🟢' : '🔴'} ${path.padEnd(34)} ${what}`);
};

console.log('\n── lichess: команды и турниры (v0.23) ──');
t('lichess.org', '/team/dr_dre08--yadeni', true, 'страница команды: вступить и попасть в швейцарку');
t('lichess.org', '/team', false, 'каталог команд');
t('lichess.org', '/team/x/forum', false, 'форум команды');
t('lichess.org', '/team/x/pm-all', false, 'рассылка по участникам');
t('lichess.org', '/team/x/members', false, 'список участников');
t('lichess.org', '/swiss', true, 'расписание швейцарок');
t('lichess.org', '/swiss/abc12345', true, 'участие в швейцарке');
t('lichess.org', '/swiss/new', false, 'создание своего турнира');
t('lichess.org', '/tournament', true, 'арены');
t('lichess.org', '/tournament/new', false, 'создание своей арены');

console.log('\n── lichess: ядро запрета ──');
t('lichess.org', '/inbox', false, 'переписка');
t('lichess.org', '/forum', false, 'общий форум');
t('lichess.org', '/@/hikaru', false, 'чужой профиль');
t('lichess.org', '/study', false, 'студии');
t('lichess.org', '/logout', false, 'выход из аккаунта');
t('lichess.org', '/training', true, 'задачи');
t('lichess.org', '/racer', true, 'гонка задач');
t('lichess.org', '/analysis', true, 'анализ');

console.log('\n── chess.com: разбор партий ──');
t('chess.com', '/analysis', true, 'доска анализа');
t('chess.com', '/analysis/game/live/123', true, 'анализ своей партии');
t('chess.com', '/game/live/123', true, 'просмотр партии');
t('chess.com', '/games/archive', true, 'архив партий');
t('chess.com', '/puzzles', true, 'задачи');

console.log('\n── chess.com: ядро запрета ──');
t('chess.com', '/messages', false, 'переписка');
t('chess.com', '/member/hikaru', false, 'чужой профиль');
t('chess.com', '/forum', false, 'форум');
t('chess.com', '/clubs', false, 'клубы');
t('chess.com', '/logout', false, 'выход из аккаунта');

console.log('\n' + (fails ? `❌ ПРОВАЛОВ: ${fails} из ${total}` : `✅ ВСЕ ${total} ПРОВЕРОК ПРОЙДЕНЫ`));
process.exit(fails ? 1 : 0);
