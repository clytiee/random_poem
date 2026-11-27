const BASE_BODY_FONT = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif';
const BASE_TITLE_FONT = '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", "Songti SC", serif';

export function applyBodySettings(settings) {
  const body = document.body;
  body.dataset.style = settings.style || 'paper';
  body.dataset.orient = settings.orient || 'v';
  body.dataset.bg = settings.bg || 'none';
  const dark = settings.darkMode === 'dark' ||
    (settings.darkMode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  body.dataset.mode = dark ? 'dark' : 'light';
  const root = document.documentElement;
  root.style.setProperty('--font-body', settings.fontBody ? `"${settings.fontBody}", ${BASE_BODY_FONT}` : '');
  root.style.setProperty('--font-title', settings.fontTitle ? `"${settings.fontTitle}", ${BASE_TITLE_FONT}` : '');
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

  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = item.title;
  paper.appendChild(title);

  if (settings.showMeta !== false) {
    const byline = document.createElement('div');
    byline.className = 'byline';
    const bits = [];
    if (item.author) bits.push(item.author);
    if (item.dynasty) bits.push(item.dynasty);
    if (item.rhythmic && item.rhythmic !== item.title) bits.push(item.rhythmic);
    byline.textContent = bits.join(' · ');
    paper.appendChild(byline);
  }

  const body = document.createElement('div');
  body.className = 'body';
  const groups = Array.isArray(item.stanzas) && item.stanzas.length ? item.stanzas : item.lines.map(l => [l]);
  for (const group of groups) {
    for (const seg of wrapStanza(group.join(''), cap)) {
      const s = document.createElement('span');
      s.className = 'clause';
      s.textContent = seg;
      body.appendChild(s);
    }
  }
  paper.appendChild(body);

  if (item.note && settings.showNote !== false) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = item.note;
    paper.appendChild(note);
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

function fitHeight(card, maxHeight) {
  const paper = card.querySelector('.paper');
  paper.style.height = 'auto';
  const natural = maxColumnHeight(paper);
  paper.style.height = `${Math.min(Math.max(Math.ceil(natural), 180), maxHeight)}px`;
}

/** 列数多、横向放不下时收紧列距（0.9em → 最低 0.08em） */
function fitColumns(card, maxWidth = 560) {
  const paper = card.querySelector('.paper');
  const body = paper.querySelector('.body');
  if (!body) return;
  const clauses = body.querySelectorAll('.clause').length;
  const fs = parseFloat(getComputedStyle(body).fontSize) || 19;
  let gap = 0.9;
  paper.style.setProperty('--col-gap', `${gap}em`);
  for (let i = 0; i < 4; i++) {
    const width = paper.scrollWidth;
    if (width <= maxWidth) break;
    const over = width - maxWidth;
    gap = Math.max(0.08, gap - over / (fs * Math.max(clauses, 1)));
    paper.style.setProperty('--col-gap', `${gap}em`);
  }
}

export function renderPoem(card, item, settings, opts = {}) {
  card.dataset.orient = settings.orient;
  card.dataset.size = sizeOf(item);
  card.style.setProperty('--align', settings.align || 'center');

  const paperEl = card.querySelector('.paper');
  paperEl.style.width = '';

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
  }

  return { title: paper.querySelector('.title'), note: paper.querySelector('.note') };
}

export function plainText(item) {
  const head = [item.title, [item.author, item.dynasty].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  return `${head}\n\n${item.lines.join('\n')}\n\n—— ${item.collection || ''}`.trim();
}
