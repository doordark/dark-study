/**
 * Exact TypeScript port of rany2/edge-tts v7.3+ Sec-MS-GEC v2 DRM token generator
 * (modified SHA-256 + CS64 digest) for Microsoft Edge Read Aloud WebSocket handshake.
 */

export const EDGE_BASE_URL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
export const EDGE_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
export const EDGE_WSS_URL = `wss://${EDGE_BASE_URL}/edge/v1?TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}`;
export const EDGE_CHROMIUM_FULL_VERSION = "143.0.3650.75";
export const EDGE_CHROMIUM_MAJOR = "143";
export const EDGE_SEC_MS_GEC_VERSION = `2-${EDGE_CHROMIUM_FULL_VERSION}`;

export const EDGE_WSS_HEADERS: Record<string, string> = {
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "Sec-WebSocket-Version": "13",
  "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${EDGE_CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${EDGE_CHROMIUM_MAJOR}.0.0.0`,
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9",
};

const WIN_EPOCH = 11644473600;

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];
const SHA256_STATE = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a,
  0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2,
];
const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba,
  0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6,
  0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564,
];
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA256_ADJUSTMENT = 0xc9dc06a7;
const SHA256_BLOCK_CONSTANTS = [
  ...SHA256_ROUND_CONSTANTS.slice(0, 14),
  SHA256_ADJUSTMENT,
  ...SHA256_ROUND_CONSTANTS.slice(15),
];
const SHA256_SIGMA0_ADJ = 0x059c0b80;
const SHA256_SIGMA1_ADJ = 0x000b92c0;

const CS64_COEFFICIENTS: readonly (readonly [number, number])[] = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJ0 = 0xf2f90b1a;
const CS64_ADJ1 = 0x0b1a0000;

const rotr = (v: number, n: number) => ((v >>> n) | (v << (32 - n))) >>> 0;
const rol16 = (v: number) => ((v << 16) | (v >>> 16)) >>> 0;
const sigma0 = (v: number) => (rotr(v, 7) ^ rotr(v, 18) ^ (v >>> 3)) >>> 0;
const sigma1 = (v: number) => (rotr(v, 17) ^ rotr(v, 19) ^ (v >>> 10)) >>> 0;
const bigSigma0 = (v: number) => (rotr(v, 2) ^ rotr(v, 13) ^ rotr(v, 22)) >>> 0;
const bigSigma1 = (v: number) => (rotr(v, 6) ^ rotr(v, 11) ^ rotr(v, 25)) >>> 0;
const mul32 = (a: number, b: number) => Math.imul(a, b) >>> 0;

function sha256Rounds(state: readonly number[], words: readonly number[], firstRound = 0): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  for (let i = firstRound; i < 64; i++) {
    const ch = (g ^ (e & (f ^ g))) >>> 0;
    const maj = ((a & b) | (c & (a | b))) >>> 0;
    const t1 = (h + bigSigma1(e) + ch + constants[i] + words[i]) >>> 0;
    const t2 = (bigSigma0(a) + maj) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function expandSha256Schedule(words: number[], firstWord = 16): void {
  for (let i = firstWord; i < 64; i++) {
    words[i] = (sigma1(words[i - 2]) + words[i - 7] + sigma0(words[i - 15]) + words[i - 16]) >>> 0;
  }
}

function sha256Init(head7: Uint8Array): number[] {
  const words = new Array<number>(64).fill(0);
  words[14] = ((head7[0] << 16) | (head7[1] << 8) | head7[2]) >>> 0;
  words[15] = ((head7[3] << 24) | (head7[4] << 16) | (head7[5] << 8) | head7[6]) >>> 0;
  for (let i = 16; i < 30; i++) {
    let value = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) {
      const s1 = sigma1(words[i - 2]);
      value = (value + (i === 16 ? ((s1 ^ SHA256_SIGMA1_ADJ) >>> 0) : s1)) >>> 0;
    }
    if (i - 7 >= 14) value = (value + words[i - 7]) >>> 0;
    if (i - 15 >= 14) {
      const s0 = sigma0(words[i - 15]);
      value = (value + (i === 29 ? ((s0 ^ SHA256_SIGMA0_ADJ) >>> 0) : s0)) >>> 0;
    }
    words[i] = value >>> 0;
  }
  words[30] =
    (sigma1(words[28]) +
      words[23] +
      sigma0(words[15]) +
      words[14] +
      SHA256_ADJUSTMENT -
      SHA256_ROUND_CONSTANTS[14]) >>>
    0;
  expandSha256Schedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((v, i) => (v + working[i]) >>> 0);
}

function sha256Digest(data: Uint8Array): Uint8Array {
  const length = 57 + data.length;
  const tailLen = data.length - 7;
  const zeroPad = (((55 - length) % 64) + 64) % 64;
  const padded = new Uint8Array(tailLen + 1 + zeroPad + 8);
  padded.set(data.subarray(7), 0);
  padded[tailLen] = 0x80;
  const bitLenHi = Math.floor((length * 8) / 0x100000000);
  const bitLenLo = (length * 8) >>> 0;
  const dv = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  dv.setUint32(padded.length - 8, bitLenHi, false);
  dv.setUint32(padded.length - 4, bitLenLo, false);

  let state = sha256Init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Array<number>(64).fill(0);
    for (let j = 0; j < 16; j++) words[j] = dv.getUint32(offset + j * 4, false);
    expandSha256Schedule(words, 16);
    const working = sha256Rounds(state, words, 0);
    state = state.map((v, i) => (v + working[i]) >>> 0);
  }
  const out = new Uint8Array(32);
  const outDv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outDv.setUint32(i * 4, state[i], false);
  return out;
}

function wordsLe4Even(data: Uint8Array): number[] {
  const padLen = (4 - (data.length % 4)) % 4;
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data, 0);
  const dv = new DataView(padded.buffer);
  const words: number[] = [];
  for (let i = 0; i < padded.length; i += 4) words.push(dv.getUint32(i, true));
  if (words.length % 2 === 1) words.push(0);
  return words;
}

function cs64Digest(data: Uint8Array, digest: Uint8Array): [number, number] {
  const dv = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const keyA = (dv.getUint32(0, true) | 1) >>> 0;
  const keyB = (dv.getUint32(4, true) | 1) >>> 0;
  const factor0 = mul32(keyA, CS64_FACTOR);
  const factor1 = mul32(keyB, CS64_FACTOR);

  const terms: number[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < CS64_COEFFICIENTS.length; i++) {
    terms.push(mul32(CS64_COEFFICIENTS[i][0], i % 2 === 0 ? factor0 : factor1));
    offsets.push(CS64_COEFFICIENTS[i][1]);
  }

  const prefixed = new Uint8Array(data.length + 1);
  prefixed[0] = 0;
  prefixed.set(data, 1);
  const words = wordsLe4Even(prefixed);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let term = mul32(w, i % 2 === 0 ? keyA : keyB);
    let off = mul32(rol16(w), i % 2 === 0 ? 0xef0569fb : 0xc31713db);
    if (i === 0) {
      term = (term + mul32(CS64_ADJ0, factor0)) >>> 0;
      off = (off + CS64_ADJ1) >>> 0;
    }
    terms.push(term >>> 0);
    offsets.push(off >>> 0);
  }

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;

  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];

    let t = rol16((offsets[i] + x) >>> 0);
    let q = mul32(t, 0x76f50f34);
    swapAcc = (swapAcc + ((mul32(rol16(q), 0xc3efea97) + q) >>> 0)) >>> 0;

    t = rol16((offsets[i + 1] + y) >>> 0);
    q = mul32(t, 0x1881ce3c);
    swapLast = (mul32(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (mul32(state, keyA) + x) >>> 0;
    state = mul32(rol16(state), 0xcf98b111);
    state = mul32(rol16(state), 0x87085b9f);
    state = mul32(rol16(state), 0x12ceb96d);
    state = mul32(rol16(state), 0x257e1d83);
    acc = (acc + state) >>> 0;

    t = (mul32(state, keyB) + y) >>> 0;
    t = mul32(rol16(t), 0xa27416f5);
    t = mul32(rol16(t), 0xd38396ff);
    state = mul32(rol16(mul32(rol16(t), 0x7c932b89)), 0xbfa49f69);
    acc = (acc + state) >>> 0;
  }

  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
}

function bytesToUpperHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out.toUpperCase();
}

function asciiBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0x7f;
  return out;
}

export function generateSecMsGecV2(unixSeconds = Date.now() / 1000): string {
  let ticks = unixSeconds + WIN_EPOCH;
  ticks -= ticks % 300;
  const ticks100ns = Math.round(ticks * 1e7);
  const input = asciiBytes(`${ticks100ns}${EDGE_TRUSTED_CLIENT_TOKEN}`);
  const digest = sha256Digest(input);
  const [w0, w1] = cs64Digest(input, digest);
  const csBytes = new Uint8Array(8);
  const dv = new DataView(csBytes.buffer);
  dv.setUint32(0, w0, true);
  dv.setUint32(4, w1, true);
  return `${bytesToUpperHex(csBytes)}-${bytesToUpperHex(digest)}`;
}

export function generateMuid(): string {
  let hex = "";
  for (let i = 0; i < 32; i++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return hex.toUpperCase();
}

export function generateRequestId(): string {
  return generateMuid().toLowerCase();
}
