// constellations.js — «Созвездия»: за 60 секунд придумай как можно больше новых комбинаций из 4 звёзд.
import { el, fmtTime, showResult } from '../core/ui.js';

const SIZE = 5;
const STARS = SIZE * SIZE;
const DURATION = 60;
const PICK = 4;
const UNIQUE_POINTS = 10;
const REPEAT_COST = 10;
const FLASH_MS = 700;
const RESET_MS = 250;
const LOW_TIME = 10;

export default {
  id: 'constellations',
  start(view, ctx) {
    const t = ctx.t;
    let timer = null;
    const timers = new Set();
    let destroyed = false;
    let finished = false;
    let locked = false;
    let st = null;
    const picked = new Set();
    const seen = new Set();
    let starEls = [];
    let gridEl, flashEl, scoreEl, streakEl, timeEl, barEl;

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

    function build() {
      view.innerHTML = `
        <div class="game-top">
          <button class="btn" data-role="exit">← ${t('common.back')}</button>
          <div class="hud">
            <span class="chip" data-role="score"></span>
            <span class="chip" data-role="streak"></span>
          </div>
          <span class="chip time">⏱ <span data-role="time"></span></span>
        </div>
        <div class="timerbar" data-role="bar"><i></i></div>
        <p class="const-hint">${t('constellations.hint')}</p>
        <div class="const-field">
          <div class="const-grid" data-role="grid" role="group" aria-label="${t('constellations.hint')}"></div>
          <div class="const-flash" data-role="flash" role="status">${t('constellations.repeat')}</div>
        </div>
      `;
      gridEl = view.querySelector('[data-role="grid"]');
      flashEl = view.querySelector('[data-role="flash"]');
      scoreEl = view.querySelector('[data-role="score"]');
      streakEl = view.querySelector('[data-role="streak"]');
      timeEl = view.querySelector('[data-role="time"]');
      barEl = view.querySelector('[data-role="bar"] > i');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());

      gridEl.innerHTML = '';
      starEls = [];
      for (let i = 0; i < STARS; i += 1) {
        const b = el(`<button class="const-star" type="button" data-role="star" aria-pressed="false" aria-label="${t('constellations.a11y.star', { n: i + 1 })}">✦</button>`);
        b.addEventListener('click', () => toggleStar(i));
        gridEl.appendChild(b);
        starEls.push(b);
      }
      flashEl.classList.remove('show');
    }

    function updateHud() {
      scoreEl.textContent = `${t('common.score')}: ${st.score}`;
      streakEl.textContent = `${t('constellations.streak')}: ${st.streak}`;
      timeEl.textContent = fmtTime(st.left);
      barEl.style.width = `${(st.left / DURATION) * 100}%`;
      barEl.parentElement.classList.toggle('low', st.left <= LOW_TIME);
    }

    function toggleStar(i) {
      if (destroyed || finished || locked) return;
      const star = starEls[i];
      if (picked.has(i)) {
        picked.delete(i);
        star.classList.remove('picked');
        star.setAttribute('aria-pressed', 'false');
        return;
      }
      picked.add(i);
      star.classList.add('picked');
      star.setAttribute('aria-pressed', 'true');
      if (picked.size === PICK) commit();
    }

    /** Комбинация из 4 звёзд: новая — очки и серия, повтор — минус и сброс серии. */
    function commit() {
      const key = [...picked].sort((a, b) => a - b).join('-');
      if (seen.has(key)) {
        st.repeats += 1;
        st.streak = 0;
        st.score = Math.max(0, st.score - REPEAT_COST);
        flashEl.textContent = t('constellations.repeat');
        flashEl.classList.add('show');
        after(FLASH_MS, () => flashEl.classList.remove('show'));
      } else {
        seen.add(key);
        st.uniques += 1;
        st.streak += 1;
        if (st.streak > st.best) st.best = st.streak;
        st.score += UNIQUE_POINTS;
      }
      updateHud();

      locked = true;
      after(RESET_MS, () => {
        locked = false;
        picked.clear();
        for (const b of starEls) {
          b.classList.remove('picked');
          b.setAttribute('aria-pressed', 'false');
        }
      });
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
      clearTimers();
      const rec = ctx.finish({
        score: st.score,
        xp: Math.round(st.score),
        correct: st.uniques,
        total: st.uniques + st.repeats,
        durationSec: DURATION,
      });
      showResult(view, {
        gameTitle: t('game.constellations.title'),
        score: st.score,
        stats: [
          { label: t('constellations.unique'), value: String(st.uniques) },
          { label: t('constellations.bestStreak'), value: String(st.best) },
        ],
        rec,
        t,
        onAgain: restart,
        onExit: () => ctx.exit(),
      });
    }

    function startGame() {
      clearInterval(timer);
      clearTimers();
      st = { score: 0, uniques: 0, repeats: 0, streak: 0, best: 0, left: DURATION };
      picked.clear();
      seen.clear();
      finished = false;
      locked = false;
      build();
      updateHud();
      timer = setInterval(tick, 1000);
    }

    function restart() {
      if (destroyed) return;
      startGame();
    }

    startGame();

    return {
      destroy() {
        destroyed = true;
        clearInterval(timer);
        timer = null;
        clearTimers();
      },
    };
  },
};
