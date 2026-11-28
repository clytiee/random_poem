const BASE_BODY_FONT = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif';
const BASE_TITLE_FONT = '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", "Songti SC", serif';

/* 版式里允许整页单独覆盖的字段 */
const LAYOUT_FIELDS = ['fontBody', 'fontTitle', 'fontSizeBody', 'fontSizeTitle', 'lineHeight', 'vAlign'];
const fullKeyOf = k => 'full' + k[0].toUpperCase() + k.slice(1);

/** 整页（展开模式）可独立设版式，未单独设过的字段回落到全局默认 */
export function layoutFor(settings, surface) {
  if (surface !== 'full') return settings;
  const out = { ...settings };
  for (const k of LAYOUT_FIELDS) {
    const v = settings[fullKeyOf(k)];
    const empty = v === undefined || v === null || v === '' ||
      (Number.isFinite(Number(v)) && Number(v) === 0);
    out[k] = empty ? settings[k] : v;
  }
  return out;
}

export function applyBodySettings(settings, surface = 'global') {
  settings = layoutFor(settings, surface);
  const body = document.body;
  body.dataset.style = settings.style || 'paper';
  body.dataset.orient = settings.orient || 'v';
  body.dataset.bg = settings.bg || 'none';
  body.dataset.vAlign = settings.vAlign === 'center' ? 'center' : 'start';
  body.dataset.break = settings.breakComma ? 'comma' : '';
  const dark = settings.darkMode === 'dark' ||
    (settings.darkMode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  body.dataset.mode = dark ? 'dark' : 'light';
  // 同步到 html：内容不满一屏时，露出的画布底色也要跟着主题走
  const root = document.documentElement;
  root.dataset.mode = body.dataset.mode;
  root.dataset.style = body.dataset.style;
  root.style.setProperty('--font-body', settings.fontBody ? `"${settings.fontBody}", ${BASE_BODY_FONT}` : '');
  root.style.setProperty('--font-title', settings.fontTitle ? `"${settings.fontTitle}", ${BASE_TITLE_FONT}` : '');

  // 用户字号：0 或空表示跟随卡片自适应档位
  for (const [prop, value] of [['--fs-body-user', settings.fontSizeBody], ['--fs-title-user', settings.fontSizeTitle]]) {
    const px = Number(value) || 0;
    if (px > 0) root.style.setProperty(prop, `${px}px`);
    else root.style.removeProperty(prop);
  }

  // 用户设定的行高：0 或空表示跟随各版式默认值
  const lh = Number(settings.lineHeight) || 0;
  if (lh > 0) root.style.setProperty('--lh-body-user', String(lh));
  else root.style.removeProperty('--lh-body-user');

  // 自定义背景图：有则覆盖纯色背景
  if (settings.bgImage) {
    root.style.setProperty('--bg-image', `url("${settings.bgImage}")`);
    body.dataset.bgImage = '1';
  } else {
    root.style.removeProperty('--bg-image');
    delete body.dataset.bgImage;
  }
}

export function sizeOf(item) {
  const chars = item.lines.join('').replace(/[，。；：？！、…·—]/g, '').length;
  if (chars <= 40) return 's';
  if (chars <= 110) return 'm';
  return 'l';
}

/* ---------- 竖排断列：优先句号，其次逗号，再次顿号/冒号 ---------- */
const CUT_PRIORITY = [/[。？！]/, /[，；]/, /[、：]/];

function findCut(text, cap) {
  for (const re of CUT_PRIORITY) {
    for (let i = Math.min(cap + 1, text.length - 1); i >= 1; i--) {
      if (re.test(text[i - 1])) return i;
    }
  }
  return cap;
}

function wrapStanza(text, cap) {
  if (cap <= 0 || text.length <= cap) return [text];
  const out = [];
  let s = text;
  while (s.length > cap) {
    const cut = findCut(s, cap);
    out.push(s.slice(0, cut));
    s = s.slice(cut);
  }
  if (s) out.push(s);
  return out;
}

/* ---------- 构建 ---------- */
function build(card, item, settings, cap) {
  const paper = card.querySelector('.paper');
  paper.textContent = '';

  // 文字块容器：竖排垂直居中时整块作为一项参与对齐（横排下退化为 display:contents）
  const piece = document.createElement('div');
  piece.className = 'piece';

  const head = document.createElement('div');
  head.className = 'head';

  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = item.title;
  head.appendChild(title);

  if (settings.showMeta !== false) {
    const byline = document.createElement('div');
    byline.className = 'byline';
    const bits = [];
    if (item.author) bits.push(item.author);
    if (item.dynasty) bits.push(item.dynasty);
    if (item.rhythmic && item.rhythmic !== item.title) bits.push(item.rhythmic);
    byline.textContent = bits.join(' · ');
    head.appendChild(byline);
  }

  piece.appendChild(head);
  paper.appendChild(piece);

  const body = document.createElement('div');
  body.className = 'body';
  const groups = Array.isArray(item.stanzas) && item.stanzas.length ? item.stanzas : item.lines.map(l => [l]);
  for (const group of groups) {
    const text = group.join('');
    // 逗号换行：每个逗号后另起一行/列（应对部分诗词标点不规整的情况）
    const segs = settings.breakComma
      ? text.split(/(?<=，)/).flatMap(part => wrapStanza(part.trim(), cap)).filter(Boolean)
      : wrapStanza(text, cap);
    for (const seg of segs) {
      const s = document.createElement('span');
      s.className = 'clause';
      s.textContent = seg;
      body.appendChild(s);
    }
  }

  // 横排：注释/题解放在标题与正文之间，展开时把正文往下推；竖排仍放列末
  piece.appendChild(body);

  if (item.note) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = item.note;
    if (settings.showNote !== false) note.classList.add('open');
    if (settings.orient === 'v') paper.appendChild(note);
    else piece.insertBefore(note, body);
    title.addEventListener('dblclick', () => note.classList.toggle('open'));
  }
}

/* ---------- 竖排尺寸 ---------- */
function paddingOf(el) {
  const cs = getComputedStyle(el);
  return parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
}

function maxColumnHeight(paper) {
  let col = 0;
  for (const child of paper.children) col = Math.max(col, child.offsetHeight);
  return col + paddingOf(paper) + 2;
}

/** 一列能装多少字：可用高度 ÷ 单个字的行距 */
function columnCapacity(paper, maxHeight) {
  const body = paper.querySelector('.body');
  if (!body) return 0;
  const cs = getComputedStyle(body);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 2;
  const avail = maxHeight - paddingOf(paper);
  return Math.max(4, Math.floor(avail / lh));
}

export function fitHeight(card, maxHeight) {
  const paper = card.querySelector('.paper');
  paper.style.height = 'auto';
  const natural = maxColumnHeight(paper);
  paper.style.height = `${Math.min(Math.max(Math.ceil(natural), 210), maxHeight)}px`;
}

/** 列数多、横向放不下时收紧列距（0 → 最低 0，再不够交给调用方裁列） */
function fitColumns(card, maxWidth = 560) {
  const paper = card.querySelector('.paper');
  const body = paper.querySelector('.body');
  if (!body) return;
  const clauses = body.querySelectorAll('.clause').length;
  const fs = parseFloat(getComputedStyle(body).fontSize) || 19;
  let gap = 0;
  paper.style.setProperty('--col-gap', `${gap}em`);
  for (let i = 0; i < 4; i++) {
    const width = paper.scrollWidth;
    if (width <= maxWidth) break;
    const over = width - maxWidth;
    gap = Math.max(0, gap - over / (fs * Math.max(clauses, 1)));
    paper.style.setProperty('--col-gap', `${gap}em`);
    if (gap === 0) break;
  }
}

/** 横排：单句宽过容器时，在句号处拆成多个可断行的小节 */
function splitLongClauses(card) {
  const body = card.querySelector('.body');
  if (!body) return;
  const avail = body.clientWidth;
  if (!avail) return;

  for (const el of [...body.querySelectorAll('.clause')]) {
    if (el.getBoundingClientRect().width <= avail + 1) continue;

    const pieces = [];
    let buf = '';
    for (const part of el.textContent.split(/([。！？])/)) {
      if (!part) continue;
      buf += part;
      if (/[。！？]/.test(part)) { pieces.push(buf); buf = ''; }
    }
    if (buf) pieces.push(buf);
    if (pieces.length < 2) continue;

    const frag = document.createDocumentFragment();
    for (const piece of pieces) {
      const s = document.createElement('span');
      s.className = 'clause';
      s.textContent = piece;
      frag.appendChild(s);
    }
    el.replaceWith(frag);
  }
}

/** 横排：先压缩行距（最低 1.1），仍装不下就按整行裁切，末行补省略号 */
function fitLinesH(card, maxHeight, minLh = 1.1) {
  const paper = card.querySelector('.paper');
  const body = paper.querySelector('.body');
  if (!body) return false;

  paper.style.height = '';
  paper.style.maxHeight = `${maxHeight}px`;
  paper.style.overflowY = '';
  body.style.lineHeight = '';

  const cs = getComputedStyle(body);
  const fs = parseFloat(cs.fontSize) || 17;
  let lh = parseFloat(cs.lineHeight) / fs;
  if (!Number.isFinite(lh) || lh < minLh) lh = 1.95;

  // 1) 压缩行距
  while (paper.scrollHeight > maxHeight + 1 && lh > minLh) {
    lh = Math.max(minLh, +(lh - 0.05).toFixed(2));
    body.style.lineHeight = String(lh);
  }

  if (paper.scrollHeight <= maxHeight + 1) {
    card.dataset.clippedY = '0';
    return false;
  }

  // 2) 按行裁切：找出第一个整行落在可视区之外的位置
  paper.style.overflow = 'hidden';
  const clauses = [...body.querySelectorAll('.clause')];
  if (!clauses.length) { card.dataset.clippedY = '0'; return false; }

  const padB = parseFloat(getComputedStyle(paper).paddingBottom) || 0;
  const limit = paper.getBoundingClientRect().bottom - padB + 0.5;

  let cut = clauses.length;
  for (let i = 0; i < clauses.length; i++) {
    if (clauses[i].getBoundingClientRect().bottom > limit) { cut = i; break; }
  }
  if (cut < clauses.length) {
    const top = clauses[cut].getBoundingClientRect().top;
    while (cut > 0 && Math.abs(clauses[cut - 1].getBoundingClientRect().top - top) < 1) cut--;
  }

  const kept = clauses.slice(0, cut);
  clauses.slice(cut).forEach(el => el.remove());
  if (kept.length) {
    const last = kept[kept.length - 1];
    last.textContent = `${last.textContent}…`;
  }

  card.dataset.clippedY = '1';
  return true;
}

export function renderPoem(card, item, settings, opts = {}) {
  card.dataset.orient = settings.orient;
  card.dataset.size = sizeOf(item);
  card.style.setProperty('--align', settings.align || 'center');

  const paperEl = card.querySelector('.paper');
  paperEl.style.width = '';
  paperEl.style.height = '';
  paperEl.style.maxHeight = '';
  paperEl.style.overflow = '';
  paperEl.style.overflowY = '';
  card.dataset.clippedY = '0';

  build(card, item, settings, 0);

  const paper = card.querySelector('.paper');

  if (settings.orient === 'v') {
    requestAnimationFrame(() => {
      const max = opts.maxHeight || 560;
      paper.style.height = 'auto';
      const natural = maxColumnHeight(paper);
      const overflow = natural > max + 1;
      if (overflow) {
        const cap = columnCapacity(paper, max);
        build(card, item, settings, cap);
      }
      fitHeight(card, max);
      fitColumns(card, opts.maxWidth);
      card.dispatchEvent(new CustomEvent('poem:fitted', { bubbles: true, detail: { overflow } }));
    });
  } else {
    requestAnimationFrame(() => {
      const max = opts.maxHeight || 560;
      splitLongClauses(card);
      fitLinesH(card, max);
      card.dispatchEvent(new CustomEvent('poem:fitted', { bubbles: true, detail: { overflow: false } }));
    });
  }

  return { title: paper.querySelector('.title'), note: paper.querySelector('.note') };
}

export function plainText(item) {
  const head = [item.title, [item.author, item.dynasty].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  return `${head}\n\n${item.lines.join('\n')}\n\n—— ${item.collection || ''}`.trim();
}
