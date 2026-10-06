# 豆图纸 DouTuZhi

**AI 拼豆图纸生成器** — 上传任意图片，自动匹配真实豆子色号（MARD / Perler / Hama / Artkal / Nabbi），生成可打印图纸 + 配豆清单。

在线使用：https://xube1you.github.io/dou-tuzhi/

## 特点
- 🔒 **图片不上传服务器**：纯浏览器本地处理（CIEDE2000 感知色差配色 + Floyd–Steinberg 抖动 + 智能缩色）
- 🆓 免费、免注册、无广告、无埋点
- 📱 手机 / 电脑都能用，支持拖拽、粘贴（Ctrl+V）
- 🖨 一键导出：图纸 PNG、带色号 PNG、配豆清单 CSV、打印 / 存 PDF
- ⚡ 零外部依赖、零后端：只要 GitHub Pages 存在就一直可用；首次打开后离线也能用（Service Worker）
- 🧩 支持去除纯色背景（做摆件 / 钥匙扣）、自动画质优化、豆板宽度 10–220 颗

## 技术栈
原生 HTML / CSS / JavaScript，无构建、无框架、无 CDN。色板数据编译为本地 `palettes.js`。

## 目录
```
site/
├── index.html        页面
├── style.css         样式
├── app.js            核心引擎（色彩匹配 / 生成 / 导出）
├── palettes.js       色板数据（由 tools/build-palettes.py 生成）
├── palettes/         原始色板 JSON（来自 craft-color-codes）
├── sw.js             离线缓存
├── icon.svg          图标
└── manifest.webmanifest
```

## 本地运行
任选其一：
- `python -m http.server 8000`（在 site/ 目录下），浏览器开 http://localhost:8000
- 直接双击 index.html 也可以（色板已内联为 JS，无 fetch 依赖）

## 更新色板
1. 把新色板 JSON 放进 `palettes/`（格式：`{id, brand, product, colors:[{code,name,hex}]}`）
2. 在 `tools/build-palettes.py` 的 `LABELS` 里加一行
3. 运行 `python tools/build-palettes.py`

## 数据来源与许可
- 色板数据：[craft-color-codes](https://github.com/makebead/craft-color-codes) by MakeBead，CC BY 4.0（本站页脚已署名）
- 配色算法：CIEDE2000（Sharma et al. 2005）
