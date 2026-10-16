// stroop.js — «Цвет и слово»: нужно выбрать цвет, которым НАПИСАНО слово (тест Струпа).
import { el, fmtTime, accuracy, showResult } from '../core/ui.js';

const DURATION = 60;
const COLORS = [
  { id: 'red', css: '#e5484d' },
  { id: 'blue', css: '#3b82f6' },
  { id: 'green', css: '#22a06b' },
  { id: 'yellow', css: '#d9a406' },
  { id: 'purple', css: '#9d5ae0' },
  { id: 'orange', css: '#ef7d2b' },
];

function rnd(n) {
  return Math.floor(Math.random() * n);
}

export default {
  id: 'stroop',
  start(view, ctx) {
    const t = ctx.t;
    let timer = null;
    let finished = false;
    let destroyed = false;
    let st = null;
    let current = null;
    let wordEl, scoreEl, timeEl, barEl;
    let swatchEls = [];

    function colorName(id) {
      return t(`stroop.color.${id}`);
    }

    function build() {
      view.innerHTML = `
        <div class="game-top">
          <button class="btn" data-role="exit">← ${t('common.back')}</button>
          <div class="hud">
            <span class="chip" data-role="score"></span>
          </div>
          <span class="chip time" data-role="time"></span>
        </div>
        <div class="timerbar" data-role="bar"><i></i></div>
        <p class="stroop-hint">${t('stroop.hint')}</p>
        <div class="stroop-word" data-role="word"></div>
        <div class="swatches" data-role="swatches"></div>
      `;
      wordEl = view.querySelector('[data-role="word"]');
      scoreEl = view.querySelector('[data-role="score"]');
      timeEl = view.querySelector('[data-role="time"]');
      barEl = view.querySelector('[data-role="bar"] > i');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());

      const sw = view.querySelector('[data-role="swatches"]');
      swatchEls = COLORS.map((c) => {
        const b = el(`<button class="swatch" style="background:${c.css}" aria-label="${colorName(c.id)}" title="${colorName(c.id)}"></button>`);
        b.addEventListener('click', () => choose(c.id, b));
        sw.appendChild(b);
        return b;
      });
    }

    function updateHud() {
      scoreEl.textContent = `${t('common.score')}: ${st.score}`;
      timeEl.textContent = fmtTime(st.left);
      barEl.style.width = `${(st.left / DURATION) * 100}%`;
      barEl.parentElement.classList.toggle('low', st.left <= 10);
    }

    function nextTask() {
      if (destroyed || finished) return;
      const word = rnd(COLORS.length);
      let ink = rnd(COLORS.length);
      if (ink === word) ink = (ink + 1 + rnd(COLORS.length - 1)) % COLORS.length;
      current = { word, ink };
      wordEl.textContent = colorName(COLORS[word].id);
      wordEl.style.color = COLORS[ink].css;
    }

    function choose(inkId, btn) {
      if (finished || destroyed || !current) return;
      st.total += 1;
      if (COLORS[current.ink].id === inkId) {
        st.correct += 1;
        st.score += 15;
        btn.classList.add('ok');
      } else {
        st.score = Math.max(0, st.score - 5);
        btn.classList.add('bad');
      }
      const b = btn;
      setTimeout(() => {
        b.classList.remove('ok');
        b.classList.remove('bad');
      }, 220);
      updateHud();
      nextTask();
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
      clearInterval(timer);
      timer = null;
      const rec = ctx.finish({
        score: st.score,
        xp: Math.round(st.score / 3),
        correct: st.correct,
        total: st.total,
        durationSec: DURATION,
      });
      showResult(view, {
        gameTitle: t('game.stroop.title'),
        score: st.score,
        stats: [
          { label: t('common.correct'), value: `${st.correct} / ${st.total}` },
          { label: t('common.accuracy'), value: `${accuracy(st.correct, st.total)}%` },
        ],
        rec,
        t,
        onAgain: restart,
        onExit: () => ctx.exit(),
      });
    }

    function startRound() {
      st = { score: 0, correct: 0, total: 0, left: DURATION };
      finished = false;
      build();
      updateHud();
      nextTask();
      timer = setInterval(tick, 1000);
    }

    function restart() {
      if (destroyed) return;
      clearInterval(timer);
      startRound();
    }

    function onKey(e) {
      const i = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }[e.key];
      if (i != null && swatchEls[i]) swatchEls[i].click();
    }
    document.addEventListener('keydown', onKey);

    startRound();

    return {
      destroy() {
        destroyed = true;
        clearInterval(timer);
        document.removeEventListener('keydown', onKey);
      },
    };
  },
};
