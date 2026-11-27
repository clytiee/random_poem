# 随机诗文

点一下工具栏图标，随机读一首古诗词。宣纸质感、竖排古籍、本机字体、深色夜读，都是可调的。

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
| core（默认启用） | 唐诗三百首、宋词三百首、千家诗、诗经、楚辞、纳兰词、水墨唐诗 | 1579 |
| tang（默认关闭） | 全唐诗 | 57432 |
| songci（默认关闭） | 全宋词 | 20996 |

繁体来源统一转简体，同池内按“标题+作者+首句”去重，超过 40 行的长诗不进池。构建时按 200 首一片切分，运行时只随机取一片，不加载全量。

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
