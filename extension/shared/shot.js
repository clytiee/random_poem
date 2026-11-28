/**
 * 把纸面逐字绘制到 canvas（只含纸面，不含任何按钮），再按设置导出 PNG / 复制到剪贴板。
 * popup 与整页共用。
 */
export async function shootPaper(card, title, settings) {
  const paper = card.querySelector('.paper');

  // 竖排内容会横向滚动，先把纸面临时展开到全文尺寸，否则只截到可见视口
  const savedW = paper.style.width;
  const savedOverflow = paper.style.overflowX;
  const savedCardW = card.style.width;
  paper.style.width = 'max-content';
  paper.style.overflowX = 'visible';
  card.style.width = 'max-content';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const rect = paper.getBoundingClientRect();
  const restore = () => {
    paper.style.width = savedW;
    paper.style.overflowX = savedOverflow;
    card.style.width = savedCardW;
  };
  if (rect.width < 2 || rect.height < 2) { restore(); return false; }

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = getComputedStyle(paper).backgroundColor || '#fff';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const range = document.createRange();
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue || '';
    const parent = node.parentElement;
    if (text.trim() && parent) {
      const style = getComputedStyle(parent);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        ctx.fillStyle = style.color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        let pos = 0;
        for (const ch of text) {
          const len = ch.length;
          if (ch !== '\n' && ch !== '\t' && ch !== ' ') {
            range.setStart(node, pos);
            range.setEnd(node, pos + len);
            const r = range.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              ctx.fillText(ch, r.left - rect.left + r.width / 2, r.top - rect.top + r.height / 2);
            }
          }
          pos += len;
        }
      }
    }
    node = walker.nextNode();
  }
  restore();

  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('画布导出为空');

  const wantClip = settings.shotClipboard === true;
  const wantDownload = settings.shotDownload !== false || !wantClip;
  const done = [];

  if (wantClip) {
    if (!navigator.clipboard?.write) throw new Error('当前环境不支持写剪贴板');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    done.push('已复制到剪贴板');
  }

  if (wantDownload) {
    if (!chrome.downloads) throw new Error('缺少 downloads 权限，请重新加载扩展');
    const url = URL.createObjectURL(blob);
    const safe = String(title || '诗文').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    await chrome.downloads.download({ url, filename: `诗文-${safe}.png`, saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    done.push('已保存图片');
  }

  return done.join('，');
}
