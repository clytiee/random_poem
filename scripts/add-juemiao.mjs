#!/usr/bin/env node
// 把《绝妙好词》收录、且能在全宋词里对上的作品并进精选集（collection = 绝妙好词）
// 用法：node scripts/add-juemiao.mjs
import fs from 'node:fs';

const DATA = 'extension/data';
const SIZE = 200;

const matchIds = new Set(JSON.parse(fs.readFileSync('scripts/juemiao-matched.json', 'utf8')));

// 全宋词条目索引
const pool = new Map();
for (const f of fs.readdirSync(`${DATA}/songci`)) {
  if (!f.endsWith('.ndjson')) continue;
  for (const line of fs.readFileSync(`${DATA}/songci/${f}`, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const it = JSON.parse(line);
    if (matchIds.has(it.id)) pool.set(it.id, it);
  }
}

// 现有精选集
const core = [];
for (const f of fs.readdirSync(`${DATA}/core`).sort()) {
  if (!f.endsWith('.ndjson')) continue;
  for (const line of fs.readFileSync(`${DATA}/core/${f}`, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    core.push(JSON.parse(line));
  }
}

const ids = new Set(core.map(it => it.id));
const keys = new Set(core.map(it => `${it.title}|${it.author}|${it.lines[0]}`));
let added = 0, dup = 0;
for (const it of pool.values()) {
  const key = `${it.title}|${it.author}|${it.lines[0]}`;
  if (ids.has(it.id) || keys.has(key)) { dup++; continue; }
  core.push({ ...it, collection: '绝妙好词' });
  ids.add(it.id);
  keys.add(key);
  added++;
}
console.log(`绝妙好词命中 ${pool.size} 首，并入 ${added} 首，与精选集已有重复 ${dup} 首`);

// 重新分片写回 core
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

// 更新索引
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
console.log(JSON.stringify(collections));

