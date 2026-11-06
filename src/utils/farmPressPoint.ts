/** Pressable sends local touch coordinates on native, but MouseEvent on web. */
export function farmPressPoint(event: { nativeEvent: unknown; currentTarget?: unknown }, scale: number): { x: number; y: number } | null {
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const input = event.nativeEvent as { locationX?: number; locationY?: number; clientX?: number; clientY?: number };
  let x = input.locationX, y = input.locationY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const target = event.currentTarget as { getBoundingClientRect?: () => { left: number; top: number } } | null;
    if (!target || typeof target.getBoundingClientRect !== 'function' || !Number.isFinite(input.clientX) || !Number.isFinite(input.clientY)) return null;
    const rect = target.getBoundingClientRect();
    x = input.clientX! - rect.left;
    y = input.clientY! - rect.top;
  }
  return Number.isFinite(x) && Number.isFinite(y) ? { x: x! / scale, y: y! / scale } : null;
}
