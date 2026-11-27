/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

const MODULES = [
  "src/components/NightSky.tsx",
  "src/components/nightSky/NightSkyPrimitives.tsx",
  "src/components/nightSky/NightSkyOwl.tsx",
  "src/components/nightSky/NightSkyStyles.ts",
  "src/screens/FarmScreen.tsx",
  "src/components/farm/farmScreenConstants.ts",
  "src/components/farm/FarmSceneHelpers.tsx",
  "src/components/farm/farmScreenStyles.ts",
];

function countLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;
}

// 1. Verify all modularized files & extracted sub-modules exist
for (const rel of MODULES) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `Missing modular refactor file: ${rel}`);
  const stat = fs.statSync(abs);
  assert.ok(stat.size > 100, `Unexpectedly tiny module: ${rel} (${stat.size} bytes)`);
}

// 2. Verify NightSky.tsx and FarmScreen.tsx strictly meet line-count caps
const nightSkyPath = path.join(root, "src/components/NightSky.tsx");
const farmScreenPath = path.join(root, "src/screens/FarmScreen.tsx");
const nightSkyLines = countLines(nightSkyPath);
const farmScreenLines = countLines(farmScreenPath);

assert.ok(
  nightSkyLines < 2500,
  `Expected src/components/NightSky.tsx < 2500 lines, got ${nightSkyLines}`,
);
assert.ok(
  farmScreenLines < 5200,
  `Expected src/screens/FarmScreen.tsx < 5200 lines, got ${farmScreenLines}`,
);

// 3. Verify NightSky public API & sub-module wiring
const nightSkySrc = fs.readFileSync(nightSkyPath, "utf8");
assert.ok(
  nightSkySrc.includes("export interface NightSkyProps"),
  "NightSky.tsx must keep exporting NightSkyProps",
);
assert.ok(
  nightSkySrc.includes("export function NightSky("),
  "NightSky.tsx must keep exporting NightSky",
);
assert.ok(
  nightSkySrc.includes("@/components/nightSky/NightSkyPrimitives"),
  "NightSky.tsx must import from NightSkyPrimitives",
);
assert.ok(
  nightSkySrc.includes("@/components/nightSky/NightSkyOwl"),
  "NightSky.tsx must import from NightSkyOwl",
);
assert.ok(
  nightSkySrc.includes("@/components/nightSky/NightSkyStyles"),
  "NightSky.tsx must import from NightSkyStyles",
);

const primitivesSrc = fs.readFileSync(
  path.join(root, "src/components/nightSky/NightSkyPrimitives.tsx"),
  "utf8",
);
for (const symbol of [
  "NightMotion",
  "AuroraVeil",
  "FireflyDot",
  "Twinkle",
  "SkyTapRipple",
  "WishMeteor",
  "ShootingStar",
  "Moon",
  "CollectStar",
  "HarpStarNode",
  "Burst",
  "ConstellationReveal",
  "SkyPanCanvas",
]) {
  assert.ok(
    primitivesSrc.includes(`export const ${symbol}`) ||
      primitivesSrc.includes(`export function ${symbol}`),
    `NightSkyPrimitives.tsx missing export: ${symbol}`,
  );
}

const owlSrc = fs.readFileSync(
  path.join(root, "src/components/nightSky/NightSkyOwl.tsx"),
  "utf8",
);
for (const symbol of ["OwlFlight", "OwlBody", "Owl"]) {
  assert.ok(
    owlSrc.includes(`export const ${symbol}`) ||
      owlSrc.includes(`export function ${symbol}`),
    `NightSkyOwl.tsx missing export: ${symbol}`,
  );
}

// 4. Verify FarmScreen modular wiring & study-loop reward claiming integration
const farmScreenSrc = fs.readFileSync(farmScreenPath, "utf8");
assert.ok(
  farmScreenSrc.includes("export function FarmScreen()"),
  "FarmScreen.tsx must keep exporting FarmScreen",
);
assert.ok(
  farmScreenSrc.includes("@/components/farm/farmScreenConstants"),
  "FarmScreen.tsx must import from farmScreenConstants",
);
assert.ok(
  farmScreenSrc.includes("@/components/farm/FarmSceneHelpers"),
  "FarmScreen.tsx must import from FarmSceneHelpers",
);
assert.ok(
  farmScreenSrc.includes("@/components/farm/farmScreenStyles"),
  "FarmScreen.tsx must import from farmScreenStyles",
);
assert.ok(
  farmScreenSrc.includes("@/store/useStudyProgress"),
  "FarmScreen.tsx must import useStudyProgress",
);
assert.ok(
  farmScreenSrc.includes("claimPendingFarmRewards("),
  "FarmScreen.tsx must invoke claimPendingFarmRewards()",
);
assert.ok(
  farmScreenSrc.includes("applyPendingRewardsToFarmCoins("),
  "FarmScreen.tsx must settle rewards with applyPendingRewardsToFarmCoins()",
);

// 5. Exercise extracted pure helpers in farmScreenConstants.ts
const loadProjectTs = require("./load-project-ts.cjs")({
  "react-native": {
    Platform: { select: (obj) => obj.default ?? obj.android ?? "monospace" },
  },
  "@/services/farmChat": {
    farmChat: async () => "",
    FarmChatError: class extends Error {},
  },
});

const farmConst = loadProjectTs("src/components/farm/farmScreenConstants.ts");
assert.equal(farmConst.parseFarmSaveRaw("{invalid", 1_750_000_000_000), null);
assert.equal(farmConst.parseFarmSaveRaw("[]", 1_750_000_000_000), null);

const legacyParsed = farmConst.parseFarmSaveRaw(
  JSON.stringify({
    day: 4,
    coins: 88,
    plots: [{ crop: "radish", stage: 1, watered: true }],
  }),
  1_750_000_000_000,
);
assert.ok(legacyParsed, "Legacy v1 farm save should parse cleanly");
assert.equal(legacyParsed.plots.length, farmConst.PLOT_COUNT);
assert.equal(legacyParsed.plots[0].crop, "radish");
assert.ok(legacyParsed.plots[0].growMs > 0);
assert.ok(
  farmConst.boundaryReplyForResident("gu", "teasing", "叫妈妈").length > 0,
);

// 6. Type-check all 8 modularized TS/TSX files using project tsconfig.json
const configPath = path.join(root, "tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
assert.ok(!configFile.error, "Failed to read tsconfig.json");
const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  root,
);
const targetAbsPaths = MODULES.map((rel) => path.resolve(root, rel));
const ambientEnvFiles = ["nativewind-env.d.ts", "expo-env.d.ts"]
  .map((rel) => path.resolve(root, rel))
  .filter((abs) => fs.existsSync(abs));
const targetSet = new Set(targetAbsPaths.map((p) => path.normalize(p).toLowerCase()));
const program = ts.createProgram({
  rootNames: [...targetAbsPaths, ...ambientEnvFiles],
  options: { ...parsedConfig.options, noEmit: true, skipLibCheck: true },
});

const diagnostics = [];
for (const filePath of targetAbsPaths) {
  const sf = program.getSourceFile(filePath);
  assert.ok(sf, `TypeScript failed to load source file: ${filePath}`);
  diagnostics.push(
    ...program.getSyntacticDiagnostics(sf),
    ...program.getSemanticDiagnostics(sf),
  );
}
const ownDiagnostics = diagnostics.filter((d) => {
  if (!d.file) return true;
  return targetSet.has(path.normalize(d.file.fileName).toLowerCase());
});

if (ownDiagnostics.length > 0) {
  const formatted = ts.formatDiagnosticsWithColorAndContext(ownDiagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: (f) => f,
    getNewLine: () => "\n",
  });
  console.error(formatted);
  process.exit(1);
}

console.log(
  `PASS: modular refactor verified (NightSky.tsx ${nightSkyLines} lines < 2500, FarmScreen.tsx ${farmScreenLines} lines < 5200, 6 new sub-modules type-checked cleanly, study reward claiming wired)`,
);
