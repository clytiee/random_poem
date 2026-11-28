import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('scripts/juemiao-raw.json', 'utf8'));

const VARS = [['馀', '余'], ['翦', '剪'], ['沈', '沉'], ['疎', '疏'], ['鎡', '镃'], ['惟', '维'], ['枏', '楠'], ['颺', '扬'], ['鞓', '鞓']];
const normalizeVars = s => VARS.reduce((acc, [a, b]) => acc.split(a).join(b), s);

const norm = s => normalizeVars(String(s || '').replace(/[\s，。；：？！、…·—（）()《》“”‘’"'・]/g, ''));

const all = [];
const byAuthor = new Map();
for (const f of fs.readdirSync('extension/data/songci')) {
  if (!f.endsWith('.ndjson')) continue;
  for (const line of fs.readFileSync('extension/data/songci/' + f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const it = JSON.parse(line);
    all.push(it);
    if (!byAuthor.has(it.author)) byAuthor.set(it.author, []);
    byAuthor.get(it.author).push(it);
  }
}

function sim(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 99;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  if (p >= 4) return p;
  // 库里首句只有前几字（按句切分导致），开头一致即可认
  if (b.length <= 5 && b.length >= 3 && a.startsWith(b)) return 20;
  if (a.length <= 5 && a.length >= 3 && b.startsWith(a)) return 20;
  if (a.length >= 8 && b.length >= 8 && (b.includes(a.slice(0, 8)) || a.includes(b.slice(0, 8)))) return 8;
  return p;
}

const hits = new Map();  // id -> {hit, raws[]}
const missed = [];
for (const r of raw) {
  const head = norm(r.lines[0]);
  if (!head) { missed.push(r); continue; }
  let best = null, bestScore = 0;
  for (const it of byAuthor.get(r.author) || []) {
    const s = sim(head, norm(it.lines[0]));
    if (s > bestScore) { bestScore = s; best = it; }
  }
  if (!best || bestScore < 4) {
    // 全库兜底：作者名有异体（蔡枏/蔡楠、张鎡/张镃、孙维信/孙惟信），靠首句唯一性找
    let gBest = null, gScore = 0, tie = 0;
    for (const it of all) {
      const s = sim(head, norm(it.lines[0]));
      if (s > gScore) { gScore = s; gBest = it; tie = 1; }
      else if (s === gScore && s > 0) tie++;
    }
    if (gScore >= 4 && tie === 1) { best = gBest; bestScore = gScore; }
    else best = null;
  }
  if (best) {
    const rec = hits.get(best.id) || { hit: best, raws: [] };
    rec.raws.push(r);
    hits.set(best.id, rec);
  } else missed.push(r);
}

console.log(`解析条目 ${raw.length}，命中去重 ${hits.size}，未匹配 ${missed.length}`);
console.log('\n低置信（靠全库兜底或同作者弱匹配）抽查:');
let n = 0;
for (const [id, rec] of hits) {
  const head = norm(rec.raws[0].lines[0]);
  const s = sim(head, norm(rec.hit.lines[0]));
  if (s < 20 && n++ < 14) {
    console.log(`  ${rec.raws[0].author} | ${rec.raws[0].title} -> ${rec.hit.author}/${rec.hit.title}`);
    console.log(`     源: ${rec.raws[0].lines[0].slice(0, 26)}`);
    console.log(`     库: ${rec.hit.lines[0].slice(0, 26)}`);
  }
}
console.log('\n未匹配样例:');
for (const m of missed.slice(0, 15)) console.log(`  ${m.author} | ${m.title} | ${m.lines[0].slice(0, 26)}`);
fs.writeFileSync('scripts/juemiao-matched.json', JSON.stringify([...hits.keys()], null, 0), 'utf8');


