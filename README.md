# 随机诗文

点一下工具栏图标，随机读一首古诗词。宣纸质感、竖排古籍、本机字体、深色夜读，都是可调的。

## 截图

### 整页模式
<img width="2588" height="1888" alt="image" src="https://github.com/user-attachments/assets/05dbce3a-12c8-4b64-b008-12ab686ccd52" />

### 图标弹窗模式
<img width="746" height="735" alt="image" src="https://github.com/user-attachments/assets/45d053a2-3418-4354-a11c-92240f7b86b7" />

### 设置
<img width="1520" height="1561" alt="image" src="https://github.com/user-attachments/assets/cb0b1746-004b-4898-b628-c951689c0f2e" />
<img width="1480" height="1888" alt="image" src="https://github.com/user-attachments/assets/1a118425-96f2-416d-bd50-c24a7f61d06c" />

### 历史记录
<img width="2588" height="1888" alt="image" src="https://github.com/user-attachments/assets/1dd7019e-8114-435e-a8d2-ff710b8a0de0" />

## 目录

```
profiles.json          池子定义：哪些数据集、怎么过滤、多少首一片
scripts/build.mjs      构建流水线：异构 JSON → 统一 NDJSON 分片
extension/             插件本体（直接加载这个目录）
  data/                构建产物，index.json + <pool>/shard-NNN.ndjson
  shared/              主题、存储、随机取诗、渲染
  popup.*              弹窗小卡
  poem.*               整页视图
  settings.*           设置
  history.*            历史 / 收藏
```

## 数据

来源：[chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)（MIT）。默认只用其中被精选过的集子：

| 池 | 内容 | 首数 |
| --- | --- | --- |
| core（默认启用） | 唐诗三百首、宋词三百首、千家诗、诗经、楚辞、水墨唐诗、绝妙好词、名家名篇 | 2544 |
| su_shi 等五人词集（默认启用） | 从全宋词按作者抽出的苏轼、欧阳修、辛弃疾、晏几道、吴文英词集 | 1827 |
| tang（默认关闭） | 全唐诗 | 57410 |
| songci（默认关闭） | 全宋词 | 20889 |

作者池用 `profiles.json` 里的 `authors` 字段从全宋词过滤生成，与全宋词池共用同一批 id。

《绝妙好词》没有独立源文件，其收录作品按「作者 + 首句」与全宋词比对后并入 core（collection 记为绝妙好词）：
`node scripts/fetch-juemiao.mjs` 抓取并解析七卷 → `node scripts/match-juemiao.mjs` 对照全宋词 → `node scripts/add-juemiao.mjs` 并入精选集。
目前 371 首解析条目中 314 首在全宋词里对上，去重后并入 278 首（其余与精选集已有篇目重复或全宋词未收）。

《名家名篇》同样并入 core（collection 记为名家名篇）：23 位指定作者，每人最多 60 首，按全集步长均匀抽样。20 位在全宋词/全唐诗里有的直接用库内数据（`scripts/add-authors.mjs`）；陶渊明、曹操、曹丕、曹植、谢道韫 库内无数据，从网络补齐（`scripts/fetch-xgushici.mjs` 抓 xgushiciw.com 作者全集，`scripts/add-weijin-full.mjs` 过滤散文、转简、抽样并入）。共 967 首。

繁体来源统一转简体，同池内按“标题+作者+首句”去重，超过 40 行的长诗不进池。构建时按 200 首一片切分，运行时只随机取一片，不加载全量。

源数据目录不在本机时，可用 `node scripts/migrate-pools.mjs` 直接从未剔除前的分片重组池子。

修改 `profiles.json` 里 `sources.chinesePoetry` 指向本地仓库根目录，然后：

```bash
npm install
npm run build          # 全部池
npm run build:core     # 只重建精选集
```

## 安装

Chrome / Edge 打开 `chrome://extensions`，开启开发者模式，选“加载已解压的扩展程序”，指向仓库里的 `extension` 目录。

## 行为

- 每次点图标随机一首，并把这首诗写进历史（同首不重复占位，上限 5000 条）。
- 弹窗里的最大化按钮打开整页视图，整页不受 600px 限制，高度完全随内容。
- 赏析按钮只在有注释的条目（水墨唐诗）上出现；也可以双击标题展开。
- 收藏独立于历史保存，不随历史轮转清掉。

## 已知限制

- 竖排长诗在弹窗里会横向滚动，整页视图里也一样——这是 `vertical-rl` 的固有行为，不是 bug。
- 本机字体读取走 `queryLocalFonts()`，首次需要授权；不支持该 API 的环境可手动输入字体名。
- 背景目前是 CSS 渐变纸色，未打包位图，所以扩展体积只有几 MB。
