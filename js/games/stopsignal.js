// stopsignal.js — «Стоп-сигнал»: жми на стрелку, но удержись, когда появится рука.
import { showResult } from '../core/ui.js';

const TRIALS = 25;
const HANDS = 5; // ровно столько «рук» среди испытаний
const SHOW_FROM = 850; // длительность показа в начале
const SHOW_TO = 750; // ... и в конце
const PAUSE_FROM = 450; // пауза между испытаниями в начале
const PAUSE_TO = 330; // ... и в конце
const GRACE = 150; // запас на ответ для стрелки после исчезновения
const READY = 700; // пауза перед первым испытанием
const FLASH = 280; // подсветка кнопки
const ARROWS = ['▲', '⬆️'];
const HAND_SIGNS = ['✋', '🚫'];

function rnd(n) {
  return Math.floor(Math.random() * n);
}

function pick(arr) {
  return arr[rnd(arr.length)];
}

export default {
  id: 'stopsignal',
  start(view, ctx) {
    const t = ctx.t;
    const timers = new Set();
    let destroyed = false;
    let finished = false;
    let open = false; // открыто ли окно ответа текущего испытания
    let responded = false;
    let flashId = null;
    let cur = null;
    let plan = [];
    let st = null;
    let padEl, faceEl, trialEl, scoreEl;

    function after(ms, fn) {
      const id = setTimeout(() => {
        timers.delete(id);
        if (destroyed || finished) return;
        fn();
      }, ms);
      timers.add(id);
      return id;
    }

    function clearTimers() {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      flashId = null;
    }

    function build() {
      view.innerHTML = `
        <div class="game-top">
          <button class="btn" data-role="exit">← ${t('common.back')}</button>
          <div class="hud">
            <span class="chip" data-role="trial"></span>
            <span class="chip" data-role="score"></span>
          </div>
        </div>
        <p class="stop-hint">${t('stopsignal.hint')}</p>
        <div class="stop-stage">
          <button class="stop-pad" type="button" data-role="pad">
            <span class="stop-face idle" data-role="face"></span>
          </button>
        </div>
      `;
      padEl = view.querySelector('[data-role="pad"]');
      faceEl = view.querySelector('[data-role="face"]');
      trialEl = view.querySelector('[data-role="trial"]');
      scoreEl = view.querySelector('[data-role="score"]');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());
      padEl.addEventListener('click', () => onPad());
      hideStimulus();
    }

    function updateHud() {
      const shown = Math.min(st.index + 1, TRIALS);
      trialEl.textContent = t('stopsignal.trial', { k: shown, total: TRIALS });
      scoreEl.textContent = `${t('stopsignal.score')}: ${st.score}`;
    }

    function showStimulus(isHand) {
      padEl.classList.toggle('hand', isHand);
      padEl.classList.toggle('arrow', !isHand);
      faceEl.className = `stop-face ${isHand ? 'hand' : 'arrow'}`;
      faceEl.textContent = isHand ? pick(HAND_SIGNS) : pick(ARROWS);
      padEl.setAttribute('aria-label', isHand ? t('stopsignal.a11y.hand') : t('stopsignal.a11y.arrow'));
    }

    function hideStimulus() {
      padEl.classList.remove('arrow', 'hand');
      faceEl.className = 'stop-face idle';
      faceEl.textContent = t('stopsignal.press');
      padEl.setAttribute('aria-label', t('stopsignal.press'));
    }

    function flash(cls) {
      if (flashId !== null) {
        clearTimeout(flashId);
        timers.delete(flashId);
      }
      padEl.classList.remove('ok', 'bad', 'miss');
      padEl.classList.add(cls);
      flashId = after(FLASH, () => {
        flashId = null;
        padEl.classList.remove('ok', 'bad', 'miss');
      });
    }

    /** Длительность показа для испытания k (0..24). */
    function showDur(k) {
      return Math.round(SHOW_FROM - ((SHOW_FROM - SHOW_TO) * k) / (TRIALS - 1));
    }

    /** Пауза после испытания k (0..24). */
    function pauseDur(k) {
      return Math.round(PAUSE_FROM - ((PAUSE_FROM - PAUSE_TO) * k) / (TRIALS - 1));
    }

    /** 25 испытаний: 5 «рук» в случайных местах, первое — всегда стрелка. */
    function makePlan() {
      const hands = new Set();
      while (hands.size < HANDS) hands.add(1 + rnd(TRIALS - 1));
      return Array.from({ length: TRIALS }, (_, i) => (hands.has(i) ? 'hand' : 'arrow'));
    }

    function onPad() {
      if (destroyed || finished || !open || responded || !cur) return;
      responded = true;
      open = false;
      if (cur.isHand) {
        st.errors += 1;
        st.score -= 10;
        flash('bad');
      } else {
        st.hits += 1;
        st.score += 10;
        flash('ok');
      }
      updateHud();
    }

    function runTrial() {
      if (destroyed || finished) return;
      const k = st.index;
      const isHand = plan[k] === 'hand';
      cur = { isHand };
      responded = false;
      open = true;
      updateHud();
      showStimulus(isHand);

      const show = showDur(k);
      after(show, () => {
        hideStimulus();
        if (isHand) open = false; // на «руку» можно было нажать только пока она видна
      });

      after(show + GRACE, () => {
        open = false;
        if (!responded) {
          responded = true;
          if (isHand) {
            st.correctReject += 1;
            st.score += 5;
            flash('ok');
          } else {
            st.misses += 1;
            flash('miss');
          }
          updateHud();
        }
        after(pauseDur(k), () => {
          st.index += 1;
          if (st.index >= TRIALS) finish();
          else runTrial();
        });
      });
    }

    function finish() {
      if (finished || destroyed) return;
      finished = true;
      open = false;
      clearTimers();
      const durationSec = Math.round((Date.now() - st.startedAt) / 1000);
      const hits = st.hits + st.correctReject;
      const rec = ctx.finish({
        score: st.score,
        xp: Math.max(0, Math.round(st.score / 2)),
        correct: hits,
        total: TRIALS,
        durationSec,
      });
      showResult(view, {
        gameTitle: t('game.stopsignal.title'),
        score: st.score,
        stats: [
          { label: t('stopsignal.hits'), value: String(hits) },
          { label: t('stopsignal.errors'), value: String(st.errors) },
          { label: t('stopsignal.misses'), value: String(st.misses) },
        ],
        rec,
        t,
        onAgain: restart,
        onExit: () => ctx.exit(),
      });
    }

    function startGame() {
      clearTimers();
      st = { index: 0, score: 0, hits: 0, errors: 0, misses: 0, correctReject: 0, startedAt: Date.now() };
      plan = makePlan();
      finished = false;
      open = false;
      responded = false;
      cur = null;
      build();
      updateHud();
      after(READY, runTrial);
    }

    function restart() {
      if (destroyed) return;
      startGame();
    }

    startGame();

    return {
      destroy() {
        destroyed = true;
        open = false;
        clearTimers();
      },
    };
  },
};
