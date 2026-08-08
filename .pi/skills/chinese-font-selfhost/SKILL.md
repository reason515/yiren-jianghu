---
name: chinese-font-selfhost
description: 中文字体自包子集化（woff2 随包，禁 CDN）。触发条件：任何中文 H5/前端/游戏需要自定义字体（书法体/宋体）且不能依赖系统字体，或 Google Fonts 在国内不可达，或字体文件太大需要子集化瘦身，或用户说"字体没生效/回退成黑体/排版没气质/打包字体"。也适用于任何 UI 项目需要把 Noto Serif SC / ZCOOL XiaoWei / 思源等中文字体打进产物时。
compatibility: 需要 Python 3 + fontTools（pyftsubset / varLib.instancer）、网络可达 raw.githubusercontent.com（google/fonts 源字体）；vite 项目需了解 assets 路径规则
---

# 中文字体自包（chinese-font-selfhost）

## 为什么必须自包

1. **Google Fonts 国内不可达**：xkx 等老项目的 `<link href="fonts.googleapis.com">` 在国内直接失效，字体回退系统字体，书法/宋体气质全丢。
2. **中文字体体积大**：Noto Serif SC 全量 25MB+，ZCOOL XiaoWei 6MB+——必须子集化。
3. **系统回退不可控**：不同设备渲染完全不同，设计一致性无法保证。

## 方案对比（实测数据）

| 方案                                                    | 产物                     | 实测                             | 结论                               |
| ------------------------------------------------------- | ------------------------ | -------------------------------- | ---------------------------------- |
| **fontsource npm 包**（`@fontsource/zcool-xiaowei` 等） | unicode-range 分片 woff2 | **283 个文件 / 21MB**，CSS 406KB | ❌ 不可取（构建/上传慢、体积失控） |
| **自子集化**（本 skill）                                | 单文件 woff2 × 3         | **3 个文件 / 5MB**，CSS 25KB     | ✅ 推荐                            |

## 完整流程

### 1. 下载源字体（google/fonts 仓库）

```bash
# ZCOOL XiaoWei（静态）——注意 Z 大写、目录名全小写
curl -L -o zcool.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf"
# Noto Serif SC（可变字体，文件名含 [wght] 需 URL 编码）
curl -L -o noto-serif-sc.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf"
```

> 路径规则：`google/fonts/main/ofl/<字体目录小写>/<PostScript名>.ttf`。查具体路径用 GitHub 网页浏览 `ofl/` 目录。

### 2. 生成 GB2312 子集字符集（约 7000 字）

用 Python 枚举 GB2312 编码覆盖的汉字 + 全角标点 + ASCII（见 `scripts/gen-gb2312-chars.py`，一次生成 `chars.txt` 可复用）：

```python
chars = set(chr(c) for c in range(0x20, 0x7F))                      # ASCII
chars.update(chr(cp) for cp in range(0x3000, 0x303F))               # CJK 标点
for cp in range(0xFF00, 0xFFEF):                                    # 全角
    try: chr(cp).encode('gb2312'); chars.add(chr(cp))
    except UnicodeEncodeError: pass
for cp in range(0x4E00, 0x9FFF + 1):                                # GB2312 汉字
    try: chr(cp).encode('gb2312'); chars.add(chr(cp))
    except UnicodeEncodeError: pass
open('chars.txt', 'w', encoding='utf-8').write(''.join(sorted(chars)))
```

### 3. 子集化（pyftsubset）

```bash
# 静态字体直接子集
pyftsubset zcool.ttf --text-file=chars.txt --flavor=woff2 --output-file=zcool-xiaowei-400.woff2

# 可变字体需先实例化静态权重（pyftsubset 无 --instance 选项，先 instancer）
python -m fontTools.varLib.instancer noto-serif-sc.ttf wght=400 -o noto-400-static.ttf
python -m fontTools.varLib.instancer noto-serif-sc.ttf wght=600 -o noto-600-static.ttf
pyftsubset noto-400-static.ttf --text-file=chars.txt --flavor=woff2 --output-file=noto-serif-sc-400.woff2
pyftsubset noto-600-static.ttf --text-file=chars.txt --flavor=woff2 --output-file=noto-serif-sc-600.woff2
```

实测体积：ZCOOL 400 ≈ 2.6MB，Noto Serif 400/600 ≈ 1.3MB 各。instancer 的 `OTLOffsetOverflowError` 修复提示是正常的，忽略即可。

### 4. vite 项目接入（关键路径坑）

- **字体放 `src/styles/fonts/`（源码目录），不要放 `public/`**——CSS 里用相对 `url()`，vite 会解析并 hash 到 `dist/assets/`；放 public 会导致 CSS 相对路径解析错误。
- `tokens.css` 顶部加 `@font-face`：

```css
@font-face {
  font-family: "ZCOOL XiaoWei";
  src: url("fonts/zcool-xiaowei-400.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
/* Noto Serif SC 400/600 同理 */
```

- **body 必须声明字体基线**（否则正文落系统字体）：`html, body { font-family: var(--font-body); }`
- 字号与实际字体族名必须匹配 token（`--font-display: "ZCOOL XiaoWei"`）。

### 5. 验收

```javascript
// 浏览器控制台
document.fonts.check('16px "ZCOOL XiaoWei"')   // true
document.fonts.check('16px "Noto Serif SC"')   // true
document.fonts.status                            // "loaded"（大字体首次 check 可能 false，稍等复查）
// 构建产物
ls dist/assets/*.woff2                          // 3 个 hash 文件
```

`font-display: swap` 会先显示回退字体再换——首次渲染短暂系统字体是正常现象，不要误判为失败。

## 常见坑

- **字体文件名 hash 变化**：每次构建 hash 变，部署后用户浏览器缓存旧 index.html 引用旧 hash → 404 白屏/旧版。排查：比对页面引用的 bundle hash 与服务器最新 index.html。
- **只打 `--font-display` 没打正文**：正文默认系统字体，视觉上"标题有气质、正文没气质"——body 字体基线必设。
- **GB2312 不含生僻字**：内容包如含生僻字（如"灋"）会缺字。需要时扩展字符集（追加 `chars.txt` 里的 Unicode 范围）。
