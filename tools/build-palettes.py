# 把 craft-color-codes (CC BY 4.0) 下载来的色板 JSON 编译成零依赖的 palettes.js
# 用法: 在 palettes/ 目录存在的前提下，于 site/ 下运行 python tools/build-palettes.py
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)

LABELS = {
    "mard-221": ("MARD", "MARD 221色 · 常规全色"),
    "mard-291": ("MARD", "MARD 291色 · 含P系列"),
    "perler-midi": ("Perler", "Perler 5mm 大豆"),
    "hama-midi": ("Hama", "Hama 5mm 大豆"),
    "artkal-s": ("Artkal", "Artkal S 2.6mm 小豆"),
    "nabbi": ("Nabbi", "Nabbi 5mm 大豆"),
}

palettes = []
for pid, (brand, label) in LABELS.items():
    path = os.path.join(SITE, "palettes", pid + ".json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    colors = [
        {"code": c["code"], "name": c.get("name", ""), "hex": c["hex"]}
        for c in data["colors"]
        if c.get("hex")
    ]
    palettes.append({"id": pid, "brand": brand, "label": label, "colors": colors})

out = os.path.join(SITE, "palettes.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("// 色板数据: craft-color-codes by MakeBead (https://makebead.com) · CC BY 4.0\n")
    f.write("window.BEAD_PALETTES = ")
    f.write(json.dumps(palettes, ensure_ascii=False, separators=(",", ":")))
    f.write(";\n")

total = sum(len(p["colors"]) for p in palettes)
print(f"palettes.js written: {len(palettes)} palettes, {total} colors, {os.path.getsize(out)} bytes")
