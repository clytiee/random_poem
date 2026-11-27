import { getSettings, getHistory, pushHistory, isFavorite, toggleFavorite } from './shared/store.js';
import { loadIndex, pickPoem, findById } from './shared/pick.js';
import { applyBodySettings, renderPoem, plainText } from './shared/render.js';

const card = document.getElementById('card');
const toastEl = document.getElementById('toast');
const params = new URLSearchParams(location.search);
const wantId = params.get('id');

let settings, index, current;
const seen = new Set();

function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 1500);
}

function show(item) {
  current = item;
  seen.add(item.id);
  renderPoem(card, item, settings, {
    maxHeight: Math.round(window.innerHeight * 0.76),
    maxWidth: Math.round(window.innerWidth * 0.88),
  });
  document.querySelector('[data-act="note"]').hidden = !item.note;
  isFavorite(item.id).then(v => { document.querySelector('[data-act="fav"]').dataset.on = String(v); });
  pushHistory(item);
}

async function next() {
  const item = await pickPoem(index, settings, seen);
  if (!item) {
    card.querySelector('.paper').innerHTML = '<div class="empty">诗库为空，请到设置里启用至少一个池</div>';
    return;
  }
  show(item);
}

async function boot() {
  settings = await getSettings();
  applyBodySettings(settings);
  index = await loadIndex();

  if (wantId) {
    const history = await getHistory();
    const hit = history.find(h => h.id === wantId) || await findById(index, wantId);
    if (hit) { show(hit); return; }
  }
  const history = await getHistory();
  history.slice(0, 30).forEach(h => seen.add(h.id));
  await next();
}

document.querySelector('.top-actions').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || !current) return;
  const act = btn.dataset.act;

  if (act === 'another') await next();
  else if (act === 'copy') {
    await navigator.clipboard.writeText(plainText(current));
    toast('已复制');
  } else if (act === 'fav') {
    const { added } = await toggleFavorite(current);
    btn.dataset.on = String(added);
    toast(added ? '已收藏' : '已取消收藏');
  } else if (act === 'note') {
    const note = card.querySelector('.note');
    const open = note.classList.toggle('open');
    btn.textContent = open ? '收起' : '赏析';
  } else if (act === 'history') {
    location.href = 'history.html';
  } else if (act === 'settings') {
    chrome.runtime.openOptionsPage();
  }
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (settings?.darkMode === 'auto') applyBodySettings(settings);
});

boot().catch(err => {
  card.querySelector('.paper').innerHTML = `<div class="empty">${err.message}</div>`;
});
