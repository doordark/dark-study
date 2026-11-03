"""Pack imagegen-authored poses; only crop, align and downsample, never synthesize frames.

Requires Pillow. Raw generations are kept for reproducibility. Uneven source row
guides are intentional: the chicken is shorter than the human characters.
"""
import json
import statistics
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / 'assets/animation-sources'
report = []


def cell(image, box):
    tile = image.crop(tuple(round(n) for n in box)).convert('RGBA')
    # Discard near-invisible generative edge dust before bounding-box alignment.
    alpha = tile.getchannel('A').point(lambda n: 0 if n < 24 else n)
    tile.putalpha(alpha)
    # Some generated grids contain a sliver from a neighbouring cell. Find the
    # main connected silhouette rather than including those disconnected pixels.
    mask = bytearray(alpha.point(lambda n: 1 if n >= 96 else 0).tobytes())
    width, height = tile.size
    largest = 0
    bounds = None
    for start in range(len(mask)):
        if not mask[start]:
            continue
        stack = [start]
        mask[start] = 0
        count = 0
        left = right = start % width
        top = bottom = start // width
        while stack:
            index = stack.pop()
            x, y = index % width, index // width
            count += 1
            left, right = min(left, x), max(right, x)
            top, bottom = min(top, y), max(bottom, y)
            for neighbour in (index-1 if x else -1, index+1 if x+1 < width else -1, index-width, index+width):
                if 0 <= neighbour < len(mask) and mask[neighbour]:
                    mask[neighbour] = 0
                    stack.append(neighbour)
        if count > largest:
            largest = count
            bounds = (max(0,left-2), max(0,top-2), min(width,right+3), min(height,bottom+3))
    assert bounds, box
    return tile, bounds


def save(sheet, relative, columns, rows):
    path = ROOT / relative
    sheet.save(path, optimize=True)
    report.append(dict(path=relative, width=sheet.width, height=sheet.height,
                       columns=columns, rows=rows, bytes=path.stat().st_size,
                       rgbaMiB=round(sheet.width * sheet.height * 4 / 1048576, 3)))


def farm(name, columns, x_guides, y_guides):
    image = Image.open(SOURCES / f'farm-{name}.png')
    sheet = Image.new('RGBA', (columns * 128, 7 * 160))
    for row in range(7):
        tiles = [cell(image, (x_guides[c], y_guides[row], x_guides[c+1], y_guides[row+1])) for c in range(columns)]
        target = [140, 144, 136, 136, 140, 96, 144][row]
        factor = target / statistics.median(b[3]-b[1] for _, b in tiles)
        # Same scale across all poses, constrain widest gesture to the cell.
        factor = min(factor, 116 / max(b[2]-b[0] for _, b in tiles), 148 / max(b[3]-b[1] for _, b in tiles))
        for col, (tile, bounds) in enumerate(tiles):
            art = tile.crop(bounds)
            art = art.resize((round(art.width*factor), round(art.height*factor)), Image.Resampling.LANCZOS)
            sheet.alpha_composite(art, (col*128 + (128-art.width)//2, row*160+155-art.height))
    save(sheet, f'assets/images/farm-people-{name}-v2.png', columns, 7)


farm('walk', 8, [16,184,350,518,686,852,1020,1187,1341], [0,167,335,503,671,839,991,1173])
farm('idle', 6, [45,245,445,645,845,1045,1199], [0,198,398,600,786,978,1112,1312])
farm('talk', 6, [20,208,394,580,766,952,1140], [0,224,442,625,802,985,1122,1354])


def pet(name, columns, rows):
    image = Image.open(SOURCES / f'pet-{name}.png')
    tiles = [[cell(image, (c*image.width/columns, r*image.height/rows,
                          (c+1)*image.width/columns, (r+1)*image.height/rows))
              for c in range(columns)] for r in range(rows)]
    # Common scale within each authored sheet, including crouches/jump poses.
    factor = min(176 / max(b[2]-b[0] for row in tiles for _, b in row),
                 236 / max(b[3]-b[1] for row in tiles for _, b in row))
    sheet = Image.new('RGBA', (columns*192, rows*256))
    for r, row in enumerate(tiles):
        baseline = max(b[3] for _, b in row)
        for c, (tile, bounds) in enumerate(row):
            art = tile.crop(bounds)
            art = art.resize((max(1, round(art.width*factor)), max(1, round(art.height*factor))), Image.Resampling.LANCZOS)
            # Preserve authored jump/landing height; do not normalize it away.
            bottom = 246 - round((baseline-bounds[3])*factor)
            sheet.alpha_composite(art, (c*192+(192-art.width)//2, r*256+bottom-art.height))
    save(sheet, f'assets/whale/pet-{name}-v2.png', columns, rows)


pet('idle', 4, 3)
pet('dance', 4, 4)
pet('spin', 4, 4)
pet('actions', 8, 5)
(SOURCES / 'atlas-metrics.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
