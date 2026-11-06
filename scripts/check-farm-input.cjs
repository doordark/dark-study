const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const target = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync('src/utils/farmPressPoint.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
new Function('exports', 'module', compiled.outputText)(target.exports, target);
const { farmPressPoint } = target.exports;
assert.deepEqual(farmPressPoint({ nativeEvent: { locationX: 120, locationY: 360 } }, 2), { x: 60, y: 180 });
// A web click has client coordinates, not locationX/Y. The scene can be scrolled.
assert.deepEqual(farmPressPoint({ nativeEvent: { clientX: 150, clientY: 250 }, currentTarget: { getBoundingClientRect: () => ({ left: 30, top: -110 }) } }, 2), { x: 60, y: 180 });
assert.deepEqual(farmPressPoint({ nativeEvent: { locationX: 0, locationY: 0 } }, 2), { x: 0, y: 0 });
assert.equal(farmPressPoint({ nativeEvent: {} }, 2), null);
assert.equal(farmPressPoint({ nativeEvent: { locationX: NaN, locationY: Infinity } }, 2), null);
assert.equal(farmPressPoint({ nativeEvent: { locationX: 10, locationY: 20 } }, 0), null);
console.log('Farm input: native touch, web mouse, scrolled scene, origin and invalid coordinates passed.');
