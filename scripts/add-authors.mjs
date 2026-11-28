#!/usr/bin/env node
// 把若干名家的作品并进精选集（collection = 名家名篇），每人最多 N 首、全集内均匀抽样
// 用法：node scripts/add-authors.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';

const DATA = 'extension/data';
const SIZE = 200;
const PER_AUTHOR = 60;

const AUTHORS = [
  '李清照', '柳永', '范仲淹', '晏殊', '姜夔', '周邦彦', '岳飞', '文天祥', '蒋捷',
  '李煜', '王维', '温庭筠', '岑参', '高适', '韦庄', '薛涛', '冯延巳', '李璟',
];

function readPool(key) {
  const dir = `${DATA}/${key}`;
  const items = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.ndjson')) continue;
    for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
      if (line.trim()) items.push(JSON.parse(line));
    }
  }
  return items;
}

/** 均匀抽样：按步长取，保证覆盖全集不同阶段 */
function sample(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
    return out;
}

const core = readPool('core');
const ids = new Set(core.map(it => it.id));
const keys = new Set(core.map(it => `${it.title}|${it.author}|${it.lines[0]}`));

const pools = { songci: readPool('songci'), tang: readPool('tang') };
const report = [];
let added = 0, dup = 0;

for (const author of AUTHORS) {
    const songs = pools.songci.filter(it => it.author === author);
    const poems = pools.tang.filter(it => it.author === author);
    const picked = sample([...songs, ...poems], PER_AUTHOR);
    let a = 0;
    for (const it of picked) {
        const key = `${it.title}|${it.author}|${it.lines[0]}`;
        if (ids.has(it.id) || keys.has(key)) { dup++; continue; }
        core.push({ ...it, collection: '名家名篇' });
        ids.add(it.id);
        keys.add(key);
        added++; a++;
    }
    report.push(`${author}: 库内 ${songs.length} 词 + ${poems.length} 诗，并入 ${a}`);
}

console.log(report.join('\n'));
console.log(`\n合计并入 ${added} 首，与精选已有重复 ${dup} 首`);

const dir = `${DATA}/core`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const shards = [];
for (let i = 0; i < core.length; i += SIZE) {
  const name = `shard-${String(Math.floor(i / SIZE)).padStart(3, '0')}.ndjson`;
  fs.writeFileSync(`${dir}/${name}`, core.slice(i, i + SIZE).map(it => JSON.stringify(it)).join('\n') + '\n', 'utf8');
  shards.push(`core/${name}`);
}
const collections = {};
for (const it of core) collections[it.collection] = (collections[it.collection] || 0) + 1;

const indexPath = `${DATA}/index.json`;
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const coreMeta = index.pools.find(p => p.key === 'core');
coreMeta.count = core.length;
coreMeta.shards = shards;
coreMeta.collections = collections;
index.builtAt = new Date().toISOString();
index.total = index.pools.reduce((s, p) => s + p.count, 0);
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
console.log(`精选集合计 ${core.length} 首 / ${shards.length} 片`);
console.log(JSON.stringify(collections, null, 0));
