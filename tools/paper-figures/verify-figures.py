# -*- coding: utf-8 -*-
"""自动比对原卷裁剪图与重绘图的归一化几何特征，输出差异报告。
管线: 原图 -> 文字行剥离 -> 竖直留白分段(多图选最优匹配区) -> 归一化特征比对。
特征: 行列投影 / 角度直线谱(Radon-lite) / 上下轮廓 / 连通域 blob。

用法:
    python verify-figures.py [paperId]          # 默认 p-174
裁剪图目录: crops/<paperId>/q*.png  生成图目录: <repo>/public/figures/hg-q*.png
按题号自动配对; 评分仅用于定位疑点, 最终以报告+接触表+精测坐标确认为准。
"""
import os, math, sys, glob, re
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

paper_id = sys.argv[1] if len(sys.argv) > 1 else "p-174"
FD = os.path.join(HERE, "crops", paper_id)          # 裁剪图目录
PUB = os.path.join(REPO, "public", "figures")        # 生成图目录
OUT_REPORT = os.path.join(HERE, f"verify-report-{paper_id}.txt")

# 按题号自动配对: crops 里 q<n>.png 对 public/figures 里 hg-q<n>.png
PAIRS = []
for p in sorted(glob.glob(os.path.join(FD, "q*.png"))):
    m = re.match(r"q(\d+)\.png$", os.path.basename(p))
    if not m:
        continue
    gen = f"hg-q{m.group(1)}.png"
    if os.path.exists(os.path.join(PUB, gen)):
        PAIRS.append((f"q{m.group(1)}", os.path.basename(p), gen))

WORK = 900   # 结构分析尺寸
MAXD = 220   # 比对尺寸

# ---------- 基础 ----------

def components(mask):
    """纯 python BFS 连通域, 返回 [(size, y0,y1,x0,x1, cx, cy)]"""
    h, w = mask.shape
    visited = np.zeros((h, w), dtype=bool)
    out = []
    for sy in range(h):
        row = mask[sy]
        for sx in range(w):
            if row[sx] and not visited[sy, sx]:
                stack = [(sy, sx)]
                visited[sy, sx] = True
                n = 0; y0 = y1 = sy; x0 = x1 = sx; sxsum = 0; sysum = 0
                while stack:
                    y, x = stack.pop()
                    n += 1
                    if y < y0: y0 = y
                    if y > y1: y1 = y
                    if x < x0: x0 = x
                    if x > x1: x1 = x
                    sxsum += x; sysum += y
                    for dy in (-1, 0, 1):
                        yy = y + dy
                        if 0 <= yy < h:
                            mrow = mask[yy]
                            for dx in (-1, 0, 1):
                                xx = x + dx
                                if 0 <= xx < w and mrow[xx] and not visited[yy, xx]:
                                    visited[yy, xx] = True
                                    stack.append((yy, xx))
                out.append((n, y0, y1, x0, x1, sxsum / n, sysum / n))
    return out

def strip_text(mask):
    """剥离成行排列的文字(≥4 个小连通域近似共线), 保留靠近图形结构的少量标签"""
    h, w = mask.shape
    comps = components(mask)
    big = [c for c in comps
           if c[0] >= 0.02 * h * w or (c[4] - c[3]) >= 0.30 * w or (c[2] - c[1]) >= 0.30 * h]
    if not big:
        return mask
    glyphs = [c for c in comps if c not in big]
    # 文字行聚类: 中心 y 相近的一排小域
    rows = []
    for g in glyphs:
        cy = g[6]
        for r in rows:
            if abs(r[0] - cy) < 0.025 * h:
                r[1].append(g); r[0] = sum(p[6] for p in r[1]) / len(r[1])
                break
        else:
            rows.append([cy, [g]])
    keep = np.zeros_like(mask)
    for _, grp in rows:
        if len(grp) >= 4:
            continue  # 文字行 -> 删
        for g in grp:
            keep[g[1]:g[2] + 1, g[3]:g[4] + 1] |= mask[g[1]:g[2] + 1, g[3]:g[4] + 1]
    for c in big:
        keep[c[1]:c[2] + 1, c[3]:c[4] + 1] |= mask[c[1]:c[2] + 1, c[3]:c[4] + 1]
    return keep

def trim(mask):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

def select_figure_bands(mask):
    """按行墨迹分带: 保留最高的图形带 + 紧邻的小标签带, 剔除远处文字带"""
    h, w = mask.shape
    rowink = mask.sum(axis=1)
    on = rowink > 0.002 * w
    bands = []
    y = 0
    while y < h:
        if on[y]:
            y0 = y
            while y < h and on[y]:
                y += 1
            bands.append([y0, y])
        else:
            y += 1
    if not bands:
        return mask
    merged = []
    for b in bands:
        if merged and b[0] - merged[-1][1] < 0.015 * h:
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    maxbh = max(b[1] - b[0] for b in merged)
    keep = np.zeros_like(mask)
    kept_idx = []
    for i, (y0, y1) in enumerate(merged):
        if (y1 - y0) >= 0.45 * maxbh:
            keep[y0:y1] |= mask[y0:y1]
            kept_idx.append(i)
    # 紧邻标签带 (间隙 < 0.02H, 带高 < 0.12H)
    for i, (y0, y1) in enumerate(merged):
        if i in kept_idx:
            continue
        bh = y1 - y0
        if bh < 0.12 * h:
            for j in kept_idx:
                ky0, ky1 = merged[j]
                if 0 < y0 - ky1 < 0.02 * h or 0 < ky0 - y1 < 0.02 * h:
                    keep[y0:y1] |= mask[y0:y1]
                    break
    return trim(keep) if keep.sum() else mask

def split_segments(mask):
    """竖直留白分段(留白 > 5% 宽), 过滤过小的碎段(如箭头)"""
    colink = mask.sum(axis=0)
    W = mask.shape[1]
    gaps = []
    x = 0
    while x < W:
        if colink[x] == 0:
            x0 = x
            while x < W and colink[x] == 0:
                x += 1
            if (x - x0) >= 0.05 * W:
                gaps.append((x0, x))
        else:
            x += 1
    segs = []
    prev = 0
    for g0, g1 in gaps:
        segs.append(mask[:, prev:g0])
        prev = g1
    segs.append(mask[:, prev:W])
    out = []
    for s in segs:
        t = trim(s) if s.sum() > 0.005 * s.size else None
        if t is not None:
            out.append(t)
    return out

def load_orig(path):
    """原图: 降采样 -> 二值 -> 剥文字 -> 行带选择 -> 返回 [候选区 mask]"""
    im = Image.open(path).convert("L")
    w, h = im.size
    s = WORK / max(w, h)
    if s < 1:
        im = im.resize((int(w * s), int(h * s)), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float32)
    thr = max(110.0, a.mean() * 0.80)
    mask = a < thr
    mask = strip_text(mask)
    mask = select_figure_bands(mask)
    if mask is None:
        return []
    return split_segments(mask)

def load_gen(path):
    im = Image.open(path).convert("L")
    w, h = im.size
    s = WORK / max(w, h)
    if s < 1:
        im = im.resize((int(w * s), int(h * s)), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float32)
    mask = a < max(110.0, a.mean() * 0.80)
    return split_segments(trim(mask))

def to_cmp(mask):
    """归一化到比对尺寸; 先加粗防细线消失"""
    img = Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))
    h, w = mask.shape
    s = MAXD / max(h, w)
    nh, nw = max(1, int(round(h * s))), max(1, int(round(w * s)))
    small = np.asarray(img.resize((nw, nh), Image.BILINEAR), dtype=np.float32) / 255.0
    return small > 0.30

# ---------- 特征 ----------

def resample(v, n=128):
    w = len(v)
    idx = np.linspace(0, w - 1, n)
    x0 = np.floor(idx).astype(int); x1 = np.minimum(x0 + 1, w - 1)
    f = idx - x0
    return v[x0] * (1 - f) + v[x1] * f

def cosim(a, b):
    a = resample(np.asarray(a, dtype=np.float32))
    b = resample(np.asarray(b, dtype=np.float32))
    a = a - a.mean(); b = b - b.mean()
    d = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / d) if d > 1e-9 else 0.0

def feat_radon(b, step=15):
    im = Image.fromarray((b * 255).astype(np.uint8))
    vec = []
    for ang in range(0, 180, step):
        r = im.rotate(ang, expand=True, fillcolor=0)
        proj = (np.asarray(r, dtype=np.float32) / 255.0).sum(axis=1)
        m = proj.mean()
        vec.append(proj.max() / m if m > 1e-9 else 0.0)
    v = np.array(vec, dtype=np.float32)
    return v / (np.linalg.norm(v) + 1e-9)

def feat_sil(b):
    h, w = b.shape
    top = np.full(w, -1.0, dtype=np.float32)
    bot = np.full(w, -1.0, dtype=np.float32)
    for x in range(w):
        ys = np.where(b[:, x])[0]
        if len(ys):
            top[x] = ys.min() / h
            bot[x] = ys.max() / h
    return top, bot

def sil_sim(t1, b1, t2, b2):
    n = 64
    def samp(t, w):
        return np.array([float(t[int(i * (w - 1) / max(1, n - 1))]) for i in range(n)])
    a1, a2 = samp(t1, len(t1)), samp(t2, len(t2))
    ok = 0; tot = 0
    for i in range(n):
        p1, p2 = a1[i] < 0, a2[i] < 0
        if p1 and p2:
            ok += 1; tot += 1
        elif p1 != p2:
            tot += 1
        else:
            tot += 1
            if abs(a1[i] - a2[i]) < 0.10:
                ok += 1
    return ok / tot

def feat_blobs(b):
    h, w = b.shape
    comps = components(b)
    minsz = max(6, 0.004 * h * w)
    out = [(n, cx / w, cy / h) for (n, _, _, _, _, cx, cy) in comps if n >= minsz]
    out.sort(reverse=True)
    return out[:30]

def blob_sim(B1, B2):
    n1, n2 = len(B1), len(B2)
    if n1 == 0 and n2 == 0:
        return 1.0, 0, 0
    if n1 == 0 or n2 == 0:
        return 0.0, n1, n2
    used = set(); ds = []
    for s1, x1, y1 in B1:
        bd, bj = 1e9, None
        for j, (s2, x2, y2) in enumerate(B2):
            if j in used:
                continue
            d = math.hypot(x1 - x2, y1 - y2)
            if d < bd:
                bd, bj = d, j
        if bj is not None and bd < 0.15:
            used.add(bj); ds.append(bd)
    cover = len(used) / max(n1, n2)
    meand = sum(ds) / len(ds) if ds else 1.0
    return cover * (1.0 - min(1.0, meand / 0.15)), n1, n2

def compare(o, g):
    r1, c1 = o.sum(axis=1), o.sum(axis=0)
    r2, c2 = g.sum(axis=1), g.sum(axis=0)
    prow, pcol = cosim(r1, r2), cosim(c1, c2)
    rad = cosim(feat_radon(o), feat_radon(g))
    t1, b1 = feat_sil(o); t2, b2 = feat_sil(g)
    sil = (sil_sim(t1, b1, t2, b2) + sil_sim(b1, t1, b2, t2)) / 2
    B1, B2 = feat_blobs(o), feat_blobs(g)
    bsim, n1, n2 = blob_sim(B1, B2)
    score = 0.15 * max(0, prow) + 0.15 * max(0, pcol) + 0.20 * max(0, rad) + 0.25 * max(0, sil) + 0.25 * max(0, bsim)
    return dict(prow=prow, pcol=pcol, rad=rad, sil=sil, bsim=bsim, n1=n1, n2=n2, score=score, B1=B1, B2=B2)

def main():
    out = ["=" * 60, "配图自动核对报告 v2 (文字剥离+行带选择+分段选区+结构特征)", "=" * 60]
    npass = 0
    thumbs = []  # (name, orig_img, gen_img) for contact sheet
    for name, orig, gen in PAIRS:
        op = os.path.join(FD, orig); gp = os.path.join(PUB, gen)
        osegs = load_orig(op) if os.path.exists(op) else []
        gsegs = load_gen(gp) if os.path.exists(gp) else []
        if not osegs or not gsegs:
            out.append(f"[{name}] FAIL: 读图失败 orig {len(osegs)} 段 / gen {len(gsegs)} 段")
            out.append("")
            continue
        # 面板配对: gen 每段在 orig 所有段中找最优匹配, 总分 = 均值
        pairs = []
        for gs in gsegs:
            g = to_cmp(gs)
            best = max((compare(to_cmp(s), g) for s in osegs), key=lambda r: r["score"])
            pairs.append((g, best))
        npair = len(pairs)
        score = sum(p[1]["score"] for p in pairs) / npair
        wi, worst = min(enumerate(pairs), key=lambda t: t[1][1]["score"])
        res = worst[1]
        seginfo = f"(gen {npair} 段 × orig {len(osegs)} 段配对, 最差为 gen 第 {wi + 1} 段)"
        thumbs.append((name, osegs[0], worst[0]))
        status = "PASS" if score >= 0.72 else ("WARN" if score >= 0.55 else "FAIL")
        out.append(f"[{name}] {status} score={score:.2f} {seginfo}")
        out.append(f"    各段: {' '.join(f'{p[1]['score']:.2f}' for p in pairs)}")
        out.append(f"    行投影 {res['prow']:+.2f} | 列投影 {res['pcol']:+.2f} | 直线谱 {res['rad']:+.2f} | 轮廓 {res['sil']:+.2f} | blob {res['bsim']:+.2f} (orig {res['n1']} vs gen {res['n2']})")
        if status != "PASS":
            bad = []
            if res["prow"] < 0.55: bad.append(f"行投影低({res['prow']:+.2f}): 水平结构不同")
            if res["pcol"] < 0.55: bad.append(f"列投影低({res['pcol']:+.2f}): 竖直结构不同")
            if res["rad"] < 0.55: bad.append(f"直线谱低({res['rad']:+.2f}): 直线角度集合不同")
            if res["sil"] < 0.55: bad.append(f"轮廓低({res['sil']:+.2f}): 曲线/外沿形状不同")
            if res["bsim"] < 0.55: bad.append(f"blob低({res['bsim']:+.2f}): 标签/点位置不同")
            out.append("    -> " + "; ".join(bad))
            out.append("    orig blobs: " + " ".join(f"({s},{x:.2f},{y:.2f})" for s, x, y in res["B1"][:10]))
            out.append("    gen  blobs: " + " ".join(f"({s},{x:.2f},{y:.2f})" for s, x, y in res["B2"][:10]))
        out.append("")
        if status == "PASS":
            npass += 1
    out.append(f"汇总: {npass}/{len(PAIRS)} PASS")
    rep = "\n".join(out)
    print(rep)
    with open(OUT_REPORT, "w", encoding="utf-8") as f:
        f.write(rep)
    # 接触表: 每行 = 原图选区(左) vs 生成图(右)
    TH = 150; PAD = 8; LABEL = 90
    rows = []
    for name, o, g in thumbs:
        def th(mb):
            img = Image.fromarray((~mb * 255).astype(np.uint8))
            w0, h0 = img.size
            s = TH / h0
            return img.resize((max(1, int(w0 * s)), TH), Image.BILINEAR)
        to_, tg = th(o), th(g)
        rows.append((name, to_, tg))
    W = LABEL + max(r[1].width for r in rows) + 20 + max(r[2].width for r in rows) + PAD * 4
    sheet = Image.new("L", (W, (TH + 26) * len(rows) + PAD), 255)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    y = PAD
    for name, to_, tg in rows:
        dr.text((PAD, y + TH // 2 - 5), name, fill=0)
        sheet.paste(to_, (LABEL, y))
        sheet.paste(tg, (LABEL + to_.width + 20, y))
        dr.text((LABEL + to_.width + 22, y + TH + 2), "orig", fill=120)
        dr.text((LABEL + to_.width + 20 + tg.width - 30, y + TH + 2), "gen", fill=120)
        y += TH + 26
    sheet.save(os.path.join(HERE, f"contact-{paper_id}.png"))
    print("contact sheet ->", os.path.join(HERE, f"contact-{paper_id}.png"))

if __name__ == "__main__":
    main()
