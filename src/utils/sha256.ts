/**
 * Pure TypeScript FIPS 180-4 SHA-256 implementation with zero dependencies.
 * Derives initial hash constants and round constants from the first 64 primes.
 */

function firstPrimes(count: number): number[] {
  const primes: number[] = [];
  for (let candidate = 2; primes.length < count; candidate++) {
    let isPrime = true;
    for (let i = 0; i < primes.length && primes[i] * primes[i] <= candidate; i++) {
      if (candidate % primes[i] === 0) {
        isPrime = false;
        break;
      }
    }
    if (isPrime) primes.push(candidate);
  }
  return primes;
}

const PRIMES_64 = firstPrimes(64);
const POW_32 = 0x100000000;

const INIT_H = new Uint32Array(
  PRIMES_64.slice(0, 8).map((p) => Math.floor((Math.sqrt(p) % 1) * POW_32) >>> 0),
);

const ROUND_K = new Uint32Array(
  PRIMES_64.map((p) => Math.floor((Math.cbrt(p) % 1) * POW_32) >>> 0),
);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function compressBlock(
  state: Uint32Array,
  block: Uint8Array,
  offset: number,
  schedule: Uint32Array,
): void {
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4;
    schedule[i] =
      ((block[j] << 24) |
        (block[j + 1] << 16) |
        (block[j + 2] << 8) |
        block[j + 3]) >>>
      0;
  }

  for (let i = 16; i < 64; i++) {
    const s0 =
      rotr(schedule[i - 15], 7) ^
      rotr(schedule[i - 15], 18) ^
      (schedule[i - 15] >>> 3);
    const s1 =
      rotr(schedule[i - 2], 17) ^
      rotr(schedule[i - 2], 19) ^
      (schedule[i - 2] >>> 10);
    schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) >>> 0;
  }

  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];

  for (let i = 0; i < 64; i++) {
    const bigSigma1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + bigSigma1 + ch + ROUND_K[i] + schedule[i]) >>> 0;
    const bigSigma0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (bigSigma0 + maj) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }

  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0;
  state[5] = (state[5] + f) >>> 0;
  state[6] = (state[6] + g) >>> 0;
  state[7] = (state[7] + h) >>> 0;
}

function encodeUtf8(text: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text);
  }
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/** 增量 SHA-256 计算器，适合分块流式校验大文件 */
export class Sha256Hasher {
  private readonly state = new Uint32Array(INIT_H);
  private readonly schedule = new Uint32Array(64);
  private readonly pending = new Uint8Array(64);
  private pendingLen = 0;
  private bytesLow = 0;
  private bytesHigh = 0;

  update(chunk: Uint8Array): this {
    const len = chunk.length;
    if (len === 0) return this;

    const nextLow = this.bytesLow + len;
    if (nextLow >= POW_32) {
      this.bytesHigh += Math.floor(nextLow / POW_32);
      this.bytesLow = nextLow >>> 0;
    } else {
      this.bytesLow = nextLow;
    }

    let offset = 0;
    if (this.pendingLen > 0) {
      const take = Math.min(64 - this.pendingLen, len);
      this.pending.set(chunk.subarray(0, take), this.pendingLen);
      this.pendingLen += take;
      offset += take;
      if (this.pendingLen === 64) {
        compressBlock(this.state, this.pending, 0, this.schedule);
        this.pendingLen = 0;
      }
    }

    while (offset + 64 <= len) {
      compressBlock(this.state, chunk, offset, this.schedule);
      offset += 64;
    }

    if (offset < len) {
      const rem = len - offset;
      this.pending.set(chunk.subarray(offset), 0);
      this.pendingLen = rem;
    }

    return this;
  }

  /** 返回小写 64 位十六进制 SHA-256 摘要（非破坏性，可重复调用） */
  digestHex(): string {
    const finalState = new Uint32Array(this.state);
    const finalSchedule = new Uint32Array(64);
    const padLen = this.pendingLen < 56 ? 64 : 128;
    const tail = new Uint8Array(padLen);
    tail.set(this.pending.subarray(0, this.pendingLen), 0);
    tail[this.pendingLen] = 0x80;

    const bitHigh = ((this.bytesHigh << 3) | (this.bytesLow >>> 29)) >>> 0;
    const bitLow = (this.bytesLow << 3) >>> 0;

    const lenOffset = padLen - 8;
    tail[lenOffset] = (bitHigh >>> 24) & 0xff;
    tail[lenOffset + 1] = (bitHigh >>> 16) & 0xff;
    tail[lenOffset + 2] = (bitHigh >>> 8) & 0xff;
    tail[lenOffset + 3] = bitHigh & 0xff;
    tail[lenOffset + 4] = (bitLow >>> 24) & 0xff;
    tail[lenOffset + 5] = (bitLow >>> 16) & 0xff;
    tail[lenOffset + 6] = (bitLow >>> 8) & 0xff;
    tail[lenOffset + 7] = bitLow & 0xff;

    for (let pos = 0; pos < padLen; pos += 64) {
      compressBlock(finalState, tail, pos, finalSchedule);
    }

    let hex = "";
    for (let i = 0; i < 8; i++) {
      hex += finalState[i].toString(16).padStart(8, "0");
    }
    return hex;
  }
}

export function sha256Bytes(data: Uint8Array): string {
  return new Sha256Hasher().update(data).digestHex();
}

export function sha256String(text: string): string {
  return sha256Bytes(encodeUtf8(text));
}
