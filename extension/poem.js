import { getSettings, getHistory, pushHistory, isFavorite, toggleFavorite, saveSettings } from './shared/store.js';
import { loadIndex, pickPoem, findById } from './shared/pick.js';
import { applyBodySettings, renderPoem, plainText, layoutFor } from './shared/render.js';
import { shootPaper } from './shared/shot.js';

const card = document.getElementById('card');
const toastEl = document.getElementById('toast');
const params = new URLSearchParams(location.search);
const wantId = params.get('id');

let settings, index, current;
let cursor = 0;
const seen = new Set();

// 逗号断行只对当前这一首生效，换诗/回看都回到关闭
let commaBreak = false;
let paintedId = null;
function syncCommaBreak() {
  document.querySelector('[data-act="comma"]').dataset.on = String(commaBreak);
  document.body.dataset.break = commaBreak ? 'comma' : '';
}

function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 1500);
}

function syncNoteBtn() {
  const noteBtn = document.querySelector('[data-act="note"]');
  const noteEl = card.querySelector('.note');
  const noteOpen = Boolean(noteEl && noteEl.classList.contains('open'));
  noteBtn.hidden = !noteEl;              // 没渲染出赏析就不给按钮
  noteBtn.textContent = noteOpen ? '收起' : '赏析';
  noteBtn.dataset.on = String(noteOpen);
}

function paint(item, { push }) {
  if (item.id !== paintedId) { commaBreak = false; paintedId = item.id; }
  current = item;
  seen.add(item.id);
  syncCommaBreak();
  renderPoem(card, item, { ...layoutFor(settings, 'full'), breakComma: commaBreak }, {
    maxHeight: Math.round(window.innerHeight * 0.76),
    maxWidth: Math.round(window.innerWidth * 0.88),
  });
  syncNoteBtn();
  isFavorite(item.id).then(v => { document.querySelector('[data-act="fav"]').dataset.on = String(v); });
  if (push) {
    cursor = 0;
    pushHistory(item);
  }
}

async function next() {
  const item = await pickPoem(index, settings, seen);
  if (!item) {
    card.querySelector('.paper').innerHTML = '<div class="empty">诗库为空，请到设置里启用至少一个池</div>';
    return;
  }
  paint(item, { push: true });
}

/** 回看历史里更早的一首：不写历史，只移动游标 */
async function prev() {
  const history = await getHistory();
  const idx = cursor + 1;
  if (idx >= history.length) { toast('已经是最早一首了'); return; }
  cursor = idx;
  paint(history[idx], { push: false });
}

async function boot() {
  settings = await getSettings();
  applyBodySettings(settings, 'full');
  index = await loadIndex();

  if (wantId) {
    const history = await getHistory();
    const hit = history.find(h => h.id === wantId) || await findById(index, wantId);
    if (hit) {
      const at = history.findIndex(h => h.id === hit.id);
      cursor = at >= 0 ? at : 0;
      paint(hit, { push: false });
      return;
    }
  }
  const history = await getHistory();
  history.slice(0, 30).forEach(h => seen.add(h.id));
  await next();
}

/* ---------- 版式浮层 ---------- */
const panel = document.getElementById('layout-panel');
const lp = id => document.getElementById(id);
let fontsLoaded = false;

const LP_FIELDS = [
  ['lp-fs-title', 'fullFontSizeTitle', 'num'],
  ['lp-fs-body', 'fullFontSizeBody', 'num'],
  ['lp-lh', 'fullLineHeight', 'num'],
  ['lp-valign', 'fullVAlign', 'text'],
  ['lp-font-body', 'fullFontBody', 'text'],
  ['lp-font-title', 'fullFontTitle', 'text'],
];

function fillPanel() {
  for (const [id, key] of LP_FIELDS) {
    const v = settings[key];
    const empty = v === undefined || v === null || v === '' || Number(v) === 0;
    lp(id).value = empty ? '' : String(v);
  }
}

async function applyLayout(key, raw, type) {
  let value;
  if (type === 'text') value = String(raw).trim();
  else if (key === 'fullLineHeight') {
    const n = Number(raw);
    value = Number.isFinite(n) && n > 0 ? Math.max(1.2, Math.min(3, Math.round(n * 10) / 10)) : 0;
  } else {
    const n = Number(raw);
    value = Number.isFinite(n) && n > 0 ? n : 0;
  }
  settings = await saveSettings({ [key]: value });
  applyBodySettings(settings, 'full');
  if (current) requestAnimationFrame(() => paint(current, { push: false }));
}

async function loadFonts() {
  if (fontsLoaded || !window.queryLocalFonts) return;
  fontsLoaded = true;
  try {
    const fonts = await window.queryLocalFonts();
    const cjk = /^[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
    const seenNames = new Set();
    const names = [];
    for (const f of fonts) {
      const n = f.fullName || f.family;
      if (n && !seenNames.has(n)) { seenNames.add(n); names.push(n); }
    }
    names.sort((a, b) => (cjk.test(a) === cjk.test(b) ? a.localeCompare(b, 'zh-Hans-CN') : (cjk.test(a) ? -1 : 1)));
    const list = lp('lp-fonts');
    list.textContent = '';
    for (const n of names.slice(0, 300)) {
      const o = document.createElement('option');
      o.value = n;
      list.appendChild(o);
    }
  } catch { /* 用户拒绝授权就只留默认 */ }
}

function togglePanel(open) {
  panel.hidden = !open;
  const btn = document.querySelector('[data-act="layout"]');
  btn.dataset.on = String(open);
  if (open) { fillPanel(); loadFonts(); }
}

for (const [id, key, type] of LP_FIELDS) {
  if (id === 'lp-lh') continue;
  lp(id).addEventListener('change', e => applyLayout(key, e.target.value, type));
}

/* 行高：空值（默认）时点上下箭头会从 min 起步，改为从当前版式默认行高开始 */
let lhEmptyInPanel = true;
const panelDefaultLh = () => (settings.orient === 'h' ? 2.05 : 2.2);
lp('lp-lh').addEventListener('focus', () => { lhEmptyInPanel = !lp('lp-lh').value.trim(); });
lp('lp-lh').addEventListener('change', e => {
  const raw = e.target.value.trim();
  if (lhEmptyInPanel || !raw) {
    lhEmptyInPanel = false;
    const d = panelDefaultLh();
    e.target.value = String(d);
    applyLayout('fullLineHeight', String(d));
    return;
  }
  applyLayout('fullLineHeight', raw);
});
lp('lp-lh').addEventListener('blur', () => { lhEmptyInPanel = true; });

document.addEventListener('click', e => {
  if (panel.hidden) return;
  if (panel.contains(e.target) || e.target.closest('[data-act="layout"]')) return;
  togglePanel(false);
});

// 双击标题也会展开/收起赏析，同步按钮文案与开启态
card.addEventListener('dblclick', () => setTimeout(syncNoteBtn, 0));

document.querySelector('.top-actions').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || !current) return;
  const act = btn.dataset.act;

  if (act === 'another') await next();
  else if (act === 'prev') await prev();
  else if (act === 'copy') {
    await navigator.clipboard.writeText(plainText(current));
    toast('已复制');
  } else if (act === 'fav') {
    const { added } = await toggleFavorite(current);
    btn.dataset.on = String(added);
    toast(added ? '已收藏' : '已取消收藏');
  } else if (act === 'note') {
    const note = card.querySelector('.note');
    if (!note) return;
    const open = note.classList.toggle('open');
    btn.textContent = open ? '收起' : '赏析';
    btn.dataset.on = String(open);
  } else if (act === 'comma') {
    commaBreak = !commaBreak;
    syncCommaBreak();
    paint(current, { push: false });
  } else if (act === 'shot') {
    try {
      const res = await shootPaper(card, current.title, settings);
      toast(res || '截图失败');
    } catch (err) {
      toast(`截图失败：${String(err?.message || err).slice(0, 40)}`);
    }
  } else if (act === 'history') {
    location.href = 'history.html';
  } else if (act === 'settings') {
    chrome.runtime.openOptionsPage();
  } else if (act === 'layout') {
    togglePanel(panel.hidden);
  }
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (settings?.darkMode === 'auto') applyBodySettings(settings, 'full');
});

boot().catch(err => {
  card.querySelector('.paper').innerHTML = `<div class="empty">${err.message}</div>`;
});
