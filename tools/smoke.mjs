#!/usr/bin/env node
// smoke.mjs — сквозная проверка BrainGym в настоящем headless Chrome (CDP).
// Запуск:  node tools/smoke.mjs [baseUrl]
//   baseUrl по умолчанию http://127.0.0.1:8765 (поднимите ./run.sh)
// Переменные: CHROME_BIN (путь к Chrome), SHOT_DIR (куда класть скриншоты).
// Что проверяет: загрузку главной, отрисовку игры, реальные клики по ответам,
// завершение партии, запись прогресса в localStorage, экран профиля, смену языка.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.env.SHOT_DIR || join(process.cwd(), '.smoke');
mkdirSync(SHOTS, { recursive: true });

const profileDir = mkdtempSync(join(tmpdir(), 'bg-smoke-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--hide-scrollbars', '--window-size=1280,900',
    `--user-data-dir=${profileDir}`, '--remote-debugging-port=0', 'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '[ok]' : '[FAIL]'} ${name}${extra ? ' — ' + extra : ''}`);
}

async function waitForPort() {
  const f = join(profileDir, 'DevToolsActivePort');
  for (let i = 0; i < 150; i++) {
    try {
      const port = readFileSync(f, 'utf8').split('\n')[0];
      if (port) return Number(port);
    } catch { /* not yet */ }
    await sleep(100);
  }
  throw new Error('Chrome не запустился (нет DevToolsActivePort)');
}

let ws;
let msgId = 0;
const pending = new Map();
const pageErrors = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 400));
  }
  return r.result && r.result.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(SHOTS, name + '.png');
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file;
}

function solve(question) {
  const q = String(question).replace(' = ?', '').trim();
  let m;
  if ((m = q.match(/^(\d+)\s*×\s*(\d+)\s*\+\s*(\d+)$/))) return Number(m[1]) * Number(m[2]) + Number(m[3]);
  if ((m = q.match(/^(\d+)\s*\+\s*(\d+)$/))) return Number(m[1]) + Number(m[2]);
  if ((m = q.match(/^(\d+)\s*−\s*(\d+)$/))) return Number(m[1]) - Number(m[2]);
  if ((m = q.match(/^(\d+)\s*×\s*(\d+)$/))) return Number(m[1]) * Number(m[2]);
  return null;
}

async function reportScreenshot(name) { return name; }

async function main() {
  const port = await waitForPort();
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page');
  if (!target) throw new Error('нет page-таргета');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'unknown');
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  // 1. Главная
  await send('Page.navigate', { url: `${BASE}/` });
  for (let i = 0; i < 40; i++) {
    if (await evaluate('document.readyState === "complete"')) break;
    await sleep(150);
  }
  await sleep(1500); // локали (fetch) + рендер

  const home = await evaluate(`(() => ({
    lang: document.documentElement.lang,
    title: document.title,
    heading: document.querySelector('h1.title')?.textContent || null,
    cards: [...document.querySelectorAll('.game-card h3')].map(e => e.textContent),
    badges: [document.getElementById('badge-level')?.textContent, document.getElementById('badge-streak')?.textContent],
  }))()`);
  check('главная: заголовок и карточки игр', !!(home && home.heading && home.cards && home.cards.length >= 3), JSON.stringify(home.cards));
  check('главная: lang/бейджи', !!(home.lang && home.badges[0]), `lang=${home.lang} badges=${JSON.stringify(home.badges)}`);
  const shotHome = await shot('01-home');

  // 2. Игра «Счёт на скорость»
  await evaluate('document.querySelectorAll(".game-card button")[0].click()');
  await sleep(900);
  const game = await evaluate(`(() => ({
    q: document.querySelector('[data-role="q"]')?.textContent || null,
    answers: [...document.querySelectorAll('.answer')].map(b => b.textContent.trim()).length,
  }))()`);
  check('игра: вопрос отрисован, 4 кнопки', !!(game.q && game.answers === 4), `${game.q} | кнопок: ${game.answers}`);
  const shotGame = await shot('02-game');

  // 3. Десять реальных ответов
  let clicks = 0;
  for (let i = 0; i < 10; i++) {
    const q = await evaluate('document.querySelector("[data-role=\\"q\\"]").textContent');
    const ans = solve(q);
    if (ans == null) { check('парсер вопроса', false, q); break; }
    const clicked = await evaluate(`(() => {
      const b = [...document.querySelectorAll('.answer')].find(x => x.textContent.trim() === '${ans}');
      if (b) { b.click(); return true; }
      return false;
    })()`);
    if (clicked) clicks++;
    await sleep(320);
  }
  const scoreText = await evaluate('document.querySelector("[data-role=\\"score\\"]").textContent');
  check('игра: 10 ответов кликами, счёт растёт', clicks === 10 && /\d/.test(scoreText) && !/[^\d]0$/.test(scoreText), `${scoreText}`);

  // 4. Ждём конец партии (таймер 60 c) и панель результата
  let done = false;
  for (let i = 0; i < 40; i++) {
    if (await evaluate('!!document.querySelector(".result .big-score")')) { done = true; break; }
    await sleep(2000);
  }
  const bigScore = await evaluate('document.querySelector(".result .big-score")?.textContent || null');
  check('игра: партия дошла до конца, есть результат', done, `score=${bigScore}`);
  const shotResult = await shot('03-result');

  // 5. Прогресс записан
  const prog = await evaluate(`(() => {
    const p = JSON.parse(localStorage.getItem('bg_progress_v1') || 'null');
    return p && { xp: p.xp, best: p.best, streak: p.streak, plays: p.plays, h0: p.history[0] };
  })()`);
  const okProg = !!(prog && prog.xp > 0 && prog.best && prog.best.math && prog.best.math.score > 0 && prog.streak.days >= 1 && prog.h0 && prog.h0.game === 'math');
  check('прогресс: xp/рекорд/серия/история записаны', okProg, JSON.stringify(prog));

  // 6. Профиль
  await evaluate('location.hash = "#/profile"');
  await sleep(800);
  const prof = await evaluate(`(() => ({
    level: document.querySelector('.levelbar i')?.style.width || null,
    cells: [...document.querySelectorAll('.kv .cell b')].map(e => e.textContent),
    rows: document.querySelectorAll('.history .hrow').length,
  }))()`);
  check('профиль: уровни/ячейки/история отрисованы', !!(prof.level && prof.cells.length >= 3 && prof.rows >= 1), JSON.stringify(prof));
  const shotProfile = await shot('04-profile');

  // 7. Смена языка на английский (reload)
  await evaluate(`(() => { const s = document.getElementById('lang-select'); s.value = 'en'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(1800);
  const en = await evaluate(`(() => ({
    lang: document.documentElement.lang,
    nav: [...document.querySelectorAll('.nav a')].map(a => a.textContent),
    title: document.title,
  }))()`);
  check('язык: переключение на EN работает', en.lang === 'en' && en.nav.includes('Games'), JSON.stringify(en));
  const shotEn = await shot('05-en');

  // 8. Тур по всем играм реестра (кроме math — она проверена выше)
  await evaluate(`(() => { const s = document.getElementById('lang-select'); s.value = 'ru'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(1500);

  const tourShots = [];
  const TOUR = [
    { id: 'schulte', sel: '.schulte-cell', want: 25 },
    { id: 'simon', sel: '.simon-btn', want: 4 },
    { id: 'numbers', sel: '.numbers-key', want: 11 },
    { id: 'parking', sel: '.park-slot', want: 12 },
    { id: 'stopsignal', sel: '.stop-pad', want: 1 },
    { id: 'shopping', sel: '.shop-row', want: 3 },
    { id: 'constellations', sel: '.const-star', want: 21 },
  ];
  for (const g of TOUR) {
    await evaluate(`location.hash = "#/game/${g.id}"`);
    await sleep(1100);
    const st = await evaluate(`(() => ({
      n: document.querySelectorAll('${g.sel}').length,
      top: !!document.querySelector('.game-top'),
    }))()`);
    check(`игра ${g.id}: рендер ${g.sel} × ${st.n}`, st.top && st.n >= g.want, `нужно ≥${g.want}`);
    tourShots.push(await shot(`game-${g.id}`));
  }

  // 8b. Функциональные мини-проверки механик
  await evaluate('location.hash = "#/game/schulte"');
  await sleep(900);
  await evaluate(`[...document.querySelectorAll('.schulte-cell')].find(b => b.textContent.trim() === '1').click()`);
  await sleep(400);
  const sch = await evaluate(`document.querySelector('[data-role="next"]').textContent`);
  check('schulte: клик по «1» продвигает прогресс', /2/.test(sch), sch);

  // Парковка: старт с пустой, первые машины заезжают на глазах
  await evaluate('location.hash = "#/game/parking"');
  await sleep(400);
  const p0 = await evaluate(`document.querySelectorAll('.park-slot.has').length`);
  await sleep(2300);
  const p1 = await evaluate(`document.querySelectorAll('.park-slot.has').length`);
  check('parking: старт с пустой парковки, первые машины заезжают', p0 === 0 && p1 >= 1, `0.4s: ${p0} машин, 2.7s: ${p1}`);

  // Созвездия: фигура соединяется линией; дуга из 4 звёзд, сдвинутая по кругу, = повтор
  await evaluate('location.hash = "#/game/constellations"');
  await sleep(900);
  const clk = (arr) => `(() => { ${JSON.stringify(arr)}.forEach((i) => document.querySelectorAll('.const-star')[i].click()); return true; })()`;
  await evaluate(clk([0, 1, 2]));
  await sleep(300);
  const lines = await evaluate(`document.querySelectorAll('.const-lines path').length`);
  await evaluate(clk([3]));
  await sleep(500);
  const cs1 = await evaluate(`document.querySelector('[data-role="score"]').textContent`);
  await evaluate(clk([4, 5, 6, 7]));
  await sleep(500);
  const cs2 = await evaluate(`document.querySelector('[data-role="score"]').textContent`);
  await evaluate(clk([12, 13, 14, 15]));
  await sleep(500);
  const cs3 = await evaluate(`document.querySelector('[data-role="score"]').textContent`);
  check('constellations: фигура соединяется линией', lines >= 1, `path=${lines}`);
  check('constellations: дуга из 4 звёзд +10, та же дуга со сдвигом — повтор', /10/.test(cs1) && /:\s*0$/.test(cs2), `${cs1} -> ${cs2}`);
  check('constellations: дуга на внутреннем круге — НЕ повтор (другой размер)', /:\s*10$/.test(cs3), cs3);

  check('без JS-исключений на странице', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));

  console.log('\nСкриншоты:');
  for (const s of [shotHome, shotGame, shotResult, shotProfile, shotEn, ...tourShots]) console.log('  ' + s);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nИТОГ: ${results.length - failed}/${results.length} проверок пройдено`);
  return failed === 0 ? 0 : 1;
}

main()
  .then((code) => {
    try { ws && ws.close(); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    process.exit(code);
  })
  .catch((e) => {
    console.error('SMOKE FAILED:', e.message);
    try { ws && ws.close(); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    process.exit(2);
  });
