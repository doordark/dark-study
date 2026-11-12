/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const moduleUnderTest = { exports: {} };
const source = fs.readFileSync(path.resolve(__dirname, "../src/utils/afterHours.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function("module", "exports", compiled)(moduleUnderTest, moduleUnderTest.exports);
const { SKY_ROUTES, makeSky, remainingRoute, turnSky } = moduleUnderTest.exports;

for (let stage = 0; stage < SKY_ROUTES.length; stage++) {
  const initial = makeSky(stage);
  assert(!initial.every(Boolean), "A stage must not start completed");
  assert.equal(initial.length, 16);
  const original = [...initial];
  for (let cell = 0; cell < 16; cell++) {
    assert.deepEqual(turnSky(turnSky(initial, cell), cell), initial, "Moves must be reversible");
  }
  assert.deepEqual(initial, original, "Moving must not mutate the previous board");
  let board = initial;
  let route = [...SKY_ROUTES[stage]];
  // Deliberately wander away from the intended solution before requesting hints.
  for (const cell of [3, 4, 15, 0, 4, 9, 9, 7, 12]) {
    board = turnSky(board, cell);
    route = remainingRoute(route, cell);
  }
  while (route.length) {
    const hint = route[0];
    board = turnSky(board, hint);
    route = remainingRoute(route, hint);
  }
  assert(board.every(Boolean), "Hints must finish the puzzle even after arbitrary moves");
}
const allDark = Array(16).fill(false);
assert.deepEqual(turnSky(allDark, 3).flatMap((lit, i) => lit ? [i] : []), [2, 3, 7], "No row wrapping at edges");
assert.deepEqual(turnSky(allDark, 5).flatMap((lit, i) => lit ? [i] : []), [1, 4, 5, 6, 9]);
console.log("After-hours checks passed: three solvable stages, reversible moves, edge handling, and recovery hints.");
