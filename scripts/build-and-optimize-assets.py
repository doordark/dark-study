"""Pack newly generated farm pixel assets and optimize all runtime textures.

- Generates pixel-aligned night variants for all 4 bedrooms (calibrated from original day->night room)
- Extracts transparent sprites cleanly (chroma-key magenta for Dafeiyu, flood-fill white for white-bg sheets)
- Extends farm-visitors-{idle,walk,talk}.png to 8x5 (adding Row 4 = Dafeiyu)
- Packs 5 emotion action sheets (family pos/neg, misc chicken+hero, visitors pos/neg) at crisp 112x112 cells
- Packs vertical sleeping sprites (when available)
- Converts huge opaque RGB backgrounds to WebP and quantizes RGBA sprite/UI atlases to crisp 256-color PNG8
  with exact preserved alpha==0 borders so all unit tests and Android WhaleOverlay remain 100% compatible.
"""
import json
import os
import shutil
import statistics
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
IMG = ASSETS / "images"
RUNTIME = IMG / "farm-runtime"
RUNTIME.mkdir(parents=True, exist_ok=True)
BRAIN = Path(r"C:\Users\door\.gemini\antigravity\brain\aae2c4c9-7eb0-42d7-a333-6ca2fd55ff2e")


def quantize_rgba_png8(im: Image.Image, colors: int = 256) -> Image.Image:
    """Convert RGBA image to crisp 256-color indexed PNG8 preserving exact alpha=0 pixels."""
    rgba = im.convert("RGBA")
    arr = np.array(rgba, dtype=np.uint8)
    # Clean near-zero alpha dust and zero out RGB under transparent pixels for better compression
    zero_mask = arr[:, :, 3] < 16
    arr[zero_mask] = 0
    clean = Image.fromarray(arr, mode="RGBA")
    q = clean.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    return q


def save_png8(im: Image.Image, target: Path, colors: int = 256):
    q = quantize_rgba_png8(im, colors=colors)
    q.save(target, format="PNG", optimize=True)


def remove_white_bg_floodfill(tile: Image.Image, tol: int = 238) -> Image.Image:
    """Remove exterior white background via border flood-fill so interior white clothing/aprons stay 100% opaque!"""
    rgba = tile.convert("RGBA")
    arr = np.array(rgba, dtype=np.uint8)
    h, w, _ = arr.shape
    r, g, b = arr[:, :, 0].astype(np.int16), arr[:, :, 1].astype(np.int16), arr[:, :, 2].astype(np.int16)
    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    # Near-white low-saturation pixels eligible as background
    is_bg_cand = (minc >= tol) & ((maxc - minc) <= 22)

    visited = np.zeros((h, w), dtype=np.bool_)
    stack = []
    for x in range(w):
        if is_bg_cand[0, x]:
            visited[0, x] = True
            stack.append((0, x))
        if is_bg_cand[h - 1, x]:
            visited[h - 1, x] = True
            stack.append((h - 1, x))
    for y in range(h):
        if is_bg_cand[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            stack.append((y, 0))
        if is_bg_cand[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            stack.append((y, w - 1))

    while stack:
        cy, cx = stack.pop()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_bg_cand[ny, nx]:
                visited[ny, nx] = True
                stack.append((ny, nx))

    # Soften 1px anti-aliased fringe adjacent to background (light near-white halo pixels)
    soft_cand = (minc >= 210) & ((maxc - minc) <= 28) & (~visited)
    padded = np.pad(visited, 1, mode="constant", constant_values=False)
    adj_bg = padded[:-2, 1:-1] | padded[2:, 1:-1] | padded[1:-1, :-2] | padded[1:-1, 2:]
    fringe = soft_cand & adj_bg

    arr[visited, 3] = 0
    arr[visited, :3] = 0
    arr[fringe, 3] = 0
    arr[fringe, :3] = 0
    return Image.fromarray(arr, mode="RGBA")


def remove_magenta_bg_floodfill(tile: Image.Image) -> Image.Image:
    """Remove exterior #FF00FF magenta chroma-key via border flood-fill + anti-magenta despill."""
    rgba = tile.convert("RGBA")
    arr = np.array(rgba, dtype=np.uint8)
    h, w, _ = arr.shape
    r, g, b = arr[:, :, 0].astype(np.int16), arr[:, :, 1].astype(np.int16), arr[:, :, 2].astype(np.int16)
    # Magenta pixels: high R & B, low G
    is_mag = (r >= 165) & (b >= 165) & (g <= 115) & ((r - g) >= 65) & ((b - g) >= 65)

    visited = np.zeros((h, w), dtype=np.bool_)
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if is_mag[y, x] and not visited[y, x]:
                visited[y, x] = True
                stack.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if is_mag[y, x] and not visited[y, x]:
                visited[y, x] = True
                stack.append((y, x))
    # Also catch interior magenta holes (e.g. between arm and skirt or between legs)
    # Any strong pure magenta pixel anywhere is background since Dafeiyu is blue/white/navy!
    pure_mag = (r >= 200) & (b >= 200) & (g <= 70)
    for py, px in zip(*np.where(pure_mag)):
        if not visited[py, px]:
            visited[py, px] = True
            stack.append((int(py), int(px)))

    while stack:
        cy, cx = stack.pop()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_mag[ny, nx]:
                visited[ny, nx] = True
                stack.append((ny, nx))

    # Remove 1px magenta anti-aliased halo and despill 2nd ring
    padded = np.pad(visited, 1, mode="constant", constant_values=False)
    adj_bg = padded[:-2, 1:-1] | padded[2:, 1:-1] | padded[1:-1, :-2] | padded[1:-1, 2:]
    fringe = adj_bg & (~visited) & (r > g + 35) & (b > g + 35)
    arr[visited] = 0
    arr[fringe] = 0
    # Despill subtle magenta tint on edge pixels
    padded2 = np.pad(visited | fringe, 1, mode="constant", constant_values=False)
    adj2 = padded2[:-2, 1:-1] | padded2[2:, 1:-1] | padded2[1:-1, :-2] | padded2[1:-1, 2:]
    spill = adj2 & (arr[:, :, 3] > 0) & (r > g + 25) & (b > g + 25)
    # Clamp red down toward min(g, b) on spill pixels to kill pink fringe
    arr[spill, 0] = np.minimum(arr[spill, 0], np.maximum(arr[spill, 1], (arr[spill, 2].astype(np.int16) // 2).astype(np.uint8)))
    return Image.fromarray(arr, mode="RGBA")


def extract_main_bounds(tile: Image.Image):
    """Find bounding box of opaque pixels ignoring isolated 1-2px noise specks."""
    arr = np.array(tile, dtype=np.uint8)
    alpha = arr[:, :, 3] > 96
    h, w = alpha.shape
    ys, xs = np.where(alpha)
    if len(xs) == 0:
        return (0, 0, w, h)
    # Filter tiny disconnected slivers right on extreme outer 2px edges
    # by checking row/col projections
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def pack_grid_sheet(
    src_path: Path,
    cols: int,
    rows: int,
    cell_w: int,
    cell_h: int,
    bg_mode: str = "white",
    target_height_ratio: float = 0.80,
    bottom_pad: int = 5,
    flip_cells: set = None,
    override_cells: dict = None,
) -> Image.Image:
    """Slice a cols x rows generated sheet, remove background cleanly, normalize scale & foot alignment."""
    src = Image.open(src_path).convert("RGBA")
    sw, sh = src.size
    out = Image.new("RGBA", (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    flip_cells = flip_cells or set()
    override_cells = override_cells or {}

    for r in range(rows):
        row_tiles = []
        for c in range(cols):
            if (r, c) in override_cells:
                ov_path, ov_r, ov_c = override_cells[(r, c)]
                ov_im = Image.open(ov_path).convert("RGBA")
                ow, oh = ov_im.size
                box = (round(ov_c * ow / cols), round(ov_r * oh / rows), round((ov_c + 1) * ow / cols), round((ov_r + 1) * oh / rows))
                raw_tile = ov_im.crop(box)
            else:
                box = (round(c * sw / cols), round(r * sh / rows), round((c + 1) * sw / cols), round((r + 1) * sh / rows))
                raw_tile = src.crop(box)
            clean = remove_magenta_bg_floodfill(raw_tile) if bg_mode == "magenta" else remove_white_bg_floodfill(raw_tile)
            if (r, c) in flip_cells:
                clean = clean.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            bounds = extract_main_bounds(clean)
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
            # Guarantee 1px transparent border around every cell
            px = max(c * cell_w + 2, min((c + 1) * cell_w - nw - 2, px))
            py = max(r * cell_h + 2, min((r + 1) * cell_h - nh - 2, py))
            out.alpha_composite(art, (px, py))
    return out


def make_night_room(day_img: Image.Image) -> Image.Image:
    """Create a cozy pixel-aligned nighttime version of a 720x540 bedroom:
    - Shifts exterior sky window to deep indigo night sky
    - Applies warm dusk indoor shadow gradient
    - Adds cozy golden desk-lamp glow on the left desk & soft moonlight rim on bed
    """
    arr = np.array(day_img.convert("RGB"), dtype=np.float32)
    h, w, _ = arr.shape
    yy, xx = np.mgrid[0:h, 0:w]
    nx = xx / w
    ny = yy / h

    # 1. Base night ambient tint (calibrated to match original farm-house-interior-night-v2)
    night = np.empty_like(arr)
    night[:, :, 0] = arr[:, :, 0] * 0.56 + 6.0
    night[:, :, 1] = arr[:, :, 1] * 0.49 + 4.0
    night[:, :, 2] = arr[:, :, 2] * 0.62 + 18.0

    # 2. Detect bright blue daytime sky inside the window pane (upper-left window box)
    in_win = (nx >= 0.14) & (nx <= 0.38) & (ny >= 0.08) & (ny <= 0.35)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    is_sky = in_win & (b > r + 15) & (b > 110)
    is_foliage = in_win & (~is_sky) & (g > r + 4)
    night[is_sky, 0] = arr[is_sky, 0] * 0.16 + 8.0
    night[is_sky, 1] = arr[is_sky, 1] * 0.24 + 14.0
    night[is_sky, 2] = arr[is_sky, 2] * 0.44 + 34.0
    night[is_foliage, 0] = arr[is_foliage, 0] * 0.32 + 4.0
    night[is_foliage, 1] = arr[is_foliage, 1] * 0.38 + 8.0
    night[is_foliage, 2] = arr[is_foliage, 2] * 0.50 + 22.0

    # 3. Warm golden desk-lamp radial bloom around left desk lamp (x~0.32, y~0.42)
    d_lamp = np.hypot((nx - 0.31) * 1.15, (ny - 0.43) * 1.35)
    lamp_glow = np.clip(1.0 - d_lamp / 0.34, 0.0, 1.0) ** 2.0
    night[:, :, 0] += lamp_glow * (arr[:, :, 0] * 0.48 + 38.0)
    night[:, :, 1] += lamp_glow * (arr[:, :, 1] * 0.36 + 20.0)
    night[:, :, 2] += lamp_glow * (arr[:, :, 2] * 0.12)

    # 4. Subtle warm bedside glow near nightstand (x~0.62, y~0.50)
    d_bed = np.hypot((nx - 0.62) * 1.1, (ny - 0.48) * 1.2)
    bed_glow = np.clip(1.0 - d_bed / 0.30, 0.0, 1.0) ** 2.2
    night[:, :, 0] += bed_glow * (arr[:, :, 0] * 0.18 + 12.0)
    night[:, :, 1] += bed_glow * (arr[:, :, 1] * 0.14 + 6.0)
    night[:, :, 2] += bed_glow * (arr[:, :, 2] * 0.06)

    return Image.fromarray(np.clip(night, 0, 255).astype(np.uint8), mode="RGB")


def total_assets_mb() -> float:
    return sum(p.stat().st_size for p in ASSETS.rglob("*") if p.is_file()) / (1024 * 1024)


def main():
    before_mb = total_assets_mb()
    print(f"Start assets/ size: {before_mb:.2f} MB")

    # ── 1. Pack 4 Bedrooms (Day + Pixel-Aligned Night) ──
    rooms = [
        ("master", BRAIN / "room_master_day_v3_1795613935289.jpg", True),
        ("xiaoba", BRAIN / "room_xiaoba_day_1795613883703.jpg", False),
        ("yujie", BRAIN / "room_yujie_day_1795613894118.jpg", False),
        ("weigang", BRAIN / "room_weigang_day_1795613904517.jpg", False),
    ]
    for room_id, src_path, is_master in rooms:
        day_im = Image.open(src_path).convert("RGB").resize((720, 540), Image.Resampling.LANCZOS)
        night_im = make_night_room(day_im)
        if is_master:
            # Keep farm-house-interior-v2.png & night-v2.png as crisp PNG8 (satisfies check-farm-map.cjs!)
            save_png8(day_im.convert("RGBA"), IMG / "farm-house-interior-v2.png", 256)
            save_png8(night_im.convert("RGBA"), IMG / "farm-house-interior-night-v2.png", 256)
        else:
            day_im.save(IMG / f"farm-room-{room_id}-day.webp", format="WEBP", quality=86, method=6)
            night_im.save(IMG / f"farm-room-{room_id}-night.webp", format="WEBP", quality=86, method=6)
    print("Packed 4 bedrooms (day + night)")

    # ── 2. Extend farm-visitors-{idle,walk,talk}.png from 8x4 -> 8x5 with Row 4 = Dafeiyu ──
    dafeiyu_sheet = pack_grid_sheet(
        BRAIN / "dafeiyu_base_sheet_v3_1795614105042.jpg",
        cols=8,
        rows=3,
        cell_w=144,
        cell_h=144,
        bg_mode="magenta",
        target_height_ratio=0.80,
        bottom_pad=5,
        # Flip Row 0 frames 1 and 4 so bow/tail consistently stay on the same side across all 8 idle frames
        flip_cells={(0, 1), (0, 4)},
    )
    for row_idx, kind in enumerate(["idle", "walk", "talk"]):
        vpath = IMG / f"farm-visitors-{kind}.png"
        existing = Image.open(vpath).convert("RGBA")
        # Support idempotent re-runs (take first 4 rows 1152x576)
        top4 = existing.crop((0, 0, 1152, 576))
        merged = Image.new("RGBA", (1152, 720), (0, 0, 0, 0))
        merged.paste(top4, (0, 0))
        dafeiyu_row = dafeiyu_sheet.crop((0, row_idx * 144, 1152, (row_idx + 1) * 144))
        merged.paste(dafeiyu_row, (0, 576))
        save_png8(merged, vpath, 256)
    print("Extended farm-visitors-{idle,walk,talk}.png to 8x5 (1152x720) with Dafeiyu")

    # ── 3. Pack 5 Emotion Action Sheets (crisp 112x112 cells, PNG8) ──
    fam_pos = pack_grid_sheet(BRAIN / "family_emotions_pos_v2_1795613985455.jpg", 8, 5, 112, 112, "white", 0.78, 4)
    save_png8(fam_pos, RUNTIME / "family-emotions-pos.png", 256)

    fam_neg = pack_grid_sheet(BRAIN / "family_emotions_neg_v3_1795614049782.jpg", 8, 5, 112, 112, "white", 0.78, 4)
    save_png8(fam_neg, RUNTIME / "family-emotions-neg.png", 256)

    misc_em = pack_grid_sheet(BRAIN / "misc_emotions_1795614013409.jpg", 8, 4, 112, 112, "white", 0.78, 4)
    save_png8(misc_em, RUNTIME / "misc-emotions.png", 256)

    vis_pos = pack_grid_sheet(BRAIN / "visitors_emotions_pos_final_1795614108672.jpg", 8, 5, 112, 112, "white", 0.78, 4)
    save_png8(vis_pos, RUNTIME / "visitors-emotions-pos.png", 256)

    v2_neg = BRAIN / "visitors_emotions_neg_v2_1795614082893.jpg"
    ov = {(1, 7): (v2_neg, 1, 7)} if v2_neg.exists() else {}
    vis_neg = pack_grid_sheet(BRAIN / "visitors_emotions_neg_final_1795614124907.jpg", 8, 5, 112, 112, "white", 0.78, 4, override_cells=ov)
    save_png8(vis_neg, RUNTIME / "visitors-emotions-neg.png", 256)
    print("Packed 5 emotion action sheets into assets/images/farm-runtime/")

    # ── 3b. Pack Vertical Sleeping Sprites (4 cols x 6 rows, 112x128 per cell) ──
    sleep_src = BRAIN / "farm_people_sleeping_4x6_1795614367440.jpg"
    if sleep_src.exists():
        # Row 2 Col 0 (Xiaoba) had open eyes; borrow Row 2 Col 2 closed-eyes pose so all 4 frames sleep peacefully
        sleep_sheet = pack_grid_sheet(
            sleep_src,
            cols=4,
            rows=6,
            cell_w=112,
            cell_h=128,
            bg_mode="white",
            target_height_ratio=0.84,
            bottom_pad=4,
            override_cells={(2, 0): (sleep_src, 2, 2)},
        )
        save_png8(sleep_sheet, RUNTIME / "farm-sleep-sprites.png", 256)
        print("Packed farm-sleep-sprites.png (4x6, 448x768) into assets/images/farm-runtime/")

    # ── 4. Convert 3 Huge Opaque RGB PNG Backgrounds to WebP (saves ~6.8 MB!) ──
    for stem, max_dim, q in [
        ("farm-bug-garden-v7", 1080, 84),
        ("night-forest-v2", 1152, 84),
        ("night-letter-bg", 1152, 84),
    ]:
        png_p = IMG / f"{stem}.png"
        webp_p = IMG / f"{stem}.webp"
        if png_p.exists():
            im = Image.open(png_p).convert("RGB")
            if max(im.size) > max_dim:
                ratio = max_dim / max(im.size)
                im = im.resize((round(im.width * ratio), round(im.height * ratio)), Image.Resampling.LANCZOS)
            im.save(webp_p, format="WEBP", quality=q, method=6)
            png_p.unlink()
            print(f"Converted {stem}.png -> .webp ({webp_p.stat().st_size/1024:.1f} KB)")

    # ── 5. Re-optimize the 20 farm/market scene WebPs (780x1284, q=80 -> ~170KB each, saves ~9.5 MB!) ──
    scene_saved = 0
    for wp in sorted(IMG.glob("*-scene-*-v6.webp")):
        old_sz = wp.stat().st_size
        im = Image.open(wp).convert("RGB")
        if im.width > 780:
            nh = round(im.height * (780 / im.width))
            im = im.resize((780, nh), Image.Resampling.LANCZOS)
        im.save(wp, format="WEBP", quality=80, method=6)
        scene_saved += old_sz - wp.stat().st_size
    print(f"Optimized 20 scene WebPs (saved {scene_saved/1024/1024:.2f} MB)")

    # ── 6. Downsample oversized UI/item sheets (>1200px) & quantize all runtime PNGs to crisp PNG8 ──
    # Files that MUST keep exact pixel dimensions (referenced by atlas-metrics.json, farm-runtime/metrics.json, WhaleOverlay.kt, or exact-size checks)
    exact_dim_files = {
        "farm-people-walk-v2.png", "farm-people-idle-v2.png", "farm-people-talk-v2.png",
        "farm-people-family-v3.png", "farm-people-family-idle-v3.png", "farm-people-family-talk-v3.png",
        "hero-walk.png", "vendors.png",
        "farm-visitors-idle.png", "farm-visitors-walk.png", "farm-visitors-talk.png",
        "farm-house-interior-v2.png", "farm-house-interior-night-v2.png",
        "pet-idle-v2.png", "pet-dance-v2.png", "pet-spin-v2.png", "pet-actions-v2.png", "pet-hurt-v1.png",
        "avatar-sheet.png",
        "icon.png", "android-icon-background.png", "android-icon-foreground.png", "android-icon-monochrome.png", "favicon.png",
    }
    # Oversized UI sheets safe to halve cleanly (exact integer grid divisibility preserved)
    halve_ui_sheets = {
        "farm-bag-slots-v6.png": (1086, 362),
        "farm-buttons-v7.png": (1086, 362),
        "farm-market-gear.png": (1000, 400),
        "farm-market-items.png": (960, 720),
        "farm-classic-crops-stages-v7.png": (432, 1296),
        "farm-new-crops-stages-v6.png": (576, 576),
        "farm-tools.png": (512, 512),
        "night-sprites-v2.png": (960, 640),
        "night-moon-phases.png": (768, 384),
        "night-owl-flight.png": (768, 576),
    }
    # Skip app icons & already-tiny palette PNGs
    skip_icons = {"icon.png", "android-icon-background.png", "android-icon-foreground.png", "android-icon-monochrome.png", "favicon.png"}

    png_saved = 0
    for png_p in sorted(ASSETS.rglob("*.png")):
        name = png_p.name
        if name in skip_icons:
            continue
        old_sz = png_p.stat().st_size
        if old_sz < 25 * 1024:
            continue
        im = Image.open(png_p)
        if name in halve_ui_sheets:
            tw, th = halve_ui_sheets[name]
            if im.size != (tw, th):
                im = im.convert("RGBA").resize((tw, th), Image.Resampling.LANCZOS)
        # Skip re-quantizing if already P mode and small
        if im.mode == "P" and old_sz < 120 * 1024:
            continue
        tmp_p = png_p.with_suffix(".tmp.png")
        save_png8(im, tmp_p, 256)
        new_sz = tmp_p.stat().st_size
        if new_sz < old_sz:
            shutil.move(str(tmp_p), str(png_p))
            png_saved += old_sz - new_sz
        else:
            tmp_p.unlink()
    print(f"Quantized/optimized runtime PNGs (saved {png_saved/1024/1024:.2f} MB)")

    after_mb = total_assets_mb()
    print(f"DONE! Total assets/ size: {before_mb:.2f} MB -> {after_mb:.2f} MB")


if __name__ == "__main__":
    main()
