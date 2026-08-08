#!/usr/bin/env python3
"""生成 GB2312 中文字体子集字符集（ASCII + 全角标点 + GB2312 汉字 ≈ 7000 字）。

用法: python gen-gb2312-chars.py [输出路径=chars.txt]
输出文件供 pyftsubset --text-file=... 使用。
"""
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "chars.txt"

chars = set()
# ASCII 可见字符
chars.update(chr(c) for c in range(0x20, 0x7F))
# CJK 标点（U+3000–U+303F）
chars.update(chr(cp) for cp in range(0x3000, 0x303F))
# 全角形式（U+FF00–U+FFEF），仅保留 GB2312 可编码的
for cp in range(0xFF00, 0xFFEF):
    try:
        chr(cp).encode("gb2312")
        chars.add(chr(cp))
    except UnicodeEncodeError:
        pass
# GB2312 覆盖的汉字（U+4E00 起）
for cp in range(0x4E00, 0x9FFF + 1):
    try:
        chr(cp).encode("gb2312")
        chars.add(chr(cp))
    except UnicodeEncodeError:
        pass
# 常用补充符号
for cp in (0x2026, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x00B7, 0x2605, 0x2606):
    chars.add(chr(cp))

text = "".join(sorted(chars))
with open(OUT, "w", encoding="utf-8") as f:
    f.write(text)
print(f"chars: {len(text)} -> {OUT}")
