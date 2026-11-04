// Репро v0.28.x: студии lichess по ссылке (lichess.studyGrants, lichess.studiesOpenDates).
//   04.11.2026 Владимир: ребёнок не смог открыть подготовку к туру — студию
//   lichess.org/study/Bl2ceZrU/xJM6sY0e: раздел /study закрыт целиком (v0.8), а
//   адрес он набрал руками с ошибкой (I вместо l).
//   v0.28.0 — выдача конкретной студии из бота; v0.28.1 — срок до точного момента
//   (вечером открыли на 24 часа — утром открыто), кнопка студии в окне прогресса,
//   «все студии сегодня» (без кнопки у ребёнка, норма действует).
// ЖИВОЙ прибор: настоящие lichess.org и chess.com без входа (нужна сеть), скрипт
// вставляется в страницу с заглушками GM_*, расписание 00:00–23:59, выдача сеется
// в LICHESS_STUDY_GRANTS / LICHESS_STUDIES_OPEN_DATES ровно в том виде, как пишет бот.
// Запуск: node repro_studies.mjs [скрипт] [папка-профиля] [снимок.png]
//   на v0.27.3 студия закрыта всегда; на v0.28.0 нет срока until, кнопки и «все студии»;
//   на v0.28.1 — все зелёные.
// Профиль Chrome — своя временная папка (не основной браузер).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const puppeteer = createRequire('/opt/homebrew/lib/node_modules/')('/opt/homebrew/lib/node_modules/puppeteer-core');
const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname);
const SCRIPT_PATH = process.argv[2] || process.env.SCRIPT_PATH || `${HERE}/11_unified_chess_control.js`;
const PROFILE = process.argv[3] || fs.mkdtempSync('/tmp/ucc-studies-');
const SHOT = process.argv[4] || '';
const SCHEDULE_FROM = "['09:00', '12:00'], ['16:00', '18:00']";
const raw = fs.readFileSync(SCRIPT_PATH, 'utf8');
if (!raw.includes(SCHEDULE_FROM)) throw new Error('нет строки расписания');
// Награда за норму (полный lichess при решённой норме) на сервере выключена
// (fullUnlockOnTaskTarget: false) — выключаем и здесь, иначе при 5000 задач lichess
// открыт целиком и прибор меряет не студии, а свободный день.
const REWARD_ON = 'const LICHESS_FULL_UNLOCK_ON_TASK_TARGET = true;';
if (!raw.includes(REWARD_ON)) throw new Error('нет строки награды за норму');
const base = raw.replaceAll(SCHEDULE_FROM, "['00:00', '23:59']")
  .replace(REWARD_ON, 'const LICHESS_FULL_UNLOCK_ON_TASK_TARGET = false;');
const STUDY = 'Bl2ceZrU', CH1 = 'xJM6sY0e', CH2 = 'R9Az73uw';
const OTHER = 'BI2ceZrU'; // то, что ребёнок набрал 04.11 (I вместо l) — не выдано
const pad = (n) => String(n).padStart(2, '0'); const d = new Date();
const TODAY = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const y = new Date(d); y.setDate(y.getDate() - 1);
const YESTERDAY = `${y.getFullYear()}-${pad(y.getMonth()+1)}-${pad(y.getDate())}`;
const H24 = () => Date.now() + 24 * 3600 * 1000;
function seeded(grants, openDates = []) {
  let out = base;
  for (const [needle, value] of [['const LICHESS_STUDY_GRANTS = [];', grants], ['const LICHESS_STUDIES_OPEN_DATES = [];', openDates]]) {
    if (out.includes(needle)) out = out.replace(needle, needle.replace('[]', JSON.stringify(value)));
  }
  return out;
}
const storeFor = (solved) => ({ [`racer_puzzles_72_${TODAY}`]: String(solved), unified_chess_control_date: TODAY });
const SHIMS = `const unsafeWindow = window; const __gm = window.__uccGmSeed || {};
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;const r=document.head||document.documentElement;if(r)r.appendChild(s);else document.addEventListener('DOMContentLoaded',()=>(document.head||document.documentElement).appendChild(s),{once:true});return s;}
function GM_getValue(k,d){return Object.prototype.hasOwnProperty.call(__gm,k)?__gm[k]:d;} function GM_setValue(k,v){__gm[k]=v;} function GM_deleteValue(k){delete __gm[k];} function GM_listValues(){return Object.keys(__gm);} function GM_xmlhttpRequest(){}
window.__uccErrors=[]; window.addEventListener('error',e=>window.__uccErrors.push(String(e.message)));`;
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', userDataDir: PROFILE, args:['--lang=ru-RU','--window-size=1400,900']});
const res=[]; const check=(n,ok,det='')=>{res.push(ok);console.log(`${ok?'✅':'❌'} ${n}${det?' — '+det:''}`);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(url, grants, { solved = 5000, openDates = [] } = {}){
 const p=await b.newPage(); await p.setViewport({width:1400,height:900});
 await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36');
 await p.setExtraHTTPHeaders({'Accept-Language':'ru-RU,ru;q=0.9'});
 await p.evaluateOnNewDocument(`window.__uccGmSeed=${JSON.stringify(storeFor(solved))};`+SHIMS+seeded(grants, openDates));
 const full = url.startsWith('http') ? url : 'https://lichess.org' + url;
 await p.goto(full,{waitUntil:'networkidle2',timeout:60000}).catch(e=>console.log('goto',e.message)); await sleep(2500); return p; }
const blocked = p => p.evaluate(()=>/Раздел не разрешён|Доступ закрыт|Страница заблокирована/i.test(document.body?document.body.innerText:'')).catch(()=>false);
const where = p => { try { return new URL(p.url()).pathname; } catch { return p.url(); } };
const studyButton = p => p.evaluate(() => {
  const w = document.getElementById('ucc-progress-window');
  const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const links = w ? [...w.querySelectorAll('a[data-ucc-study-link]')].filter(vis) : [];
  return { window: vis(w), links: links.map(a => ({ href: a.getAttribute('href'), text: a.textContent })),
           row: w && vis(w.querySelector('[data-role="study-line"]')) ? w.querySelector('[data-role="study-line"]').textContent : '' };
}).catch(() => ({ window: false, links: [], row: '' }));

const TIMED = () => [{ id: STUDY, until: H24(), title: 'T22', afterTaskTarget: false }];

// A. Выданная студия открывается целиком: доска, список глав, ссылки на главы.
let p = await open(`/study/${STUDY}/${CH1}`, TIMED());
const unlockedFlag = await p.evaluate(()=>{const q=(window.__uccGmSeed||{}).unified_chess_control_telemetry_queue||[];const e=q.find(x=>x.ctx);return e?e.ctx.unlocked:'?';});
check('A0 стенд: lichess НЕ открыт полностью (меряем именно студии)', unlockedFlag === 'нет', `unlocked=${unlockedFlag}`);
const st = await p.evaluate((id) => {
  const vis = el => !!el && getComputedStyle(el).display!=='none' && el.getBoundingClientRect().height>0;
  const board = document.querySelector('cg-board, .cg-wrap, .main-board');
  const chapters = [...document.querySelectorAll('.study__chapters > *, .study__chapters [data-id]')].filter(vis);
  const links = [...document.querySelectorAll(`a[href*="/study/${id}"]`)].filter(a => !a.closest('#ucc-progress-window'));
  return { board: vis(board), chapters: chapters.length, links: links.length, hiddenLinks: links.filter(a=>!vis(a)).length };
}, STUDY);
check('A1 выданная (на 24 часа) студия не закрыта', !(await blocked(p)) && where(p) === `/study/${STUDY}/${CH1}`, where(p));
check('A2 доска видна', st.board);
check('A3 список глав виден', st.chapters >= 2, `глав видно: ${st.chapters}`);
check('A4 ссылки на эту студию не спрятаны скрытием раздела', st.hiddenLinks === 0, `${st.links} ссылок, скрыто ${st.hiddenLinks}`);
const own = await studyButton(p);
check('A5 на самой студии кнопки «перейти в неё же» нет', own.links.length === 0, JSON.stringify(own.links));
if (SHOT) await p.screenshot({path:SHOT});
// B. Переход на другую главу внутри страницы (без перезагрузки) — не закрывается.
const moved = await p.evaluate((ch) => {
  const el = document.querySelector(`.study__chapters [data-id="${ch}"]`);
  if (!el) return false; el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true})); el.click(); return true;
}, CH2);
await sleep(3000);
check('B1 другая глава внутри студии открылась без блок-экрана', moved && !(await blocked(p)) && where(p).startsWith(`/study/${STUDY}`), `${moved ? 'клик' : 'нет главы'} → ${where(p)}`);
const errs = await p.evaluate(()=>window.__uccErrors||[]).catch(()=>[]);
check('B2 ошибок скрипта на странице студии нет', errs.length === 0, errs.slice(0,3).join(' ; '));
await p.close();

// C. Прямая ссылка на вторую главу.
p = await open(`/study/${STUDY}/${CH2}`, TIMED());
check('C1 прямая ссылка на главу открыта', !(await blocked(p)), where(p)); await p.close();

// D. Остальное в /study по-прежнему закрыто, и выдача на другой id не действует.
p = await open('/study', TIMED());
check('D1 список студий /study закрыт', await blocked(p), where(p));
const quick = await p.evaluate((id)=>[...document.querySelectorAll('a')].some(a=>a.href.includes(`/study/${id}`) && /T22/.test(a.textContent)), STUDY);
check('D2 на блок-экране есть ссылка на открытую студию', quick); await p.close();
p = await open(`/study/${OTHER}/${CH1}`, TIMED());
check('D3 чужая (не выданная) студия закрыта', await blocked(p), where(p)); await p.close();

// E. Срок: истёкший не действует; дневная выдача на сегодня — действует, на вчера — нет.
p = await open(`/study/${STUDY}`, [{ id: STUDY, until: Date.now() - 60000 }]);
check('E1 истёкший срок (минуту назад) не действует', await blocked(p), where(p)); await p.close();
p = await open(`/study/${STUDY}`, [{ id: STUDY, dates: [YESTERDAY] }]);
check('E2 дневная выдача на вчера не действует', await blocked(p), where(p)); await p.close();
p = await open(`/study/${STUDY}`, [{ id: STUDY, dates: [TODAY] }]);
check('E3 дневная выдача на сегодня действует', !(await blocked(p)) && where(p).startsWith(`/study/${STUDY}`), where(p)); await p.close();

// F. Норма задач: обычная выдача на задачи не уводит, «после нормы» — ждёт нормы.
p = await open(`/study/${STUDY}`, TIMED(), { solved: 0 });
check('F1 норма не решена, выдача обычная → студия открыта, не увело на задачи', !(await blocked(p)) && where(p).startsWith(`/study/${STUDY}`), where(p)); await p.close();
p = await open(`/study/${STUDY}`, [{ id: STUDY, dates: [TODAY], afterTaskTarget: true }], { solved: 0 });
check('F2 «после нормы», норма не решена → студия не открыта', (await blocked(p)) || !where(p).startsWith('/study'), where(p)); await p.close();
p = await open(`/study/${STUDY}`, [{ id: STUDY, dates: [TODAY], afterTaskTarget: true }]);
check('F3 «после нормы», норма решена → студия открыта', !(await blocked(p)) && where(p).startsWith(`/study/${STUDY}`), where(p)); await p.close();

// G. Кнопка студии в окне прогресса.
p = await open('/', TIMED());
let btn = await studyButton(p);
check('G1 lichess, норма решена: окно видно ради кнопки студии', btn.window && btn.links.length === 1 && btn.links[0].href === `https://lichess.org/study/${STUDY}`, JSON.stringify(btn));
check('G2 на кнопке название и срок «до …»', /T22/.test(btn.row) && /до \d/.test(btn.row), btn.row);
if (btn.links.length) {
  await Promise.all([p.waitForNavigation({ timeout: 30000 }).catch(() => {}), p.click('a[data-ucc-study-link]')]);
  await sleep(2500);
  check('G3 нажатие ведёт в студию, не на блок-экран', !(await blocked(p)) && where(p) === `/study/${STUDY}`, where(p));
} else check('G3 нажатие ведёт в студию, не на блок-экран', false, 'кнопки нет');
await p.close();
p = await open('/', []);
btn = await studyButton(p);
check('G4 без выдачи кнопки и окна нет', !btn.window && btn.links.length === 0, JSON.stringify(btn)); await p.close();
p = await open('/', [{ id: STUDY, dates: [TODAY], afterTaskTarget: true }], { solved: 0 });
btn = await studyButton(p);
check('G5 «после нормы» до нормы — кнопки нет', btn.links.length === 0, `${where(p)} ${JSON.stringify(btn.links)}`); await p.close();
let gameId = null;
try { gameId = (await (await fetch('https://lichess.org/api/tv/channels')).json()).blitz.gameId; } catch {}
if (gameId) {
  p = await open(`/${gameId}`, TIMED());
  btn = await studyButton(p);
  check('G6 на странице партии окно ради кнопки не всплывает', !btn.window, `/${gameId} ${JSON.stringify(btn)}`); await p.close();
} else check('G6 на странице партии окно ради кнопки не всплывает', false, 'нет партии из lichess TV');
p = await open('https://www.chess.com/login', TIMED());
btn = await studyButton(p);
check('G7 chess.com: кнопка студии тоже есть', btn.window && btn.links.length === 1, `${where(p)} ${JSON.stringify(btn)}`); await p.close();

// H. Срок истёк на уже открытых вкладках: кнопка пропадает, студия закрывается сама.
const soon = Date.now() + 15000;
p = await open('/', [{ id: STUDY, until: soon, title: 'T22' }]);
const q = await open(`/study/${STUDY}`, [{ id: STUDY, until: soon, title: 'T22' }]);
check('H0 до истечения: кнопка есть, студия открыта', (await studyButton(p)).links.length === 1 && !(await blocked(q)));
await sleep(Math.max(0, soon - Date.now()) + 14000);
btn = await studyButton(p);
check('H1 срок истёк — кнопка пропала без перезагрузки', btn.links.length === 0 && !btn.window, JSON.stringify(btn));
check('H2 срок истёк — открытая вкладка студии закрылась', await blocked(q), where(q));
await p.close(); await q.close();

// I. «Все студии сегодня»: раздел открыт, кнопки нет, норма действует.
p = await open('/study', [], { openDates: [TODAY] });
check('I1 «все студии»: список студий открыт', !(await blocked(p)) && where(p) === '/study', where(p));
btn = await studyButton(p);
check('I2 «все студии»: кнопки у ребёнка нет', btn.links.length === 0 && !btn.window, JSON.stringify(btn)); await p.close();
p = await open(`/study/${STUDY}/${CH1}`, [], { openDates: [TODAY] });
check('I3 «все студии»: любая студия открыта', !(await blocked(p)) && where(p).startsWith(`/study/${STUDY}`), where(p)); await p.close();
p = await open('/study', [], { openDates: [YESTERDAY] });
check('I4 «все студии» вчера — сегодня закрыто', await blocked(p), where(p)); await p.close();
p = await open('/study', [], { openDates: [TODAY], solved: 0 });
check('I5 «все студии», норма не решена → уводит на задачи', !where(p).startsWith('/study'), where(p)); await p.close();

await b.close();
console.log(`${res.filter(Boolean).length}/${res.length}`);
