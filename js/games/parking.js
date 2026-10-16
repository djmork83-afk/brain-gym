// parking.js — «Парковка»: следи, как машины приезжают и уезжают, и скажи, сколько осталось.
import { el, fmtTime, toast, showResult } from '../core/ui.js';

const ROUNDS = 5;
const SLOT_COUNT = 12;
const CARS = ['🚗', '🚙', '🚕', '🚌'];
const EVENTS = [6, 7, 8, 9, 10]; // событий в раундах 1..5
const EVENT_PAUSE = [750, 715, 680, 645, 600]; // пауза между событиями, мс
const START_SHOW = 1000; // показ начальной расстановки, мс
const BEFORE_QUESTION = 600; // пауза перед вопросом, мс
const AFTER_ANSWER = 1200; // пауза после ответа, мс

function rnd(n) {
  return Math.floor(Math.random() * n);
}

function pick(arr) {
  return arr[rnd(arr.length)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default {
  id: 'parking',
  start(view, ctx) {
    const t = ctx.t;
    const timers = new Set();
    let destroyed = false;
    let finished = false;
    let awaiting = false;
    let st = null;
    let slots = new Array(SLOT_COUNT).fill(null);
    let slotEls = [];
    let playEl, fieldEl, questionEl, optionsEl, scoreEl, roundEl;

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
    }

    function carCount() {
      let n = 0;
      for (const v of slots) if (v) n += 1;
      return n;
    }

    function build() {
      view.innerHTML = `
        <div class="game-top">
          <button class="btn" data-role="exit">← ${t('common.back')}</button>
          <div class="hud">
            <span class="chip" data-role="score"></span>
            <span class="chip" data-role="round"></span>
          </div>
        </div>
        <p class="park-hint">${t('parking.hint')}</p>
        <div class="park-play" data-role="play">
          <div class="park-field" data-role="field" role="group" aria-label="${t('parking.a11y.parking')}"></div>
          <p class="park-question" data-role="question" role="status"></p>
          <div class="park-options" data-role="options"></div>
        </div>
      `;
      playEl = view.querySelector('[data-role="play"]');
      fieldEl = view.querySelector('[data-role="field"]');
      questionEl = view.querySelector('[data-role="question"]');
      optionsEl = view.querySelector('[data-role="options"]');
      scoreEl = view.querySelector('[data-role="score"]');
      roundEl = view.querySelector('[data-role="round"]');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());

      fieldEl.innerHTML = '';
      slotEls = [];
      for (let i = 0; i < SLOT_COUNT; i += 1) {
        const s = el(`<div class="park-slot" data-role="slot" role="img"><span class="park-car"></span></div>`);
        fieldEl.appendChild(s);
        slotEls.push(s);
      }
    }

    function updateHud() {
      scoreEl.textContent = `${t('common.score')}: ${st.score}`;
      roundEl.textContent = t('parking.round', { n: st.round });
    }

    function drawSlot(i) {
      const v = slots[i];
      const s = slotEls[i];
      s.classList.toggle('has', !!v);
      s.querySelector('.park-car').textContent = v || '';
      s.setAttribute('aria-label', v ? t('parking.a11y.car') : t('parking.a11y.slotFree'));
    }

    /** Правильный ответ + 3 близких (±3), уникальные, 0..12. */
    function makeOptions(answer) {
      const set = new Set([answer]);
      let guard = 0;
      while (set.size < 4 && guard++ < 300) {
        const d = 1 + rnd(3);
        const cand = answer + (rnd(2) ? d : -d);
        if (cand >= 0 && cand <= SLOT_COUNT) set.add(cand);
      }
      for (let v = 0; v <= SLOT_COUNT && set.size < 4; v += 1) {
        if (Math.abs(v - answer) <= 3) set.add(v);
      }
      return shuffle([...set]);
    }

    function clearFlash() {
      playEl.classList.remove('flash-ok', 'flash-bad');
    }

    function startRound() {
      awaiting = false;
      slots = new Array(SLOT_COUNT).fill(null);
      const startCars = 2 + rnd(5); // 2..6
      for (const i of shuffle([...Array(SLOT_COUNT).keys()]).slice(0, startCars)) slots[i] = pick(CARS);
      for (let i = 0; i < SLOT_COUNT; i += 1) drawSlot(i);
      fieldEl.classList.remove('hidden');
      clearFlash();
      questionEl.textContent = '';
      optionsEl.innerHTML = '';
      updateHud();

      const count = EVENTS[st.round - 1];
      const pause = EVENT_PAUSE[st.round - 1];
      let at = START_SHOW;
      for (let i = 0; i < count; i += 1) {
        at += pause;
        after(at, eventStep);
      }
      at += BEFORE_QUESTION;
      after(at, ask);
    }

    /** Одно событие: машина приезжает на свободное место или уезжает. */
    function eventStep() {
      const occ = [];
      const free = [];
      for (let i = 0; i < SLOT_COUNT; i += 1) (slots[i] ? occ : free).push(i);
      let arrive;
      if (!free.length) arrive = false;
      else if (!occ.length) arrive = true;
      else {
        // чем больше машин, тем чаще уезжают — держим число в «интересной» зоне
        const p = Math.min(0.85, Math.max(0.15, 0.5 + (SLOT_COUNT / 2 - occ.length) * 0.07));
        arrive = Math.random() < p;
      }
      if (arrive) {
        const i = pick(free);
        slots[i] = pick(CARS);
        drawSlot(i);
      } else {
        const i = pick(occ);
        slots[i] = null;
        drawSlot(i);
      }
    }

    function ask() {
      if (destroyed || finished) return;
      awaiting = true;
      const answer = carCount();
      fieldEl.classList.add('hidden');
      questionEl.textContent = t('parking.question');
      optionsEl.innerHTML = '';
      for (const v of makeOptions(answer)) {
        const b = el(`<button class="btn park-opt" data-role="opt">${v}</button>`);
        b.addEventListener('click', () => answerWith(v, b, answer));
        optionsEl.appendChild(b);
      }
    }

    function answerWith(value, btn, answer) {
      if (!awaiting || destroyed || finished) return;
      awaiting = false;
      if (value === answer) {
        st.score += 100;
        st.hits += 1;
        playEl.classList.add('flash-ok');
        btn.classList.add('ok');
      } else {
        playEl.classList.add('flash-bad');
        btn.classList.add('bad');
        optionsEl.querySelectorAll('.park-opt').forEach((b) => {
          if (Number(b.textContent) === answer) b.classList.add('ok');
        });
      }
      updateHud();
      after(AFTER_ANSWER, nextRound);
    }

    function nextRound() {
      if (st.round >= ROUNDS) {
        finish();
        return;
      }
      st.round += 1;
      toast(t('parking.round', { n: st.round }));
      startRound();
    }

    function finish() {
      if (finished || destroyed) return;
      finished = true;
      awaiting = false;
      clearTimers();
      const durationSec = Math.round((Date.now() - st.startedAt) / 1000);
      const rec = ctx.finish({
        score: st.score,
        xp: Math.round(st.score / 3),
        correct: st.hits,
        total: ROUNDS,
        durationSec,
      });
      showResult(view, {
        gameTitle: t('game.parking.title'),
        score: st.score,
        stats: [
          { label: t('parking.hits'), value: `${st.hits} / ${ROUNDS}` },
          { label: t('common.time'), value: fmtTime(durationSec) },
        ],
        rec,
        t,
        onAgain: restart,
        onExit: () => ctx.exit(),
      });
    }

    function startGame() {
      clearTimers();
      st = { round: 1, score: 0, hits: 0, startedAt: Date.now() };
      finished = false;
      awaiting = false;
      build();
      startRound();
    }

    function restart() {
      if (destroyed) return;
      startGame();
    }

    startGame();

    return {
      destroy() {
        destroyed = true;
        clearTimers();
      },
    };
  },
};
