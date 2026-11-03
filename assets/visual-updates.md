# Pet and easter egg assets

Generated with built-in imagegen, using the existing `whale/pet-idle.png` as the character reference. Original generated files remain in the Codex generated_images folder.

## Pet idle animation

- `whale/pet-idle-sheet.png`: transparent 1536×1024 PNG, 4 columns × 2 rows, 384×512 cells. Read left to right then top to bottom.
- Eight poses: open eyes / gentle sway / sway / half blink / closed eyes / reopening / open / return.
- Player: `src/components/PetIdleAnimation.tsx`. Per-pose timing includes a longer open-eye hold so blinking does not repeat continuously. UI-thread atlas offsets, no per-frame React state updates; stops when app is backgrounded.
- Generation brief: preserve the existing blue-haired chibi maid's outfit, face, hairstyle, whale ornament and proportions; eight subtle seamless breathing poses with blinking, hair and skirt secondary motion; full body, equal cells, same scale, aligned feet, no grid or labels. A second imagegen edit removed the grey backdrop while retaining all eight poses and replaced empty areas with real alpha.

## Farm props

- `images/farm-props.png`: transparent 1254×1254 atlas, 2×2 cells, 627×627 each.
- Cells: lantern post / flowerbed / harvest basket / reeds and stones.
- Generation brief: isolated cozy 16-bit pixel-art farm props with warm colors, dark purple/brown contours, equal 2×2 cells, orthographic 3/4 view, transparent background, no labels or ground planes.
- Placement and daytime/nighttime opacity: `src/components/farm/FarmWater.tsx`. Decorations pass touches through. Original terrain, house and crop coordinates are preserved.

## Night forest

- `images/night-forest.png`: portrait backdrop. Existing interactive moon, stars and owl remain separate.
- Generation brief: tranquil handcrafted storybook night sky, near-black indigo to muted teal/violet gradient, faint wispy Milky Way and soft grain, layered pine forest and distant mountains in bottom 18%, a small path into the trees; upper sky mostly empty for interactive overlays; no moon, large stars, text, UI or buildings.
- The backdrop uses cover sizing with dark overlays. Collected stars form a constellation; collectible positions reserve room for the safe area and bottom card.
