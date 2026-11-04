// Репро v0.28.0: студии lichess по ссылке (lichess.studyGrants).
//   04.11.2026 Владимир: ребёнок не смог открыть подготовку к туру — студию
//   lichess.org/study/Bl2ceZrU/xJM6sY0e. Раздел /study закрыт целиком (v0.8), и
//   с сервера его было не открыть ничем, кроме полной разблокировки lichess.
// ЖИВОЙ прибор: настоящий lichess.org без входа (нужна сеть), скрипт вставляется
// в страницу с заглушками GM_*, расписание 00:00–23:59, выдача студий сеется в
// LICHESS_STUDY_GRANTS (ровно в том виде, в каком её пишет бот).
// Запуск: node repro_studies.mjs [скрипт] [папка-профиля] [снимок.png]
//   на v0.27.3 — студия закрыта (3/14 зелёных: только то, что и так было закрыто);
//   на v0.28.0 — 14/14.
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
function withGrants(grants) {
  const needle = 'const LICHESS_STUDY_GRANTS = [];';
  if (!base.includes(needle)) return base; // старая версия: настройки нет — меряем как есть
  return base.replace(needle, `const LICHESS_STUDY_GRANTS = ${JSON.stringify(grants)};`);
}
const storeFor = (solved) => ({ [`racer_puzzles_72_${TODAY}`]: String(solved), unified_chess_control_date: TODAY });
const SHIMS = `const unsafeWindow = window; const __gm = window.__uccGmSeed || {};
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;const r=document.head||document.documentElement;if(r)r.appendChild(s);else document.addEventListener('DOMContentLoaded',()=>(document.head||document.documentElement).appendChild(s),{once:true});return s;}
function GM_getValue(k,d){return Object.prototype.hasOwnProperty.call(__gm,k)?__gm[k]:d;} function GM_setValue(k,v){__gm[k]=v;} function GM_deleteValue(k){delete __gm[k];} function GM_listValues(){return Object.keys(__gm);} function GM_xmlhttpRequest(){}
window.__uccErrors=[]; window.addEventListener('error',e=>window.__uccErrors.push(String(e.message)));`;
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', userDataDir: PROFILE, args:['--lang=ru-RU','--window-size=1400,900']});
const res=[]; const check=(n,ok,det='')=>{res.push(ok);console.log(`${ok?'✅':'❌'} ${n}${det?' — '+det:''}`);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(path, grants, solved = 5000){ const p=await b.newPage(); await p.setViewport({width:1400,height:900});
 await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36');
 await p.setExtraHTTPHeaders({'Accept-Language':'ru-RU,ru;q=0.9'});
 await p.evaluateOnNewDocument(`window.__uccGmSeed=${JSON.stringify(storeFor(solved))};`+SHIMS+withGrants(grants));
 await p.goto('https://lichess.org'+path,{waitUntil:'networkidle2',timeout:60000}).catch(e=>console.log('goto',e.message)); await sleep(2500); return p; }
const blocked = p => p.evaluate(()=>/Раздел не разрешён|Доступ закрыт|Страница заблокирована/i.test(document.body?document.body.innerText:'')).catch(()=>false);
const where = p => { try { return new URL(p.url()).pathname; } catch { return p.url(); } };

const ALWAYS = [{ id: STUDY, always: true, title: 'T22', afterTaskTarget: false }];

// A. Выданная студия открывается целиком: доска, список глав, ссылки на главы.
let p = await open(`/study/${STUDY}/${CH1}`, ALWAYS);
const st = await p.evaluate((id) => {
  const vis = el => !!el && getComputedStyle(el).display!=='none' && el.getBoundingClientRect().height>0;
  const board = document.querySelector('cg-board, .cg-wrap, .main-board');
  const chapters = [...document.querySelectorAll('.study__chapters > *, .study__chapters [data-id]')].filter(vis);
  const links = [...document.querySelectorAll(`a[href*="/study/${id}"]`)];
  return { board: vis(board), chapters: chapters.length, links: links.length, hiddenLinks: links.filter(a=>!vis(a)).length };
}, STUDY);
const unlockedFlag = await p.evaluate(()=>{const q=(window.__uccGmSeed||{}).unified_chess_control_telemetry_queue||[];const e=q.find(x=>x.ctx);return e?e.ctx.unlocked:'?';});
check('A0 стенд: lichess НЕ открыт полностью (меряем именно студии)', unlockedFlag === 'нет', `unlocked=${unlockedFlag}`);
check('A1 выданная студия не закрыта', !(await blocked(p)) && where(p) === `/study/${STUDY}/${CH1}`, where(p));
check('A2 доска видна', st.board);
check('A3 список глав виден', st.chapters >= 2, `глав видно: ${st.chapters}`);
check('A4 ссылки на эту студию не спрятаны скрытием раздела', st.hiddenLinks === 0, `${st.links} ссылок, скрыто ${st.hiddenLinks}`);
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
p = await open(`/study/${STUDY}/${CH2}`, ALWAYS);
check('C1 прямая ссылка на главу открыта', !(await blocked(p)), where(p)); await p.close();

// D. Остальное в /study по-прежнему закрыто, и выдача на другой id не действует.
p = await open('/study', ALWAYS);
check('D1 список студий /study закрыт', await blocked(p), where(p));
const quick = await p.evaluate((id)=>[...document.querySelectorAll('a')].some(a=>a.href.includes(`/study/${id}`) && /T22/.test(a.textContent)), STUDY);
check('D2 на блок-экране есть ссылка на открытую студию', quick); await p.close();
p = await open(`/study/${OTHER}/${CH1}`, ALWAYS);
check('D3 чужая (не выданная) студия закрыта', await blocked(p), where(p)); await p.close();

// E. По датам: вчерашняя выдача не действует, сегодняшняя — да.
p = await open(`/study/${STUDY}`, [{ id: STUDY, dates: [YESTERDAY] }]);
check('E1 выдача на вчера сегодня не действует', await blocked(p), where(p)); await p.close();
p = await open(`/study/${STUDY}`, [{ id: STUDY, dates: [TODAY] }]);
check('E2 выдача на сегодня действует', !(await blocked(p)) && where(p).startsWith(`/study/${STUDY}`), where(p)); await p.close();

// F. Норма задач: обычная выдача на задачи не уводит, «после нормы» — ждёт нормы.
p = await open(`/study/${STUDY}`, [{ id: STUDY, dates: [TODAY] }], 0);
check('F1 норма не решена, выдача обычная → студия открыта, не увело на задачи', !(await blocked(p)) && where(p).startsWith(`/study/${STUDY}`), where(p)); await p.close();
p = await open(`/study/${STUDY}`, [{ id: STUDY, dates: [TODAY], afterTaskTarget: true }], 0);
check('F2 «после нормы», норма не решена → студия не открыта', (await blocked(p)) || !where(p).startsWith('/study'), where(p)); await p.close();
p = await open(`/study/${STUDY}`, [{ id: STUDY, dates: [TODAY], afterTaskTarget: true }], 5000);
check('F3 «после нормы», норма решена → студия открыта', !(await blocked(p)) && where(p).startsWith(`/study/${STUDY}`), where(p)); await p.close();

await b.close();
console.log(`${res.filter(Boolean).length}/${res.length}`);
