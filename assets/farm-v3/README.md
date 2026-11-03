# Farm V3 art sources

Both `scene-concept.png` and `house-concept.png` are original images generated for this task with the built-in `image_gen` tool. No downloaded stock/game art was used. These are authoring references, not app-loaded textures.

Production files live in `assets/images/`:

- `farm-day-v3.png`, `farm-night-v3.png`: 600×990 terrain, narrow paths, calibrated soil beds and merged static ground details.
- `farm-{house,coop,market,pond,bench,tree}-v3.png` and corresponding `farm-*-night-v3.png`: transparent facility/foreground sprites with foot-depth ordering.
- `farm-house-interior-v2.png`, `farm-house-interior-night-v2.png`: 720×540 furnished pixel room; the bed remains an accessible native hit area.

Run `node scripts/build-farm-v3-assets.cjs` to reproduce all production textures from the references and `src/constants/farmMap.ts`. The generator separates hand-traced silhouettes, redraws the sixteen soil beds at shared coordinates and adds the short north/east farm paths. Day/night use the **same pixels, outlines and alpha**, with deterministic lighting and window/lantern relighting. Night was not independently generated. This controlled layer separation is intentional: the task prioritizes precise interaction geometry over independent random image variants.

## Final prompt set

Scene prompt: Original cozy pixel-art farm game scene, portrait 200:330, crisp richly detailed 16-bit art, warm bright spring, slightly elevated frontal top-down RPG view. No realism, 3D, UI, labels or people. Sky/clouds/mountains only in the top fifth, grass below. Compact terracotta-roof timber cottage upper left; empty 4×4 soil beds in the center; chicken coop to their right; striped-awning market below the house; modest circular gathering clearing below the crops with wooden bench and warm lantern; stone-bank pond in the lower right with lily pads/reeds; leafy tree lower left. Narrow sandy branching footpaths connect the front door, left farm edge, gathering clearing, pond, coop and market. Never a long straight left-side road, never a road through the beds. Cluster woodpile, barrel, laundry, tool rack, hay, baskets, birdhouse, flowers, stones and mushrooms near their associated facilities. Keep clear walking spaces and balanced negative space. Fences only near the horizon and bottom corners.

Interior prompt: Original full-frame 4:3 production pixel-art cottage room, same warm honey-wood, terracotta and leafy-green language. Frontal elevated RPG view, no realism/3D, text, UI or people. Cream plaster wall and wooden wainscot; honey floorboards; four-pane window with checked curtains upper left, daytime hills outside; bookshelf upper right; small framed flower picture; left writing desk with notebook, brass lamp and stool; lower-left plant and storage chest; central coral/sage woven rug; one clearly recognizable wooden bed on the right, vertical long axis, green quilt, white pillows and visible footboard; small bedside plant/cabinet. All furniture entirely in frame. Cozy sunlight and restrained shadows, consistent pixel rendering, bed position preserved for the game hit target.

## Intentional changes from the scene concept

- Soil beds are resampled onto an exact uniform 4×4 grid from `farmMap`, rather than relying on approximate generated bed edges.
- Short north/east paths connect the coop and farm apron to the plaza without cutting through soil. Blocker-safe waypoints use these paths and open ground.
- Short portrait screens fit the world above the existing controls, using quiet side gutters; the same scene is never stretched to a different aspect ratio.
- HUD and interaction labels remain code-native. NPC identity, chat rules and economy are outside the art redesign.
