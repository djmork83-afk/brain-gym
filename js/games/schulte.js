// schulte.js — «Таблица Шульте»: три таблицы 5×5, числа 1–25 по порядку как можно быстрее.
import { el, fmtTime, accuracy, toast, showResult } from '../core/ui.js';

const TABLES = 3;          // таблиц в партии
const SIZE = 5;            // размер таблицы 5×5
const COUNT = SIZE * SIZE; // 25 чисел
const PAUSE_MS = 1200;     // пауза между таблицами

function rnd(n) {
  return Math.floor(Math.random() * n);
}

/** Числа 1..25 в случайном порядке. */
function shuffledNumbers() {
  const nums = Array.from({ length: COUNT }, (_, i) => i + 1);
  for (let i = nums.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums;
}

export default {
  id: 'schulte',
  start(view, ctx) {
    const t = ctx.t;
    let ticker = null;
    const timeouts = new Set();
    let finished = false;
    let destroyed = false;
    let locked = true;
    let st = null;
    let gridEl = null;
    let tableChip, nextChip, errChip, timeChip;

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
      if (ticker !== null) {
        clearInterval(ticker);
        ticker = null;
      }
    }

    /** Секунды текущей таблицы; после её завершения — «замершее» время. */
    function elapsed() {
      if (!st || !st.startedAt) return 0;
      const end = st.tableEndedAt || Date.now();
      return (end - st.startedAt) / 1000;
    }

    function build() {
      view.innerHTML = `
        <div class="game-top">
          <button class="btn" data-role="exit">← ${t('common.back')}</button>
          <div class="hud">
            <span class="chip" data-role="table"></span>
            <span class="chip" data-role="next"></span>
            <span class="chip" data-role="errors"></span>
          </div>
          <span class="chip time" data-role="time"></span>
        </div>
        <p class="schulte-hint">${t('schulte.hint')}</p>
        <div class="schulte-grid" data-role="grid"></div>
      `;
      gridEl = view.querySelector('[data-role="grid"]');
      tableChip = view.querySelector('[data-role="table"]');
      nextChip = view.querySelector('[data-role="next"]');
      errChip = view.querySelector('[data-role="errors"]');
      timeChip = view.querySelector('[data-role="time"]');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());
      gridEl.addEventListener('click', onGridClick);
    }

    function updateHud() {
      if (!st) return;
      tableChip.textContent = t('schulte.chipTable', { n: st.tableIdx });
      nextChip.textContent = `${t('schulte.next')}: ${st.next <= COUNT ? st.next : '✓'}`;
      errChip.textContent = `${t('schulte.errors')}: ${st.errors}`;
      timeChip.textContent = `${t('common.time')}: ${fmtTime(elapsed())}`;
    }

    /** Новая таблица: числа перемешаны заново. */
    function fillTable() {
      gridEl.innerHTML = '';
      gridEl.classList.remove('done');
      for (const n of shuffledNumbers()) {
        gridEl.appendChild(el(`<button class="schulte-cell" type="button">${n}</button>`));
      }
    }

    function onGridClick(e) {
      if (locked || finished || destroyed) return;
      const cell = e.target.closest('.schulte-cell');
      if (!cell || cell.classList.contains('done')) return;
      const n = Number(cell.textContent);
      if (n !== st.next) {
        st.errors += 1;
        cell.classList.add('bad');
        later(() => cell.classList.remove('bad'), 220);
        updateHud();
        return;
      }
      st.next += 1;
      st.correct += 1;
      cell.classList.add('done', 'ok');
      later(() => cell.classList.remove('ok'), 220);
      updateHud();
      if (st.next > COUNT) tableDone();
    }

    function startTable() {
      if (destroyed || finished) return;
      st.next = 1;
      st.errors = 0;
      st.startedAt = Date.now();
      st.tableEndedAt = 0;
      fillTable();
      locked = false;
      updateHud();
    }

    function tableDone() {
      locked = true;
      st.tableEndedAt = Date.now();
      const timeSec = elapsed();
      const score = Math.max(0, Math.round(1500 - timeSec * 15 - st.errors * 150));
      st.tables.push({ timeSec, errors: st.errors, score });
      gridEl.classList.add('done');
      updateHud();
      if (st.tableIdx < TABLES) {
        later(() => {
          st.tableIdx += 1;
          toast(t('schulte.table', { n: st.tableIdx }));
          startTable();
        }, PAUSE_MS);
      } else {
        finish();
      }
    }

    function finish() {
      if (finished || destroyed) return;
      finished = true;
      locked = true;
      clearTimers();
      const score = st.tables.reduce((sum, r) => sum + r.score, 0);
      const errors = st.tables.reduce((sum, r) => sum + r.errors, 0);
      const durationSec = Math.round(st.tables.reduce((sum, r) => sum + r.timeSec, 0));
      const rec = ctx.finish({
        score,
        xp: Math.round(score / 10),
        correct: st.correct,
        total: st.correct + errors,
        durationSec,
      });
      showResult(view, {
        gameTitle: t('game.schulte.title'),
        score,
        stats: [
          ...st.tables.map((r, i) => ({
            label: t('schulte.tableStat', { n: i + 1 }),
            value: `${fmtTime(r.timeSec)} · ${t('schulte.errors')}: ${r.errors}`,
          })),
          { label: t('schulte.errors'), value: String(errors) },
          { label: t('common.accuracy'), value: `${accuracy(st.correct, st.correct + errors)}%` },
        ],
        rec,
        t,
        onAgain: restart,
        onExit: () => ctx.exit(),
      });
    }

    function startRound() {
      st = { tables: [], tableIdx: 1, next: 1, errors: 0, correct: 0, startedAt: 0, tableEndedAt: 0 };
      finished = false;
      locked = true;
      build();
      startTable();
      ticker = setInterval(() => {
        if (!destroyed && !finished) updateHud();
      }, 500);
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
