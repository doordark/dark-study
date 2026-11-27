/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const srcRoot = path.join(root, "src");

function readRel(relPath) {
  const abs = path.join(root, relPath);
  assert.ok(fs.existsSync(abs), `Missing expected file: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

function countLines(content) {
  return content.split(/\r?\n/).length;
}

function collectSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(abs, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(abs);
    }
  }
  return out;
}

function resolveLocalModule(fromAbs, specifier) {
  let candidateBase = null;
  if (specifier.startsWith("@/")) {
    candidateBase = path.join(srcRoot, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    candidateBase = path.resolve(path.dirname(fromAbs), specifier);
  } else {
    return null;
  }

  const attempts = [
    candidateBase,
    `${candidateBase}.ts`,
    `${candidateBase}.tsx`,
    `${candidateBase}.js`,
    `${candidateBase}.jsx`,
    path.join(candidateBase, "index.ts"),
    path.join(candidateBase, "index.tsx"),
    path.join(candidateBase, "index.js"),
    path.join(candidateBase, "index.jsx"),
  ];

  for (const attempt of attempts) {
    if (fs.existsSync(attempt) && fs.statSync(attempt).isFile()) {
      const normalized = path.normalize(attempt);
      if (normalized.startsWith(path.normalize(srcRoot))) {
        return normalized;
      }
    }
  }
  return null;
}

function isRuntimeImportClause(clause) {
  if (!clause) return true; // side-effect import: import "./foo"
  if (clause.isTypeOnly) return false;
  if (clause.name) return true; // default import
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return true;
  if (ts.isNamedImports(bindings)) {
    return bindings.elements.some((el) => !el.isTypeOnly);
  }
  return false;
}

function isRuntimeExportDecl(node) {
  if (node.isTypeOnly) return false;
  if (!node.exportClause) return true; // export * from "./foo"
  if (ts.isNamespaceExport(node.exportClause)) return true;
  if (ts.isNamedExports(node.exportClause)) {
    return node.exportClause.elements.some((el) => !el.isTypeOnly);
  }
  return false;
}

const ZUSTAND_STORE_HOOKS = new Set([
  "useStore",
  "useSettings",
  "useWhaleMemory",
  "useWhalePet",
  "useWhalePersona",
  "useWhaleVoice",
  "useDesktopPet",
  "useSoundEffects",
  "useStudyProgress",
  "useImportTask",
  "useDataSession",
]);

/* -------------------------------------------------------------------------- */
/*  1 & 4. AST scan: 0 runtime circular deps + 0 whole-store Zustand calls    */
/* -------------------------------------------------------------------------- */

const allSrcFiles = collectSourceFiles(srcRoot);
const graph = new Map();
const wholeStoreViolations = [];

for (const absFile of allSrcFiles) {
  const code = fs.readFileSync(absFile, "utf8");
  const scriptKind = absFile.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : absFile.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : absFile.endsWith(".js")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absFile, code, ts.ScriptTarget.Latest, true, scriptKind);
  const deps = new Set();

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (isRuntimeImportClause(node.importClause)) {
        const resolved = resolveLocalModule(absFile, node.moduleSpecifier.text);
        if (resolved) deps.add(resolved);
      }
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (isRuntimeExportDecl(node)) {
        const resolved = resolveLocalModule(absFile, node.moduleSpecifier.text);
        if (resolved) deps.add(resolved);
      }
    } else if (ts.isCallExpression(node)) {
      // Static require("./...")
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const resolved = resolveLocalModule(absFile, node.arguments[0].text);
        if (resolved) deps.add(resolved);
      }
      // Whole-store Zustand hook invocation with 0 arguments: useStore(), useSettings(), ...
      if (
        ts.isIdentifier(node.expression) &&
        ZUSTAND_STORE_HOOKS.has(node.expression.text) &&
        node.arguments.length === 0
      ) {
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        wholeStoreViolations.push(
          `${path.relative(root, absFile)}:${pos.line + 1} calls ${node.expression.text}() without selector`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  graph.set(path.normalize(absFile), [...deps]);
}

const visited = new Set();
const inStack = new Set();
const stack = [];
const cycles = [];

function dfs(node) {
  visited.add(node);
  inStack.add(node);
  stack.push(node);

  for (const next of graph.get(node) ?? []) {
    if (!visited.has(next)) {
      dfs(next);
    } else if (inStack.has(next)) {
      const idx = stack.indexOf(next);
      const cyclePath = [...stack.slice(idx), next].map((p) =>
        path.relative(root, p).replace(/\\/g, "/"),
      );
      cycles.push(cyclePath.join(" -> "));
    }
  }

  stack.pop();
  inStack.delete(node);
}

for (const node of graph.keys()) {
  if (!visited.has(node)) dfs(node);
}

assert.equal(
  cycles.length,
  0,
  `Detected ${cycles.length} runtime circular dependencies in src/:\n${cycles.join("\n")}`,
);
assert.equal(
  wholeStoreViolations.length,
  0,
  `Detected whole-store Zustand subscriptions without selectors:\n${wholeStoreViolations.join("\n")}`,
);

/* -------------------------------------------------------------------------- */
/*  2. Metro inlineRequires: true                                             */
/* -------------------------------------------------------------------------- */

const metroConfigSrc = readRel("metro.config.js");
assert.ok(
  /inlineRequires\s*:\s*true/.test(metroConfigSrc),
  "metro.config.js must enable inlineRequires: true",
);
assert.ok(
  metroConfigSrc.includes("withNativeWind"),
  "metro.config.js must retain withNativeWind wrapper",
);

/* -------------------------------------------------------------------------- */
/*  3. Root layout enableFreeze(true)                                         */
/* -------------------------------------------------------------------------- */

const rootLayoutSrc = readRel("src/app/_layout.tsx");
assert.ok(
  rootLayoutSrc.includes("enableFreeze") &&
    rootLayoutSrc.includes("react-native-screens") &&
    /enableFreeze\(\s*true\s*\)/.test(rootLayoutSrc),
  "src/app/_layout.tsx must import enableFreeze from react-native-screens and call enableFreeze(true)",
);
assert.ok(
  rootLayoutSrc.includes('Platform.OS !== "web"') ||
    rootLayoutSrc.includes("Platform.OS !== 'web'"),
  "src/app/_layout.tsx must guard enableFreeze(true) for non-web platforms",
);

/* -------------------------------------------------------------------------- */
/*  5. Lazy-loading & conditional-mount verification                          */
/* -------------------------------------------------------------------------- */

// 5a. CourseScheduleScreen.tsx + lazyScheduleModals.ts
const courseScheduleSrc = readRel("src/screens/CourseScheduleScreen.tsx");
const lazyScheduleModalsSrc = readRel("src/components/schedule/lazyScheduleModals.ts");
assert.ok(
  lazyScheduleModalsSrc.includes("React.lazy") || lazyScheduleModalsSrc.includes("lazy("),
  "lazyScheduleModals.ts must use React.lazy",
);
for (const eagerModal of [
  "CourseEditorPanel",
  "CourseTaskSheet",
  "HolidayShiftModal",
  "CourseSearchStatsModal",
  "ScheduleExportModal",
  "CourseStudyModal",
  "PeerCompareModal",
  "NightSky",
  "AfterHours",
]) {
  assert.ok(
    !new RegExp(`import\\s*\\{[^}]*\\b${eagerModal}\\b[^}]*\\}\\s*from`).test(courseScheduleSrc),
    `CourseScheduleScreen.tsx must not statically import ${eagerModal}`,
  );
  assert.ok(
    lazyScheduleModalsSrc.includes(`@/components/${eagerModal}`),
    `lazyScheduleModals.ts must lazily import ${eagerModal}`,
  );
}
assert.ok(
  courseScheduleSrc.includes("<Suspense"),
  "CourseScheduleScreen.tsx must wrap lazy modals in <Suspense>",
);
for (const gate of [
  "editorOpen ?",
  "taskSheetOpen ?",
  "holidayOpen ?",
  "searchStatsOpen ?",
  "exportOpen ?",
  "studyModalOpen ?",
  "peerCompareOpen ?",
  "afterHours ?",
  "nightOpen ?",
]) {
  assert.ok(
    courseScheduleSrc.includes(gate),
    `CourseScheduleScreen.tsx must conditionally mount lazy modal behind "${gate}"`,
  );
}

// 5b. SettingsScreen.tsx
const settingsScreenSrc = readRel("src/screens/SettingsScreen.tsx");
assert.ok(
  (settingsScreenSrc.includes("React.lazy") || settingsScreenSrc.includes("lazy(")) &&
    settingsScreenSrc.includes("<Suspense"),
  "SettingsScreen.tsx must lazy-load categories with React.lazy + <Suspense>",
);
for (const categoryModule of [
  "ScheduleSemesterSettings",
  "ReminderWidgetSettings",
  "AppearanceSettings",
  "AiPetSettings",
  "BackupSyncSettings",
  "PerformanceDiagSettings",
]) {
  assert.ok(
    settingsScreenSrc.includes(`./settings/${categoryModule}`),
    `SettingsScreen.tsx must lazy-load ./settings/${categoryModule}`,
  );
}
for (const heavyWidget of [
  "CourseWidgetSettings",
  "DesktopPetSettings",
  "WebdavSyncCard",
  "PerformanceSettings",
]) {
  assert.ok(
    !settingsScreenSrc.includes(heavyWidget),
    `SettingsScreen.tsx root hub must not statically import ${heavyWidget}`,
  );
}

// 5c. GradesScreen.tsx
const gradesScreenSrc = readRel("src/screens/GradesScreen.tsx");
assert.ok(
  (gradesScreenSrc.includes("React.lazy") || gradesScreenSrc.includes("lazy(")) &&
    gradesScreenSrc.includes("<Suspense"),
  "GradesScreen.tsx must lazy-load heavy panels/modals with React.lazy + <Suspense>",
);
assert.ok(
  gradesScreenSrc.includes("<FlatList") &&
    gradesScreenSrc.includes("initialNumToRender") &&
    gradesScreenSrc.includes("windowSize") &&
    gradesScreenSrc.includes("removeClippedSubviews"),
  "GradesScreen.tsx must virtualize grade list with configured FlatList",
);
for (const gate of [
  "editorVisible ?",
  "yearVisible ?",
  "ruleVisible ?",
  "scalePickerOpen ?",
  "importSheet ?",
  "pasteOpen ?",
  "projectionOpen ?",
  "scheduleImportOpen ?",
  "analyticsOpen ?",
  "graduationOpen ?",
]) {
  assert.ok(
    gradesScreenSrc.includes(gate),
    `GradesScreen.tsx must conditionally mount lazy modal/card behind "${gate}"`,
  );
}

// 5d. WhalePet.tsx
const whalePetSrc = readRel("src/components/WhalePet.tsx");
assert.ok(
  whalePetSrc.includes("useDesktopPetSync()"),
  "WhalePet.tsx gatekeeper must keep calling useDesktopPetSync()",
);
assert.ok(
  (whalePetSrc.includes("lazy(") || whalePetSrc.includes("lazyNamed(")) &&
    whalePetSrc.includes("<Suspense"),
  "WhalePet.tsx must lazily load WhalePetStage via React.lazy + <Suspense>",
);
assert.ok(
  whalePetSrc.includes("if (!visible || onDesktopVisible) return null;"),
  "WhalePet.tsx must return null immediately when hidden or desktop pet overlay is visible",
);

// 5e. ImportTaskOverlay.tsx
const importOverlaySrc = readRel("src/components/ImportTaskOverlay.tsx");
assert.ok(
  (importOverlaySrc.includes("lazyNamed(") || importOverlaySrc.includes("lazy(")) &&
    importOverlaySrc.includes("<Suspense"),
  "ImportTaskOverlay.tsx must lazily load ImportTaskOverlayBody via Suspense",
);
assert.ok(
  importOverlaySrc.includes('if (status === "idle") return null;') ||
    importOverlaySrc.includes("if (status === 'idle') return null;"),
  "ImportTaskOverlay.tsx must return null immediately when status === 'idle'",
);

// 5f. FarmSheetsHost.tsx
const farmSheetsHostSrc = readRel("src/components/farm/FarmSheetsHost.tsx");
assert.ok(
  (farmSheetsHostSrc.includes("lazy(") || farmSheetsHostSrc.includes("React.lazy")) &&
    farmSheetsHostSrc.includes("<Suspense"),
  "FarmSheetsHost.tsx must lazy-load farm sheets with React.lazy + <Suspense>",
);
for (const gate of [
  "bagOpen ?",
  "groupOpen ?",
  "townOpen ?",
  "visitorSpeaker !== null ?",
  "focusOpen ?",
  "festivalOpen ?",
  "fishingOpen ?",
  "storiesOpen ?",
  "decorOpen ?",
  "houseOpen ?",
  "randomEventModalOpen",
  "gameOpen ?",
]) {
  assert.ok(
    farmSheetsHostSrc.includes(gate),
    `FarmSheetsHost.tsx must conditionally mount lazy sheet behind "${gate}"`,
  );
}

// 5g. NightSky.tsx
const nightSkySrc = readRel("src/components/NightSky.tsx");
assert.ok(
  (nightSkySrc.includes("lazy(") || nightSkySrc.includes("React.lazy")) &&
    nightSkySrc.includes("<Suspense"),
  "NightSky.tsx must lazy-load heavy realms/modals with React.lazy + <Suspense>",
);
assert.ok(
  nightSkySrc.includes('import("@/components/nightSky/BloodMoonRealm")') &&
    nightSkySrc.includes("bloodMoonRealmMounted ?"),
  "NightSky.tsx must lazy-load BloodMoonRealm and conditionally mount only when active/exiting",
);
assert.ok(
  nightSkySrc.includes("atlasOpen ?") && nightSkySrc.includes("wishOpen ?"),
  "NightSky.tsx must conditionally mount StarAtlasModal and WishComposerModal only when open",
);

/* -------------------------------------------------------------------------- */
/*  6. Enforced line-count ceilings                                           */
/* -------------------------------------------------------------------------- */

const LINE_CEILINGS = [
  ["src/screens/CourseScheduleScreen.tsx", 950],
  ["src/screens/SettingsScreen.tsx", 350],
  ["src/screens/GradesScreen.tsx", 900],
  ["src/components/WhalePet.tsx", 100],
  ["src/components/ImportTaskOverlay.tsx", 80],
  ["src/screens/AssistantScreen.tsx", 1250],
  ["src/screens/FarmScreen.tsx", 2500],
  ["src/components/NightSky.tsx", 1400],
];

const measuredLines = [];
for (const [relPath, maxLines] of LINE_CEILINGS) {
  const lines = countLines(readRel(relPath));
  assert.ok(
    lines < maxLines,
    `${relPath} exceeded line ceiling: ${lines} lines (limit < ${maxLines})`,
  );
  measuredLines.push(`${path.basename(relPath)}=${lines}/${maxLines}`);
}

/* -------------------------------------------------------------------------- */
/*  7. Wallpaper & memory hygiene: pickImageForBackground uses base64: false  */
/* -------------------------------------------------------------------------- */

const fileImportSrc = readRel("src/services/fileImport.ts");
const bgFnStart = fileImportSrc.indexOf("export async function pickImageForBackground");
assert.ok(bgFnStart !== -1, "src/services/fileImport.ts must export pickImageForBackground");
const nextExportIdx = fileImportSrc.indexOf("\nexport ", bgFnStart + 1);
const bgFnBody =
  nextExportIdx === -1 ? fileImportSrc.slice(bgFnStart) : fileImportSrc.slice(bgFnStart, nextExportIdx);
assert.ok(
  /base64\s*:\s*false/.test(bgFnBody) && !/base64\s*:\s*true/.test(bgFnBody),
  "pickImageForBackground() must set base64: false to prevent full-res wallpaper base64 RAM spikes",
);

const backdropSrc = readRel("src/components/Backdrop.tsx");
assert.ok(
  backdropSrc.includes('resizeMethod="resize"'),
  'src/components/Backdrop.tsx must pass resizeMethod="resize" on wallpaper ImageBackground',
);

const voiceCacheSrc = readRel("src/services/whaleVoiceCache.ts");
assert.ok(
  voiceCacheSrc.includes("export function releaseVoiceCacheMemory"),
  "src/services/whaleVoiceCache.ts must export releaseVoiceCacheMemory()",
);

console.log(
  `PASS: architecture health verified (${allSrcFiles.length} src files, 0 circular deps, 0 whole-store Zustand calls, inlineRequires + enableFreeze + lazy mounts + base64:false enforced; ${measuredLines.join(", ")})`,
);
