"""Deterministic runtime copies; keep authored sources intact.

Family cells retain 144px detail. The hero strip bakes the exact existing
viewport crop into each frame, removing transparent pixels outside the view.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'assets/images'
OUT = ART / 'farm-runtime'
OUT.mkdir(exist_ok=True)
metrics = []


def save(source, result, name, columns, rows):
    target = OUT / name
    result.save(target, optimize=True)
    metrics.append(dict(file=name, columns=columns, rows=rows,
                        width=result.width, height=result.height,
                        sourceRGBABytes=source.width * source.height * 4,
                        runtimeRGBABytes=result.width * result.height * 4))


for name in ['farm-people-family-v3.png', 'farm-people-family-idle-v3.png',
             'farm-people-family-talk-v3.png']:
    with Image.open(ART / name) as source:
        result = source.convert('RGBA').resize((1152, 720), Image.Resampling.LANCZOS)
        save(source, result, name, 8, 5)

with Image.open(ART / 'farm-market-vendors-idle-alpha-v6.png') as source:
    result = source.convert('RGBA').resize((1152, 768), Image.Resampling.LANCZOS)
    save(source, result, 'vendors.png', 8, 4)

with Image.open(ART / 'farm-player-walk-left-v7.png') as source:
    source = source.convert('RGBA')
    result = Image.new('RGBA', (1152, 180))
    for frame in range(8):
        # Matches FarmPersonSprite's former top=-size*200/271.5 crop.
        box = (frame * 271.5, 200, (frame + 1) * 271.5, 200 + 271.5 * 1.25)
        tile = source.resize((144, 180), Image.Resampling.LANCZOS, box=box)
        result.paste(tile, (frame * 144, 0))
    save(source, result, 'hero-walk.png', 8, 1)

(OUT / 'metrics.json').write_text(json.dumps(metrics, indent=2) + '\n', encoding='utf-8')
before = sum(m['sourceRGBABytes'] for m in metrics)
after = sum(m['runtimeRGBABytes'] for m in metrics)
print(f'RGBA texture estimate: {before/1048576:.2f} -> {after/1048576:.2f} MiB ({(1-after/before)*100:.1f}% smaller)')
