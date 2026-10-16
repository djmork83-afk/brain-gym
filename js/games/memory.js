// memory.js — «Найди пары»: три уровня с растущей сеткой (6 → 8 → 10 пар).
import { el, fmtTime, toast, showResult } from '../core/ui.js';

const EMOJI = ['🍎', '🚀', '⭐', '🎵', '🌙', '🐸', '🎈', '🍀', '🐬', '🔥', '🌈', '🍩', '⚽', '🌸', '🧩', '🐙', '🍇', '🎲', '🌵', '🎩'];
const STAGES = [
  { cols: 3, rows: 4 }, // 6 пар
  { cols: 4, rows: 4 }, // 8 пар
  { cols: 4, rows: 5 }, // 10 пар
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default {
  id: 'memory',
  start(view, ctx) {
    const t = ctx.t;
    let to = null;
    let destroyed = false;
    let busy = false;
    let opened = [];
    let st = null;
    let gridEl = null;
    let levelEl, pairsEl, movesEl;

    function pairsOf(conf) {
      return (conf.cols * conf.rows) / 2;
    }

    /** Очки за уровень: меньше ходов и меньше времени — больше очков. */
    function scoreForStage() {
      const sec = (Date.now() - st.stageStart) / 1000;
      return Math.max(0, Math.round(1000 - st.stageMoves * 15 - sec * 4));
    }

    function updateHud() {
      levelEl.textContent = `${t('common.level')}: ${st.stage + 1}/${STAGES.length}`;
      pairsEl.textContent = `${t('memory.pairs')}: ${st.totalPairs}`;
      movesEl.textContent = `${t('memory.moves')}: ${st.totalMoves}`;
    }

    function buildStage() {
      const conf = STAGES[st.stage];
      const pairs = pairsOf(conf);
      const faces = shuffle(EMOJI).slice(0, pairs);
      const deck = shuffle([...faces, ...faces]);

      st.stageMoves = 0;
      st.stagePairs = 0;
      st.stageStart = Date.now();
      opened = [];
      busy = false;

      gridEl.style.setProperty('--cols', conf.cols);
      gridEl.innerHTML = '';
      for (const face of deck) {
        const card = el(`<button class="mcard" data-face="${face}" aria-hidden="false"></button>`);
        card.addEventListener('click', () => flip(card));
        gridEl.appendChild(card);
      }
      updateHud();
    }

    function flip(card) {
      if (destroyed || busy) return;
      if (card.classList.contains('matched') || card.classList.contains('flipped')) return;

      card.classList.add('flipped');
      card.textContent = card.dataset.face;
      opened.push(card);
      if (opened.length < 2) return;

      st.stageMoves += 1;
      st.totalMoves += 1;
      const [a, b] = opened;

      if (a.dataset.face === b.dataset.face) {
        a.classList.add('matched');
        b.classList.add('matched');
        opened = [];
        st.stagePairs += 1;
        st.totalPairs += 1;
        updateHud();
        if (st.stagePairs === pairsOf(STAGES[st.stage])) {
          busy = true;
          to = setTimeout(() => {
            busy = false;
            stageDone();
          }, 650);
        }
      } else {
        busy = true;
        to = setTimeout(() => {
          if (destroyed) return;
          a.classList.remove('flipped');
          b.classList.remove('flipped');
          a.textContent = '';
          b.textContent = '';
          opened = [];
          busy = false;
        }, 750);
      }
    }

    function stageDone() {
      if (destroyed) return;
      st.score += scoreForStage();
      if (st.stage + 1 < STAGES.length) {
        st.stage += 1;
        toast(t('memory.level', { n: st.stage + 1 }));
        buildStage();
      } else {
        finish();
      }
    }

    function finish() {
      if (destroyed) return;
      const totalSec = Math.round((Date.now() - st.startedAt) / 1000);
      const rec = ctx.finish({
        score: st.score,
        xp: Math.round(st.score / 10),
        correct: st.totalPairs,
        total: st.totalMoves,
      });
      showResult(view, {
        gameTitle: t('game.memory.title'),
        score: st.score,
        stats: [
          { label: t('memory.pairs'), value: `${st.totalPairs} / ${STAGES.reduce((n, c) => n + pairsOf(c), 0)}` },
          { label: t('memory.moves'), value: String(st.totalMoves) },
          { label: t('common.time'), value: fmtTime(totalSec) },
        ],
        rec,
        t,
        onAgain: restart,
        onExit: () => ctx.exit(),
      });
    }

    function startRound() {
      st = {
        stage: 0,
        score: 0,
        totalPairs: 0,
        totalMoves: 0,
        startedAt: Date.now(),
        stageMoves: 0,
        stagePairs: 0,
        stageStart: Date.now(),
      };
      view.innerHTML = `
        <div class="game-top">
          <button class="btn" data-role="exit">← ${t('common.back')}</button>
          <div class="hud">
            <span class="chip" data-role="level"></span>
            <span class="chip" data-role="pairs"></span>
            <span class="chip" data-role="moves"></span>
          </div>
        </div>
        <div class="mgrid" data-role="grid"></div>
      `;
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());
      gridEl = view.querySelector('[data-role="grid"]');
      levelEl = view.querySelector('[data-role="level"]');
      pairsEl = view.querySelector('[data-role="pairs"]');
      movesEl = view.querySelector('[data-role="moves"]');
      updateHud();
      buildStage();
    }

    function restart() {
      if (destroyed) return;
      clearTimeout(to);
      startRound();
    }

    startRound();

    return {
      destroy() {
        destroyed = true;
        clearTimeout(to);
      },
    };
  },
};
