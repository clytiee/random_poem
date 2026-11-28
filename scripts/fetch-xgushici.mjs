// 抓取 xgushiciw.com 作者全集页（is_detail=true 每页 100 条）
import fs from 'node:fs';

const AUTHORS = [
  ['陶渊明', 'tao-yuan-ming'],
  ['曹丕', 'cao-pi'],
  ['曹植', 'cao-zhi'],
  ['谢道韫', 'xie-dao-yun'],
];

const strip = s => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

function parseCards(html) {
  const out = [];
  const blocks = html.split('<div class="card container border mb-3 p-3 data-card">').slice(1);
  for (const raw of blocks) {
    const b = raw.slice(0, raw.indexOf('</div> <div class="card') === -1 ? undefined : raw.indexOf('</div> <div class="card'));
    const title = strip((b.match(/<b>([\s\S]*?)<\/b>/) || [])[1] || '');
    if (!title) continue;
    // 正文：卡片内 <p> 序列，跳过含「」注释? 这里整段收
    const ps = [...b.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => strip(m[1])).filter(x => x && !/^[（(]/.test(x));
    if (!ps.length) continue;
    out.push({ title, lines: ps });
  }
  return out;
}

const all = [];
for (const [author, slug] of AUTHORS) {
  let got = new Map();
  for (let page = 1; page <= 8; page++) {
    const url = `https://xgushiciw.com/poems?author=${slug}&is_detail=true${page > 1 ? `&page=${page}` : ''}`;
    let text = null;
    for (let t = 0; t < 4 && text === null; t++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
        if (res.ok) text = await res.text();
        else if (res.status === 404) { text = ''; }
      } catch (e) { await new Promise(r => setTimeout(r, 1500 + t * 1500)); }
    }
    if (text === null) { console.log('  ', page, '抓取失败'); break; }
    const cards = parseCards(text);
    await new Promise(r => setTimeout(r, 800));
    let added = 0;
    for (const c of cards) {
      const k = c.title + '|' + c.lines[0];
      if (got.has(k)) continue;
      got.set(k, c); added++;
    }
    console.log(`${author} 第 ${page} 页：${cards.length} 条，新增 ${added}，累计 ${got.size}`);
    if (!cards.length || added === 0) break;
  }
  for (const c of got.values()) all.push({ author, ...c });
}

fs.writeFileSync('scripts/xgushici-raw.json', JSON.stringify(all, null, 1), 'utf8');
console.log('总计', all.length, '首');
console.log('样例:', JSON.stringify(all.find(x => x.author === '陶渊明'), null, 1));
