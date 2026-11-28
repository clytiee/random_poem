import fs from 'node:fs';

const DATA = 'extension/data';
const pages = [48503, 48504, 48505, 48506, 48507, 48508, 48509];

// 1) 词牌集合（来自全宋词）
const titles = new Set();
for (const f of fs.readdirSync(`${DATA}/songci`)) {
  if (!f.endsWith('.ndjson')) continue;
  for (const line of fs.readFileSync(`${DATA}/songci/${f}`, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const it = JSON.parse(line);
    if (it.title) titles.add(it.title);
  }
}
console.log('词牌集合', titles.size);

const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim();
const isAuthorName = s => /^[\u4e00-\u9fff]{2,6}$/.test(s);
const isBio = s => s.length > 18 && /（公元|公元|字[^。]{0,6}[，、]|号[^。]{0,6}[，、]|生卒|存词|传词/.test(s);
const leadOf = s => s.split(/[.（(〔\s]/)[0].trim();

function parsePage(html) {
  const start = html.indexOf('id="content"');
  if (start < 0) return [];
  const end = html.indexOf('</div>', start);
  const body = html.slice(start, end > 0 ? end : undefined);
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map(m => decode(m[1].replace(/<[^>]+>/g, '')))
    .filter(Boolean);
  return paras;
}

function toItems(paras, vol) {
  const items = [];
  let author = '';
  let title = null;
  let buf = [];
  const flush = () => {
    if (author && title && buf.length) {
      items.push({ vol, author, title, sub: '', lines: buf.slice() });
    }
    buf = [];
  };
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    // 作者行：本身是名字，且下一段是小传
    if (isAuthorName(p) && isBio(paras[i + 1] || '')) {
      flush();
      author = p;
      title = null;
      i++; // 跳过小传
      continue;
    }
    if (isBio(p)) continue;
    const lead = leadOf(p);
    const looksTitle = titles.has(lead) || (p.length <= 8 && !/[，。？！、；：]/.test(p));
    if (looksTitle && (!title || buf.length)) {
      flush();
      title = p;
      continue;
    }
    if (title) buf.push(p);
  }
  flush();
  return items;
}

const all = [];
for (const id of pages) {
  const res = await fetch(`https://www.diancang.xyz/shicixiqu/juemiaohaoci/${id}.html`);
  const html = await res.text();
  const paras = parsePage(html);
  const items = toItems(paras, pages.indexOf(id) + 1);
  console.log(`卷${pages.indexOf(id) + 1}: ${items.length} 首（段落 ${paras.length}）`);
  all.push(...items);
}
fs.writeFileSync('scripts/juemiao-raw.json', JSON.stringify(all, null, 1), 'utf8');
console.log('合计', all.length);

