import { getSettings, saveSettings, getHistory, clearHistory, HISTORY_LIMIT } from './shared/store.js';
import { loadIndex, pickPoem } from './shared/pick.js';
import { applyBodySettings } from './shared/render.js';

let fontFaces = [];
let fontTarget = 'fontBody';
let fontSample = '春江潮水连海平';
let poemIndex = null;

const toastEl = document.getElementById('toast');
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 1500);
}

const $ = id => document.getElementById(id);
let settings;

/** 纸面底色（CSS 里按 data-bg 定义，这里负责把选项渲染出来） */
const BG_ITEMS = [
  { key: 'none', label: '默认' },
  { key: 'warm', label: '暖黄' },
  { key: 'cool', label: '冷灰' },
  { key: 'ink', label: '墨黑' },
  { key: 'dusk', label: '暮色' },
];

function renderBgList() {
  const list = $('bg-list');
  if (!list || list.childElementCount) return;
  for (const { key, label } of BG_ITEMS) {
    const el = document.createElement('div');
    el.className = 'bg-item';
    el.dataset.bg = key;
    el.textContent = label;
    list.appendChild(el);
  }
}

function setNum(id, value) {
  const el = $(id);
  if (document.activeElement === el) return;
  const text = Number(value) > 0 ? String(value) : '';
  if (el.value !== text) el.value = text;
}

function syncClear(id) {
  const wrap = $(id).closest('.input-clear');
  if (wrap) wrap.dataset.filled = $(id).value.trim() ? '1' : '0';
}

function paint() {
  applyBodySettings(settings);
  $('orient').value = settings.orient;
  $('align').value = settings.align;
  $('style').value = settings.style;
  $('darkMode').value = settings.darkMode;
  $('shotDownload').checked = settings.shotDownload !== false;
  $('shotClipboard').checked = settings.shotClipboard === true;
  $('showMeta').checked = settings.showMeta !== false;
  $('showNote').checked = settings.showNote !== false;
  $('fontBody').value = settings.fontBody || '';
  $('fontTitle').value = settings.fontTitle || '';
  setNum('fontSizeBody', settings.fontSizeBody);
  setNum('fontSizeTitle', settings.fontSizeTitle);
  if (document.activeElement !== $('excludeDays')) {
    $('excludeDays').value = String(Number(settings.excludeDays) || 0);
  }
  document.querySelectorAll('.bg-item').forEach(el => {
    el.dataset.on = String((el.dataset.bg || 'none') === (settings.bg || 'none'));
  });
  document.querySelectorAll('input[data-pool]').forEach(el => {
    el.checked = settings.pools[el.dataset.pool] !== false;
  });
  paintFontVariables();
  syncClear('fontBody');
  syncClear('fontTitle');
}

function paintFontVariables() {
  document.documentElement.style.setProperty('--font-body', $('fontBody').value ? `"${$('fontBody').value}", "Songti SC", serif` : '');
  document.documentElement.style.setProperty('--font-title', $('fontTitle').value ? `"${$('fontTitle').value}", "Kaiti SC", serif` : '');
}

async function update(patch) {
  settings = await saveSettings(patch);
  paint();
}

async function boot() {
  settings = await getSettings();
  applyBodySettings(settings);

  try {
    poemIndex = await loadIndex();
    const list = $('pool-list');
    list.textContent = '';
    for (const p of poemIndex.pools) {
      const row = document.createElement('label');
      row.className = 'pool';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.label;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${p.count} 首 · ${p.shards.length} 片`;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.pool = p.key;
      row.append(name, count, cb);
      list.appendChild(row);
    }
  } catch (e) {
    $('pool-list').textContent = '数据未构建，请先运行 npm run build';
  }

  renderBgList();
  paint();

  const history = await getHistory();
  $('history-count').textContent = `已记录 ${history.length} / ${HISTORY_LIMIT} 首`;

  $('pool-list').addEventListener('change', e => {
    const key = e.target.dataset.pool;
    if (!key) return;
    const anyOn = [...document.querySelectorAll('input[data-pool]')].some(x => x.checked);
    if (!anyOn) { e.target.checked = true; toast('至少要启用一个诗库'); return; }
    update({ pools: { [key]: e.target.checked } });
  });

  for (const [id, key] of [['orient', 'orient'], ['align', 'align'], ['style', 'style'], ['darkMode', 'darkMode']]) {
    $(id).addEventListener('change', e => update({ [key]: e.target.value }));
  }
  $('showMeta').addEventListener('change', e => update({ showMeta: e.target.checked }));
  $('showNote').addEventListener('change', e => update({ showNote: e.target.checked }));
  $('shotDownload').addEventListener('change', e => update({ shotDownload: e.target.checked }));
  $('shotClipboard').addEventListener('change', e => update({ shotClipboard: e.target.checked }));

  fontSample = await pickSampleLine();
  markFontTarget();
  renderFontList();

  for (const id of ['fontBody', 'fontTitle']) {
    $(id).addEventListener('focus', () => {
      fontTarget = id;
      markFontTarget();
      renderFontList();
    });
    $(id).addEventListener('input', e => {
      paintFontVariables();
      syncClear(id);
      update({ [id]: e.target.value.trim() });
      if (fontFaces.length) renderFontList();
    });
  }

  document.querySelectorAll('.clear-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.clear;
      const input = $(id);
      input.value = '';
      if (id === fontTarget) renderFontList();
      paintFontVariables();
      syncClear(id);
      update({ [id]: '' });
      input.focus();
    });
  });

  document.querySelectorAll('.bg-item').forEach(el => {
    el.addEventListener('click', () => update({ bg: el.dataset.bg }));
  });

  for (const [id, min, max] of [['fontSizeBody', 10, 48], ['fontSizeTitle', 10, 64]]) {    const clamp = raw => Math.max(min, Math.min(max, Math.round(Number(raw))));
    $(id).addEventListener('input', e => {
      const raw = e.target.value.trim();
      if (!raw) { update({ [id]: 0 }); return; }
      const v = Number(raw);
      if (!Number.isFinite(v) || v <= 0) return;
      update({ [id]: clamp(raw) });
    });
    $(id).addEventListener('blur', e => {
      const raw = e.target.value.trim();
      if (!raw || !(Number(raw) > 0)) { e.target.value = ''; update({ [id]: 0 }); return; }
      const v = clamp(raw);
      e.target.value = String(v);
      update({ [id]: v });
    });
  }

  const daysOf = raw => (raw === '' ? 14 : Math.max(0, Math.min(365, Math.round(Number(raw) || 0))));
  $('excludeDays').addEventListener('input', e => update({ excludeDays: daysOf(e.target.value.trim()) }));
  $('excludeDays').addEventListener('blur', e => {
    const v = daysOf(e.target.value.trim());
    e.target.value = String(v);
    update({ excludeDays: v });
  });

  $('scan-fonts').addEventListener('click', scanFonts);
  $('clear-history').addEventListener('click', async () => {
    await clearHistory();
    $('history-count').textContent = `已记录 0 / ${HISTORY_LIMIT} 首`;
    toast('历史已清空');
  });
  $('open-history').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('history.html') }));

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.darkMode === 'auto') applyBodySettings(settings);
  });
}

/* ---------- 本机字体 ---------- */

const CJK_HEAD = /^[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

async function pickSampleLine() {
  try {
    if (!poemIndex || !settings) return fontSample;
    const poem = await pickPoem(poemIndex, settings);
    if (!poem) return fontSample;
    const stanza = (poem.stanzas && poem.stanzas[0]) || poem.lines || [];
    const line = String(stanza.join('') || poem.title || '').replace(/\s+/g, '');
    if (line) return line.slice(0, 14);
  } catch (e) { /* 池子未加载时用兜底句 */ }
  return '春江潮水连海平';
}

function fontCss(f) {
  return `"${f.fullName}", "${f.family}", serif`;
}

function renderFontList() {
  const list = $('font-list');
  const sampleEl = $('font-sample');
  sampleEl.textContent = `预览句：${fontSample}`;

  if (!fontFaces.length) { list.hidden = true; return; }
  list.hidden = false;
  list.textContent = '';

  const current = ($(fontTarget).value || '').trim().toLowerCase();

  for (const f of fontFaces) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'font-item';
    const hit = f.fullName.toLowerCase() === current || f.family.toLowerCase() === current;
    btn.dataset.on = String(hit);

    const fx = document.createElement('span');
    fx.className = 'fx';
    fx.textContent = fontSample;
    fx.style.fontFamily = fontCss(f);

    const fn = document.createElement('span');
    fn.className = 'fn';
    fn.textContent = f.fullName;

    btn.append(fx, fn);
    btn.addEventListener('click', () => {
      $(fontTarget).value = f.fullName;
      paintFontVariables();
      update({ [fontTarget]: f.fullName });
      renderFontList();
      toast(`已应用到${fontTarget === 'fontBody' ? '正文' : '标题'}：${f.fullName}`);
    });
    list.appendChild(btn);
  }
}

function markFontTarget() {
  $('font-target').textContent = `应用到${fontTarget === 'fontBody' ? '正文' : '标题'}`;
}

async function scanFonts() {
  const status = $('font-status');
  if (typeof window.queryLocalFonts !== 'function') {
    status.textContent = '当前浏览器不支持本地字体读取，可直接输入字体名';
    return;
  }
  status.textContent = '扫描中…';
  try {
    const faces = await window.queryLocalFonts();
    const seen = new Map();
    for (const face of faces) {
      const family = String(face.family || '').trim();
      if (!family) continue;
      const fullName = String(face.fullName || family).trim() || family;
      const key = fullName.toLowerCase();
      if (!seen.has(key)) seen.set(key, { family, fullName });
    }
    fontFaces = [...seen.values()].sort((a, b) => {
      const ca = CJK_HEAD.test(a.fullName) ? 0 : 1;
      const cb = CJK_HEAD.test(b.fullName) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return a.fullName.localeCompare(b.fullName, 'zh-Hans-CN');
    });

    const dl = $('font-options');
    dl.textContent = '';
    for (const f of fontFaces) {
      const opt = document.createElement('option');
      opt.value = f.fullName;
      dl.appendChild(opt);
    }

    renderFontList();
    status.textContent = `找到 ${fontFaces.length} 个字体，点击列表任一项即可应用`;
  } catch (e) {
    status.textContent = '未获得字体访问权限，可直接输入字体名';
  }
}

boot();
