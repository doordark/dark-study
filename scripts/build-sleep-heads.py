"""Build farm-sleep-heads-night.png: head-only, night-graded sleeping sprites.

The original farm-sleep-sprites.png bakes a pillow + quilt into every sleeper,
which looked like a second tiny bed pasted on top of the room's own bed.
This script keeps only hair + face, colour-matches each resident to the night
pillow of the room they sleep in, and normalises every cell so the chin rests
on row TOP_CUT (HouseInterior then tucks the chin under a redraw of the room's
own sheet).

Usage: python scripts/build-sleep-heads.py
"""
import colorsys
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "assets" / "images"
SRC = IMG / "farm-runtime" / "farm-sleep-sprites.png"
OUT = IMG / "farm-runtime" / "farm-sleep-heads-night.png"
FW, FH = 112, 128
TOP_CUT = 72

ROOMS = {
    "master": IMG / "farm-house-interior-night-v2.png",
    "xiaoba": IMG / "farm-room-xiaoba-night.webp",
    "yujie": IMG / "farm-room-yujie-night.webp",
    "weigang": IMG / "farm-room-weigang-night.webp",
}
# sprite row -> (room, pillow box in 720x540 art px). Keep in sync with FARM_ROOMS.sleepSlots (÷3).
ROWS = {
    0: ("master", (505, 245, 588, 290)),   # door
    1: ("master", (597, 245, 680, 290)),   # gu
    2: ("xiaoba", (538, 245, 628, 294)),
    3: ("yujie", (537, 242, 630, 290)),
    4: ("weigang", (537, 243, 628, 285)),
}


def classify(p):
    r, g, b, a = p
    if a < 60:
        return "bg"
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    if lum < 95:
        return "dark"
    if r > 170 and (r - g) >= 28 and (g - b) >= 8 and lum > 140:
        return "skin"
    return "other"


def head_mask(fr):
    w, h = fr.size
    px = fr.load()
    cls = [[classify(px[x, y]) for x in range(w)] for y in range(h)]
    seeds = [(x, y) for y in range(20, 75) for x in range(30, 85) if cls[y][x] == "skin"]
    mask = [[False] * w for _ in range(h)]
    q = deque(seeds)
    for x, y in seeds:
        mask[y][x] = True
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not mask[ny][nx] and cls[ny][nx] in ("skin", "dark"):
                mask[ny][nx] = True
                q.append((nx, ny))
    m = Image.new("L", (w, h), 0)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            if mask[y][x]:
                mp[x, y] = 255
    return m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))


def fill_holes(m):
    w, h = m.size
    inv = Image.eval(m, lambda v: 255 if v < 128 else 0)
    border = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    for pt in border:
        if inv.getpixel(pt) == 255:
            ImageDraw.floodfill(inv, pt, 0)
    return ImageChops.lighter(m, inv)


def clean_mask(fr):
    m = head_mask(fr)
    ImageDraw.Draw(m).rectangle((0, TOP_CUT - 4, FW, FH), fill=0)
    m = m.point(lambda v: 255 if v >= 128 else 0)
    opened = m.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    m = ImageChops.multiply(m, opened.filter(ImageFilter.MaxFilter(3)))
    m = fill_holes(m.point(lambda v: 255 if v >= 128 else 0))
    row = TOP_CUT - 5
    xs = [x for x in range(FW) if m.getpixel((x, row)) > 0]
    if xs:
        ImageDraw.Draw(m).rectangle((xs[0], row, xs[-1], TOP_CUT), fill=255)
    return m


def avg_rgb(pixels):
    vals = list(pixels)
    n = max(1, len(vals))
    return tuple(sum(v[i] for v in vals) / n for i in range(3))


def main():
    sheet = Image.open(SRC).convert("RGBA")
    out = Image.new("RGBA", (FW * 4, FH * 5), (0, 0, 0, 0))
    for row, (room, box) in ROWS.items():
        art = Image.open(ROOMS[room]).convert("RGB")
        art_pillow = avg_rgb(art.crop((box[0] + 10, box[1] + 8, box[2] - 10, box[3] - 10)).getdata())
        first = sheet.crop((0, row * FH, FW, row * FH + FH))
        sprite_pillow = avg_rgb(p[:3] for p in first.crop((8, 22, 30, 60)).getdata() if p[3] > 200 and sum(p[:3]) > 600)
        mul = [min(1.0, art_pillow[i] / sprite_pillow[i] * 1.06) for i in range(3)]
        ref = None
        for col in range(4):
            fr = sheet.crop((col * FW, row * FH, col * FW + FW, row * FH + FH))
            m = clean_mask(fr)
            r, g, b, a = fr.split()
            r = r.point(lambda v, k=mul[0]: min(255, int(v * k)))
            g = g.point(lambda v, k=mul[1]: min(255, int(v * k)))
            b = b.point(lambda v, k=mul[2]: min(255, int(v * k)))
            fr = Image.merge("RGBA", (r, g, b, ImageChops.multiply(a, m)))
            if ref is None:
                ref = fr.getbbox()
            cell = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
            cell.paste(fr, (FW // 2 - (ref[0] + ref[2]) // 2, TOP_CUT - ref[3]), fr)
            out.paste(cell, (col * FW, row * FH))
    out.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({out.width}x{out.height})")


if __name__ == "__main__":
    main()
