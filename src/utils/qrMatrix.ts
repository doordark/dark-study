/**
 * Pure-TypeScript ISO/IEC 18004 QR Code (Model 2) matrix generator.
 * Supports Versions 1–10 in Byte mode with Error Correction Level L (up to 271 UTF-8 bytes).
 * Zero external dependencies — renders cleanly via react-native-svg <Rect>.
 */

export interface QrMatrix {
  /** Width and height of the square QR symbol in modules (21..57). */
  size: number;
  /** Selected QR version (1..10). */
  version: number;
  /** Row-major boolean grid: true = dark module, false = light module. */
  modules: boolean[][];
}

interface VersionSpec {
  version: number;
  /** Maximum UTF-8 byte payload length in Byte mode at EC Level L. */
  maxBytes: number;
  /** Total data codewords across all blocks. */
  dataCodewords: number;
  /** Error-correction codewords per RS block. */
  ecCodewordsPerBlock: number;
  /** Group 1 block count and data codewords per block. */
  g1Blocks: number;
  g1DataCodewords: number;
  /** Group 2 block count and data codewords per block. */
  g2Blocks: number;
  g2DataCodewords: number;
  /** Alignment pattern center coordinates (both row and col). */
  alignmentCenters: readonly number[];
}

/**
 * ISO/IEC 18004 Tables 7 & 9 — Error Correction Level L, Versions 1..10.
 * Versions 1–9 use an 8-bit Byte-mode length field; Version 10 uses a 16-bit length field.
 */
const VERSION_SPECS: readonly VersionSpec[] = [
  { version: 1, maxBytes: 17, dataCodewords: 19, ecCodewordsPerBlock: 7, g1Blocks: 1, g1DataCodewords: 19, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [] },
  { version: 2, maxBytes: 32, dataCodewords: 34, ecCodewordsPerBlock: 10, g1Blocks: 1, g1DataCodewords: 34, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 18] },
  { version: 3, maxBytes: 53, dataCodewords: 55, ecCodewordsPerBlock: 15, g1Blocks: 1, g1DataCodewords: 55, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 22] },
  { version: 4, maxBytes: 78, dataCodewords: 80, ecCodewordsPerBlock: 20, g1Blocks: 1, g1DataCodewords: 80, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 26] },
  { version: 5, maxBytes: 106, dataCodewords: 108, ecCodewordsPerBlock: 26, g1Blocks: 1, g1DataCodewords: 108, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 30] },
  { version: 6, maxBytes: 134, dataCodewords: 136, ecCodewordsPerBlock: 18, g1Blocks: 2, g1DataCodewords: 68, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 34] },
  { version: 7, maxBytes: 154, dataCodewords: 156, ecCodewordsPerBlock: 20, g1Blocks: 2, g1DataCodewords: 78, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 22, 38] },
  { version: 8, maxBytes: 192, dataCodewords: 194, ecCodewordsPerBlock: 24, g1Blocks: 2, g1DataCodewords: 97, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 24, 42] },
  { version: 9, maxBytes: 230, dataCodewords: 232, ecCodewordsPerBlock: 30, g1Blocks: 2, g1DataCodewords: 116, g2Blocks: 0, g2DataCodewords: 0, alignmentCenters: [6, 26, 46] },
  { version: 10, maxBytes: 271, dataCodewords: 274, ecCodewordsPerBlock: 18, g1Blocks: 2, g1DataCodewords: 68, g2Blocks: 2, g2DataCodewords: 69, alignmentCenters: [6, 28, 50] },
];

/** Maximum UTF-8 byte capacity supported by generateQrMatrix (Version 10, EC Level L). */
export const QR_MAX_BYTES = 271;

/* -------------------------------------------------------------------------- */
/*  UTF-8 encoding (Hermes/Node safe, surrogate-pair compliant)               */
/* -------------------------------------------------------------------------- */

export function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
        i++;
      } else {
        cp = 0xfffd;
      }
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      cp = 0xfffd;
    }

    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(
        0xe0 | (cp >> 12),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

export function utf8ByteLength(text: string): number {
  return utf8Encode(text).length;
}

/* -------------------------------------------------------------------------- */
/*  GF(256) arithmetic & Reed-Solomon ECC (primitive poly 0x11D)              */
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
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

const rsGeneratorCache = new Map<number, Uint8Array>();

function getRsGenerator(degree: number): Uint8Array {
  const cached = rsGeneratorCache.get(degree);
  if (cached) return cached;

  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  rsGeneratorCache.set(degree, poly);
  return poly;
}

function computeRsRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = getRsGenerator(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < ecCount - 1; j++) {
      rem[j] = rem[j + 1];
    }
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

/* -------------------------------------------------------------------------- */
/*  Data stream encoding & multi-block interleaving                           */
/* -------------------------------------------------------------------------- */

function encodeDataCodewords(payload: Uint8Array, spec: VersionSpec): Uint8Array {
  const totalBits = spec.dataCodewords * 8;
  const bits: number[] = [];

  const pushBits = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };

  // Mode indicator: Byte mode (0100)
  pushBits(0b0100, 4);
  // Character count indicator: 8 bits for V1-V9, 16 bits for V10+
  pushBits(payload.length, spec.version <= 9 ? 8 : 16);
  // Byte payload
  for (let i = 0; i < payload.length; i++) {
    pushBits(payload[i], 8);
  }
  // Terminator: up to 4 zero bits
  const termLen = Math.min(4, totalBits - bits.length);
  for (let i = 0; i < termLen; i++) bits.push(0);
  // Zero-pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  const out = new Uint8Array(spec.dataCodewords);
  const byteCount = bits.length >>> 3;
  for (let i = 0; i < byteCount; i++) {
    let b = 0;
    const base = i << 3;
    for (let k = 0; k < 8; k++) {
      b = (b << 1) | bits[base + k];
    }
    out[i] = b;
  }

  // Pad codewords alternating 0xEC and 0x11
  let padToggle = 0;
  for (let i = byteCount; i < spec.dataCodewords; i++) {
    out[i] = padToggle === 0 ? 0xec : 0x11;
    padToggle ^= 1;
  }
  return out;
}

function buildInterleavedCodewords(
  dataBytes: Uint8Array,
  spec: VersionSpec,
): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let b = 0; b < spec.g1Blocks; b++) {
    const slice = dataBytes.subarray(offset, offset + spec.g1DataCodewords);
    dataBlocks.push(slice);
    ecBlocks.push(computeRsRemainder(slice, spec.ecCodewordsPerBlock));
    offset += spec.g1DataCodewords;
  }
  for (let b = 0; b < spec.g2Blocks; b++) {
    const slice = dataBytes.subarray(offset, offset + spec.g2DataCodewords);
    dataBlocks.push(slice);
    ecBlocks.push(computeRsRemainder(slice, spec.ecCodewordsPerBlock));
    offset += spec.g2DataCodewords;
  }

  const totalBlocks = dataBlocks.length;
  const maxDataLen = Math.max(spec.g1DataCodewords, spec.g2DataCodewords);
  const totalCodewords =
    spec.dataCodewords + totalBlocks * spec.ecCodewordsPerBlock;
  const interleaved = new Uint8Array(totalCodewords);

  let pos = 0;
  for (let col = 0; col < maxDataLen; col++) {
    for (let b = 0; b < totalBlocks; b++) {
      if (col < dataBlocks[b].length) {
        interleaved[pos++] = dataBlocks[b][col];
      }
    }
  }
  for (let col = 0; col < spec.ecCodewordsPerBlock; col++) {
    for (let b = 0; b < totalBlocks; b++) {
      interleaved[pos++] = ecBlocks[b][col];
    }
  }
  return interleaved;
}

/* -------------------------------------------------------------------------- */
/*  Matrix construction: function patterns, format/version info, masking      */
/* -------------------------------------------------------------------------- */

function computeFormatBitsLevelL(mask: number): number {
  // EC Level L indicator = 01 (binary)
  const data = (0b01 << 3) | (mask & 0b111);
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) {
      rem ^= 0x1f25 << (i - 12);
    }
  }
  return (version << 12) | rem;
}

function drawFunctionPatterns(
  modules: boolean[][],
  isFunction: boolean[][],
  spec: VersionSpec,
): void {
  const size = modules.length;
  const setFn = (r: number, c: number, dark: boolean) => {
    modules[r][c] = dark;
    isFunction[r][c] = true;
  };

  // 1. Finder patterns (7x7) + 1-module white separator around each corner
  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      const r = top + dr;
      if (r < 0 || r >= size) continue;
      for (let dc = -1; dc <= 7; dc++) {
        const c = left + dc;
        if (c < 0 || c >= size) continue;
        const isSep = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const isOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFn(r, c, !isSep && (isOuter || isInner));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Timing patterns (row 6 and col 6 between separators)
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setFn(6, i, dark);
    setFn(i, 6, dark);
  }

  // 3. Alignment patterns (5x5) skipping overlaps with the three finder corners
  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const cr = centers[i];
      const cc = centers[j];
      const overlapsFinder =
        (cr <= 8 && cc <= 8) ||
        (cr <= 8 && cc >= size - 9) ||
        (cr >= size - 9 && cc <= 8);
      if (overlapsFinder) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFn(cr + dr, cc + dc, dist !== 1);
        }
      }
    }
  }

  // 4. Dark module (always dark at row 4*v + 9 = size - 8, col 8)
  setFn(size - 8, 8, true);

  // 5. Reserve format information modules (populated once mask is chosen)
  drawFormatInfo(modules, isFunction, 0);

  // 6. Version information blocks (18-bit Golay, V7+)
  if (spec.version >= 7) {
    const vBits = computeVersionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const dark = ((vBits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, dark);
      setFn(b, a, dark);
    }
  }
}

function drawFormatInfo(
  modules: boolean[][],
  isFunction: boolean[][],
  mask: number,
): void {
  const size = modules.length;
  const bits = computeFormatBitsLevelL(mask);
  const bitAt = (idx: number) => ((bits >>> idx) & 1) !== 0;
  const setFn = (r: number, c: number, dark: boolean) => {
    modules[r][c] = dark;
    isFunction[r][c] = true;
  };

  // Copy 1: around top-left finder
  // Row 8: cols 0..5 -> bits 14..9; col 7 -> bit 8; col 8 -> bit 7
  for (let c = 0; c <= 5; c++) setFn(8, c, bitAt(14 - c));
  setFn(8, 7, bitAt(8));
  setFn(8, 8, bitAt(7));
  // Col 8: row 7 -> bit 6; rows 5..0 -> bits 5..0
  setFn(7, 8, bitAt(6));
  for (let r = 5; r >= 0; r--) setFn(r, 8, bitAt(r));

  // Copy 2: bottom-left col 8 (rows size-1..size-7 -> bits 14..8)
  for (let i = 0; i < 7; i++) {
    setFn(size - 1 - i, 8, bitAt(14 - i));
  }
  // Copy 2: top-right row 8 (cols size-8..size-1 -> bits 7..0)
  for (let i = 0; i < 8; i++) {
    setFn(8, size - 8 + i, bitAt(7 - i));
  }
}

function placeDataCodewords(
  modules: boolean[][],
  isFunction: boolean[][],
  codewords: Uint8Array,
): void {
  const size = modules.length;
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // Skip vertical timing column
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFunction[r][c]) continue;
        let dark = false;
        if (bitIndex < totalBits) {
          dark = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
        modules[r][c] = dark;
      }
    }
    upward = !upward;
  }
}

function shouldFlipMask(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function applyMask(
  modules: boolean[][],
  isFunction: boolean[][],
  mask: number,
): void {
  const size = modules.length;
  for (let r = 0; r < size; r++) {
    const row = modules[r];
    const fnRow = isFunction[r];
    for (let c = 0; c < size; c++) {
      if (!fnRow[c] && shouldFlipMask(mask, r, c)) {
        row[c] = !row[c];
      }
    }
  }
}

function matchesFinderLikePattern(
  line: readonly boolean[],
  start: number,
): boolean {
  // Pattern A: 10111010000  |  Pattern B: 00001011101
  const a =
    line[start] &&
    !line[start + 1] &&
    line[start + 2] &&
    line[start + 3] &&
    line[start + 4] &&
    !line[start + 5] &&
    line[start + 6] &&
    !line[start + 7] &&
    !line[start + 8] &&
    !line[start + 9] &&
    !line[start + 10];
  if (a) return true;
  return (
    !line[start] &&
    !line[start + 1] &&
    !line[start + 2] &&
    !line[start + 3] &&
    line[start + 4] &&
    !line[start + 5] &&
    line[start + 6] &&
    line[start + 7] &&
    line[start + 8] &&
    !line[start + 9] &&
    line[start + 10]
  );
}

function computePenaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;

  // Rule 1 (runs >= 5) & Rule 3 (finder-like 11-module patterns) across rows
  for (let r = 0; r < size; r++) {
    const row = modules[r];
    let runColor = row[0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (row[c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = row[c];
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);

    for (let c = 0; c <= size - 11; c++) {
      if (matchesFinderLikePattern(row, c)) score += 40;
    }
  }

  // Rule 1 & Rule 3 across columns
  const colBuf: boolean[] = new Array(size);
  for (let c = 0; c < size; c++) {
    for (let r = 0; r < size; r++) colBuf[r] = modules[r][c];
    let runColor = colBuf[0];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (colBuf[r] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = colBuf[r];
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);

    for (let r = 0; r <= size - 11; r++) {
      if (matchesFinderLikePattern(colBuf, r)) score += 40;
    }
  }

  // Rule 2: 2x2 same-color blocks
  for (let r = 0; r < size - 1; r++) {
    const r0 = modules[r];
    const r1 = modules[r + 1];
    for (let c = 0; c < size - 1; c++) {
      const v = r0[c];
      if (v === r0[c + 1] && v === r1[c] && v === r1[c + 1]) {
        score += 3;
      }
    }
  }

  // Rule 4: dark module ratio deviation from 50%
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    const row = modules[r];
    for (let c = 0; c < size; c++) {
      if (row[c]) darkCount++;
    }
  }
  const total = size * size;
  const deviationSteps = Math.floor(
    Math.abs((darkCount * 100) / total - 50) / 5,
  );
  score += deviationSteps * 10;

  return score;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Generates a standard scannable QR Code matrix (Byte mode, EC Level L, V1–V10).
 * Returns `null` gracefully if `text` exceeds Version 10-L capacity (271 UTF-8 bytes)
 * or is invalid — never throws.
 */
export function generateQrMatrix(text: string): QrMatrix | null {
  if (typeof text !== "string") return null;
  const payload = utf8Encode(text);
  if (payload.length > QR_MAX_BYTES) return null;

  const spec = VERSION_SPECS.find((s) => payload.length <= s.maxBytes);
  if (!spec) return null;

  const size = spec.version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );

  drawFunctionPatterns(modules, isFunction, spec);
  const dataCodewords = encodeDataCodewords(payload, spec);
  const interleaved = buildInterleavedCodewords(dataCodewords, spec);
  placeDataCodewords(modules, isFunction, interleaved);

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(modules, isFunction, mask);
    drawFormatInfo(modules, isFunction, mask);
    const penalty = computePenaltyScore(modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    // Revert mask (XOR is self-inverse)
    applyMask(modules, isFunction, mask);
  }

  applyMask(modules, isFunction, bestMask);
  drawFormatInfo(modules, isFunction, bestMask);

  return {
    size,
    version: spec.version,
    modules,
  };
}
