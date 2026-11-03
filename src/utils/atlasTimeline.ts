/** Pure timing helpers shared by the UI worklet and regression checks. */
export function atlasTimeline(frames: readonly number[], cells: number, frameDuration = 80, fps?: number, holds?: readonly number[]) {
  const fallback = Number.isFinite(fps) && fps! > 0 ? 1000 / fps! : Number.isFinite(frameDuration) && frameDuration > 0 ? frameDuration : 80;
  const poses = frames.length ? frames.map((frame) => Number.isFinite(frame) ? Math.max(0, Math.min(cells - 1, Math.floor(frame))) : 0) : [0];
  const durations = poses.map((_, i) => Number.isFinite(holds?.[i]) && holds![i] > 0 ? holds![i] : fallback);
  return { frames: poses, holds: durations, total: durations.reduce((sum, ms) => sum + ms, 0) };
}

export function atlasPose(elapsed: number, frames: readonly number[], holds: readonly number[]) {
  "worklet";
  let index = 0;
  while (index < frames.length - 1 && elapsed >= holds[index]) elapsed -= holds[index++];
  return frames[index];
}
