// progress.js — прогресс пользователя. Хранилище: localStorage, ключ bg_progress_v1.
// Экспорт/импорт — JSON-файл (прогресс принадлежит пользователю).

const KEY = 'bg_progress_v1';
const HISTORY_LIMIT = 100;

/** XP на один уровень. Единственное место, где задаётся темп роста уровней. */
export const LEVEL_XP = 250;

function defaults() {
  return {
    v: 1,
    xp: 0,
    streak: { days: 0, lastDay: null, best: 0 },
    best: {},     // gameId -> { score, ts }
    plays: {},    // gameId -> количество партий
    history: [],  // [{ game, score, xp, correct, total, ts }]
  };
}

function normalize(data) {
  const d = defaults();
  return {
    ...d,
    ...data,
    streak: { ...d.streak, ...(data.streak || {}) },
    best: { ...d.best, ...(data.best || {}) },
    plays: { ...d.plays, ...(data.plays || {}) },
    history: Array.isArray(data.history) ? data.history.slice(0, HISTORY_LIMIT) : [],
  };
}

let state = null;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') return normalize(data);
    }
  } catch (e) {
    console.warn('progress: read failed', e);
  }
  return defaults();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('progress: save failed', e);
  }
}

export function getState() {
  if (!state) state = read();
  return state;
}

export function levelFromXp(xp) {
  return Math.floor(xp / LEVEL_XP) + 1;
}

/** Сколько XP осталось до следующего уровня. */
export function xpToNext(xp) {
  return LEVEL_XP - (xp % LEVEL_XP);
}

function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Записать результат партии. result: { score, xp, correct, total, durationSec }.
 * Возвращает { isRecord, gainedXp, level } — игра показывает это в панели результата.
 */
export function recordResult(gameId, result) {
  const s = getState();
  const score = Math.max(0, Math.round(Number(result.score) || 0));
  const xp = Math.max(0, Math.round(Number(result.xp != null ? result.xp : score) || 0));

  s.xp += xp;
  s.plays[gameId] = (s.plays[gameId] || 0) + 1;

  const today = dateStr(0);
  if (s.streak.lastDay !== today) {
    s.streak.days = s.streak.lastDay === dateStr(-1) ? (s.streak.days || 0) + 1 : 1;
    s.streak.lastDay = today;
  }
  if (s.streak.days > (s.streak.best || 0)) s.streak.best = s.streak.days;

  const prev = s.best[gameId];
  const isRecord = !prev || score > (prev.score || 0);
  if (isRecord) s.best[gameId] = { score, ts: Date.now() };

  s.history.unshift({
    game: gameId,
    score,
    xp,
    correct: result.correct != null ? result.correct : null,
    total: result.total != null ? result.total : null,
    ts: Date.now(),
  });
  if (s.history.length > HISTORY_LIMIT) s.history.length = HISTORY_LIMIT;

  save();
  return { isRecord, gainedXp: xp, level: levelFromXp(s.xp) };
}

export function resetProgress() {
  state = defaults();
  save();
}

export function exportProgress() {
  const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'braingym-progress.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Импорт заменяет текущий прогресс (предсказуемо; слияние — позже). */
export async function importProgressFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || typeof data.xp !== 'number') {
    throw new Error('not a BrainGym progress file');
  }
  state = normalize(data);
  save();
  return true;
}
