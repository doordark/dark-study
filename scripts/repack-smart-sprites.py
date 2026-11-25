"""Re-pack all newly generated sprite sheets with automatic valley-based row/col slicing
and connected-component sliver removal so ZERO feet are clipped and ZERO neighbor specks appear!
"""
import statistics
from pathlib import Path
import numpy as np
from PIL import Image

from importlib.machinery import SourceFileLoader

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets/images"
RUNTIME = IMG / "farm-runtime"
BRAIN = Path(r"C:\Users\door\.gemini\antigravity\brain\aae2c4c9-7eb0-42d7-a333-6ca2fd55ff2e")

mod = SourceFileLoader("opt", str(ROOT / "scripts/build-and-optimize-assets.py")).load_module()


def find_valley_guides(fg_mask: np.ndarray, count: int, axis: int) -> list[int]:
    """Find `count + 1` cut positions along axis (0=rows/y, 1=cols/x) by picking the lowest-density
    whitespace valley near each expected uniform split."""
    # fg_mask is (H, W) bool where True = foreground sprite pixel
    proj = fg_mask.sum(axis=1 - axis)  # density along the split axis
    length = len(proj)
    guides = [0]
    for i in range(1, count):
        expected = round(i * length / count)
        win = max(6, round(length / count * 0.34))
        lo = max(guides[-1] + 8, expected - win)
        hi = min(length - 8, expected + win)
        seg = proj[lo : hi + 1]
        min_val = int(seg.min())
        # Among indices achieving minimum density (usually 0!), pick the center of the widest zero run nearest expected
        mins = np.where(seg == min_val)[0] + lo
        if len(mins) > 1:
            # Find contiguous runs and pick the run whose midpoint is closest to expected
            runs = []
            start = prev = int(mins[0])
            for v in mins[1:]:
                v = int(v)
                if v == prev + 1:
                    prev = v
                else:
                    runs.append((start, prev))
                    start = prev = v
            runs.append((start, prev))
            # Prefer widest run near expected
            best_run = max(runs, key=lambda r: (r[1] - r[0]) - abs((r[0] + r[1]) / 2 - expected) * 0.15)
            cut = round((best_run[0] + best_run[1]) / 2)
        else:
            cut = int(mins[0])
        guides.append(cut)
    guides.append(length)
    return guides


def clean_edge_slivers(tile: Image.Image) -> Image.Image:
    """Drop tiny disconnected fragments touching the extreme outer 3px cell border (e.g., neighbor's tail tip)."""
    arr = np.array(tile, dtype=np.uint8)
    h, w, _ = arr.shape
    mask = arr[:, :, 3] > 32
    visited = np.zeros((h, w), dtype=np.bool_)
    comps = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not visited[y, x]:
                stack = [(y, x)]
                visited[y, x] = True
                pts = []
                touches_edge = False
                while stack:
                    cy, cx = stack.pop()
                    pts.append((cy, cx))
                    if cy <= 2 or cy >= h - 3 or cx <= 2 or cx >= w - 3:
                        touches_edge = True
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not visited[ny, nx]:
                            visited[ny, nx] = True
                            stack.append((ny, nx))
                comps.append((len(pts), touches_edge, pts))
    if not comps:
        return tile
    largest = max(c[0] for c in comps)
    for size, touches_edge, pts in comps:
        # Remove small edge slivers (<12% of main body) touching the cut border, or 1-4px dust anywhere
        if (touches_edge and size < largest * 0.12) or size <= 4:
            for py, px in pts:
                arr[py, px] = 0
    return Image.fromarray(arr, mode="RGBA")


def pack_smart_sheet(
    src_path: Path,
    cols: int,
    rows: int,
    cell_w: int,
    cell_h: int,
    bg_mode: str = "white",
    target_height_ratio: float = 0.78,
    bottom_pad: int = 4,
    flip_cells: set = None,
    override_cells: dict = None,
) -> Image.Image:
    src = Image.open(src_path).convert("RGBA")
    arr = np.array(src, dtype=np.uint8)
    r_c, g_c, b_c = arr[:, :, 0].astype(np.int16), arr[:, :, 1].astype(np.int16), arr[:, :, 2].astype(np.int16)
    if bg_mode == "magenta":
        is_bg = (r_c >= 170) & (b_c >= 170) & (g_c <= 110) & ((r_c - g_c) >= 65) & ((b_c - g_c) >= 65)
    else:
        maxc = np.maximum(np.maximum(r_c, g_c), b_c)
        minc = np.minimum(np.minimum(r_c, g_c), b_c)
        is_bg = (minc >= 238) & ((maxc - minc) <= 20)
    fg = ~is_bg

    y_guides = find_valley_guides(fg, rows, axis=0)
    x_guides = find_valley_guides(fg, cols, axis=1)
    print(f"  {src_path.name}: y={y_guides}, x={x_guides}")

    # Pre-load override sources' guides if any
    ov_cache = {}
    override_cells = override_cells or {}
    for _, (ov_p, _, _) in override_cells.items():
        if ov_p not in ov_cache:
            oim = Image.open(ov_p).convert("RGBA")
            oa = np.array(oim, dtype=np.uint8)
            or_c, og_c, ob_c = oa[:, :, 0].astype(np.int16), oa[:, :, 1].astype(np.int16), oa[:, :, 2].astype(np.int16)
            omax = np.maximum(np.maximum(or_c, og_c), ob_c)
            omin = np.minimum(np.minimum(or_c, og_c), ob_c)
            ofg = ~((omin >= 238) & ((omax - omin) <= 20))
            ov_cache[ov_p] = (oim, find_valley_guides(ofg, rows, axis=0), find_valley_guides(ofg, cols, axis=1))

    out = Image.new("RGBA", (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    flip_cells = flip_cells or set()

    for r in range(rows):
        # Also compute per-row x_guides so slight horizontal drift on one row never clips!
        row_fg = fg[y_guides[r] : y_guides[r + 1], :]
        row_x = find_valley_guides(row_fg, cols, axis=1)
        row_tiles = []
        for c in range(cols):
            if (r, c) in override_cells:
                ov_p, ov_r, ov_c = override_cells[(r, c)]
                oim, oyg, oxg = ov_cache[ov_p]
                raw_tile = oim.crop((oxg[ov_c], oyg[ov_r], oxg[ov_c + 1], oyg[ov_r + 1]))
            else:
                raw_tile = src.crop((row_x[c], y_guides[r], row_x[c + 1], y_guides[r + 1]))
            clean = mod.remove_magenta_bg_floodfill(raw_tile) if bg_mode == "magenta" else mod.remove_white_bg_floodfill(raw_tile)
            clean = clean_edge_slivers(clean)
            if (r, c) in flip_cells:
                clean = clean.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            bounds = mod.extract_main_bounds(clean)
            row_tiles.append((clean, bounds))

        heights = [b[3] - b[1] for _, b in row_tiles]
        max_w = max(b[2] - b[0] for _, b in row_tiles)
        max_h = max(heights)
        med_h = statistics.median(heights)
        usable_w = cell_w - 8
        usable_h = cell_h - bottom_pad - 6
        factor = (cell_h * target_height_ratio) / max(1, med_h)
        factor = min(factor, usable_w / max(1, max_w), usable_h / max(1, max_h))

        for c, (clean, b) in enumerate(row_tiles):
            art = clean.crop(b)
            nw = max(1, round(art.width * factor))
            nh = max(1, round(art.height * factor))
            art = art.resize((nw, nh), Image.Resampling.LANCZOS)
            px = c * cell_w + (cell_w - nw) // 2
            py = r * cell_h + cell_h - bottom_pad - nh
            px = max(c * cell_w + 2, min((c + 1) * cell_w - nw - 2, px))
            py = max(r * cell_h + 2, min((r + 1) * cell_h - nh - 2, py))
            out.alpha_composite(art, (px, py))
    return out


def main():
    # 1. Re-pack Dafeiyu 8x3 and merge cleanly into 8x5 farm-visitors-{idle,walk,talk}.png
    dafeiyu_sheet = pack_smart_sheet(
        BRAIN / "dafeiyu_base_sheet_v3_1795614105042.jpg",
        cols=8, rows=3, cell_w=144, cell_h=144,
        bg_mode="magenta", target_height_ratio=0.80, bottom_pad=5,
        flip_cells={(0, 1), (0, 4)},
    )
    for row_idx, kind in enumerate(["idle", "walk", "talk"]):
        vpath = IMG / f"farm-visitors-{kind}.png"
        existing = Image.open(vpath).convert("RGBA")
        top4 = existing.crop((0, 0, 1152, 576))
        merged = Image.new("RGBA", (1152, 720), (0, 0, 0, 0))
        merged.paste(top4, (0, 0))
        merged.paste(dafeiyu_sheet.crop((0, row_idx * 144, 1152, (row_idx + 1) * 144)), (0, 576))
        mod.save_png8(merged, vpath, 256)

    # 2. Re-pack all 5 emotion action sheets with zero clipped feet!
    mod.save_png8(pack_smart_sheet(BRAIN / "family_emotions_pos_v2_1795613985455.jpg", 8, 5, 112, 112, "white", 0.78, 4), RUNTIME / "family-emotions-pos.png", 256)
    mod.save_png8(pack_smart_sheet(BRAIN / "family_emotions_neg_v3_1795614049782.jpg", 8, 5, 112, 112, "white", 0.78, 4), RUNTIME / "family-emotions-neg.png", 256)
    mod.save_png8(pack_smart_sheet(BRAIN / "misc_emotions_1795614013409.jpg", 8, 4, 112, 112, "white", 0.78, 4), RUNTIME / "misc-emotions.png", 256)
    mod.save_png8(pack_smart_sheet(BRAIN / "visitors_emotions_pos_final_1795614108672.jpg", 8, 5, 112, 112, "white", 0.78, 4), RUNTIME / "visitors-emotions-pos.png", 256)

    v2_neg = BRAIN / "visitors_emotions_neg_v2_1795614082893.jpg"
    ov = {(1, 7): (v2_neg, 1, 7)} if v2_neg.exists() else {}
    mod.save_png8(pack_smart_sheet(BRAIN / "visitors_emotions_neg_final_1795614124907.jpg", 8, 5, 112, 112, "white", 0.78, 4, override_cells=ov), RUNTIME / "visitors-emotions-neg.png", 256)

    # 3. Re-pack vertical sleeping sprites cleanly
    sleep_src = BRAIN / "farm_people_sleeping_4x6_1795614367440.jpg"
    mod.save_png8(pack_smart_sheet(sleep_src, 4, 6, 112, 128, "white", 0.84, 4, override_cells={(2, 0): (sleep_src, 2, 2)}), RUNTIME / "farm-sleep-sprites.png", 256)

    total_mb = sum(p.stat().st_size for p in (ROOT / "assets").rglob("*") if p.is_file()) / (1024 * 1024)
    print(f"Re-packed all sheets cleanly! Total assets/: {total_mb:.2f} MB")


if __name__ == "__main__":
    main()
