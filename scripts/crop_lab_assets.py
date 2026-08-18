"""
把 public/assets/lab/ 下的贴纸 PNG 裁掉白边，并把白底转为透明。
用于 e-speed 等实验：源图是大白底 + 居中主体，直接 drawImage 会把白底也画进画布，
导致贴纸看起来小、模糊。处理后只剩主体，且无白底。
"""
from PIL import Image, ImageChops
import os
import sys

BASE = r'D:\project\physics-lab\public\assets\lab'
# 像素亮度 >= threshold 视为白底 -> 完全透明
# threshold-softBand ~ threshold 之间做柔和过渡，避免硬边白边
THRESHOLD = 245
SOFT_BAND = 30
PAD = 8  # 裁剪后留的透明 padding


def process(input_path, output_path, threshold=THRESHOLD, soft=SOFT_BAND, pad=PAD):
    img = Image.open(input_path)
    print(f'[in ] {input_path}: mode={img.mode} size={img.size}')
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    w, h = img.size

    # 用与纯白的差值快速找主体 bbox（避免遍历全图找 min/max）
    white = Image.new('RGBA', (w, h), (255, 255, 255, 255))
    diff = ImageChops.difference(img, white).convert('L')
    th = 255 - threshold
    mask = diff.point(lambda v: 255 if v > th else 0)
    bbox = mask.getbbox()
    if not bbox:
        print(f'  skip: no non-white content')
        return
    print(f'  content bbox: {bbox}')

    # 把白/近白像素的 alpha 清掉 / 渐变（保留原 RGB 以便边缘柔色）
    px = img.load()
    lo = threshold - soft
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            mx = r if r >= g and r >= b else (g if g >= b else b)
            if mx >= threshold:
                px[x, y] = (r, g, b, 0)
            elif mx >= lo:
                # 柔和过渡：越白越透明
                new_a = int((threshold - mx) / soft * 255)
                px[x, y] = (r, g, b, min(a, new_a))

    # 按主体 bbox + padding 裁剪
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad); y1 = min(h, y1 + pad)
    out = img.crop((x0, y0, x1, y1))
    out.save(output_path)
    print(f'[out] {output_path}: size={out.size}')


def main():
    targets = ['che.png', 'huadao.png']
    only = sys.argv[1:] if len(sys.argv) > 1 else targets
    for name in only:
        p = os.path.join(BASE, name)
        if not os.path.exists(p):
            print(f'missing: {p}')
            continue
        process(p, p)  # 原地覆盖


if __name__ == '__main__':
    main()
