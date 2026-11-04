# Farm UI V3

`../images/farm-ui-v3.png` is an original generated pixel-art UI atlas, reduced with nearest-neighbor sampling to 540 × 800. Four equal rows: cream paper, sage, rose and powder blue. No baked text, icons or numbers. The app shares a single decoded texture and keeps controls accessible and interactive.

`FarmSkin.tsx` clips one row per frame. HUD, seed selection, action tray, resident controls and journal/market actions share these frames. Large sheets use matching paper, maple borders and brown ink; speech uses an opaque high-contrast paper card above the scene's depth-sorted sprites.
