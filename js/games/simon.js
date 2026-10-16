// simon.js — «Повтори последовательность»: запомни и повтори вспышки цветных кнопок.
import { el, showResult } from '../core/ui.js';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const START_LEN = 3;  // длина первой последовательности
const MAX_LEN = 12;   // дальше не растём — защита от бесконечности
const FLASH_MS = 450; // сколько «горит» кнопка
const GAP_MS = 220;   // пауза между вспышками
const NEXT_MS = 600;  // пауза перед следующим раундом

function rnd(n) {
  return Math.floor(Math.random() * n);
}

export default {
  id: 'simon',
  start(view, ctx) {
    const t = ctx.t;
    const timeouts = new Set();
    let finished = false;
    let destroyed = false;
    let locked = true;
    let st = null;
    let gridEl = null;
    let btns = [];
    let lenChip, scoreChip, phaseChip;

    /** setTimeout, который не сработает после destroy(). */
    function later(fn, ms) {
      const id = setTimeout(() => {
        timeouts.delete(id);
        if (!destroyed) fn();
      }, ms);
      timeouts.add(id);
      return id;
    }

    function clearTimers() {
      for (const id of timeouts) clearTimeout(id);
      timeouts.clear();
    }

    function build() {
      view.innerHTML = `
        <div class="game-top">
          <button class="btn" data-role="exit">← ${t('common.back')}</button>
          <div class="hud">
            <span class="chip" data-role="len"></span>
            <span class="chip" data-role="score"></span>
            <span class="chip" data-role="phase"></span>
          </div>
        </div>
        <div class="simon-grid" data-role="grid"></div>
      `;
      gridEl = view.querySelector('[data-role="grid"]');
      lenChip = view.querySelector('[data-role="len"]');
      scoreChip = view.querySelector('[data-role="score"]');
      phaseChip = view.querySelector('[data-role="phase"]');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());

      btns = COLORS.map((c, i) => {
        const name = t(`simon.color.${c}`);
        const b = el(`<button class="simon-btn" type="button" data-index="${i}" data-color="${c}" aria-label="${name}" title="${name}"></button>`);
        gridEl.appendChild(b);
        return b;
      });
      gridEl.addEventListener('click', onGridClick);
    }

    function updateHud() {
      if (!st) return;
      lenChip.textContent = `${t('simon.length')}: ${st.len}`;
      scoreChip.textContent = `${t('simon.score')}: ${st.score}`;
      phaseChip.textContent = st.phase === 'input' ? t('simon.repeat') : t('simon.watch');
    }

    function flash(btn, cls, ms) {
      btn.classList.add(cls);
      later(() => btn.classList.remove(cls), ms);
    }

    function nextRound() {
      if (finished || destroyed) return;
      st.phase = 'show';
      st.seq = Array.from({ length: st.len }, () => rnd(COLORS.length));
      st.inputIdx = 0;
      locked = true;
      updateHud();
      const step = FLASH_MS + GAP_MS;
      st.seq.forEach((ci, i) => later(() => flash(btns[ci], 'flash', FLASH_MS), i * step));
      later(() => {
        st.phase = 'input';
        st.inputIdx = 0;
        locked = false;
        updateHud();
      }, (st.seq.length - 1) * step + FLASH_MS + 90);
    }

    function onGridClick(e) {
      if (locked || finished || destroyed) return;
      const btn = e.target.closest('.simon-btn');
      if (!btn) return;
      const ci = Number(btn.dataset.index);
      flash(btn, 'press', 180);
      if (ci !== st.seq[st.inputIdx]) {
        locked = true;
        st.phase = 'done';
        st.failed = true;
        flash(btn, 'bad', 380);
        updateHud();
        later(() => finish(), 700);
        return;
      }
      st.inputIdx += 1;
      if (st.inputIdx < st.len) return;
      locked = true;
      st.wins += 1;
      st.score += st.len * 10;
      updateHud();
      const reachedMax = st.len >= MAX_LEN;
      later(() => {
        if (finished || destroyed) return;
        if (reachedMax) {
          finish();
          return;
        }
        st.len += 1;
        nextRound();
      }, NEXT_MS);
    }

    function finish() {
      if (finished || destroyed) return;
      finished = true;
      locked = true;
      clearTimers();
      const rounds = st.wins + (st.failed ? 1 : 0);
      const rec = ctx.finish({
        score: st.score,
        xp: Math.round(st.score / 2),
        correct: st.wins,
        total: rounds,
        durationSec: Math.round((Date.now() - st.startedAt) / 1000),
      });
      showResult(view, {
        gameTitle: t('game.simon.title'),
        score: st.score,
        stats: [
          { label: t('common.correct'), value: `${st.wins} / ${rounds}` },
          { label: t('simon.reached'), value: String(st.len) },
        ],
        rec,
        t,
        onAgain: restart,
        onExit: () => ctx.exit(),
      });
    }

    function startRound() {
      st = { len: START_LEN, seq: [], inputIdx: 0, wins: 0, score: 0, failed: false, phase: 'show', startedAt: Date.now() };
      finished = false;
      locked = true;
      build();
      nextRound();
    }

    function restart() {
      if (destroyed) return;
      clearTimers();
      startRound();
    }

    startRound();

    return {
      destroy() {
        destroyed = true;
        clearTimers();
        if (gridEl) gridEl.removeEventListener('click', onGridClick);
      },
    };
  },
};
