#!/usr/bin/env node
// merge-locales.mjs — вливает фрагменты локалей из locales/frag/*.json в locales/<lang>.json.
// Фрагмент: { "ru": {...}, "en": {...}, ... } — deep-merge в соответствующий языковой файл.
// Запуск: node tools/merge-locales.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fragDir = join(root, 'locales', 'frag');
const localesDir = join(root, 'locales');

function merge(target, source, path = '') {
  const conflicts = [];
  for (const [k, v] of Object.entries(source)) {
    const p = path ? `${path}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (target[k] === undefined || typeof target[k] !== 'object') target[k] = {};
      conflicts.push(...merge(target[k], v, p));
    } else {
      if (target[k] !== undefined) conflicts.push(p);
      target[k] = v;
    }
  }
  return conflicts;
}

if (!existsSync(fragDir)) {
  console.log('locales/frag не найден — нечего мержить');
  process.exit(0);
}
const files = readdirSync(fragDir).filter((f) => f.endsWith('.json'));
if (!files.length) {
  console.log('locales/frag пуст — нечего мержить');
  process.exit(0);
}

let merged = 0;
for (const file of files) {
  let frag;
  try {
    frag = JSON.parse(readFileSync(join(fragDir, file), 'utf8'));
  } catch (e) {
    console.error(`ОШИБКА JSON в ${file}: ${e.message}`);
    process.exit(1);
  }
  for (const [lang, tree] of Object.entries(frag)) {
    const locFile = join(localesDir, `${lang}.json`);
    if (!existsSync(locFile)) {
      console.warn(`нет locales/${lang}.json — пропуск (${file})`);
      continue;
    }
    const dict = JSON.parse(readFileSync(locFile, 'utf8'));
    const conflicts = merge(dict, tree);
    if (conflicts.length) console.warn(`[${lang}] ${file}: перезаписано ключей: ${conflicts.join(', ')}`);
    writeFileSync(locFile, JSON.stringify(dict, null, 2) + '\n');
    merged++;
  }
  console.log(`ok ${file}`);
}
console.log(`\nСмержено ${merged} фрагментов из ${files.length} файлов.`);
