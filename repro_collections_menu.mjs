// Репро v0.27.3: вход в свои «Коллекции» из левого меню chess.com (Другие → Коллекции).
//   03.11.2026 Владимир: в меню у ребёнка только Играть/Задачи/Учеба/Тренировка, нужен
//   доступ к «Другие → Коллекции». Раздел /other закрыт (сборная страница), а ссылка
//   на него пряталась общим правилом autoHide — вместе с ней пропадал и вход в коллекции.
// ЖИВОЙ прибор: открывает настоящий www.chess.com без входа (нужна сеть), скрипт
// вставляется в страницу с заглушками GM_*, норма задач засчитана, расписание 00:00–23:59.
// Запуск: node repro_collections_menu.mjs [скрипт] [папка-профиля] [снимок.png]
//   на v0.27.2 — 3/8 (меню без «Другие»), на v0.27.3 — 9/9.
// Профиль Chrome — своя временная папка (не основной браузер).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const puppeteer = createRequire('/opt/homebrew/lib/node_modules/')('/opt/homebrew/lib/node_modules/puppeteer-core');
const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname);
const SCRIPT_PATH = process.argv[2] || process.env.SCRIPT_PATH || `${HERE}/11_unified_chess_control.js`;
const PROFILE = process.argv[3] || fs.mkdtempSync('/tmp/ucc-collections-');
const SHOT = process.argv[4] || '';
const SCHEDULE_FROM = "['09:00', '12:00'], ['16:00', '18:00']";
const raw = fs.readFileSync(SCRIPT_PATH, 'utf8');
if (!raw.includes(SCHEDULE_FROM)) throw new Error('нет строки расписания');
const script = raw.replaceAll(SCHEDULE_FROM, "['00:00', '23:59']");
const pad = (n) => String(n).padStart(2, '0'); const d = new Date();
const TODAY = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const store = { [`racer_puzzles_72_${TODAY}`]: '5000', unified_chess_control_date: TODAY };
const SHIMS = `const unsafeWindow = window; const __gm = window.__uccGmSeed || {};
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;const r=document.head||document.documentElement;if(r)r.appendChild(s);else document.addEventListener('DOMContentLoaded',()=>(document.head||document.documentElement).appendChild(s),{once:true});return s;}
function GM_getValue(k,d){return Object.prototype.hasOwnProperty.call(__gm,k)?__gm[k]:d;} function GM_setValue(k,v){__gm[k]=v;} function GM_deleteValue(k){delete __gm[k];} function GM_listValues(){return Object.keys(__gm);} function GM_xmlhttpRequest(){}
window.__uccErrors=[]; window.addEventListener('error',e=>window.__uccErrors.push(String(e.message)));`;
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', userDataDir: PROFILE, args:['--lang=ru-RU','--window-size=1400,900']});
const res=[]; const check=(n,ok,det='')=>{res.push(ok);console.log(`${ok?'✅':'❌'} ${n}${det?' — '+det:''}`);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(path){ const p=await b.newPage(); await p.setViewport({width:1400,height:900});
 await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36');
 await p.setExtraHTTPHeaders({'Accept-Language':'ru-RU,ru;q=0.9'});
 await p.evaluateOnNewDocument(`window.__uccGmSeed=${JSON.stringify(store)};`+SHIMS+script);
 await p.goto('https://www.chess.com'+path,{waitUntil:'networkidle2',timeout:60000}).catch(e=>console.log('goto',e.message)); await sleep(3000); return p; }
const blocked = p => p.evaluate(()=>/Раздел не разрешён|Доступ закрыт|доступны \d ссылк/i.test(document.body?document.body.innerText:'')).catch(()=>false);
const p = await open('/ru/play/online');
check('лобби не закрыто', !(await blocked(p)));
const st = await p.evaluate(()=>{
  const vis = el => !!el && getComputedStyle(el).display!=='none' && el.getBoundingClientRect().height>0;
  const w = document.querySelector('[data-interaction="other"] a.sidebar-link');
  const side = [...document.querySelectorAll('a.sidebar-link')].filter(vis).map(a=>a.textContent.trim().replace(/\s+/g,' '));
  return { href: w && w.getAttribute('href'), vis: vis(w), side };
});
check('«Другие» видно в меню', st.vis, `видно: ${st.side.join(' | ')}`);
check('«Другие» ведёт в коллекции', /\/analysis\/collections$/.test(st.href||''), st.href);
check('Смотреть/Сообщество по-прежнему скрыты', !st.side.some(t=>/Смотреть|Сообщество/.test(t)));
const h = await p.$('[data-interaction="other"] a.sidebar-link');
if (h && st.vis) { await h.hover(); await sleep(1500); }
const sub = await p.evaluate(()=>{
  const vis = el => getComputedStyle(el).display!=='none' && el.getBoundingClientRect().height>0;
  const all=[...document.querySelectorAll('a.sub-menu-link-container[data-pin^="other."]')];
  return { total: all.length, shown: all.filter(vis).map(a=>a.dataset.pin+' '+a.textContent.trim()) };
});
check('подменю раскрылось (пункты other.* есть в DOM)', sub.total>5, `всего ${sub.total}`);
check('в подменю видны только «Коллекции»', sub.shown.length===1 && /other\.library/.test(sub.shown[0]), sub.shown.join(' | '));
const href2 = await p.evaluate(()=>{const w=document.querySelector('[data-interaction="other"] a.sidebar-link');return w&&w.getAttribute('href');});
check('после наведения адрес не вернулся на /other', /\/analysis\/collections$/.test(href2||''), href2);
if (SHOT) await p.screenshot({path:SHOT});
// клик по «Другие» → коллекции, не блок-экран
if (st.vis) { await Promise.all([p.waitForNavigation({timeout:30000}).catch(()=>{}), h.click()]); await sleep(3000);
  const u = p.url(); check('клик по «Другие» открыл коллекции/вход, не блок-экран', !(await blocked(p)) && /analysis\/collections|login/.test(u), u); }
const errs = await p.evaluate(()=>window.__uccErrors||[]).catch(()=>[]);
await p.close();
const q = await open('/ru/other');
check('страница /other по-прежнему закрыта', await blocked(q), q.url());
await q.close();
await b.close();
console.log(`${res.filter(Boolean).length}/${res.length}`, errs.length? 'ошибки страницы: '+errs.slice(0,3).join(' ; '):'');
