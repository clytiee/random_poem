import { getSettings, saveSettings, getHistory, clearHistory, HISTORY_LIMIT } from './shared/store.js';
import { loadIndex } from './shared/pick.js';
import { applyBodySettings } from './shared/render.js';

const toastEl = document.getElementById('toast');
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 1500);
}

const $ = id => document.getElementById(id);
let settings;

function paint() {
  applyBodySettings(settings);
  $('orient').value = settings.orient;
  $('align').value = settings.align;
  $('style').value = settings.style;
  $('darkMode').value = settings.darkMode;
  $('showMeta').checked = settings.showMeta !== false;
  $('showNote').checked = settings.showNote !== false;
  $('fontBody').value = settings.fontBody || '';
  $('fontTitle').value = settings.fontTitle || '';
  document.querySelectorAll('.bg-item').forEach(el => {
    el.dataset.on = String((el.dataset.bg || 'none') === (settings.bg || 'none'));
  });
  document.querySelectorAll('input[data-pool]').forEach(el => {
    el.checked = settings.pools[el.dataset.pool] !== false;
  });
  paintFontVariables();
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
    const index = await loadIndex();
    const list = $('pool-list');
    list.textContent = '';
    for (const p of index.pools) {
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

  $('fontBody').addEventListener('input', e => { paintFontVariables(); update({ fontBody: e.target.value.trim() }); });
  $('fontTitle').addEventListener('input', e => { paintFontVariables(); update({ fontTitle: e.target.value.trim() }); });

  document.querySelectorAll('.bg-item').forEach(el => {
    el.addEventListener('click', () => update({ bg: el.dataset.bg }));
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

async function scanFonts() {
  const status = $('font-status');
  if (typeof window.queryLocalFonts !== 'function') {
    status.textContent = '当前浏览器不支持本地字体读取，可直接输入字体名';
    return;
  }
  status.textContent = '扫描中…';
  try {
    const faces = await window.queryLocalFonts();
    const families = [...new Set(faces.map(f => String(f.family || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'zh'));
    const dl = $('font-options');
    dl.textContent = '';
    for (const fam of families) {
      const opt = document.createElement('option');
      opt.value = fam;
      dl.appendChild(opt);
    }
    status.textContent = `找到 ${families.length} 个字体族，输入框可直接搜索`;
  } catch (e) {
    status.textContent = '未获得字体访问权限，可直接输入字体名';
  }
}

boot();
