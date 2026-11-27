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

/** 竖排纸面在 max-content 状态下的真实宽度（含内边距，标题、作者、正文各列都算在内） */
function naturalSpan(paper) {
  return paper.getBoundingClientRect().width;
}

/** 竖排滚动时停在最右：vertical-rl 的滚动起点就在右侧，scrollLeft=0 即最右 */
function stickToRight(paper) {
  if (paper.scrollWidth <= paper.clientWidth) return;
  paper.scrollLeft = 0;
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

  // 先按纸面自然宽（max-content）量出真实占用；宽度顶到上限时先把竖排行距收到 1.65，
  // 列随之变窄，还放不下再裁列
  paper.style.width = '';
  card.style.width = '';
  let natural = naturalSpan(paper);
  if (natural + 2 > CARD_MAX_W) {
    paper.style.setProperty('--lh-v', '1.65');
    natural = naturalSpan(paper);
  } else {
    paper.style.removeProperty('--lh-v');
  }

  const w = Math.min(Math.max(Math.ceil(natural) + 2, 210), CARD_MAX_W);
  document.body.style.width = `${w}px`;
  // 卡片不能跟着正文自然宽跑，否则弹窗被撑宽、出现整页横向滚动条
  card.style.width = `${w}px`;
  card.style.minWidth = '0';
  paper.style.width = '100%';
  // 列数过多不再省略：纸面固定在上限宽，横向可滚，滚动位置停在最右（正文从头开始）
  stickToRight(paper);
  requestAnimationFrame(() => stickToRight(paper));

  card.dataset.clipped = '0';
  fade.hidden = true;
  hint.hidden = true;
}

/** 把纸面逐字绘制到 canvas（只含纸面，不含任何按钮），再导出 PNG */
async function saveImage() {
  const paper = card.querySelector('.paper');

  // 竖排内容会横向滚动，先把纸面临时展开到全文尺寸，否则只截到可见视口
  const savedW = paper.style.width;
  const savedOverflow = paper.style.overflowX;
  const savedCardW = card.style.width;
  paper.style.width = 'max-content';
  paper.style.overflowX = 'visible';
  card.style.width = 'max-content';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let rect = paper.getBoundingClientRect();
  const restore = () => {
    paper.style.width = savedW;
    paper.style.overflowX = savedOverflow;
    card.style.width = savedCardW;
  };
  if (rect.width < 2 || rect.height < 2) { restore(); return false; }

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = getComputedStyle(paper).backgroundColor || '#fff';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const range = document.createRange();
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue || '';
    const parent = node.parentElement;
    if (text.trim() && parent) {
      const style = getComputedStyle(parent);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        ctx.fillStyle = style.color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        let pos = 0;
        for (const ch of text) {
          const len = ch.length;
          if (ch !== '\n' && ch !== '\t' && ch !== ' ') {
            range.setStart(node, pos);
            range.setEnd(node, pos + len);
            const r = range.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              ctx.fillText(ch, r.left - rect.left + r.width / 2, r.top - rect.top + r.height / 2);
            }
          }
          pos += len;
        }
      }
    }
    node = walker.nextNode();
  }
  restore();

  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('画布导出为空');

  const wantClip = settings.shotClipboard === true;
  const wantDownload = settings.shotDownload !== false || !wantClip;
  const done = [];

  if (wantClip) {
    if (!navigator.clipboard?.write) throw new Error('当前环境不支持写剪贴板');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    done.push('已复制到剪贴板');
  }

  if (wantDownload) {
    if (!chrome.downloads) throw new Error('缺少 downloads 权限，请重新加载扩展');
    const url = URL.createObjectURL(blob);
    const safe = String(current?.title || '诗文').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    await chrome.downloads.download({ url, filename: `诗文-${safe}.png`, saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    done.push('已保存图片');
  }

  return done.join('，');
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
  } else if (act === 'shot') {
    card.dataset.shot = '1';
    await new Promise(r => setTimeout(r, 80));
    try {
      const res = await saveImage();
      toast(res || '截图失败');
    } catch (err) {
      toast(`截图失败：${String(err?.message || err).slice(0, 40)}`);
    }
    delete card.dataset.shot;
  } else if (act === 'fav') {    const { added } = await toggleFavorite(current);
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
