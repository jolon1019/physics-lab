# -*- coding: utf-8 -*-
"""从试卷 PDF 高倍(5x)裁剪各题图形区域，供逐题重绘与自动核对参考。

用法:
    python crop-figs.py [paperId]      # 默认 p-174

新增试卷时: 在 PAPERS 里加一项 pdf 路径, 并按题目实际位置填 CROPS 比例框。
"""
import fitz, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

PAPERS = {
    "p-174": r"C:\Users\Administrator\AppData\Local\Temp\fig-demo\papers\2026-2027学年邯郸汉光中学九上期中数学试卷.pdf",
}

paper_id = sys.argv[1] if len(sys.argv) > 1 else "p-174"
PDF = PAPERS[paper_id]
OUT = os.path.join(HERE, "crops", paper_id)
os.makedirs(OUT, exist_ok=True)

doc = fitz.open(PDF)

# (页码1基, x0,y0,x1,y1 相对页面宽高比例, 输出名)
CROPS = [
    (1, 0.70, 0.44, 1.00, 0.58, "q4"),
    (1, 0.70, 0.66, 1.00, 0.81, "q6"),
    (2, 0.72, 0.06, 1.00, 0.22, "q8"),
    (2, 0.52, 0.29, 1.00, 0.42, "q10"),
    (2, 0.05, 0.42, 1.00, 0.635, "q11"),
    (2, 0.62, 0.56, 1.00, 0.78, "q12"),
    (3, 0.42, 0.34, 1.00, 0.50, "q16"),
    (4, 0.05, 0.22, 0.95, 0.48, "q18"),
    (4, 0.05, 0.61, 0.75, 0.80, "q19"),
    (5, 0.05, 0.33, 0.90, 0.48, "q20"),
    (5, 0.42, 0.66, 1.00, 0.87, "q21"),
    (7, 0.05, 0.13, 1.00, 0.32, "q23"),
    (8, 0.05, 0.09, 1.00, 0.38, "q24"),
]

for pno, fx0, fy0, fx1, fy1, name in CROPS:
    page = doc[pno - 1]
    r = page.rect
    clip = fitz.Rect(r.width * fx0, r.height * fy0, r.width * fx1, r.height * fy1)
    pix = page.get_pixmap(matrix=fitz.Matrix(5, 5), clip=clip)
    path = os.path.join(OUT, name + ".png")
    pix.save(path)
    print(name, pix.width, pix.height)

doc.close()
print("all done ->", OUT)
