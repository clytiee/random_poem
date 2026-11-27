let indexCache = null;
const shardCache = new Map();

export async function loadIndex() {
  if (indexCache) return indexCache;
  const res = await fetch(chrome.runtime.getURL('data/index.json'));
  indexCache = await res.json();
  return indexCache;
}

export function activePools(index, settings) {
  return index.pools.filter(p => p.count > 0 && settings.pools?.[p.key] !== false);
}

async function loadShard(relPath) {
  if (shardCache.has(relPath)) return shardCache.get(relPath);
  const res = await fetch(chrome.runtime.getURL('data/' + relPath));
  const text = await res.text();
  const items = text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  shardCache.set(relPath, items);
  return items;
}

/**
 * 随机取一首。
 * 池之间按首数加权（整体均匀），同池内先随机片、再随机首；
 * excludeIds 用于避开最近读过的，最多重试 12 次。
 */
export async function pickPoem(index, settings, excludeIds = new Set()) {
  const pools = activePools(index, settings);
  if (!pools.length) return null;
  const total = pools.reduce((s, p) => s + p.count, 0);

  for (let attempt = 0; attempt < 12; attempt++) {
    let r = Math.random() * total;
    let pool = pools[pools.length - 1];
    for (const p of pools) {
      if (r < p.count) { pool = p; break; }
      r -= p.count;
    }
    const shardPath = pool.shards[Math.floor(Math.random() * pool.shards.length)];
    const items = await loadShard(shardPath);
    if (!items.length) continue;
    const item = items[Math.floor(Math.random() * items.length)];
    if (!excludeIds.has(item.id)) return item;
  }
  // 兜底：忽略去重
  const pool = pools[0];
  const items = await loadShard(pool.shards[0]);
  return items[0] || null;
}

/** 按 id 精确找回一首（全页/历史跳转用），走索引全池扫描 */
export async function findById(index, id) {
  for (const pool of index.pools) {
    for (const shard of pool.shards) {
      const items = await loadShard(shard);
      const hit = items.find(x => x.id === id);
      if (hit) return hit;
    }
  }
  return null;
}
