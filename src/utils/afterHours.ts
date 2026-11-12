// Each puzzle is produced by legal moves from the completed sky, so it is solvable.
export const SKY_ROUTES = [[5, 10], [0, 6, 13], [2, 7, 8, 14]] as const;

export function turnSky(board: readonly boolean[], cell: number): boolean[] {
  const row = Math.floor(cell / 4);
  const col = cell % 4;
  return board.map((lit, index) => {
    const distance = Math.abs(Math.floor(index / 4) - row) + Math.abs(index % 4 - col);
    return distance <= 1 ? !lit : lit;
  });
}

export function makeSky(stage: number): boolean[] {
  return SKY_ROUTES[stage].reduce<boolean[]>((board, cell) => turnSky(board, cell), Array(16).fill(true));
}

export function remainingRoute(route: readonly number[], cell: number): number[] {
  return route.includes(cell) ? route.filter((item) => item !== cell) : [...route, cell];
}
