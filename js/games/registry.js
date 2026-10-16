// registry.js — реестр игр. Добавить игру = файл js/games/<id>.js + строка здесь.
export const GAMES = [
  { id: 'math',           icon: '🧮', hue: 'indigo' },
  { id: 'memory',         icon: '🃏', hue: 'green' },
  { id: 'stroop',         icon: '🎨', hue: 'orange' },
  { id: 'schulte',        icon: '🎯', hue: 'blue' },
  { id: 'simon',          icon: '🎹', hue: 'purple' },
  { id: 'numbers',        icon: '🔢', hue: 'orange' },
  { id: 'parking',        icon: '🅿️', hue: 'indigo' },
  { id: 'stopsignal',     icon: '✋', hue: 'red' },
  { id: 'shopping',       icon: '🛒', hue: 'green' },
  { id: 'constellations', icon: '✨', hue: 'teal' },
];

export async function loadGame(id) {
  const mod = await import(`./${id}.js`);
  return mod.default;
}
