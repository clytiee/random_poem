#!/usr/bin/env node
// 构建脚本：把 chinese-poetry 的异构 JSON 归一化为扩展可直接消费的 NDJSON 分片。
// 用法：node scripts/build.mjs [--pool=core|tang|songci|all] [--list]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OpenCC = require('opencc-js');
const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles.json'), 'utf8'));
const SRC_ROOT = path.resolve(ROOT, CONFIG.sources.chinesePoetry);
const OUT_ROOT = path.join(ROOT, 'extension', 'data');

const args = process.argv.slice(2);
const onlyPool = (args.find(a => a.startsWith('--pool=')) || '').split('=')[1] || 'all';

function readJson(rel) {
  const p = path.join(SRC_ROOT, rel);
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

/** 在句读处断句：。 ， ； ： ？ ！ 后切分，标点保留在句尾；顿号不切 */
function splitClauses(line) {
  return line.split(/(?<=[。，；：？！])/).map(s => s.trim()).filter(Boolean);
}

function cleanLines(arr) {
  const raw = (arr || []).map(s => toSimplified(String(s || '').trim())).filter(Boolean);
  return raw.flatMap(splitClauses);
}

function titleOf(s) {
  return toSimplified(String(s || '').trim());
}

function makeItem(base) {
  const raw = (base.lines || []).map(s => toSimplified(String(s || '').trim())).filter(Boolean);
  if (!raw.length) return null;
  // 原始段落先切成分句，但保留段落分组（一联一组），渲染时按组排布
  const stanzas = raw.map(splitClauses).map(g => g.filter(Boolean)).filter(g => g.length);
  const lines = stanzas.flat();
  const rules = CONFIG.rules;
  if (rules.maxLines && lines.length > rules.maxLines) return null;
  const title = titleOf(base.title) || toSimplified(lines[0].slice(0, 12));
  const author = toSimplified(String(base.author || '').trim());
  const key = `${base.collection}|${title}|${author}|${lines[0]}`;
  return {
    id: crypto.createHash('sha1').update(key).digest('hex').slice(0, 10),
    title,
    author,
    dynasty: base.dynasty || '',
    genre: base.genre || '诗',
    collection: base.collection || '',
    rhythmic: base.rhythmic ? toSimplified(base.rhythmic) : undefined,
    tags: base.tags && base.tags.length ? base.tags.map(titleOf) : undefined,
    note: base.note ? toSimplified(base.note) : undefined,
    lines,
    stanzas,
  };
}

// —— 各来源的适配器：输出统一的 base 结构 ——
const adapters = {
  // 唐诗三百首：author / paragraphs / title / tags（繁体）
  tang300(root, cfg) {
    return root.map(x => ({
      title: x.title, author: x.author, lines: x.paragraphs, tags: x.tags,
      collection: cfg.collection, dynasty: cfg.dynasty, genre: cfg.genre,
    }));
  },
  // 宋词三百首：author / paragraphs / rhythmic（简体）
  songci300(root, cfg) {
    return root.map(x => ({
      title: x.rhythmic, rhythmic: x.rhythmic, author: x.author, lines: x.paragraphs,
      collection: cfg.collection, dynasty: cfg.dynasty, genre: cfg.genre,
    }));
  },
  // 千家诗：{content:[{type, content:[{chapter, author:"（唐）孟浩然", paragraphs}]}]}
  qianjiashi(root, cfg) {
    const out = [];
    for (const group of root.content || []) {
      for (const p of group.content || []) {
        const rawAuthor = String(p.author || '');
        const m = rawAuthor.match(/^[（(]([^）)]*)[）)]\s*(.*)$/);
        const dynasty = m ? toSimplified(m[1]) : cfg.dynasty;
        const author = m ? m[2] : rawAuthor;
        out.push({
          title: p.chapter, author, lines: p.paragraphs,
          collection: cfg.collection, dynasty,
          genre: toSimplified(group.type || cfg.genre),
        });
      }
    }
    return out;
  },
  shijing(root, cfg) {
    return root.map(x => ({
      title: x.title, author: '', lines: x.content,
      collection: cfg.collection, dynasty: cfg.dynasty, genre: cfg.genre,
      note: [x.chapter, x.section].filter(Boolean).join(' · '),
    }));
  },
  chuci(root, cfg) {
    return root.map(x => ({
      title: x.title, author: x.author, lines: x.content,
      collection: cfg.collection, dynasty: cfg.dynasty, genre: cfg.genre,
      note: x.section,
    }));
  },
  // 纳兰性德：title / para / author
  nalan(root, cfg) {
    return root.map(x => ({
      title: x.title, author: x.author, lines: x.para,
      rhythmic: String(x.title || '').split('·')[0],
      collection: cfg.collection, dynasty: cfg.dynasty, genre: cfg.genre,
    }));
  },
  // 水墨唐诗：author / title / paragraphs / prologue（prologue 是赏析）
  shuimo(root, cfg) {
    return root.map(x => ({
      title: x.title, author: x.author, lines: x.paragraphs, note: x.prologue,
      collection: cfg.collection, dynasty: cfg.dynasty, genre: cfg.genre,
    }));
  },
  // 全唐诗 poet.tang.N.json
  poet(root, cfg) {
    return root.map(x => ({
      title: x.title, author: x.author, lines: x.paragraphs,
      collection: cfg.collection, dynasty: cfg.dynasty, genre: cfg.genre,
    }));
  },
  // 全宋词 ci.song.N.json
  ci(root, cfg) {
    return root.map(x => ({
      title: x.rhythmic, rhythmic: x.rhythmic, author: x.author, lines: x.paragraphs,
      collection: cfg.collection, dynasty: cfg.dynasty, genre: cfg.genre,
    }));
  },
};

function matchGlob(pattern) {
  const [dirPart, filePattern] = pattern.split('/');
  const dir = path.join(SRC_ROOT, dirPart);
  const re = new RegExp('^' + filePattern.replace(/\./g, '\\.').replace(/\*/g, '\\d+') + '$');
  return fs.readdirSync(dir).filter(f => re.test(f)).sort();
}

function collectPool(pool) {
  const items = [];
  if (pool.collections) {
    for (const cfg of pool.collections) {
      const adapter = adapters[cfg.adapter];
      if (!adapter) throw new Error(`未知 adapter: ${cfg.adapter}`);
      const raw = readJson(cfg.file);
      for (const base of adapter(raw, cfg)) {
        const item = makeItem(base);
        if (item) items.push(item);
      }
    }
  } else if (pool.glob) {
    const adapter = adapters[pool.adapter];
    for (const file of matchGlob(pool.glob)) {
      const raw = readJson(`${pool.glob.split('/')[0]}/${file}`);
      for (const base of adapter(raw, pool)) {
        const item = makeItem(base);
        if (item) items.push(item);
      }
    }
  }
  if (CONFIG.rules.dedupe) {
    const seen = new Set();
    return items.filter(it => {
      const k = `${it.title}|${it.author}|${it.lines[0]}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return items;
}

function writePool(pool, items) {
  const dir = path.join(OUT_ROOT, pool.key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const size = CONFIG.shardSize || 200;
  const shards = [];
  for (let i = 0; i < items.length; i += size) {
    const name = `shard-${String(Math.floor(i / size)).padStart(3, '0')}.ndjson`;
    const body = items.slice(i, i + size).map(it => JSON.stringify(it)).join('\n');
    fs.writeFileSync(path.join(dir, name), body + '\n', 'utf8');
    shards.push(`${pool.key}/${name}`);
  }
  const byCollection = {};
  for (const it of items) byCollection[it.collection] = (byCollection[it.collection] || 0) + 1;
  return {
    key: pool.key,
    label: pool.label,
    enabled: pool.enabled,
    count: items.length,
    shards,
    collections: byCollection,
  };
}

function main() {
  if (!fs.existsSync(SRC_ROOT)) {
    console.error(`数据源不存在：${SRC_ROOT}\n请修改 profiles.json 里的 sources.chinesePoetry`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const pools = [];
  const t0 = Date.now();
  for (const pool of CONFIG.pools) {
    if (onlyPool !== 'all' && pool.key !== onlyPool) continue;
    process.stdout.write(`构建 ${pool.key} (${pool.label}) ... `);
    const items = collectPool(pool);
    const meta = writePool(pool, items);
    pools.push(meta);
    console.log(`${meta.count} 首 / ${meta.shards.length} 片 ; ${JSON.stringify(meta.collections)}`);
  }
  const oldIndexPath = path.join(OUT_ROOT, 'index.json');
  let mergedPools = pools;
  if (onlyPool !== 'all' && fs.existsSync(oldIndexPath)) {
    const old = JSON.parse(fs.readFileSync(oldIndexPath, 'utf8'));
    mergedPools = old.pools.map(p => pools.find(np => np.key === p.key) || p);
  }
  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    shardSize: CONFIG.shardSize,
    total: mergedPools.reduce((s, p) => s + p.count, 0),
    pools: mergedPools,
  };
  fs.writeFileSync(oldIndexPath, JSON.stringify(index, null, 2), 'utf8');
  console.log(`\n完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s，总计 ${index.total} 首`);
}

main();
