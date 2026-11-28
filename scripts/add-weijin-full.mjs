#!/usr/bin/env node
// 用 xgushiciw.com 作者全集补齐魏晋四家（每人最多 60 首）并入精选集
// 依赖 scripts/fetch-xgushici.mjs 生成的 scripts/xgushici-raw.json
// 用法：node scripts/add-weijin-full.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';

const DATA = 'extension/data';
const SIZE = 200;
const PER_AUTHOR = 60;
const COLLECTION = '名家名篇';

const DYNASTY = { 陶渊明: '晋', 曹丕: '魏', 曹植: '魏', 谢道韫: '晋' };

/** 去掉校勘括注，如“（间隔 一作：隔绝）” */
const clean = s => s
  .replace(/[（(][^（）()]{1,30}(一作|一曰|同|或作|一作：)[^（）()]{0,20}[）)]/g, '')
  .replace(/[（(][^（）()]{1,20}[）)]$/g, '')
  .trim();

const splitClauses = line => line.split(/(?<=[。，；：？！])/).map(s => s.trim()).filter(Boolean);

/** 散文类体裁，竖排排版不适合，跳过 */
const PROSE_SUFFIX = /(记|传|赋|序|表|书|赞|诔|祭文|辞|论|说|疏|启|笺|碑|铭|颂|赞)$/;

function makeItem({ title, author, paragraphs }) {
  const stanzas = paragraphs.map(splitClauses).filter(g => g.length);
  const lines = stanzas.flat();
  if (!lines.length) return null;
  const text = lines.join('');
  if (text.length > 480) return null;            // 长文过滤
  if (PROSE_SUFFIX.test(title)) return null;     // 散文体裁
  return {
    id: crypto.createHash('sha1').update(`${COLLECTION}|${title}|${author}|${lines[0]}`).digest('hex').slice(0, 10),
    title, author, dynasty: DYNASTY[author] || '', genre: '诗', collection: COLLECTION,
    lines, stanzas,
  };
}

const raw = JSON.parse(fs.readFileSync('scripts/xgushici-raw.json', 'utf8'));

const collect = [];
for (const r of raw) {
  const paragraphs = r.lines.map(clean).filter(Boolean);
  const item = makeItem({ title: clean(r.title), author: r.author, paragraphs });
  if (item) collect.push(item);
}

function sample(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

function readPool(key) {
  const dir = `${DATA}/${key}`;
  const items = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.ndjson')) continue;
    for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) if (line.trim()) items.push(JSON.parse(line));
  }
  return items;
}

const core = readPool('core');
// 幂等：先移除本任务此前为这四位并入的条目，再按上限统一重入
const removedOld = [];
const kept = core.filter(it => {
  const take = it.collection === COLLECTION && DYNASTY[it.author];
  if (take) removedOld.push(it);
  return !take;
});
core.length = 0;
core.push(...kept);
if (removedOld.length) console.log(`移除旧的同名条目 ${removedOld.length} 首`);

const ids = new Set(core.map(it => it.id));
const keys = new Set(core.map(it => `${it.title}|${it.author}|${it.lines[0]}`));
let added = 0, dup = 0, skipped = 0;
const byAuthor = {};
const pool = {};

for (const r of raw) pool[r.author] = (pool[r.author] || 0) + 1;

for (const author of Object.keys(DYNASTY)) {
  const mine = collect.filter(it => it.author === author);
  skipped += (pool[author] || 0) - mine.length;
  const picked = sample(mine, PER_AUTHOR);
  let n = 0;
  for (const it of picked) {
    const k = `${it.title}|${it.author}|${it.lines[0]}`;
    if (ids.has(it.id) || keys.has(k)) { dup++; continue; }
    core.push(it);
    ids.add(it.id);
    keys.add(k);
    added++; n++;
  }
  byAuthor[author] = n;
}

console.log(`抓取可用 ${collect.length} 首（过滤散文 ${skipped} 条），并入 ${added} 首，重复 ${dup} 首`);
console.log('每位并入：', byAuthor);

// 写回分片与索引
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
