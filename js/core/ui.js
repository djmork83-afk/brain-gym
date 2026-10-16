// ui.js — мелкие DOM/UX-утилиты, общая панель результатов.

/** Из HTML-строки делает DOM-элемент (первый корневой). */
export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function accuracy(correct, total) {
  return total ? Math.round((100 * correct) / total) : 0;
}

let toastTimer = null;
export function toast(msg) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  host.textContent = msg;
  host.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('show'), 2400);
}

/** Web Share, при неудаче — буфер обмена. Возвращает 'ok' | 'copied' | 'cancelled' | 'failed'. */
export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'ok';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    return 'failed';
  }
}

/**
 * Общая панель результата (её используют все игры).
 * opts: { gameTitle, score, stats: [{label, value}], rec: {isRecord, gainedXp, level},
 *         t, onAgain, onExit }
 */
export function showResult(host, opts) {
  const { gameTitle, score, stats = [], rec = {}, t, onAgain, onExit } = opts;
  host.innerHTML = '';

  const panel = el(`<div class="card result"></div>`);
  if (rec.isRecord) panel.appendChild(el(`<div class="record-badge">🎉 ${t('result.newRecord')}</div>`));
  panel.appendChild(el(`<h2>${gameTitle}</h2>`));
  panel.appendChild(el(`<div class="big-score">${score}</div>`));

  const rows = el(`<div class="rows"></div>`);
  for (const s of stats) {
    rows.appendChild(el(`<div class="row"><span>${s.label}</span><b>${s.value}</b></div>`));
  }
  if (rec.gainedXp != null) {
    rows.appendChild(el(`<div class="row"><span>${t('common.xp')}</span><b>+${rec.gainedXp}</b></div>`));
  }
  if (rec.level != null) {
    rows.appendChild(el(`<div class="row"><span>${t('common.level')}</span><b>${rec.level}</b></div>`));
  }
  panel.appendChild(rows);

  const actions = el(`<div class="actions"></div>`);
  const again = el(`<button class="btn primary big">${t('common.again')}</button>`);
  const back = el(`<button class="btn big">${t('common.back')}</button>`);
  const share = el(`<button class="btn big">📣 ${t('common.share')}</button>`);

  again.addEventListener('click', () => onAgain && onAgain());
  back.addEventListener('click', () => onExit && onExit());
  share.addEventListener('click', async () => {
    const text = t('share.text', { game: gameTitle, score, url: location.origin });
    const r = await shareText(text);
    if (r === 'copied') toast(t('share.copied'));
    else if (r === 'failed') toast(t('share.failed'));
  });

  actions.append(again, back, share);
  panel.appendChild(actions);
  host.appendChild(panel);
}
