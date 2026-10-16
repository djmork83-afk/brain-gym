// numbers.js — «Запомни числа»: цифры показываются по одной, введи их по порядку.
import { el, showResult } from '../core/ui.js';

const START_LEN = 3; // длина первой последовательности
const MAX_LEN = 10;  // дальше не растём
const SHOW_MS = 700; // сколько видна одна цифра
const GAP_MS = 250;  // пауза между цифрами
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']; // '' — пустая ячейка сетки

function rnd(n) {
  return Math.floor(Math.random() * n);
}

export default {
  id: 'numbers',
  start(view, ctx) {
    const t = ctx.t;
    const timeouts = new Set();
    let finished = false;
    let destroyed = false;
    let st = null;
    let stageEl = null;
    let padEl = null;
    let hintEl = null;
    let lenChip, scoreChip;
    let slotEls = [];

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
          </div>
        </div>
        <p class="numbers-hint" data-role="hint"></p>
        <div class="numbers-stage" data-role="stage"></div>
        <div class="numbers-pad" data-role="pad"></div>
      `;
      stageEl = view.querySelector('[data-role="stage"]');
      padEl = view.querySelector('[data-role="pad"]');
      hintEl = view.querySelector('[data-role="hint"]');
      lenChip = view.querySelector('[data-role="len"]');
      scoreChip = view.querySelector('[data-role="score"]');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());

      for (const k of PAD) {
        if (k === '') {
          padEl.appendChild(el('<span class="numbers-spacer"></span>'));
          continue;
        }
        const erase = k === '⌫';
        const label = erase ? ` aria-label="${t('numbers.erase')}" title="${t('numbers.erase')}"` : '';
        padEl.appendChild(el(`<button class="numbers-key${erase ? ' erase' : ''}" type="button" data-key="${k}"${label}>${k}</button>`));
      }
      padEl.addEventListener('click', onPadClick);
    }

    function updateHud() {
      if (!st) return;
      lenChip.textContent = `${t('numbers.length')}: ${st.len}`;
      scoreChip.textContent = `${t('numbers.score')}: ${st.score}`;
    }

    function renderSlots() {
      const row = el('<div class="numbers-slots"></div>');
      slotEls = [];
      for (let i = 0; i < st.len; i++) {
        const s = el(`<span class="numbers-slot">${st.typed[i] != null ? st.typed[i] : ''}</span>`);
        row.appendChild(s);
        slotEls.push(s);
      }
      stageEl.innerHTML = '';
      stageEl.appendChild(row);
    }

    function markSlots() {
      slotEls.forEach((s, i) => {
        s.classList.add(st.typed[i] === st.seq[i] ? 'ok' : 'bad');
      });
    }

    function press(key) {
      if (finished || destroyed || !st || st.phase !== 'input') return;
      if (key === '⌫') {
        st.typed.pop();
      } else if (st.typed.length < st.len) {
        st.typed.push(key);
      }
      renderSlots();
      if (st.typed.length === st.len) check();
    }

    function onPadClick(e) {
      const btn = e.target.closest('.numbers-key');
      if (btn) press(btn.dataset.key);
    }

    function check() {
      st.phase = 'check';
      padEl.classList.add('disabled');
      if (st.typed.join('') === st.seq.join('')) {
        st.wins += 1;
        st.score += st.len * 10;
        markSlots();
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
        }, 650);
      } else {
        st.failed = true;
        markSlots();
        updateHud();
        later(() => {
          stageEl.innerHTML = `<div class="numbers-answer">${st.seq.join(' ')}</div>`;
        }, 650);
        later(() => finish(), 1400);
      }
    }

    function nextRound() {
      if (finished || destroyed) return;
      st.phase = 'show';
      st.seq = Array.from({ length: st.len }, () => String(rnd(10)));
      st.typed = [];
      updateHud();
      hintEl.textContent = t('numbers.watch');
      padEl.classList.add('disabled');
      stageEl.innerHTML = '<div class="numbers-digit"></div>';
      const digitEl = stageEl.firstElementChild;

      const step = SHOW_MS + GAP_MS;
      st.seq.forEach((d, i) => {
        later(() => { digitEl.textContent = d; }, i * step);
        later(() => { digitEl.textContent = ''; }, i * step + SHOW_MS);
      });
      later(() => {
        st.phase = 'input';
        st.typed = [];
        hintEl.textContent = t('numbers.repeat');
        padEl.classList.remove('disabled');
        renderSlots();
        updateHud();
      }, (st.seq.length - 1) * step + SHOW_MS + 80);
    }

    function finish() {
      if (finished || destroyed) return;
      finished = true;
      st.phase = 'done';
      clearTimers();
      const rounds = st.wins + (st.failed ? 1 : 0);
      const rec = ctx.finish({
        score: st.score,
        xp: Math.round(st.score / 2),
        correct: st.wins,
        total: rounds,
        durationSec: Math.round((Date.now() - st.startedAt) / 1000),
      });
      const stats = [
        { label: t('common.correct'), value: `${st.wins} / ${rounds}` },
        { label: t('numbers.reached'), value: String(st.len) },
      ];
      if (st.failed) stats.push({ label: t('numbers.was'), value: st.seq.join(' ') });
      showResult(view, {
        gameTitle: t('game.numbers.title'),
        score: st.score,
        stats,
        rec,
        t,
        onAgain: restart,
        onExit: () => ctx.exit(),
      });
    }

    function onKey(e) {
      if (finished || destroyed || !st || st.phase !== 'input') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1 && e.key >= '0' && e.key <= '9') {
        press(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        press('⌫');
      }
    }
    document.addEventListener('keydown', onKey);

    function startRound() {
      st = { len: START_LEN, seq: [], typed: [], wins: 0, score: 0, failed: false, phase: 'show', startedAt: Date.now() };
      finished = false;
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
        document.removeEventListener('keydown', onKey);
        if (padEl) padEl.removeEventListener('click', onPadClick);
      },
    };
  },
};
