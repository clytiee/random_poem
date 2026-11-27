import { getHistory, getFavorites, getSettings } from './shared/store.js';
import { applyBodySettings } from './shared/render.js';

const list = document.getElementById('list');
const empty = document.getElementById('empty');
const more = document.getElementById('more');
const search = document.getElementById('search');
const favBtn = document.getElementById('to-fav');

let all = [];
let filtered = [];
let rendered = 0;
let onlyFav = false;
const PAGE = 60;

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function rowFor(item) {
  const el = document.createElement('button');
  el.className = 'item';
  const t = document.createElement('div');
  t.className = 't';

  const tt = document.createElement('span');
  tt.className = 'tt';
  tt.textContent = item.title;

  const b = document.createElement('span');
  b.className = 'b';
  b.textContent = [item.author, item.dynasty, item.collection].filter(Boolean).join(' · ');

  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = item.ts ? formatTime(item.ts) : '';

  t.append(tt, b, time);

  const l = document.createElement('div');
  l.className = 'l';
  l.textContent = (item.lines || []).join(' ');

  el.append(t, l);
  el.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL(`poem.html?id=${encodeURIComponent(item.id)}`) });
  });
  return el;
}

function renderChunk() {
  if (rendered >= filtered.length) { more.textContent = ''; return; }
  const frag = document.createDocumentFragment();
  for (let i = rendered; i < Math.min(rendered + PAGE, filtered.length); i++) {
    frag.appendChild(rowFor(filtered[i]));
  }
  list.appendChild(frag);
  rendered = Math.min(rendered + PAGE, filtered.length);
  more.textContent = '';
  if (rendered < filtered.length) {
    const btn = document.createElement('button');
    btn.textContent = `继续加载（还有 ${filtered.length - rendered} 首）`;
    btn.addEventListener('click', renderChunk);
    more.appendChild(btn);
  }
}

function applyFilter() {
  const q = search.value.trim();
  filtered = q
    ? all.filter(x => (x.title || '').includes(q) || (x.author || '').includes(q) || (x.lines || []).join('').includes(q))
    : all.slice();
  list.textContent = '';
  rendered = 0;
  empty.textContent = onlyFav ? '还没有收藏' : '还没有记录';
  empty.hidden = filtered.length > 0;
  renderChunk();
}

async function boot() {
  const settings = await getSettings();
  applyBodySettings(settings);
  all = onlyFav ? await getFavorites() : await getHistory();
  applyFilter();

  search.addEventListener('input', applyFilter);
  favBtn.addEventListener('click', async () => {
    onlyFav = !onlyFav;
    favBtn.dataset.on = String(onlyFav);
    all = onlyFav ? await getFavorites() : await getHistory();
    applyFilter();
  });
  document.getElementById('back').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('poem.html') });
  });
}

boot();
