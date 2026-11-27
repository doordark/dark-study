const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = process.cwd();

function createTsLoader(mocks = {}) {
  const cache = new Map();

  function resolveLocal(specifier, fromFile) {
    let base;
    if (specifier.startsWith("@/")) {
      base = path.join(ROOT, "src", specifier.slice(2));
    } else if (specifier.startsWith(".")) {
      base = path.resolve(path.dirname(fromFile), specifier);
    } else {
      return null;
    }
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    ]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
  }

  function load(filePath) {
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.join(ROOT, filePath);
    if (cache.has(abs)) return cache.get(abs).exports;

    const source = fs.readFileSync(abs, "utf8");
    const compiled = ts.transpileModule(source, {
      fileName: abs,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;

    const mod = { exports: {} };
    cache.set(abs, mod);

    const localRequire = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(mocks, specifier)) {
        return mocks[specifier];
      }
      const resolved = resolveLocal(specifier, abs);
      if (resolved) return load(resolved);
      return require(specifier);
    };

    new Function("require", "module", "exports", compiled)(
      localRequire,
      mod,
      mod.exports,
    );
    return mod.exports;
  }

  return { load };
}

/* -------------------------------------------------------------------------- */
/*  Independent QR Code verifier (BCH, Golay, RS syndrome, Byte-mode decode)  */
/* -------------------------------------------------------------------------- */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function bchFormatSyndrome(bits15) {
  let rem = bits15 ^ 0x5412;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return rem;
}

function golayVersionSyndrome(bits18) {
  let rem = bits18;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
  }
  return rem;
}

const ALIGN_CENTERS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const RS_SPECS_L = {
  1: { ec: 7, blocks: [19] },
  2: { ec: 10, blocks: [34] },
  3: { ec: 15, blocks: [55] },
  4: { ec: 20, blocks: [80] },
  5: { ec: 26, blocks: [108] },
  6: { ec: 18, blocks: [68, 68] },
  7: { ec: 20, blocks: [78, 78] },
  8: { ec: 24, blocks: [97, 97] },
  9: { ec: 30, blocks: [116, 116] },
  10: { ec: 18, blocks: [68, 68, 69, 69] },
};

function maskCond(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: throw new Error(`bad mask ${mask}`);
  }
}

function verifyQrMatrixFully(qr, expectedText) {
  const { size, version, modules } = qr;
  assert.equal(size, version * 4 + 17);
  assert.equal(modules.length, size);
  for (const row of modules) assert.equal(row.length, size);

  // 1. Verify all 3 finder patterns (7x7) + 1-module white separators
  const corners = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [top, left] of corners) {
    for (let dr = -1; dr <= 7; dr++) {
      const r = top + dr;
      if (r < 0 || r >= size) continue;
      for (let dc = -1; dc <= 7; dc++) {
        const c = left + dc;
        if (c < 0 || c >= size) continue;
        const isSep = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const isOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const expected = !isSep && (isOuter || isInner);
        assert.equal(
          modules[r][c],
          expected,
          `Finder/separator mismatch at (${r},${c}) for V${version}`,
        );
      }
    }
  }

  // 2. Timing patterns & dark module
  for (let i = 8; i < size - 8; i++) {
    assert.equal(modules[6][i], i % 2 === 0, `Horizontal timing mismatch at ${i}`);
    assert.equal(modules[i][6], i % 2 === 0, `Vertical timing mismatch at ${i}`);
  }
  assert.equal(modules[size - 8][8], true, "Dark module must be true");

  // 3. Read format info Copy 1 and Copy 2, assert equality + valid BCH + Level L
  let fmt1 = 0;
  const pushFmt1 = (r, c) => { fmt1 = (fmt1 << 1) | (modules[r][c] ? 1 : 0); };
  for (let c = 0; c <= 5; c++) pushFmt1(8, c);
  pushFmt1(8, 7);
  pushFmt1(8, 8);
  pushFmt1(7, 8);
  for (let r = 5; r >= 0; r--) pushFmt1(r, 8);

  let fmt2 = 0;
  const pushFmt2 = (r, c) => { fmt2 = (fmt2 << 1) | (modules[r][c] ? 1 : 0); };
  for (let i = 0; i < 7; i++) pushFmt2(size - 1 - i, 8);
  for (let i = 0; i < 8; i++) pushFmt2(8, size - 8 + i);

  assert.equal(fmt1, fmt2, "Format info copies must match");
  assert.equal(bchFormatSyndrome(fmt1), 0, "Format info BCH syndrome must be 0");
  const unmaskedFmt = (fmt1 ^ 0x5412) >>> 10;
  const ecLevelIndicator = unmaskedFmt >>> 3;
  const mask = unmaskedFmt & 0b111;
  assert.equal(ecLevelIndicator, 0b01, "EC level indicator must be Level L (01)");

  // 4. Version info (V7+)
  if (version >= 7) {
    let vTopRight = 0;
    let vBotLeft = 0;
    for (let i = 17; i >= 0; i--) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      vTopRight = (vTopRight << 1) | (modules[b][a] ? 1 : 0);
      vBotLeft = (vBotLeft << 1) | (modules[a][b] ? 1 : 0);
    }
    assert.equal(vTopRight, vBotLeft, "Version info copies must match");
    assert.equal(golayVersionSyndrome(vTopRight), 0, "Version Golay syndrome must be 0");
    assert.equal(vTopRight >>> 12, version, "Decoded version bits must match version");
  }

  // 5. Reconstruct function map, unmask, read zigzag codewords, verify RS syndromes, and decode payload!
  const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
  for (const [top, left] of corners) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r >= 0 && r < size && c >= 0 && c < size) isFn[r][c] = true;
      }
    }
  }
  for (let i = 0; i < size; i++) {
    isFn[6][i] = true;
    isFn[i][6] = true;
  }
  for (const cr of ALIGN_CENTERS[version]) {
    for (const cc of ALIGN_CENTERS[version]) {
      if ((cr <= 8 && cc <= 8) || (cr <= 8 && cc >= size - 9) || (cr >= size - 9 && cc <= 8)) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) isFn[cr + dr][cc + dc] = true;
      }
    }
  }
  for (let i = 0; i <= 8; i++) {
    isFn[8][i] = true;
    isFn[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    isFn[8][size - 1 - i] = true;
    isFn[size - 1 - i][8] = true;
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      isFn[a][b] = true;
      isFn[b][a] = true;
    }
  }

  const rawBits = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFn[r][c]) continue;
        const unmasked = modules[r][c] !== maskCond(mask, r, c);
        rawBits.push(unmasked ? 1 : 0);
      }
    }
    upward = !upward;
  }

  const spec = RS_SPECS_L[version];
  const totalCw = spec.blocks.reduce((a, b) => a + b, 0) + spec.blocks.length * spec.ec;
  assert.ok(rawBits.length >= totalCw * 8);
  const codewords = new Uint8Array(totalCw);
  for (let i = 0; i < totalCw; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | rawBits[i * 8 + k];
    codewords[i] = b;
  }

  // De-interleave into blocks & check every RS syndrome = 0
  const dataBlocks = spec.blocks.map((len) => new Uint8Array(len));
  const ecBlocks = spec.blocks.map(() => new Uint8Array(spec.ec));
  const maxDataLen = Math.max(...spec.blocks);
  let pos = 0;
  for (let col = 0; col < maxDataLen; col++) {
    for (let b = 0; b < dataBlocks.length; b++) {
      if (col < dataBlocks[b].length) dataBlocks[b][col] = codewords[pos++];
    }
  }
  for (let col = 0; col < spec.ec; col++) {
    for (let b = 0; b < ecBlocks.length; b++) {
      ecBlocks[b][col] = codewords[pos++];
    }
  }

  for (let b = 0; b < dataBlocks.length; b++) {
    const fullBlock = new Uint8Array(dataBlocks[b].length + ecBlocks[b].length);
    fullBlock.set(dataBlocks[b], 0);
    fullBlock.set(ecBlocks[b], dataBlocks[b].length);
    // Evaluate codeword polynomial at alpha^0 .. alpha^(ec-1); must ALL be 0!
    for (let rootIdx = 0; rootIdx < spec.ec; rootIdx++) {
      const alpha = GF_EXP[rootIdx];
      let acc = 0;
      for (let i = 0; i < fullBlock.length; i++) {
        acc = gfMul(acc, alpha) ^ fullBlock[i];
      }
      assert.equal(
        acc,
        0,
        `RS syndrome non-zero for V${version} block ${b} root ${rootIdx}`,
      );
    }
  }

  // Reassemble data bitstream and decode Byte-mode string
  const dataStream = [];
  for (const blk of dataBlocks) {
    for (const byte of blk) {
      for (let k = 7; k >= 0; k--) dataStream.push((byte >>> k) & 1);
    }
  }
  const readBits = (offset, width) => {
    let v = 0;
    for (let i = 0; i < width; i++) v = (v << 1) | dataStream[offset + i];
    return v;
  };
  const mode = readBits(0, 4);
  assert.equal(mode, 0b0100, "Mode indicator must be Byte mode (0100)");
  const countWidth = version <= 9 ? 8 : 16;
  const byteLen = readBits(4, countWidth);
  const decodedBytes = new Uint8Array(byteLen);
  let bitOff = 4 + countWidth;
  for (let i = 0; i < byteLen; i++) {
    decodedBytes[i] = readBits(bitOff, 8);
    bitOff += 8;
  }
  const decodedText = Buffer.from(decodedBytes).toString("utf8");
  assert.equal(
    decodedText,
    expectedText,
    `Decoded QR payload mismatch for V${version}`,
  );
}

/* -------------------------------------------------------------------------- */
/*  Test Fixtures & Suite                                                     */
/* -------------------------------------------------------------------------- */

const PERIODS = [
  { index: 1, label: "第1节", startTime: "08:00", endTime: "08:45" },
  { index: 2, label: "第2节", startTime: "08:55", endTime: "09:40" },
  { index: 3, label: "第3节", startTime: "10:00", endTime: "10:45" },
  { index: 4, label: "第4节", startTime: "10:55", endTime: "11:40" },
  { index: 5, label: "第5节", startTime: "14:00", endTime: "14:45" },
  { index: 6, label: "第6节", startTime: "14:55", endTime: "15:40" },
  { index: 7, label: "第7节", startTime: "16:00", endTime: "16:45" },
  { index: 8, label: "第8节", startTime: "16:55", endTime: "17:40" },
];

function makeMySchedule() {
  return {
    id: "term-2026-fall",
    name: "2026 秋季学期",
    kind: "fall",
    startDate: "2026-08-31",
    endDate: "2027-01-03",
    totalWeeks: 18,
    periods: PERIODS,
    courses: [
      {
        id: "c1",
        name: "高等数学",
        teacher: "王教授",
        classroom: "一教 201",
        weekday: 1,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        color: "sky",
      },
      {
        id: "c2",
        name: "大学物理实验",
        teacher: "李老师",
        classroom: "实验楼 B302",
        weekday: 2,
        startPeriod: 5,
        endPeriod: 6,
        weeks: [1, 3, 5, 7, 9, 11, 13, 15],
        color: "violet",
      },
      {
        id: "c3",
        name: "英语口语",
        teacher: "",
        classroom: "外语楼 105",
        weekday: 4,
        startPeriod: 3,
        endPeriod: 4,
        weeks: [2, 4, 6, 8, 10, 12, 14, 16],
        color: "emerald",
      },
      {
        id: "c4",
        name: "新生研讨课",
        teacher: "陈老师",
        classroom: "",
        weekday: 5,
        startPeriod: 7,
        endPeriod: 8,
        weeks: [5],
        color: "amber",
      },
      {
        id: "c5",
        name: "数据结构",
        teacher: "顾林",
        classroom: "尚七 513",
        weekday: 1,
        startPeriod: 5,
        endPeriod: 6,
        weeks: [1, 2, 3, 4, 6, 7, 8],
        color: "cyan",
      },
    ],
  };
}

async function run() {
  const { load } = createTsLoader();
  const qrMod = load("src/utils/qrMatrix.ts");
  const shareMod = load("src/utils/scheduleShare.ts");

  /* ---------------- 1. QR Matrix Generator Tests ---------------- */
  const versionBoundaryCases = [
    { text: "", expectedVersion: 1 },
    { text: "A".repeat(17), expectedVersion: 1 },
    { text: "B".repeat(18), expectedVersion: 2 },
    { text: "C".repeat(32), expectedVersion: 2 },
    { text: "D".repeat(53), expectedVersion: 3 },
    { text: "E".repeat(78), expectedVersion: 4 },
    { text: "F".repeat(106), expectedVersion: 5 },
    { text: "G".repeat(134), expectedVersion: 6 },
    { text: "H".repeat(154), expectedVersion: 7 },
    { text: "I".repeat(192), expectedVersion: 8 },
    { text: "J".repeat(230), expectedVersion: 9 },
    { text: "K".repeat(271), expectedVersion: 10 },
    { text: "DS1:中文测试课表口令🎉.01234567", expectedVersion: 3 },
  ];

  for (const tc of versionBoundaryCases) {
    const qr = qrMod.generateQrMatrix(tc.text);
    assert.ok(qr, `Expected QR matrix for length ${Buffer.byteLength(tc.text)}`);
    assert.equal(qr.version, tc.expectedVersion);
    assert.equal(qr.size, tc.expectedVersion * 4 + 17);
    verifyQrMatrixFully(qr, tc.text);
  }

  // Graceful null when > 271 bytes (must never throw)
  assert.equal(qrMod.generateQrMatrix("X".repeat(272)), null);
  assert.equal(qrMod.generateQrMatrix("课表".repeat(100)), null);
  assert.equal(qrMod.generateQrMatrix(null), null);

  /* ---------------- 2. Share Code Codec Tests ---------------- */
  assert.equal(shareMod.encodeWeeksSpec([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), "1-16");
  assert.equal(shareMod.encodeWeeksSpec([1, 3, 5, 7, 9, 11, 13, 15]), "1-15:2");
  assert.equal(shareMod.encodeWeeksSpec([2, 4, 6, 8, 10, 12, 14, 16]), "2-16:2");
  assert.equal(shareMod.encodeWeeksSpec([5]), "5");
  assert.equal(shareMod.encodeWeeksSpec([1, 2, 3, 4, 6, 7, 8]), "1-4,6-8");
  assert.deepEqual(shareMod.decodeWeeksSpec("1-15:2"), [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(shareMod.decodeWeeksSpec("1-4,6-8,12"), [1, 2, 3, 4, 6, 7, 8, 12]);

  const mySchedule = makeMySchedule();
  const token = shareMod.encodeScheduleShareCode(mySchedule, "小明");
  assert.ok(token.startsWith("DS1:"));
  assert.match(token, /^DS1:[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);

  const decoded = shareMod.decodeScheduleShareCode(token);
  assert.equal(decoded.nickname, "小明");
  assert.equal(decoded.scheduleName, "2026 秋季学期");
  assert.equal(decoded.totalWeeks, 18);
  assert.equal(decoded.startDate, "2026-08-31");
  assert.equal(decoded.courses.length, 5);
  assert.deepEqual(decoded.courses[0], {
    n: "高等数学",
    d: 1,
    s: 1,
    e: 2,
    w: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    r: "一教 201",
    t: "王教授",
  });
  assert.deepEqual(decoded.courses[1].w, [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(decoded.courses[2].w, [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.equal(decoded.courses[2].t, undefined);
  assert.deepEqual(decoded.courses[3].w, [5]);
  assert.equal(decoded.courses[3].r, undefined);
  assert.equal(decoded.courses[3].t, "陈老师");

  // Extraction from noisy WeChat/QQ surrounding text
  const wrappedChat = `嗨，这是我这学期的课表，复制到 Dark Study 就能看共同空课啦！\n  ${token}  \n周末一起自习吗？`;
  const decodedFromChat = shareMod.decodeScheduleShareCode(wrappedChat);
  assert.equal(decodedFromChat.nickname, "小明");
  assert.equal(decodedFromChat.courses.length, 5);

  // Tampered payload & tampered checksum must throw clear Chinese errors
  const dotPos = token.lastIndexOf(".");
  const flippedPayloadChar = token[6] === "A" ? "B" : "A";
  const tamperedPayload = token.slice(0, 6) + flippedPayloadChar + token.slice(7);
  assert.throws(
    () => shareMod.decodeScheduleShareCode(tamperedPayload),
    /校验失败/,
  );

  const flippedHex = token[dotPos + 1] === "0" ? "1" : "0";
  const tamperedChecksum = token.slice(0, dotPos + 1) + flippedHex + token.slice(dotPos + 2);
  assert.throws(
    () => shareMod.decodeScheduleShareCode(tamperedChecksum),
    /校验失败/,
  );

  assert.throws(() => shareMod.decodeScheduleShareCode(""), /请先粘贴/);
  assert.throws(() => shareMod.decodeScheduleShareCode("随便一段没有口令的文字"), /DS1:/);
  assert.throws(() => shareMod.decodeScheduleShareCode("DS1:truncated"), /不完整/);

  /* ---------------- 3. Compact QR Summary Tests ---------------- */
  // Tiny schedule fits in full QR code directly
  const tinySchedule = {
    ...mySchedule,
    courses: [mySchedule.courses[0]],
  };
  const tinyQrToken = shareMod.buildCompactQrSummary(tinySchedule, 5);
  assert.equal(tinyQrToken, shareMod.encodeScheduleShareCode(tinySchedule));
  assert.ok(Buffer.byteLength(tinyQrToken, "utf8") <= 271);
  const tinyQr = qrMod.generateQrMatrix(tinyQrToken);
  assert.ok(tinyQr);
  verifyQrMatrixFully(tinyQr, tinyQrToken);

  // Huge 20-course semester schedule falls back cleanly to week-scoped QR <= 271 bytes
  const hugeCourses = [];
  for (let i = 0; i < 20; i++) {
    hugeCourses.push({
      id: `hc-${i}`,
      name: `计算机系统结构与编译原理专题课程${i + 1}`,
      teacher: `张老师${i}`,
      classroom: `理科教学楼 A${100 + i}`,
      weekday: (i % 5) + 1,
      startPeriod: ((i % 4) * 2) + 1,
      endPeriod: ((i % 4) * 2) + 2,
      weeks: i < 8 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] : [1, 2, 3, 4],
      color: "sky",
    });
  }
  const hugeSchedule = { ...mySchedule, courses: hugeCourses };
  const hugeFull = shareMod.encodeScheduleShareCode(hugeSchedule);
  assert.ok(Buffer.byteLength(hugeFull, "utf8") > 271, "Huge schedule should exceed 271 bytes");
  const hugeQrToken = shareMod.buildCompactQrSummary(hugeSchedule, 5);
  assert.ok(
    Buffer.byteLength(hugeQrToken, "utf8") <= 271,
    `Compact QR token must be <= 271 bytes, got ${Buffer.byteLength(hugeQrToken, "utf8")}`,
  );
  const hugeQr = qrMod.generateQrMatrix(hugeQrToken);
  assert.ok(hugeQr, "Compact QR token must produce a valid QR matrix");
  verifyQrMatrixFully(hugeQr, hugeQrToken);
  const decodedHugeQr = shareMod.decodeScheduleShareCode(hugeQrToken);
  assert.ok(decodedHugeQr.courses.length > 0);
  assert.ok(decodedHugeQr.courses.every((c) => c.w.includes(5)));

  // Extreme density stress test: 25 courses all in the SAME week still fits <= 271 bytes & valid QR
  const extremeCourses = Array.from({ length: 25 }, (_, i) => ({
    id: `ex-${i}`,
    name: `超长名字的专业方向前沿讨论课第${i + 1}模块`,
    teacher: `教授${i}`,
    classroom: `教学大楼B区${300 + i}`,
    weekday: (i % 7) + 1,
    startPeriod: ((i % 4) * 2) + 1,
    endPeriod: ((i % 4) * 2) + 2,
    weeks: [5],
    color: "violet",
  }));
  const extremeQrToken = shareMod.buildCompactQrSummary(
    { ...mySchedule, courses: extremeCourses },
    5,
    "超长测试昵称",
  );
  assert.ok(Buffer.byteLength(extremeQrToken, "utf8") <= 271);
  const extremeQr = qrMod.generateQrMatrix(extremeQrToken);
  assert.ok(extremeQr);
  verifyQrMatrixFully(extremeQr, extremeQrToken);
  const decodedExtreme = shareMod.decodeScheduleShareCode(extremeQrToken);
  assert.ok(decodedExtreme.courses.length > 0);

  /* ---------------- 4. Multi-Peer Common Free Slot Radar Tests ---------------- */
  const peerA = {
    id: "peer-a",
    nickname: "室友A",
    color: "violet",
    scheduleName: "大二下",
    totalWeeks: 18,
    startDate: "2026-08-31",
    active: true,
    importedAt: 1000,
    courses: [
      // Mon P1-2 (busy together with me!)
      { n: "线性代数", d: 1, s: 1, e: 2, w: [1, 2, 3, 4, 5], r: "二教 101" },
      // Wed P1-4 (leaves Wed P5-8 completely free for everyone!)
      { n: "操作系统", d: 3, s: 1, e: 4, w: [5], r: "计科楼 305" },
      // Thu P1-8 (occupies all of Thursday)
      { n: "金工实习", d: 4, s: 1, e: 8, w: [5] },
    ],
  };

  const peerB = {
    id: "peer-b",
    nickname: "对象",
    color: "rose",
    scheduleName: "设计学院",
    totalWeeks: 18,
    startDate: "2026-08-31",
    active: true,
    importedAt: 2000,
    courses: [
      // Mon P3-4
      { n: "视觉传达", d: 1, s: 3, e: 4, w: [5], r: "艺设 202" },
      // Tue P1-4
      { n: "色彩构成", d: 2, s: 1, e: 4, w: [5] },
      // Fri P1-6 (with my Fri P7-8, leaves Fri 0 free slots!)
      { n: "素描实训", d: 5, s: 1, e: 6, w: [5] },
    ],
  };

  const inactivePeer = {
    id: "peer-off",
    nickname: "已隐藏好友",
    color: "amber",
    scheduleName: "隐藏课表",
    totalWeeks: 18,
    startDate: "2026-08-31",
    active: false,
    importedAt: 3000,
    courses: [
      // Would block Wed P5-8 if active, must be ignored!
      { n: "占满课", d: 3, s: 5, e: 8, w: [5] },
    ],
  };

  // In week 5:
  // Me: Mon P1-2 (高数), Tue P5-6 (大物实验, odd week!), Fri P7-8 (新生研讨课). (Mon P5-6 数据结构 skips week 5!)
  // PeerA: Mon P1-2, Wed P1-4, Thu P1-8
  // PeerB: Mon P3-4, Tue P1-4, Fri P1-6
  // Result per day (Mon-Fri, 8 periods each = 40 slots):
  // - Mon: P1-2 busy (Me + PeerA), P3-4 busy (PeerB), P5-8 ALL FREE (4 contiguous!)
  // - Tue: P1-4 busy (PeerB), P5-6 busy (Me), P7-8 ALL FREE (2 contiguous)
  // - Wed: P1-4 busy (PeerA), P5-8 ALL FREE (4 contiguous!)
  // - Thu: P1-8 busy (PeerA) -> 0 free
  // - Fri: P1-6 busy (PeerB), P7-8 busy (Me) -> 0 free
  // Total allFree slots = 4 + 2 + 4 = 10 / 40
  const radar = shareMod.computeCommonFreeSlots(
    mySchedule,
    [peerA, peerB, inactivePeer],
    5,
  );

  assert.equal(radar.totalPeople, 3, "Only active peers + me counted");
  assert.equal(radar.totalSlotCount, 40);
  assert.equal(radar.allFreeSlotCount, 10);

  // Check Mon P1 cell (both Me and PeerA busy, PeerB free)
  const monP1 = radar.cellMap["1-1"];
  assert.equal(monP1.allFree, false);
  assert.equal(monP1.freeCount, 1);
  assert.deepEqual(monP1.freePeople, ["对象"]);
  assert.equal(monP1.busy.length, 2);
  assert.equal(monP1.busy[0].isMe, true);
  assert.equal(monP1.busy[0].personName, "我");
  assert.equal(monP1.busy[0].courseName, "高等数学");
  assert.equal(monP1.busy[1].isMe, false);
  assert.equal(monP1.busy[1].personName, "室友A");
  assert.equal(monP1.busy[1].courseName, "线性代数");
  assert.equal(monP1.busy[1].classroom, "二教 101");

  // Check Wed P5 cell (all 3 free, inactivePeer ignored)
  const wedP5 = radar.cellMap["3-5"];
  assert.equal(wedP5.allFree, true);
  assert.equal(wedP5.freeCount, 3);
  assert.deepEqual(wedP5.freePeople, ["我", "室友A", "对象"]);
  assert.equal(wedP5.busy.length, 0);

  // Check recommendedBlocks sorted longest first: Mon P5-8 (4), Wed P5-8 (4), Tue P7-8 (2)
  assert.equal(radar.recommendedBlocks.length, 3);
  assert.deepEqual(radar.recommendedBlocks[0], {
    weekday: 1,
    dayLabel: "周一",
    startPeriod: 5,
    endPeriod: 8,
    startTime: "14:00",
    endTime: "17:40",
    periodCount: 4,
  });
  assert.deepEqual(radar.recommendedBlocks[1], {
    weekday: 3,
    dayLabel: "周三",
    startPeriod: 5,
    endPeriod: 8,
    startTime: "14:00",
    endTime: "17:40",
    periodCount: 4,
  });
  assert.deepEqual(radar.recommendedBlocks[2], {
    weekday: 2,
    dayLabel: "周二",
    startPeriod: 7,
    endPeriod: 8,
    startTime: "16:00",
    endTime: "17:40",
    periodCount: 2,
  });

  // Weekend toggle includes Sat/Sun (56 total slots, adding 16 free slots on Sat+Sun)
  const radarWithWeekend = shareMod.computeCommonFreeSlots(
    mySchedule,
    [peerA, peerB],
    5,
    { includeWeekend: true },
  );
  assert.equal(radarWithWeekend.weekdays.length, 7);
  assert.equal(radarWithWeekend.totalSlotCount, 56);
  assert.equal(radarWithWeekend.allFreeSlotCount, 26);
  assert.equal(radarWithWeekend.recommendedBlocks[0].periodCount, 8);

  /* ---------------- 5. Zustand Peer Store Tests ---------------- */
  const memStorage = new Map();
  const { load: loadStore } = createTsLoader({
    "react-native": { Platform: { OS: "ios" } },
    "@/utils/storage": {
      coordinatedJSONStorage: () => ({
        getItem: async (k) => memStorage.get(k) ?? null,
        setItem: async (k, v) => { memStorage.set(k, v); },
        removeItem: async (k) => { memStorage.delete(k); },
      }),
    },
  });
  const { usePeerSchedules } = loadStore("src/store/usePeerSchedules.ts");

  const imported1 = usePeerSchedules
    .getState()
    .importPeerFromCode(wrappedChat, "死党B");
  assert.equal(imported1.nickname, "死党B");
  assert.equal(imported1.active, true);
  assert.equal(usePeerSchedules.getState().peers.length, 1);

  usePeerSchedules.getState().togglePeerActive(imported1.id);
  assert.equal(usePeerSchedules.getState().peers[0].active, false);

  usePeerSchedules.getState().renamePeer(imported1.id, "室友小王");
  assert.equal(usePeerSchedules.getState().peers[0].nickname, "室友小王");

  // Invalid import throws and leaves existing peers untouched
  assert.throws(
    () => usePeerSchedules.getState().importPeerFromCode("DS1:bad.00000000"),
    /校验失败/,
  );
  assert.equal(usePeerSchedules.getState().peers.length, 1);

  usePeerSchedules.getState().removePeer(imported1.id);
  assert.equal(usePeerSchedules.getState().peers.length, 0);

  usePeerSchedules.getState().importPeerFromCode(token);
  assert.equal(usePeerSchedules.getState().peers.length, 1);
  usePeerSchedules.getState().clearPeers();
  assert.equal(usePeerSchedules.getState().peers.length, 0);

  console.log(
    "PASS: qrMatrix (V1-V10 full RS/BCH/Golay/Byte decode + >271B null), scheduleShare (DS1 codec, chat extract, tamper reject, compact QR fallback, multi-peer free-slot radar), and usePeerSchedules store",
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
