# Pet and easter egg assets

Generated with built-in imagegen, using the existing `whale/pet-idle.png` as the character reference. Original generated files remain in the Codex generated_images folder.

## Pet idle animation

- `whale/pet-idle-sheet.png`: transparent 1536×1024 PNG, 4 columns × 2 rows, 384×512 cells. Read left to right then top to bottom.
- Eight poses: open eyes / gentle sway / sway / half blink / closed eyes / reopening / open / return.
- Player: `src/components/PetAnimation.tsx` + `AnimatedAtlas.tsx` (the unused separate `PetIdleAnimation.tsx` was removed). The current version uses `pet-idle-v2.png`, 12 poses in 192×256 cells; the older sheet below is retained as source history.
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


## 星空统一画风（v2）

- `images/night-forest-v2.png`：替换星空背景，保留森林、山峦与小径的纵向构图，重新按细腻水粉童话插画统一笔触与靛蓝、紫灰、青绿色层次。
- `images/night-sprites-v2.png`：1536×1024、3列×2行透明图集；第一行是金星、银星与手绘弯月，第二行是睁眼和闭眼猫头鹰及留空格。以新背景为画风参考，仍沿用现有星星和猫头鹰姿态。
- 精灵图在接入前校验了 RGBA 透明通道，外部透明背景不会带入画面。
- 生成提示词：参考森林插画与原图集，统一为带干笔触和纸纹的民间童话水粉插画；六个等分透明格依次绘制金色星、银蓝星、淡金弯月、睁眼猫头鹰、同姿闭眼猫头鹰和透明空格；无分隔线、文字或强烈辉光。
