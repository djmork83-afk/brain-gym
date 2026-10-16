// stopsignal.js — «Стоп-сигнал»: правило меняется по блокам — форма, цвет или сравнение
// с предыдущим символом. Жми только тогда, когда говорит правило блока!
import { showResult } from '../core/ui.js';

const SHAPES = ['▲', '●', '■', '★'];
const COLORS = ['#e5484d', '#3b82f6', '#22a06b', '#d9a406'];
const HAND = '✋';

// Блоки партии: у каждого своё правило и число испытаний
const BLOCKS = [
  { mode: 'form', n: 6 },   // разминка: ▲ — жми, ✋ — не жми
  { mode: 'color', n: 8 },  // жми, если цвет такой же, как у предыдущего символа
  { mode: 'shape', n: 8 },  // жми, если фигура такая же, как у предыдущей
  { mode: 'mixed', n: 10 }, // финал: правило чередуется (бейдж подсказывает)
];

const SHOW_FROM = 850; // длительность показа в начале партии, мс
const SHOW_TO = 680;   // ... и в конце
const PAUSE_FROM = 420; // пауза между испытаниями в начале, мс
const PAUSE_TO = 320;   // ... и в конце
const GRACE = 180;      // окно ответа после исчезновения (для «жми»)
const RULE_MS = 2300;   // показ плашки правила
const SEED_MS = 1100;   // показ стартового символа (для сравнения)
const FLASH = 260;      // подсветка кнопки

function rnd(n) {
  return Math.floor(Math.random() * n);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Испытания блока: сразу готовые стимулы + нужно ли жать.
 * Для блоков сравнения первым показывается стартовый символ (без реакции).
 */
function makeTrials(block) {
  const n = block.n;
  if (block.mode === 'form') {
    return {
      seed: null,
      trials: Array.from({ length: n }, () => {
        const press = Math.random() < 0.5;
        return press
          ? { text: '▲', css: '#22a06b', press: true, mode: 'form' }
          : { text: HAND, css: '#c9cfdb', press: false, mode: 'form' };
      }),
    };
  }
  // блоки сравнения: половина испытаний — совпадение, половина — нет
  const targets = shuffle(Array.from({ length: n }, (_, i) => i % 2 === 0));
  const seed = { s: rnd(SHAPES.length), c: rnd(COLORS.length) };
  let cur = seed;
  const trials = [];
  for (let i = 0; i < n; i += 1) {
    const mode = block.mode === 'mixed' ? (Math.random() < 0.5 ? 'color' : 'shape') : block.mode;
    const press = targets[i];
    let s;
    let c;
    if (mode === 'color') {
      c = press ? cur.c : (cur.c + 1 + rnd(COLORS.length - 1)) % COLORS.length;
      s = rnd(SHAPES.length);
    } else {
      s = press ? cur.s : (cur.s + 1 + rnd(SHAPES.length - 1)) % SHAPES.length;
      c = rnd(COLORS.length);
    }
    trials.push({ text: SHAPES[s], css: COLORS[c], press, mode });
    cur = { s, c };
  }
  return { seed: { text: SHAPES[seed.s], css: COLORS[seed.c] }, trials };
}

export default {
  id: 'stopsignal',
  start(view, ctx) {
    const t = ctx.t;
    const timers = new Set();
    let destroyed = false;
    let finished = false;
    let open = false;      // открыто ли окно ответа текущего испытания
    let responded = false;
    let flashId = null;
    let cur = null;
    let st = null;
    let padEl, faceEl, ruleEl, ruleTextEl, badgeEl, blockEl, scoreEl;

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
            <span class="chip" data-role="block"></span>
            <span class="chip" data-role="score"></span>
          </div>
        </div>
        <p class="stop-hint">${t('stopsignal.hint')}</p>
        <div class="stop-rule" data-role="rule"><span data-role="ruleText"></span></div>
        <div class="stop-stage">
          <div class="stop-badge" data-role="badge"></div>
          <button class="stop-pad" type="button" data-role="pad">
            <span class="stop-face idle" data-role="face"></span>
          </button>
        </div>
      `;
      padEl = view.querySelector('[data-role="pad"]');
      faceEl = view.querySelector('[data-role="face"]');
      ruleEl = view.querySelector('[data-role="rule"]');
      ruleTextEl = view.querySelector('[data-role="ruleText"]');
      badgeEl = view.querySelector('[data-role="badge"]');
      blockEl = view.querySelector('[data-role="block"]');
      scoreEl = view.querySelector('[data-role="score"]');
      view.querySelector('[data-role="exit"]').addEventListener('click', () => ctx.exit());
      padEl.addEventListener('click', onPad);
      hideStimulus();
    }

    function updateHud() {
      blockEl.textContent = t('stopsignal.block', { n: st.block + 1, total: BLOCKS.length });
      scoreEl.textContent = `${t('common.score')}: ${st.score}`;
    }

    function showRule(text) {
      ruleTextEl.textContent = text;
      ruleEl.classList.add('show');
    }

    function hideRule() {
      ruleEl.classList.remove('show');
    }

    function showBadge(mode) {
      if (mode === 'color') {
        badgeEl.textContent = t('stopsignal.badgeColor');
        badgeEl.classList.add('show');
      } else if (mode === 'shape') {
        badgeEl.textContent = t('stopsignal.badgeShape');
        badgeEl.classList.add('show');
      } else {
        badgeEl.classList.remove('show');
      }
    }

    function showStimulus(tr) {
      padEl.classList.remove('ok', 'bad', 'miss');
      faceEl.className = 'stop-face';
      faceEl.style.color = tr.css;
      faceEl.textContent = tr.text;
      showBadge(tr.mode);
    }

    function showSeed(seed) {
      padEl.classList.remove('ok', 'bad', 'miss');
      faceEl.className = 'stop-face';
      faceEl.style.color = seed.css;
      faceEl.textContent = seed.text;
      badgeEl.textContent = t('stopsignal.remember');
      badgeEl.classList.add('show');
    }

    function hideStimulus() {
      faceEl.className = 'stop-face idle';
      faceEl.style.color = '';
      faceEl.textContent = t('stopsignal.press');
      badgeEl.classList.remove('show');
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

    /** Длительность показа: темп подтягивается к концу партии. */
    function showDur(k) {
      return Math.round(SHOW_FROM - ((SHOW_FROM - SHOW_TO) * Math.min(k, 40)) / 40);
    }

    function pauseDur(k) {
      return Math.round(PAUSE_FROM - ((PAUSE_FROM - PAUSE_TO) * Math.min(k, 40)) / 40);
    }

    function onPad() {
      if (destroyed || finished || !open || responded || !cur) return;
      responded = true;
      open = false;
      if (cur.press) {
        st.score += 10;
        st.ok += 1;
        flash('ok');
      } else {
        st.score -= 5;
        st.errors += 1;
        flash('bad');
      }
      updateHud();
    }

    function runTrial() {
      if (destroyed || finished) return;
      if (st.idx >= st.trials.length) {
        endBlock();
        return;
      }
      const tr = st.trials[st.idx];
      cur = tr;
      responded = false;
      open = true;
      updateHud();
      showStimulus(tr);

      const k = st.done;
      const show = showDur(k);
      after(show, () => {
        hideStimulus();
        if (!tr.press) open = false; // по «не жми» кликать можно было только пока видно
      });

      after(show + GRACE, () => {
        open = false;
        if (!responded) {
          responded = true;
          if (tr.press) {
            st.misses += 1;
            st.score -= 5;
            flash('miss');
          } else {
            st.ok += 1;
            st.score += 10;
            flash('ok');
          }
          updateHud();
        }
        st.idx += 1;
        st.done += 1;
        after(pauseDur(k), runTrial);
      });
    }

    function ruleTextFor(mode) {
      if (mode === 'form') return t('stopsignal.rule.form');
      if (mode === 'color') return t('stopsignal.rule.color');
      if (mode === 'shape') return t('stopsignal.rule.shape');
      return t('stopsignal.rule.mixed');
    }

    function startBlock() {
      if (destroyed || finished) return;
      const block = BLOCKS[st.block];
      const made = makeTrials(block);
      st.seed = made.seed;
      st.trials = made.trials;
      st.idx = 0;
      updateHud();
      showRule(ruleTextFor(block.mode));
      after(RULE_MS, () => {
        hideRule();
        if (!st.seed) {
          runTrial();
          return;
        }
        showSeed(st.seed);
        after(SEED_MS, () => {
          hideStimulus();
          runTrial();
        });
      });
    }

    function endBlock() {
      hideStimulus();
      st.block += 1;
      if (st.block < BLOCKS.length) {
        after(400, startBlock);
      } else {
        finish();
      }
    }

    function finish() {
      if (finished || destroyed) return;
      finished = true;
      open = false;
      clearTimers();
      const durationSec = Math.round((Date.now() - st.startedAt) / 1000);
      const total = BLOCKS.reduce((s, b) => s + b.n, 0);
      const rec = ctx.finish({
        score: st.score,
        xp: Math.max(0, Math.round(st.score / 2)),
        correct: st.ok,
        total,
        durationSec,
      });
      showResult(view, {
        gameTitle: t('game.stopsignal.title'),
        score: st.score,
        stats: [
          { label: t('stopsignal.hits'), value: String(st.ok) },
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
      st = {
        block: 0, idx: 0, done: 0, trials: [], seed: null,
        score: 0, ok: 0, errors: 0, misses: 0, startedAt: Date.now(),
      };
      finished = false;
      open = false;
      responded = false;
      cur = null;
      build();
      updateHud();
      startBlock();
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
