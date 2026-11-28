export const DEFAULT_SETTINGS = {
  pools: {
    core: true,
    tang: false,
    songci: false,
    su_shi: true,
    ouyang_xiu: true,
    xin_qiji: true,
    yan_jidao: true,
    wu_wenying: true,
  },
  orient: 'v',          // 'h' 横排 | 'v' 竖排
  style: 'paper',       // 'paper' 宣纸 | 'minimal' 极简
  darkMode: 'auto',     // 'auto' 跟随系统 | 'light' | 'dark'
  bg: 'none',           // 背景图 key，'none' 为无
  bgImage: '',          // 自定义背景图（dataURL），空为无
  fontBody: '',         // 空 = 使用默认字体栈
  fontTitle: '',
  fontSizeBody: 0,      // 0 = 按卡片档位自动
  fontSizeTitle: 0,
  lineHeight: 0,         // 正文行高，0 = 按版式默认（竖排 2.2 / 横排 2.05）
  excludeDays: 14,      // 最近 N 天出现过的诗不再随机到，0 = 不限
  align: 'center',      // 'center' | 'left'
  vAlign: 'start',      // 竖排整块的垂直对齐：'start' 靠上 | 'center' 垂直居中
  // 整页（展开模式）独立的版式：留空 = 跟随上面这组全局默认
  fullFontBody: '',
  fullFontTitle: '',
  fullFontSizeBody: 0,
  fullFontSizeTitle: 0,
  fullLineHeight: 0,
  fullVAlign: '',
  shotDownload: true,    // 截图时保存 PNG 到下载目录
  shotClipboard: false,  // 截图时同时复制到剪贴板
  showNote: true,
  showMeta: true,
};

export const HISTORY_LIMIT = 5000;

const KEYS = { settings: 'settings', history: 'history', favorites: 'favorites' };

async function get(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
async function set(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

export async function getSettings() {
  const data = await get([KEYS.settings]);
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}), pools: { ...DEFAULT_SETTINGS.pools, ...((data.settings || {}).pools || {}) } };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch, pools: { ...current.pools, ...(patch.pools || {}) } };
  await set({ [KEYS.settings]: next });
  return next;
}

export async function getHistory() {
  const data = await get([KEYS.history]);
  return data.history || [];
}

function slim(item) {
  return {
    id: item.id,
    title: item.title,
    author: item.author,
    dynasty: item.dynasty,
    genre: item.genre,
    collection: item.collection,
    rhythmic: item.rhythmic,
    note: item.note,
    lines: item.lines,
    stanzas: item.stanzas,
  };
}

/** 追加历史：同 id 去重并置顶，超过上限截断 */
export async function pushHistory(item) {
  const list = await getHistory();
  const rest = list.filter(x => x.id !== item.id);
  rest.unshift({ ...slim(item), ts: Date.now() });
  const trimmed = rest.slice(0, HISTORY_LIMIT);
  await set({ [KEYS.history]: trimmed });
  return trimmed;
}

/** 最近 days 天内出现过的诗 id 集合；days <= 0 时返回空集 */
export function recentIds(history, days) {
  const out = new Set();
  const span = Number(days) || 0;
  if (span <= 0) return out;
  const cutoff = Date.now() - span * 24 * 60 * 60 * 1000;
  for (const h of history) {
    if (!h || !h.id) continue;
    if (!h.ts || h.ts >= cutoff) out.add(h.id);
  }
  return out;
}

export async function getFavorites() {
  const data = await get([KEYS.favorites]);
  return data.favorites || [];
}

export async function toggleFavorite(item) {
  const list = await getFavorites();
  const exists = list.some(x => x.id === item.id);
  const next = exists ? list.filter(x => x.id !== item.id) : [{ ...slim(item), ts: Date.now() }, ...list];
  await set({ [KEYS.favorites]: next });
  return { list: next, added: !exists };
}

export async function isFavorite(id) {
  const list = await getFavorites();
  return list.some(x => x.id === id);
}

export async function clearHistory() {
  await set({ [KEYS.history]: [] });
}
