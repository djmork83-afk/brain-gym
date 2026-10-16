// shopping.js — «Список покупок»: запомни товары и цены, потом ответь на вопрос.
import { el, fmtTime, toast, showResult } from '../core/ui.js';

const ROUNDS = 5;
const LENGTHS = [3, 3, 4, 4, 5];
const POOL = [
  { id: 'bread', emoji: '🍞' },
  { id: 'milk', emoji: '🥛' },
  { id: 'eggs', emoji: '🥚' },
  { id: 'butter', emoji: '🧈' },
  { id: 'apples', emoji: '🍎' },
  { id: 'cheese', emoji: '🧀' },
  { id: 'bananas', emoji: '🍌' },
  { id: 'coffee', emoji: '☕' },
];
const STEP = 5; // все цены кратны 5
const PRICE_MIN = 2; // 2 шага = 10
const PRICE_MAX = 40; // 40 шагов = 200
const SHOW_PER_ITEM = 1300; // показ списка: длина × 1300 + 1000
const SHOW_EXTRA = 1000;
const BEFORE_QUESTION = 400;
const AFTER_ANSWER = 1200;
const TWO_ITEMS_MIN_LEN = 4; // вопрос про пару — только если в списке ≥4 товаров
const TWO_ITEMS_CHANCE = 0.5;

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
  id: 'shopping',
  start(view, ctx) {
    const t = ctx.t;
    const timers = new Set();
    let destroyed = false;
    let finished = false;
    let awaiting = false;
    let st = null;
    let listEl, hintEl, askEl, emojiEl, questionEl, optionsEl, scoreEl, roundEl;

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

    function itemName(item) {
      return t(`shopping.items.${item.id}`);
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
        <p class="shop-hint" data-role="hint"></p>
        <div class="shop-list card" data-role="list" role="list"></div>
        <div class="shop-ask" data-role="ask" hidden>
          <div class="shop-emoji" data-role="emoji" aria-hidden="true"></div>
          <p class="shop-question" data-role="question" role="status"></p>
          <div class="shop-options" data-role="options"></div>
        </div>
      `;
      listEl = view.querySelector('[data-role="list"]');
      hintEl = view.querySelector('[data-role="hint"]');
      askEl = view.querySelector('[data-role="ask"]');
      emojiEl = view.querySelector('[data-role="emoji"]');
      questionEl = view.querySelector('[data-role="question"]');
      optionsEl = view.querySelector('[data-role="options"]');
      scoreEl = view.querySelector('[data-role="score"]');
      roundEl = view.querySelector('[data-role="round"]');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());
    }

    function updateHud() {
      scoreEl.textContent = `${t('common.score')}: ${st.score}`;
      roundEl.textContent = t('shopping.round', { n: st.round });
    }

    /** Список раунда: уникальные товары со случайными ценами (10..200, кратные 5). */
    function makeItems() {
      const len = LENGTHS[st.round - 1];
      const price = () => STEP * (PRICE_MIN + rnd(PRICE_MAX - PRICE_MIN + 1));
      return shuffle(POOL).slice(0, len).map((it) => ({ ...it, price: price() }));
    }

    /** Вопрос: (а) про один товар или (б) про сумму двух. */
    function makeQuestion(items) {
      const two = items.length >= TWO_ITEMS_MIN_LEN && Math.random() < TWO_ITEMS_CHANCE;
      if (!two) {
        const it = pick(items);
        return {
          emoji: it.emoji,
          text: t('shopping.questionOne', { item: itemName(it) }),
          answer: it.price,
          spread: 6, // дистракторы ±(5..30)
        };
      }
      const pair = shuffle(items).slice(0, 2);
      return {
        emoji: `${pair[0].emoji} + ${pair[1].emoji}`,
        text: t('shopping.questionTwo', { a: itemName(pair[0]), b: itemName(pair[1]) }),
        answer: pair[0].price + pair[1].price,
        spread: 8, // дистракторы ±(5..40)
      };
    }

    /** Правильный ответ + 3 правдоподобных варианта (> 0, без повторов). */
    function makeOptions(answer, spread) {
      const set = new Set([answer]);
      let guard = 0;
      while (set.size < 4 && guard++ < 400) {
        const d = STEP * (1 + rnd(spread));
        const cand = answer + (rnd(2) ? d : -d);
        if (cand > 0 && cand !== answer) set.add(cand);
      }
      for (let k = 1; k <= 40 && set.size < 4; k += 1) {
        const cand = answer + k * STEP;
        if (cand > 0) set.add(cand);
      }
      return shuffle([...set]);
    }

    function clearFlash() {
      askEl.classList.remove('flash-ok', 'flash-bad');
    }

    function startRound() {
      awaiting = false;
      clearFlash();
      askEl.hidden = true;
      emojiEl.textContent = '';
      questionEl.textContent = '';
      optionsEl.innerHTML = '';
      listEl.classList.remove('hidden');
      listEl.innerHTML = '';
      hintEl.textContent = t('shopping.hint');
      hintEl.hidden = false;

      const items = makeItems();
      for (const it of items) {
        listEl.appendChild(el(`<div class="shop-row" role="listitem"><span class="shop-name">${it.emoji} ${itemName(it)}</span><b class="shop-price">${it.price}</b></div>`));
      }
      updateHud();

      after(items.length * SHOW_PER_ITEM + SHOW_EXTRA, () => {
        listEl.classList.add('hidden');
        listEl.innerHTML = '<div class="shop-mask">❓</div>';
        hintEl.hidden = true;
        after(BEFORE_QUESTION, () => ask(items));
      });
    }

    function ask(items) {
      if (destroyed || finished) return;
      const q = makeQuestion(items);
      awaiting = true;
      askEl.hidden = false;
      emojiEl.textContent = q.emoji;
      questionEl.textContent = q.text;
      optionsEl.innerHTML = '';
      for (const v of makeOptions(q.answer, q.spread)) {
        const b = el(`<button class="btn shop-opt" data-role="opt">${v}</button>`);
        b.addEventListener('click', () => answerWith(v, b, q.answer));
        optionsEl.appendChild(b);
      }
    }

    function answerWith(value, btn, answer) {
      if (!awaiting || destroyed || finished) return;
      awaiting = false;
      if (value === answer) {
        st.score += 100;
        st.hits += 1;
        askEl.classList.add('flash-ok');
        btn.classList.add('ok');
      } else {
        askEl.classList.add('flash-bad');
        btn.classList.add('bad');
        optionsEl.querySelectorAll('.shop-opt').forEach((b) => {
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
      toast(t('shopping.round', { n: st.round }));
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
        gameTitle: t('game.shopping.title'),
        score: st.score,
        stats: [
          { label: t('shopping.hits'), value: `${st.hits} / ${ROUNDS}` },
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
