import { getSettings, getHistory, pushHistory, isFavorite, toggleFavorite } from './shared/store.js';
import { loadIndex, pickPoem } from './shared/pick.js';
import { applyBodySettings, renderPoem, plainText } from './shared/render.js';

const card = document.getElementById('card');
const toastEl = document.getElementById('toast');
let settings, index, current;
const seen = new Set();

function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 1500);
}

async function next() {
  current = await pickPoem(index, settings, seen);
  if (!current) {
    card.querySelector('.paper').innerHTML = '<div class="empty">诗库为空，请到设置里启用至少一个池</div>';
    return;
  }
  seen.add(current.id);
  const maxHeight = Math.min(Math.round((window.screen?.availHeight || 900) * 0.8), 560);
  renderPoem(card, current, settings, { maxHeight, maxWidth: 620 });
  await pushHistory(current);
  card.querySelector('[data-act="note"]').hidden = !current.note;
  card.querySelector('[data-act="fav"]').dataset.on = String(await isFavorite(current.id));
  requestAnimationFrame(applyPopupWidth);
}

/** popup 尺寸由内容决定，显式量一次，避免短诗沿用上一首的宽度 */
function applyPopupWidth() {
  const fade = document.getElementById('clip-fade');
  const hint = document.getElementById('more-hint');

  if (settings.orient !== 'v') {
    document.body.style.width = '380px';
    card.dataset.clipped = '0';
    fade.hidden = true;
    hint.hidden = true;
    return;
  }

  const paper = card.querySelector('.paper');
  const raw = paper.scrollWidth;
  const MAX = 620;
  const clipped = raw + 2 > 621;
  const w = Math.min(Math.max(Math.ceil(raw) + 2, 210), MAX);

  document.body.style.width = `${w}px`;
  paper.style.width = '100%';
  card.dataset.clipped = clipped ? '1' : '0';
  fade.hidden = !clipped;
  hint.hidden = !clipped;
}

card.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || !current) return;
  const act = btn.dataset.act;

  if (act === 'another') {
    await next();
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
    if (note) {
      const open = note.classList.toggle('open');
      btn.textContent = open ? '收起' : '赏析';
    }
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
  history.slice(0, 30).forEach(h => seen.add(h.id));
  await next();

  // 正文用双击标题展开赏析时，同步按钮文案
  card.addEventListener('dblclick', () => {
    const note = card.querySelector('.note');
    if (!note) return;
    const btn = card.querySelector('[data-act="note"]');
    btn.textContent = note.classList.contains('open') ? '收起' : '赏析';
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.darkMode === 'auto') applyBodySettings(settings);
  });
})();
