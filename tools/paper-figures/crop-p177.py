# -*- coding: utf-8 -*-
"""p-177 石家庄81中九上物理: 17 题配图精确裁剪
源: mytrae 试卷第N页.jpg (1080x1527, 已去水印)
框: (page, x0,y0,x1,y1) 以 1080x1527 像素为基准的绝对坐标, 宁大勿小
后处理: 自动裁掉纯白边 -> 四周补 10px 白 -> LANCZOS 3x 放大
输出: d:/project/physics-lab/public/figures/s81w/s81w-qN.png + 接触表
"""
from PIL import Image, ImageOps
import numpy as np, os

SRC = r"C:\Users\Administrator\Documents\mytrae\2026-2027学年石家庄81中九年级上册期中物理试卷"
OUT = r"d:\project\physics-lab\public\figures\s81w"
W, H = 1080, 1527

# 依据 6 页目视定位的裁剪框 (px, 1080x1527 基准)
CROPS = {
    "q2":  (1, 680, 462, 860, 622),     # 温度-时间图像 a/b
    "q3":  (1, 790, 650, 950, 805),     # 内燃机冲程剖面
    "q4":  (1, 322, 942, 778, 1152),    # 甲水碓照片 + 乙水电站原理 + 标签
    "q5":  (2, 210, 108, 700, 302),     # 甲电路 + 乙丙电流表表盘
    "q6":  (2, 740, 418, 912, 595),     # 电路图 V/A/R/S/P
    "q7":  (2, 730, 618, 925, 802),     # 实物连接图(擦除左上角题干字尾)
    "q8":  (2, 710, 900, 915, 1045),    # 电路图 A/P/R/S/V
    "q9":  (2, 680, 1208, 820, 1362),   # 风力测定仪
    "q10": (3, 300, 145, 730, 355),     # 图1电路 + 图2 U-I 网格
    "q13": (3, 360, 778, 695, 930),     # 甲装置 + 乙 A/B 两冲程
    "q14": (3, 100, 1170, 420, 1335),   # 14题图 输电线检测电路
    "q15": (3, 580, 1173, 825, 1345),   # 15题图 R1/R2 电路
    "q16": (4, 380, 190, 645, 285),     # 两烧杯电加热器实物
    "q17": (4, 190, 1005, 820, 1252),   # 甲电路 + 乙实物 + 丙表盘
    "q18": (5, 278, 768, 740, 928),     # 甲电路 + 乙实物
    "q19": (6, 700, 588, 865, 665),     # 丁烷气炉实物(灰色照片, 不做去边)
    "q20": (6, 650, 1120, 995, 1270),   # 电路图 R1/R2/A/V/S(右侧加宽)
}

# 灰色淡色照片跳过 autotrim, 避免误裁
NOTRIM = {"q19"}

# 裁剪后需要涂白擦除的残留文字区 (页面绝对坐标)
ERASE = {
    "q7":  [(725, 615, 752, 662)],      # "闭合开"字尾
    "q6":  [(698, 405, 752, 548)],      # "变""量"两字(电路左线在x760, 勿越界)
    "q20": [(650, 1240, 752, 1278)],    # "确保电"字尾
}

def autotrim(im, thresh=185, pad=10):
    g = np.array(im.convert("L"))
    dark = g < thresh
    rows = dark.any(axis=1); cols = dark.any(axis=0)
    if not rows.any() or not cols.any():
        return im
    y0, y1 = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
    x0, x1 = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
    return im.crop((max(0, x0 - pad), max(0, y0 - pad),
                    min(im.width, x1 + pad), min(im.height, y1 + pad)))

pages = {}
tiles = []
for q, (pg, x0, y0, x1, y1) in sorted(CROPS.items(), key=lambda kv: int(kv[0][1:])):
    if pg not in pages:
        pages[pg] = Image.open(os.path.join(SRC, f"试卷第{pg}页.jpg")).convert("RGB")
    crop = pages[pg].crop((x0, y0, x1, y1))
    for (ex0, ey0, ex1, ey1) in ERASE.get(q, []):
        crop.paste((255, 255, 255), (ex0 - x0, ey0 - y0, ex1 - x0, ey1 - y0))
    if q not in NOTRIM:
        crop = autotrim(crop)
    big = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
    big = ImageOps.expand(big, border=10, fill="white")
    dst = os.path.join(OUT, f"s81w-{q}.png")
    big.save(dst)
    print(q, f"page{pg}", f"{crop.width}x{crop.height}", "->", f"{big.width}x{big.height}")
    tiles.append((q, big))

# 接触表: 每行 2 列, 缩到宽 500
from PIL import ImageDraw
CW = 500
rows = (len(tiles) + 1) // 2
heights = []
for r in range(rows):
    pair = tiles[r*2:r*2+2]
    heights.append(max(min(t[1].height, 400) for t in pair))
sheet = Image.new("RGB", (CW*2 + 60, sum(heights) + 40*rows + 20), "white")
d = ImageDraw.Draw(sheet)
y = 10
for r in range(rows):
    pair = tiles[r*2:r*2+2]
    for c, (q, im) in enumerate(pair):
        t = im.copy(); t.thumbnail((CW, 400))
        x = 20 + c*(CW+20)
        d.text((x, y), q, fill="red")
        sheet.paste(t, (x, y+18))
    y += heights[r] + 40
sheet.save(r"C:\Users\Administrator\AppData\Local\Temp\fig-demo\contact-p177.png")
print("contact sheet saved")
