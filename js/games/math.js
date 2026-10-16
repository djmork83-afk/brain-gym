// math.js — «Счёт на скорость»: 60 секунд примеров, сложность растёт с каждым 5-м правильным.
import { el, fmtTime, accuracy, showResult } from '../core/ui.js';

const DURATION = 60;
const MAX_DIFF = 6;

function rnd(n) {
  return Math.floor(Math.random() * n);
}

function makeTask(diff) {
  if (diff <= 1) { const a = 2 + rnd(9), b = 2 + rnd(9); return { text: `${a} + ${b}`, answer: a + b }; }
  if (diff === 2) { const a = 7 + rnd(12), b = 2 + rnd(a - 3); return { text: `${a} − ${b}`, answer: a - b }; }
  if (diff === 3) { const a = 2 + rnd(4), b = 2 + rnd(4); return { text: `${a} × ${b}`, answer: a * b }; }
  if (diff === 4) { const a = 11 + rnd(39), b = 2 + rnd(8); return { text: `${a} + ${b}`, answer: a + b }; }
  if (diff === 5) { const a = 3 + rnd(7), b = 3 + rnd(7); return { text: `${a} × ${b}`, answer: a * b }; }
  const v = rnd(3);
  if (v === 0) { const a = 31 + rnd(39), b = 11 + rnd(20); return { text: `${a} − ${b}`, answer: a - b }; }
  if (v === 1) { const a = 4 + rnd(6), b = 4 + rnd(6); return { text: `${a} × ${b}`, answer: a * b }; }
  const a = 2 + rnd(8), b = 2 + rnd(8), c = 2 + rnd(9);
  return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
}

/** Правильный ответ + 3 недалёких дистрактора, перемешанные. */
function makeOptions(answer) {
  const set = new Set([answer]);
  let guard = 0;
  while (set.size < 4 && guard++ < 300) {
    let cand = answer + (rnd(2) ? 1 : -1) * (1 + rnd(9));
    if (cand < 0) cand = answer + 1 + rnd(9);
    if (cand !== answer) set.add(cand);
  }
  const opts = [...set];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

export default {
  id: 'math',
  start(view, ctx) {
    const t = ctx.t;
    let timer = null;
    let to = null;
    let finished = false;
    let destroyed = false;
    let locked = true;
    let st = null;
    let current = null;
    let qEl, ansEl, scoreEl, comboEl, timeEl, barEl;

    function build() {
      view.innerHTML = `
        <div class="game-top">
          <button class="btn" data-role="exit">← ${t('common.back')}</button>
          <div class="hud">
            <span class="chip" data-role="score"></span>
            <span class="chip" data-role="combo"></span>
          </div>
          <span class="chip time" data-role="time"></span>
        </div>
        <div class="timerbar" data-role="bar"><i></i></div>
        <div class="math-question" data-role="q"></div>
        <div class="math-answers" data-role="answers"></div>
      `;
      qEl = view.querySelector('[data-role="q"]');
      ansEl = view.querySelector('[data-role="answers"]');
      scoreEl = view.querySelector('[data-role="score"]');
      comboEl = view.querySelector('[data-role="combo"]');
      timeEl = view.querySelector('[data-role="time"]');
      barEl = view.querySelector('[data-role="bar"] > i');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());
    }

    function updateHud() {
      scoreEl.textContent = `${t('common.score')}: ${st.score}`;
      comboEl.textContent = `${t('math.combo')}: ${st.combo}`;
      timeEl.textContent = fmtTime(st.left);
      barEl.style.width = `${(st.left / DURATION) * 100}%`;
      barEl.parentElement.classList.toggle('low', st.left <= 10);
    }

    function nextTask() {
      if (destroyed || finished) return;
      current = makeTask(st.diff);
      qEl.textContent = `${current.text} = ?`;
      ansEl.innerHTML = '';
      for (const val of makeOptions(current.answer)) {
        const btn = el(`<button class="btn answer">${val}</button>`);
        btn.addEventListener('click', () => choose(val, btn));
        ansEl.appendChild(btn);
      }
      locked = false;
    }

    function choose(val, btn) {
      if (locked || finished || destroyed) return;
      locked = true;
      st.total += 1;
      if (val === current.answer) {
        st.correct += 1;
        st.combo += 1;
        if (st.combo > st.bestCombo) st.bestCombo = st.combo;
        st.score += 10 + st.combo * 2;
        btn.classList.add('ok');
        if (st.correct % 5 === 0 && st.diff < MAX_DIFF) st.diff += 1;
        updateHud();
        to = setTimeout(nextTask, 170);
      } else {
        st.combo = 0;
        btn.classList.add('bad');
        ansEl.querySelectorAll('.answer').forEach((b) => {
          if (Number(b.textContent) === current.answer) b.classList.add('ok');
        });
        updateHud();
        to = setTimeout(nextTask, 560);
      }
    }

    function tick() {
      if (finished || destroyed) return;
      st.left -= 1;
      if (st.left <= 0) {
        st.left = 0;
        updateHud();
        finish();
        return;
      }
      updateHud();
    }

    function finish() {
      if (finished || destroyed) return;
      finished = true;
      locked = true;
      clearInterval(timer);
      timer = null;
      const rec = ctx.finish({
        score: st.score,
        xp: Math.round(st.score / 2),
        correct: st.correct,
        total: st.total,
        durationSec: DURATION,
      });
      showResult(view, {
        gameTitle: t('game.math.title'),
        score: st.score,
        stats: [
          { label: t('common.correct'), value: `${st.correct} / ${st.total}` },
          { label: t('common.accuracy'), value: `${accuracy(st.correct, st.total)}%` },
          { label: t('math.bestCombo'), value: String(st.bestCombo) },
        ],
        rec,
        t,
        onAgain: restart,
        onExit: () => ctx.exit(),
      });
    }

    function startRound() {
      st = { score: 0, correct: 0, total: 0, combo: 0, bestCombo: 0, diff: 1, left: DURATION };
      finished = false;
      build();
      updateHud();
      nextTask();
      timer = setInterval(tick, 1000);
    }

    function restart() {
      if (destroyed) return;
      clearInterval(timer);
      clearTimeout(to);
      startRound();
    }

    function onKey(e) {
      if (e.repeat) return;
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i < 0) return;
      const btns = ansEl.querySelectorAll('.answer');
      if (btns[i]) btns[i].click();
    }
    document.addEventListener('keydown', onKey);

    startRound();

    return {
      destroy() {
        destroyed = true;
        clearInterval(timer);
        clearTimeout(to);
        document.removeEventListener('keydown', onKey);
      },
    };
  },
};
