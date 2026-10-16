// app.js — hash-роутер и общие экраны (главная, профиль).
import { initI18n, t, allLangs, setLang, applyI18n, getLang } from './core/i18n.js';
import { GAMES, loadGame } from './games/registry.js';
import * as progress from './core/progress.js';
import { el, toast } from './core/ui.js';

const view = document.getElementById('view');
let screen = null; // активный экран: { destroy?() }

function refreshHeader() {
  const s = progress.getState();
  const lvl = document.getElementById('badge-level');
  const st = document.getElementById('badge-streak');
  lvl.textContent = `Lv ${progress.levelFromXp(s.xp)}`;
  lvl.title = `${t('common.level')} · ${s.xp} XP`;
  st.textContent = `🔥 ${s.streak.days || 0}`;
  st.title = t('common.streak');
}

function setActiveNav(name) {
  document.querySelectorAll('.nav a').forEach((a) => {
    const target = a.getAttribute('href') === '#/profile' ? 'profile' : 'home';
    a.classList.toggle('active', target === name || (name === 'game' && target === 'home'));
  });
}

function destroyScreen() {
  if (screen && typeof screen.destroy === 'function') {
    try { screen.destroy(); } catch (e) { console.warn('destroy failed', e); }
  }
  screen = null;
}

// ---------- Главная ----------
function renderHome() {
  const s = progress.getState();
  const wrap = el(`<section>
    <h1 class="title">${t('app.tagline')}</h1>
    <p class="lead">${t('home.lead')}</p>
    <div class="games"></div>
  </section>`);
  const box = wrap.querySelector('.games');

  for (const g of GAMES) {
    const best = s.best[g.id];
    const card = el(`<div class="card game-card" data-hue="${g.hue}" role="button" tabindex="0" aria-label="${t(`game.${g.id}.title`)}">
      <div class="game-icon">${g.icon}</div>
      <h3>${t(`game.${g.id}.title`)}</h3>
      <p>${t(`game.${g.id}.desc`)}</p>
      <div class="game-meta">${t('common.best')}: ${best ? best.score : '—'}</div>
      <button class="btn primary big">${t('common.play')}</button>
    </div>`);
    const go = () => { location.hash = `#/game/${g.id}`; };
    card.querySelector('button').addEventListener('click', go);
    card.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') go(); });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    box.appendChild(card);
  }

  view.innerHTML = '';
  view.appendChild(wrap);
}

// ---------- Профиль ----------
function renderProfile() {
  const s = progress.getState();
  const level = progress.levelFromXp(s.xp);
  const into = s.xp % progress.LEVEL_XP;
  const toNext = progress.xpToNext(s.xp);
  const totalPlays = Object.values(s.plays).reduce((a, b) => a + b, 0);

  const bestRows = GAMES.map((g) => {
    const b = s.best[g.id];
    return `<div class="row"><span>${g.icon} ${t(`game.${g.id}.title`)}</span><b>${b ? b.score : '—'}</b></div>`;
  }).join('');

  const history = s.history.slice(0, 8).map((h) => {
    const name = t(`game.${h.game}.title`);
    const d = new Date(h.ts);
    const ds = `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `<div class="hrow"><span>${name}</span><span class="muted">${ds}</span><span><b>${h.score}</b></span></div>`;
  }).join('');

  const wrap = el(`<section>
    <h1 class="title">${t('profile.title')}</h1>
    <p class="lead">${t('profile.subtitle')}</p>
    <div class="profile-grid">
      <div class="panel">
        <h3>${t('common.level')} ${level} · ${s.xp} XP</h3>
        <div class="levelbar"><i style="width:${Math.round((into / progress.LEVEL_XP) * 100)}%"></i></div>
        <div class="muted">${t('profile.toNext', { n: toNext })}</div>
      </div>
      <div class="panel">
        <div class="kv">
          <div class="cell"><b>${s.streak.days || 0}</b><span>${t('common.streak')}</span></div>
          <div class="cell"><b>${s.streak.best || 0}</b><span>${t('profile.bestStreak')}</span></div>
          <div class="cell"><b>${totalPlays}</b><span>${t('profile.plays')}</span></div>
        </div>
      </div>
      <div class="panel">
        <h3>${t('profile.best')}</h3>
        <div class="rows">${bestRows}</div>
      </div>
      <div class="panel">
        <h3>${t('profile.history')}</h3>
        ${history ? `<div class="history">${history}</div>` : `<p class="muted">${t('profile.noHistory')}</p>`}
      </div>
      <div class="panel">
        <div class="actions-row">
          <button class="btn" data-role="export">⬇️ ${t('profile.export')}</button>
          <label class="btn">⬆️ ${t('profile.import')}<input type="file" accept="application/json,.json" hidden data-role="import" /></label>
          <button class="btn danger" data-role="reset">🗑️ ${t('profile.reset')}</button>
        </div>
      </div>
    </div>
  </section>`);

  const $ = (sel) => wrap.querySelector(sel);
  $('[data-role="export"]').addEventListener('click', () => progress.exportProgress());
  $('[data-role="import"]').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await progress.importProgressFile(file);
      toast(t('profile.imported'));
      refreshHeader();
      renderProfile();
    } catch (err) {
      console.warn(err);
      toast(t('profile.importFailed'));
    }
  });
  $('[data-role="reset"]').addEventListener('click', () => {
    if (!confirm(t('profile.resetConfirm'))) return;
    progress.resetProgress();
    refreshHeader();
    renderProfile();
  });

  view.innerHTML = '';
  view.appendChild(wrap);
}

// ---------- Игра ----------
async function renderGame(id) {
  if (!GAMES.some((g) => g.id === id)) { location.hash = '#/'; return; }
  let mod;
  try {
    mod = await loadGame(id);
  } catch (e) {
    console.error('game load failed', e);
    toast('Failed to load game / Не удалось загрузить игру');
    location.hash = '#/';
    return;
  }
  const ctx = {
    t,
    state: progress.getState(),
    finish(result) {
      const rec = progress.recordResult(id, result);
      refreshHeader();
      return rec;
    },
    exit() { location.hash = '#/'; },
  };
  view.innerHTML = '';
  const res = mod.start(view, ctx);
  screen = res || {};
}

// ---------- Роутер ----------
function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  destroyScreen();

  if (hash.startsWith('game/')) {
    setActiveNav('game');
    renderGame(hash.slice(5));
  } else if (hash === 'profile') {
    setActiveNav('profile');
    renderProfile();
  } else {
    setActiveNav('home');
    renderHome();
  }
}

// ---------- Старт ----------
async function init() {
  await initI18n();
  applyI18n();
  document.title = `${t('app.title')} — ${t('app.tagline')}`;

  const sel = document.getElementById('lang-select');
  sel.innerHTML = allLangs()
    .map((l) => `<option value="${l.code}" ${l.code === getLang() ? 'selected' : ''}>${l.label}</option>`)
    .join('');
  sel.setAttribute('aria-label', t('lang.label'));
  sel.addEventListener('change', () => setLang(sel.value));

  refreshHeader();
  window.addEventListener('hashchange', route);
  route();
}

init().catch((e) => {
  console.error(e);
  view.innerHTML = '<p class="lead">BrainGym failed to start. Open it via a local server (see README: ./run.sh).</p>';
});
