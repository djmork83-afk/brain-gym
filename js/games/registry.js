// registry.js — реестр игр. Добавить игру = файл js/games/<id>.js + строка здесь.
export const GAMES = [
  { id: 'math',   icon: '🧮', hue: 'indigo' },
  { id: 'memory', icon: '🃏', hue: 'green' },
  { id: 'stroop', icon: '🎨', hue: 'orange' },
];

export async function loadGame(id) {
  const mod = await import(`./${id}.js`);
  return mod.default;
}
