// i18n.js — переводы: locales/<lang>.json + t(key)
// Добавление языка: JSON-файл + запись в LANGS.

const LANGS = {
  ru: 'Русский',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  zh: '中文',
};

const STORAGE_KEY = 'bg_lang';
const FALLBACK = 'en';

let lang = FALLBACK;
let dict = {};

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS[saved]) return saved;
  } catch (e) { /* приватный режим — не страшно */ }

  const candidates =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ''];
  for (const c of candidates) {
    const code = String(c).slice(0, 2).toLowerCase();
    if (LANGS[code]) return code;
  }
  return FALLBACK;
}

export async function initI18n() {
  lang = detectLang();
  const res = await fetch(`locales/${lang}.json`);
  if (!res.ok) throw new Error(`locale not found: ${lang}`);
  dict = await res.json();
  document.documentElement.lang = lang;
}

export function getLang() {
  return lang;
}

export function allLangs() {
  return Object.entries(LANGS).map(([code, label]) => ({ code, label }));
}

export function setLang(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
  location.reload();
}

/** t('game.math.title') → строка; плейсхолдеры {name} подставляются из vars. */
export function t(key, vars) {
  let node = dict;
  for (const part of String(key).split('.')) {
    node = node && typeof node === 'object' ? node[part] : undefined;
    if (node === undefined) break;
  }
  if (node === undefined) return key;
  let s = String(node);
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  }
  return s;
}

/** Перевод статических узлов: атрибут data-i18n → textContent. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}
