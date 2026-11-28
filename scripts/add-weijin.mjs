#!/usr/bin/env node
// 从网络补齐魏晋五家（陶渊明、曹操、曹丕、曹植、谢道韫）并入精选集
// 用法：node scripts/add-weijin.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OpenCC = require('opencc-js');
const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' });

const DATA = 'extension/data';
const SIZE = 200;
const PER_AUTHOR = 60;

const decode = s => toSimplified(String(s || '')
  .replace(/&middot;/g, '·').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
  .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
  .replace(/<[^>]+>/g, '')).trim();

const splitClauses = line => line.split(/(?<=[。，；：？！])/).map(s => s.trim()).filter(Boolean);

function makeItem({ title, author, dynasty, genre, paragraphs, collection }) {
  const stanzas = paragraphs.map(splitClauses).filter(g => g.length);
  const lines = stanzas.flat();
  if (!lines.length) return null;
  return {
    id: crypto.createHash('sha1').update(`${collection}|${title}|${author}|${lines[0]}`).digest('hex').slice(0, 10),
    title, author, dynasty, genre, collection,
    lines, stanzas,
  };
}

/** 抓唐诗宋词网的作者页（?page=N），页面结构为 li>div.text>h3.title + div.summary>p */
async function grabAuthor(slug) {
  const seen = new Set();
  const out = [];
  for (let page = 1; page <= 12; page++) {
    const url = `https://www.tangshisongci.net/author/${slug}/?page=${page}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) break;
    const html = await res.text();
    const lis = [...html.matchAll(/<li><div class="text">[\s\S]*?<\/li>/g)];
    let fresh = 0;
    for (const li of lis) {
      const seg = li[0];
      const t = seg.match(/title="([^"]*)"/);
      if (!t) continue;
      const title = decode(t[1]);
      const paragraphs = [...seg.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => decode(x[1])).filter(Boolean);
      const key = `${title}|${paragraphs[0] || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title, paragraphs });
      fresh++;
    }
    console.log(`  ${slug} 第 ${page} 页：${lis.length} 条，新增 ${fresh}`);
    if (!fresh) break;
  }
  return out;
}

const plan = [
  { author: '陶渊明', dynasty: '晋', slug: 'taoyuanming' },
  { author: '曹丕', dynasty: '魏', slug: 'caopi' },
  { author: '曹植', dynasty: '魏', slug: 'caozhi' },
  { author: '谢道韫', dynasty: '晋', slug: 'xiedaowen' },
];

const collect = [];
for (const { author, dynasty, slug } of plan) {
  console.log(`抓取 ${author}`);
  const raws = await grabAuthor(slug);
  for (const r of raws) {
    const item = makeItem({ title: r.title, author, dynasty, genre: '诗', paragraphs: r.paragraphs, collection: '名家名篇' });
    if (item) collect.push({ ...item, sourceAuthor: author });
  }
}

// 曹操：chinese-poetry 的曹操诗集
const cao = await (await fetch('https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master/' +
  encodeURIComponent('曹操诗集/caocao.json'))).json();
for (const x of cao) {
  const item = makeItem({
    title: decode(x.title), author: '曹操', dynasty: '魏', genre: '诗',
    paragraphs: (x.paragraphs || []).map(decode), collection: '名家名篇',
  });
  if (item) collect.push({ ...item, sourceAuthor: '曹操' });
}

// 均匀抽样
function sample(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

// 并入 core
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
const ids = new Set(core.map(it => it.id));
const keys = new Set(core.map(it => `${it.title}|${it.author}|${it.lines[0]}`));
let added = 0, dup = 0;
const byAuthor = new Map(plan.map(p => [p.author, 0]));

// 每位作者单独抽样到 PER_AUTHOR 首
for (const author of [...plan.map(p => p.author), '曹操']) {
  const mine = collect.filter(it => it.author === author);
  for (const it of sample(mine, PER_AUTHOR)) {
    const k = `${it.title}|${it.author}|${it.lines[0]}`;
    if (ids.has(it.id) || keys.has(k)) { dup++; continue; }
    const { sourceAuthor, ...rest } = it;
    core.push(rest);
    ids.add(it.id);
    keys.add(k);
    added++;
    byAuthor.set(author, (byAuthor.get(author) || 0) + 1);
  }
}
console.log(`\n并入 ${added} 首，重复 ${dup} 首`, Object.fromEntries(byAuthor));

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
