# Animation generation record — 2026-11-03

Built-in imagegen, transparent_background=true. Original generations are retained
here; runtime atlases are packed by scripts/pack-animation-atlases.py. Packing only
crops silhouettes, discards disconnected neighbouring-cell slivers, aligns feet,
and downsamples. It never interpolates, duplicates or synthesizes action poses.

All prompts use the existing project atlas as the identity reference. Preserve
the existing face, hair, clothes, palette, proportions and rendering style. Equal
cells, full bodies, stable centers/sole baseline, actual transparent alpha, no
text, grid, backdrop, effects, shadows or character redesign.

## Farm walk → farm-walk.png

Reference assets/images/farm-people-sheet.png. Exactly 8 columns × 7 rows, same
character order: gray-shirt man; long-haired purple-dress woman; blue-shirt shorts
boy; orange-vest shorts boy; purple wizard; cream chicken; straw-hat orange-overall
ponytail hero. All eight cells form one right-facing three-quarter walk cycle:
left contact, down, passing, up, right contact, down, passing, up. Opposite arms
and legs, hair/clothing inertia, no duplicated poses. Target 128×160 source cells.
The first generation had an opaque paper background; a second imagegen edit
removed only that background, preserving figures and layout.

## Farm idle → farm-idle.png

Same reference/order. Six columns × seven rows. Six continuous idle poses:
neutral open eyes, inhale with hair lag, half-lidded, fully closed eyelids,
half-open, relaxed open eyes/exhale. Small breathing/weight shift; fixed feet.

## Farm talk → farm-talk.png

Same reference/order. Six columns × seven rows. Continuous gesture: neutral,
hand/wing begins rising, half raised, fully raised emphasis/open mouth, lower
halfway, relaxed slight other-hand action returning neutral. Fixed feet, distinct
elbow/wing/mouth positions. A corrective imagegen edit repaired the cropped sixth
column and gave every cell generous transparent margins while preserving poses.

## Pet idle → pet-idle.png

References assets/whale/pet-idle-sheet.png and pet-actions-sheet.png. Four columns
× three rows, twelve chronological idle frames. Same navy/gold whale maid dress,
white whale apron, frilly headband, blue bow, long blue hair, whale tail. Frames
1–4 gentle inhale/open eyes with hair/skirt/tail lag; 5 slight closing; 6 half
closed; 7 fully closed; 8 half open; 9 open; 10–12 exhale and return. Target
192×256 cells, no source blue backdrop.

## Pet dance → pet-dance.png

References pet-dance-sheet.png and pet-actions-sheet.png. Four columns × four
rows, sixteen unique chronological poses over a complete dance phrase, no repeated
A-B-C-D pattern: shift weight left, arms gradually sweep outward/up, torso turns
through front to right, shift right, arms arc/lower, crossover step, return.
Hair/skirt/tail inertia, fixed scale and floor baseline. Target 192×256 cells.

## Pet spin → pet-spin.png

References pet-spin-sheet.png and pet-actions-sheet.png. Four columns × four rows.
Sixteen distinct clockwise orientations spanning a full turn, front, three-quarter,
profile, back-three-quarter, back, opposite side and front. Request 22.5-degree
increments, genuine profiles/backs, subtle hair/skirt/tail lag. No repeated fronts.
Target 192×256 cells. Generated view angles remain artist-authored approximations.

## Pet actions → pet-actions.png

Reference pet-actions-sheet.png. Eight columns × five rows, forty poses:

- Happy: neutral, anticipation crouch, rise, takeoff, apex, descend, landing
  squash, rebound/neutral.
- Wave: rest, lift low, lift mid, raised, hand left, hand right, lower mid, rest.
- Eat: hold blue snack, raise, mouth open, bite, close mouth, chew left, chew
  right, satisfied returning.
- Study: same wooden desk/laptop/book throughout; reading, gaze shift, reach
  page, lift page, halfway turn, lower page, pen note, return gaze.
- Sleep: drowsy, half closing, yawn begins, yawn ends, closed eyes/head tilt,
  inhale/body rises, exhale/body lowers, relaxed resting.

Real in-between body/arm/eyelid/page changes, same scale, stable baseline except
jump height. No text/grid/stars/hearts/motion lines. Target 192×256 cells. Sleep
uses the eight-pose intro once, then loops the four closed-eye breathing poses.
