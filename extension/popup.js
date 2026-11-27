import { getSettings, getHistory, pushHistory, isFavorite, toggleFavorite, recentIds } from './shared/store.js';
import { loadIndex, pickPoem } from './shared/pick.js';
import { applyBodySettings, renderPoem, plainText } from './shared/render.js';

const card = document.getElementById('card');
const toastEl = document.getElementById('toast');
let settings, index, current;
let cursor = 0;
const seen = new Set();

/** Chrome 弹窗上限 800×600；底部工具栏已并入顶部，高度放宽到 580 */
const CARD_MAX_W = 760;
const CARD_MAX_H = 580;

function cardWidthH() {
  const sw = window.screen?.availWidth || 1920;
  return Math.min(CARD_MAX_W, Math.max(380, Math.round(sw * 0.26)));
}

function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 1500);
}

async function paintCurrent(item, { push }) {
  current = item;
  seen.add(item.id);
  const maxHeight = Math.min(Math.round((window.screen?.availHeight || 900) * 0.8), CARD_MAX_H);
  if (settings.orient !== 'v') document.body.style.width = `${cardWidthH()}px`;
  renderPoem(card, item, { ...settings, showNote: false }, { maxHeight, maxWidth: CARD_MAX_W });
  if (push) await pushHistory(item);

  card.querySelector('[data-act="fav"]').dataset.on = String(await isFavorite(item.id));
  requestAnimationFrame(applyPopupWidth);
}

async function next() {
  const poem = await pickPoem(index, settings, seen);
  if (!poem) {
    card.querySelector('.paper').innerHTML = '<div class="empty">诗库为空，请到设置里启用至少一个池</div>';
    return;
  }
  cursor = 0;
  await paintCurrent(poem, { push: true });
}

/** 回看历史里更早的一首：不写入历史，只移动游标 */
async function prev() {
  const history = await getHistory();
  const idx = cursor + 1;
  if (idx >= history.length) { toast('已经是最早一首了'); return; }
  cursor = idx;
  await paintCurrent(history[idx], { push: false });
}

/** popup 尺寸由内容决定，显式量一次，避免短诗沿用上一首的宽度 */
function applyPopupWidth() {
  const fade = document.getElementById('clip-fade');
  const hint = document.getElementById('more-hint');
  const paper = card.querySelector('.paper');

  if (settings.orient !== 'v') {
    document.body.style.width = `${cardWidthH()}px`;
    const clipped = card.dataset.clippedY === '1';
    card.dataset.clipped = clipped ? '1' : '0';
    fade.dataset.dir = 'bottom';
    hint.dataset.dir = 'bottom';
    fade.hidden = !clipped;
    hint.hidden = !clipped;
    return;
  }

  const raw = paper.scrollWidth;
  const clipped = raw + 2 > CARD_MAX_W + 1;
  const w = Math.min(Math.max(Math.ceil(raw) + 2, 210), CARD_MAX_W);

  document.body.style.width = `${w}px`;
  paper.style.width = '100%';
  card.dataset.clipped = clipped ? '1' : '0';
  fade.dataset.dir = 'left';
  hint.dataset.dir = 'left';
  fade.hidden = !clipped;
  hint.hidden = !clipped;
}

card.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || !current) return;
  const act = btn.dataset.act;

  if (act === 'another') {
    await next();
  } else if (act === 'prev') {
    await prev();
  } else if (act === 'copy') {
    try {
      await navigator.clipboard.writeText(plainText(current));
      toast('已复制');
    } catch {
      toast('复制失败');
    }
  } else if (act === 'fav') {
    const { added } = await toggleFavorite(current);
    btn.dataset.on = String(added);
    toast(added ? '已收藏' : '已取消收藏');
  } else if (act === 'note') {
    const note = card.querySelector('.note');
    if (note) note.classList.toggle('open');
  } else if (act === 'full') {    chrome.tabs.create({ url: chrome.runtime.getURL(`poem.html?id=${encodeURIComponent(current.id)}`) });
  } else if (act === 'history') {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  } else if (act === 'settings') {
    chrome.runtime.openOptionsPage();
  }
});

(async function boot() {
  settings = await getSettings();
  applyBodySettings(settings);
  try {
    index = await loadIndex();
  } catch {
    card.querySelector('.paper').innerHTML = '<div class="empty">数据未构建，请先运行 npm run build</div>';
    return;
  }
  const history = await getHistory();
  recentIds(history, settings.excludeDays).forEach(id => seen.add(id));
  await next();

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.darkMode === 'auto') applyBodySettings(settings);
  });
})();
