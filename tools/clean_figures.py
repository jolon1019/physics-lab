# -*- coding: utf-8 -*-
"""
通用配图清洗 v2：输入"宽松裁剪"的灰度图（保证图形完整、允许混入题干文字），
自动识别并抹掉文字，只保留图形主体与紧邻的字母/图号标注，最后按墨迹收边。

原理（连通块形态学，无需 OCR）：
  1) 图形笔画 = 大尺寸连通块（高>55px、长直线/坐标轴），邻近的结构合并成"图形组"
     （矩形框的四条边会并成一组，框内文字因此受保护）；
  2) 保护区域 = 图形组包围盒填充 + 非对称边距（上14/下40/左右30，下方留足选项字母与图注）；
  3) 题干汉字/字母 = 字符尺寸连通块（高10~45、宽3~65），保护区域之外一律清除；
  4) 密排文字行（>=6字符、横跨>60%图宽、间距<30px）整行清除——即使贴着图形；
     行带内的下划线/句点/粘连串一并扫掉；被图形组包围盒包含的"框内文字"豁免；
  5) 清除时同步抹掉笔画周围的浅灰晕影，避免留下 ghost 字迹；
  6) 孤立噪点（结构总包围盒外）清除，网格点/虚线在包围盒内保留；按墨迹收边。
用法：from clean_figures import clean; out = clean(gray_np)
"""
import numpy as np
import cv2

THR = 170
MT, MB, MS = 14, 40, 30   # 保护边距：上/下/左右


def clean(gray: np.ndarray) -> np.ndarray:
    H, W = gray.shape
    bw = (gray < THR).astype(np.uint8)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(bw, 8)
    if n <= 1:
        return gray

    tier1, charlike, midsize, speck = [], [], [], []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if h > 55 or (w > 110 and h <= 12) or (w > 110 and h > 42):
            tier1.append(i)
        elif 10 <= h <= 45 and 3 <= w <= 65:
            charlike.append(i)
        elif h < 10 and w < 40 and a < 80:
            speck.append(i)
        else:
            midsize.append(i)

    if not tier1:
        return gray

    # 下划线甄别：孤立长横线（上下 20px 内无其它结构支撑）是填空下划线而非坐标轴/边框 → 降级
    horiz = [i for i in tier1 if stats[i][3] <= 12 and stats[i][2] > 110]
    for i in horiz:
        x, y, w, h, a = stats[i]
        supported = False
        for j in tier1:
            if j == i:
                continue
            xj, yj, wj, hj, aj = stats[j]
            if xj <= x + w and x <= xj + wj:
                gap = max(y - (yj + hj), yj - (y + h))
                if gap <= 20:
                    supported = True
                    break
        if not supported:
            tier1.remove(i)
            midsize.append(i)

    if not tier1:
        return gray

    # 结构分组：bbox 外扩 12px 后相交即并组
    boxes = [tuple(stats[i][:4]) for i in tier1]
    parent = list(range(len(boxes)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for i in range(len(boxes)):
        xi, yi, wi, hi = boxes[i]
        for j in range(i + 1, len(boxes)):
            xj, yj, wj, hj = boxes[j]
            if (xi - 12 <= xj + wj and xj - 12 <= xi + wi and
                    yi - 12 <= yj + hj and yj - 12 <= yi + hi):
                parent[find(i)] = find(j)

    groups = {}
    for i, (x, y, w, h) in enumerate(boxes):
        g = find(i)
        if g not in groups:
            groups[g] = [x, y, x + w, y + h]
        else:
            b = groups[g]
            b[0], b[1] = min(b[0], x), min(b[1], y)
            b[2], b[3] = max(b[2], x + w), max(b[3], y + h)
    gboxes = list(groups.values())

    prot = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in gboxes:
        prot[max(0, y0 - MT):min(H, y1 + MB), max(0, x0 - MS):min(W, x1 + MS)] = True

    ux0 = min(b[0] for b in gboxes); uy0 = min(b[1] for b in gboxes)
    ux1 = max(b[2] for b in gboxes); uy1 = max(b[3] for b in gboxes)

    def inside_prot(i):
        cx, cy = cent[i]
        return prot[int(cy), int(cx)]

    removed = set()

    # 规则A：保护区域之外的字符 → 清除
    for i in charlike:
        if not inside_prot(i):
            removed.add(i)

    # 规则B：保护区域之外的下划线/粘连字串 → 清除
    for i in midsize:
        x, y, w, h, a = stats[i]
        dens = a / max(1, w * h)
        if inside_prot(i):
            continue
        if h <= 13 or a < 150 or (14 <= h <= 45 and dens > 0.22):
            removed.add(i)

    # 规则C：密排文字行整行清除（含行带内非结构墨迹）
    items = sorted(charlike, key=lambda i: cent[i][1])
    clusters = []
    for i in items:
        x, y, w, h, a = stats[i]
        placed = False
        for cl in clusters:
            if y <= cl['y1'] + 6 and y + h >= cl['y0'] - 6:
                cl['ids'].append(i)
                cl['y0'], cl['y1'] = min(cl['y0'], y), max(cl['y1'], y + h)
                placed = True
                break
        if not placed:
            clusters.append({'ids': [i], 'y0': y, 'y1': y + h})

    for cl in clusters:
        ids = cl['ids']
        if len(ids) < 6:
            continue
        ids_sorted = sorted(ids, key=lambda i: stats[i][0])
        xs = [stats[i][0] for i in ids_sorted]
        xe = [stats[i][0] + stats[i][2] for i in ids_sorted]
        span = max(xe) - min(xs)
        gaps = [xs[k + 1] - xe[k] for k in range(len(xs) - 1)]
        med_gap = sorted(gaps)[len(gaps) // 2] if gaps else 999
        if span < 0.60 * W or med_gap >= 30:
            continue
        bx0, bx1 = min(xs), max(xe)
        by0, by1 = cl['y0'], cl['y1']
        # 单行守卫：跨多行的串联簇、以及含多个大间隔的"分组标注"（图1/图2/A.B.C.D.）不算题干行
        if by1 - by0 > 32:
            continue
        if sum(1 for g in gaps if g > 60) >= 2:
            continue
        contained = any(gx0 - 4 <= bx0 and bx1 <= gx1 + 4 and gy0 - 4 <= by0 and by1 <= gy1 + 4
                        for gx0, gy0, gx1, gy1 in gboxes)
        if contained:
            continue
        for i in ids:
            removed.add(i)
        for i in charlike + midsize + speck:
            cx, cy = cent[i]
            if by0 - 3 <= cy <= by1 + 3 and bx0 - 12 <= cx <= bx1 + 12:
                removed.add(i)

    # 规则D：结构总包围盒之外的孤立噪点 → 清除
    for i in speck:
        cx, cy = cent[i]
        if not (ux0 - 6 <= cx <= ux1 + 6 and uy0 - 6 <= cy <= uy1 + 6):
            removed.add(i)

    # 规则E：同行级联——若某字符的同行邻居已被判定为题干文字，则该字符也一并清除
    # （用于抹掉坐标轴单位/图例等被保护带"切了一半"的残留词，如"年龄/岁""等级"）
    for _ in range(2):
        add = set()
        for i in charlike:
            if i in removed:
                continue
            cx, cy = cent[i]
            for j in charlike:
                if j == i or j not in removed:
                    continue
                jx, jy = cent[j]
                if abs(jx - cx) <= 26 and abs(jy - cy) <= 10:
                    add.add(i)
                    break
        removed |= add

    # 规则K：孤立字母/数字标注回保——距结构 30px 内、且同行无相邻字符的单个字符，
    # 视为顶点/端点标注（如三角形上方的 E、B），即使落在保护带外也保留
    cl_set = set(charlike)
    for i in list(removed):
        if i not in cl_set:
            continue
        cx, cy = cent[i]
        isolated = True
        for j in charlike:
            if j == i:
                continue
            jx, jy = cent[j]
            if abs(jx - cx) <= 22 and abs(jy - cy) <= 12:
                isolated = False
                break
        if not isolated:
            continue
        near = False
        for t in tier1:
            x, y, w, h, a = stats[t]
            dx = max(x - cx, cx - (x + w), 0)
            dy = max(y - cy, cy - (y + h), 0)
            if max(dx, dy) <= 30:
                near = True
                break
        if near:
            removed.discard(i)

    out = gray.copy()
    if removed:
        rm = np.isin(lab, list(removed)).astype(np.uint8)
        kept = np.isin(lab, [i for i in range(1, n) if i not in removed])
        halo = cv2.dilate(rm, np.ones((5, 5), np.uint8)) > 0
        out[halo & ~kept] = 255
        out[rm > 0] = 255

    ys, xs = np.where(out < THR)
    if len(xs) == 0:
        return gray
    pad = 8
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad)
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
    return out[y0:y1, x0:x1]