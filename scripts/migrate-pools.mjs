#!/usr/bin/env node
// 从已构建分片重组池子（源数据目录缺失时用）：
//   - core：剔除「纳兰词」，重新分片
//   - 按 profiles.json 里带 authors 的池，从「全宋词」分片抽该作者的作品
// 用法：node scripts/migrate-pools.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles.json'), 'utf8'));
const OUT_ROOT = path.join(ROOT, 'extension', 'data');
const SIZE = CONFIG.shardSize || 200;

function readPool(key) {
  const dir = path.join(OUT_ROOT, key);
  const items = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.ndjson')) continue;
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (line.trim()) items.push(JSON.parse(line));
    }
  }
  return items;
}

function writePool(pool, items) {
  const dir = path.join(OUT_ROOT, pool.key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const shards = [];
  for (let i = 0; i < items.length; i += SIZE) {
    const name = `shard-${String(Math.floor(i / SIZE)).padStart(3, '0')}.ndjson`;
    const body = items.slice(i, i + SIZE).map(it => JSON.stringify(it)).join('\n');
    fs.writeFileSync(path.join(dir, name), body + '\n', 'utf8');
    shards.push(`${pool.key}/${name}`);
  }
  const collections = {};
  for (const it of items) collections[it.collection] = (collections[it.collection] || 0) + 1;
  return { key: pool.key, label: pool.label, enabled: pool.enabled, count: items.length, shards, collections };
}

const oldIndex = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, 'index.json'), 'utf8'));
const songci = readPool('songci');
const meta = new Map();

// core：剔除纳兰词
const coreCfg = CONFIG.pools.find(p => p.key === 'core');
const coreItems = readPool('core').filter(it => it.collection !== '纳兰词');
meta.set('core', writePool(coreCfg, coreItems));

// 作者池：从全宋词里按作者抽
for (const pool of CONFIG.pools) {
  if (!pool.authors) continue;
  const want = new Set(pool.authors);
  const items = songci.filter(it => want.has(it.author));
  meta.set(pool.key, writePool(pool, items));
}

// 其余池沿用旧元数据
for (const p of oldIndex.pools) if (!meta.has(p.key)) meta.set(p.key, p);

const pools = CONFIG.pools.map(p => meta.get(p.key)).filter(Boolean);
const index = {
  version: 1,
  builtAt: new Date().toISOString(),
  shardSize: SIZE,
  total: pools.reduce((s, p) => s + p.count, 0),
  pools,
};
fs.writeFileSync(path.join(OUT_ROOT, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
console.log(pools.map(p => `${p.key}: ${p.count} 首 / ${p.shards.length} 片`).join('\n'));
console.log(`总计 ${index.total} 首`);
