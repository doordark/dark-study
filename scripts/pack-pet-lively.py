"""Extract and pack the 8x4 lively pet sprite atlas (walk, peek, dangle, cuddle) with clean alpha."""
import json
from collections import deque
from pathlib import Path
from PIL import Image

SRC_PATH = Path(
    r"C:\Users\door\.gemini\antigravity\brain\7d6e6d1e-7b7a-4136-b202-8c6ea3aac4a9\pet_lively_edited_v2_1795613485995.jpg"
)
ROOT = Path(__file__).resolve().parent.parent


def is_bg_pixel(r: int, g: int, b: int) -> bool:
    return r >= 235 and g >= 235 and b >= 235 and (max(r, g, b) - min(r, g, b)) <= 20


def find_spans(counts: list[int], min_len: int = 30, thresh: int = 2) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    in_span = False
    start = 0
    for i, c in enumerate(counts):
        if c >= thresh and not in_span:
            in_span = True
            start = i
        elif c < thresh and in_span:
            if i - start >= min_len:
                spans.append((start, i))
            in_span = False
    if in_span and len(counts) - start >= min_len:
        spans.append((start, len(counts)))
    return spans


def main() -> None:
    im = Image.open(SRC_PATH).convert("RGBA")
    width, height = im.size
    px = im.load()

    row_counts = [
        sum(1 for x in range(0, width, 2) if not is_bg_pixel(*px[x, y][:3]))
        for y in range(height)
    ]
    row_spans = find_spans(row_counts, min_len=80, thresh=5)
    assert len(row_spans) == 4, f"Expected 4 rows, got {row_spans}"

    all_rows: list[list[Image.Image]] = []
    for r_idx, (y0, y1) in enumerate(row_spans):
        pad_y0, pad_y1 = max(0, y0 - 4), min(height, y1 + 4)
        col_counts = [
            sum(1 for y in range(pad_y0, pad_y1, 2) if not is_bg_pixel(*px[x, y][:3]))
            for x in range(width)
        ]
        col_spans = find_spans(col_counts, min_len=45, thresh=2)
        print(f"Row {r_idx} raw col spans ({len(col_spans)}): {col_spans}")
        if r_idx == 1 and len(col_spans) == 9:
            # Drop index 4 (standing upright mid-row) so all 8 peek frames are perched/sitting poses.
            col_spans = [s for i, s in enumerate(col_spans) if i != 4]
        elif len(col_spans) > 8:
            col_spans = col_spans[:8]
        assert len(col_spans) == 8, f"Row {r_idx} expected 8 cols, got {len(col_spans)}"

        row_sprites: list[Image.Image] = []
        for x0, x1 in col_spans:
            pad_x0, pad_x1 = max(0, x0 - 4), min(width, x1 + 4)
            crop = im.crop((pad_x0, pad_y0, pad_x1, pad_y1)).convert("RGBA")
            cw, ch = crop.size
            cpx = crop.load()

            visited = bytearray(cw * ch)
            q: deque[tuple[int, int]] = deque()

            def push_if_bg(xx: int, yy: int) -> None:
                idx = yy * cw + xx
                if visited[idx]:
                    return
                r, g, b, _ = cpx[xx, yy]
                if is_bg_pixel(r, g, b):
                    visited[idx] = 1
                    q.append((xx, yy))

            for xx in range(cw):
                push_if_bg(xx, 0)
                push_if_bg(xx, ch - 1)
            for yy in range(ch):
                push_if_bg(0, yy)
                push_if_bg(cw - 1, yy)

            while q:
                xx, yy = q.popleft()
                cpx[xx, yy] = (0, 0, 0, 0)
                for nx, ny in ((xx - 1, yy), (xx + 1, yy), (xx, yy - 1), (xx, yy + 1)):
                    if 0 <= nx < cw and 0 <= ny < ch:
                        push_if_bg(nx, ny)

            # Clear enclosed pure-white gaps inside the top ahoge curl and tiny lower shoe/tail gaps
            seen_hole = bytearray(cw * ch)
            for yy in range(ch):
                if not (yy < int(ch * 0.18) or yy > int(ch * 0.78)):
                    continue
                for xx in range(cw):
                    idx = yy * cw + xx
                    if visited[idx] or seen_hole[idx]:
                        continue
                    r, g, b, a = cpx[xx, yy]
                    if a > 0 and r >= 245 and g >= 245 and b >= 245:
                        comp: list[tuple[int, int]] = []
                        hq: deque[tuple[int, int]] = deque([(xx, yy)])
                        seen_hole[idx] = 1
                        min_y = max_y = yy
                        while hq:
                            hx, hy = hq.popleft()
                            comp.append((hx, hy))
                            min_y = min(min_y, hy)
                            max_y = max(max_y, hy)
                            for nx, ny in ((hx - 1, hy), (hx + 1, hy), (hx, hy - 1), (hx, hy + 1)):
                                if 0 <= nx < cw and 0 <= ny < ch:
                                    nidx = ny * cw + nx
                                    if not visited[nidx] and not seen_hole[nidx]:
                                        nr, ng, nb, na = cpx[nx, ny]
                                        if na > 0 and nr >= 240 and ng >= 240 and nb >= 240:
                                            seen_hole[nidx] = 1
                                            hq.append((nx, ny))
                        if (max_y < int(ch * 0.24) and len(comp) < cw * ch * 0.045) or (
                            min_y > int(ch * 0.76) and len(comp) < cw * ch * 0.015
                        ):
                            for hx, hy in comp:
                                cpx[hx, hy] = (0, 0, 0, 0)
                                visited[hy * cw + hx] = 1

            # Soft de-fringe 1px anti-aliased white border pixels touching transparent background
            fringe: list[tuple[int, int, tuple[int, int, int, int]]] = []
            for yy in range(ch):
                for xx in range(cw):
                    r, g, b, a = cpx[xx, yy]
                    if a == 0:
                        continue
                    if r >= 205 and g >= 205 and b >= 205 and (max(r, g, b) - min(r, g, b)) <= 30:
                        if any(
                            0 <= nx < cw and 0 <= ny < ch and cpx[nx, ny][3] == 0
                            for nx, ny in ((xx - 1, yy), (xx + 1, yy), (xx, yy - 1), (xx, yy + 1))
                        ):
                            lum = (r + g + b) / 3.0
                            if lum >= 230:
                                fringe.append((xx, yy, (0, 0, 0, 0)))
                            else:
                                new_a = max(0, min(255, int((236 - lum) * 7)))
                                fringe.append(
                                    (xx, yy, (max(0, r - 40), max(0, g - 40), max(0, b - 25), new_a))
                                )
            for xx, yy, rgba in fringe:
                cpx[xx, yy] = rgba

            bbox = crop.getbbox()
            assert bbox is not None
            row_sprites.append(crop.crop(bbox))
        all_rows.append(row_sprites)

    max_w = max(sp.width for row in all_rows for sp in row)
    max_h = max(sp.height for row in all_rows for sp in row)
    factor = min(172.0 / max_w, 232.0 / max_h)
    print(f"Max bbox: {max_w}x{max_h}, scale={factor:.4f}")

    sheet = Image.new("RGBA", (8 * 192, 4 * 256), (0, 0, 0, 0))
    for r_idx, row in enumerate(all_rows):
        for c_idx, sp in enumerate(row):
            nw = max(1, round(sp.width * factor))
            nh = max(1, round(sp.height * factor))
            resized = sp.resize((nw, nh), Image.Resampling.LANCZOS)
            alpha = resized.getchannel("A").point(lambda n: 0 if n < 20 else n)
            resized.putalpha(alpha)
            dx = c_idx * 192 + (192 - nw) // 2
            dy = r_idx * 256 + ((256 - nh) // 2 if r_idx == 2 else 244 - nh)
            sheet.alpha_composite(resized, (dx, dy))

    src_out = ROOT / "assets/animation-sources/pet-lively.png"
    dst_out = ROOT / "assets/whale/pet-lively-v1.png"
    sheet.save(src_out, optimize=True)
    sheet.save(dst_out, optimize=True)

    metrics_path = ROOT / "assets/animation-sources/atlas-metrics.json"
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    metrics = [m for m in metrics if m["path"] != "assets/whale/pet-lively-v1.png"]
    metrics.append(
        dict(
            path="assets/whale/pet-lively-v1.png",
            width=sheet.width,
            height=sheet.height,
            columns=8,
            rows=4,
            bytes=dst_out.stat().st_size,
            rgbaMiB=round(sheet.width * sheet.height * 4 / 1048576, 3),
        )
    )
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(
        f"Packed {dst_out}: {dst_out.stat().st_size} bytes, {sheet.width}x{sheet.height}, "
        f"rgbaMiB={round(sheet.width * sheet.height * 4 / 1048576, 3)}"
    )


if __name__ == "__main__":
    main()
