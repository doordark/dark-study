import {
  cleanHtmlToText,
  decodeEntities,
  decodeTextBytes,
  parseXlsxToTsv,
} from "./documentParser";

/* -------------------------------------------------------------------------- */
/*  纯 TS 旧版 .xls 解析器（同时兼容 HTML 伪装、SpreadsheetML XML、真 OLE2 BIFF8） */
/* -------------------------------------------------------------------------- */

const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const MAXREGSECT = 0xfffffffa;
const MAX_SHEET_COLUMNS = 1024;

function hasOle2Magic(bytes: Uint8Array): boolean {
  if (bytes.length < 512) return false;
  for (let i = 0; i < OLE2_MAGIC.length; i++) {
    if (bytes[i] !== OLE2_MAGIC[i]) return false;
  }
  return true;
}

function hasZipMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function normalizeCellText(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, " ").trim();
}

function formatExcelNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Object.is(value, -0)) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(12)));
}

/* -------------------------------------------------------------------------- */
/*  格式 2：SpreadsheetML XML (.xls)                                           */
/* -------------------------------------------------------------------------- */

function parseSpreadsheetMlToTsv(xml: string): string {
  const wsRe = /<(?:[a-zA-Z0-9_-]+:)?Worksheet\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?Worksheet>/gi;
  const worksheets: string[] = [];
  let wm: RegExpExecArray | null;
  while ((wm = wsRe.exec(xml)) !== null) {
    worksheets.push(wm[1]);
  }
  const chunks = worksheets.length ? worksheets : [xml];

  const allLines: string[] = [];
  const rowRe = /<(?:[a-zA-Z0-9_-]+:)?Row\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?Row>/gi;
  const cellRe =
    /<(?:[a-zA-Z0-9_-]+:)?Cell\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?Cell>)/gi;

  for (const sheetXml of chunks) {
    rowRe.lastIndex = 0;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(sheetXml)) !== null) {
      const rowBody = rm[1];
      const cells: string[] = [];
      let nextCol = 0;
      cellRe.lastIndex = 0;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rowBody)) !== null) {
        const attrs = cm[1] ?? "";
        const body = cm[2] ?? "";
        const idxMatch = attrs.match(/(?:^|\s)(?:[a-zA-Z0-9_-]+:)?Index="(\d+)"/i);
        const mergeMatch = attrs.match(
          /(?:^|\s)(?:[a-zA-Z0-9_-]+:)?MergeAcross="(\d+)"/i,
        );
        const colIdx = idxMatch ? Math.max(0, Number(idxMatch[1]) - 1) : nextCol;
        const mergeAcross = mergeMatch
          ? Math.min(MAX_SHEET_COLUMNS, Math.max(0, Number(mergeMatch[1])))
          : 0;
        if (colIdx > MAX_SHEET_COLUMNS) {
          nextCol = MAX_SHEET_COLUMNS + 1;
          continue;
        }
        nextCol = Math.min(MAX_SHEET_COLUMNS + 1, colIdx + 1 + mergeAcross);

        const dataMatch = body.match(
          /<(?:[a-zA-Z0-9_-]+:)?Data\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?Data>/i,
        );
        const rawInner = dataMatch ? dataMatch[1] : body;
        const plain = decodeEntities(
          rawInner.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""),
        );
        cells[colIdx] = normalizeCellText(plain);
      }

      const row = Array.from({ length: cells.length }, (_, i) => cells[i] ?? "");
      if (row.some((c) => c.length > 0)) {
        allLines.push(row.join("\t").replace(/\t+$/, ""));
      }
    }
  }

  if (!allLines.length) {
    throw new Error("XML 格式的 XLS 表格中没有可读取的单元格数据");
  }
  return allLines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  格式 3：真二进制 OLE2 Compound File + BIFF8 Workbook/Book 流               */
/* -------------------------------------------------------------------------- */

function readUtf16LeString(bytes: Uint8Array, start: number, charCount: number): string {
  let out = "";
  const end = Math.min(bytes.length, start + charCount * 2);
  for (let i = start; i + 1 < end; i += 2) {
    out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  }
  return out;
}

function readLatin1String(bytes: Uint8Array, start: number, len: number): string {
  let out = "";
  const end = Math.min(bytes.length, start + len);
  for (let i = start; i < end; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/** 从 OLE2 容器中读取 `Workbook` 或 `Book` 字节流（同时支持标准 FAT 与 MiniFAT） */
function extractOle2WorkbookStream(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = view.getUint16(30, true);
  const miniSectorShift = view.getUint16(32, true);
  if (sectorShift < 7 || sectorShift > 16) {
    throw new Error("OLE2 文件扇区大小无效");
  }
  const sectorSize = 1 << sectorShift;
  const miniSectorSize =
    miniSectorShift >= 4 && miniSectorShift <= sectorShift
      ? 1 << miniSectorShift
      : 64;

  const firstDirSector = view.getUint32(48, true);
  const miniStreamCutoff = view.getUint32(56, true) || 4096;
  const firstMiniFatSector = view.getUint32(60, true);
  const numMiniFatSectors = view.getUint32(64, true);
  const firstDifatSector = view.getUint32(68, true);
  const numDifatSectors = view.getUint32(72, true);

  const sectorOffset = (sid: number): number => (sid + 1) * sectorSize;

  // 1) 收集所有 FAT 扇区编号（Header DIFAT[109] + 扩展 DIFAT 链）
  const fatSectorIds: number[] = [];
  for (let i = 0; i < 109; i++) {
    const sid = view.getUint32(76 + i * 4, true);
    if (sid <= MAXREGSECT) fatSectorIds.push(sid);
  }

  let difatSid = firstDifatSector;
  const difatVisited = new Set<number>();
  const difatLimit = Math.min(numDifatSectors, 4096);
  const entriesPerSector = sectorSize >>> 2;
  for (let step = 0; step < difatLimit && difatSid <= MAXREGSECT; step++) {
    if (difatVisited.has(difatSid)) break;
    difatVisited.add(difatSid);
    const off = sectorOffset(difatSid);
    if (off + sectorSize > bytes.length) break;
    for (let i = 0; i < entriesPerSector - 1; i++) {
      const sid = view.getUint32(off + i * 4, true);
      if (sid <= MAXREGSECT) fatSectorIds.push(sid);
    }
    difatSid = view.getUint32(off + (entriesPerSector - 1) * 4, true);
  }

  if (!fatSectorIds.length) {
    throw new Error("OLE2 文件缺少有效的 FAT 分区表");
  }

  // 2) 构建平铺 FAT 表
  const fat = new Uint32Array(fatSectorIds.length * entriesPerSector);
  for (let s = 0; s < fatSectorIds.length; s++) {
    const off = sectorOffset(fatSectorIds[s]);
    if (off < 0 || off + sectorSize > bytes.length) continue;
    for (let i = 0; i < entriesPerSector; i++) {
      fat[s * entriesPerSector + i] = view.getUint32(off + i * 4, true);
    }
  }

  const readFatChain = (startSector: number, expectedSize?: number): Uint8Array => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let sid = startSector;
    const visited = new Set<number>();
    const maxSectors = Math.max(fat.length, Math.ceil(bytes.length / sectorSize)) + 1;

    while (sid <= MAXREGSECT && sid < fat.length && !visited.has(sid)) {
      if (visited.size >= maxSectors) break;
      visited.add(sid);
      const off = sectorOffset(sid);
      if (off < 0 || off >= bytes.length) break;
      const end = Math.min(off + sectorSize, bytes.length);
      const slice = bytes.subarray(off, end);
      chunks.push(slice);
      total += slice.length;
      if (expectedSize !== undefined && total >= expectedSize) break;
      sid = fat[sid];
    }

    const finalLen =
      expectedSize !== undefined ? Math.min(expectedSize, total) : total;
    const out = new Uint8Array(finalLen);
    let pos = 0;
    for (const chunk of chunks) {
      const take = Math.min(chunk.length, finalLen - pos);
      if (take <= 0) break;
      out.set(chunk.subarray(0, take), pos);
      pos += take;
    }
    return out;
  };

  // 3) 读取目录流（每个目录项 128 字节）
  const dirBytes = readFatChain(firstDirSector);
  if (dirBytes.length < 128) {
    throw new Error("OLE2 文件目录区损坏");
  }
  const dirView = new DataView(
    dirBytes.buffer,
    dirBytes.byteOffset,
    dirBytes.byteLength,
  );

  interface DirEntry {
    name: string;
    type: number;
    startSector: number;
    size: number;
  }

  let rootEntry: DirEntry | null = null;
  let workbookEntry: DirEntry | null = null;

  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const entryType = dirBytes[off + 66];
    if (entryType === 0) continue;
    const nameByteLen = Math.min(64, dirView.getUint16(off + 64, true));
    const charCount = Math.max(0, Math.floor((nameByteLen - 2) / 2));
    const name = readUtf16LeString(dirBytes, off, charCount).replace(/\0+$/g, "");
    const startSector = dirView.getUint32(off + 116, true);
    const sizeLow = dirView.getUint32(off + 120, true);
    const sizeHigh = sectorSize >= 4096 ? dirView.getUint32(off + 124, true) : 0;
    const size = sizeHigh > 0 ? sizeHigh * 0x100000000 + sizeLow : sizeLow;

    const entry: DirEntry = { name, type: entryType, startSector, size };
    if (entryType === 5 && !rootEntry) {
      rootEntry = entry;
    } else if (entryType === 2) {
      const lower = name.toLowerCase();
      if (lower === "workbook") {
        workbookEntry = entry;
      } else if (lower === "book" && !workbookEntry) {
        workbookEntry = entry;
      }
    }
  }

  if (!workbookEntry) {
    throw new Error("未在 XLS 文件中找到 Workbook 工作簿数据流");
  }
  if (workbookEntry.size === 0 || workbookEntry.startSector === ENDOFCHAIN || workbookEntry.startSector === FREESECT) {
    throw new Error("XLS 工作簿数据流为空");
  }

  // 4) 若流小于 miniStreamCutoff 且存在 MiniFAT + Root MiniStream，则走 MiniFAT 读取
  const useMiniStream =
    workbookEntry.size < miniStreamCutoff &&
    rootEntry != null &&
    rootEntry.startSector <= MAXREGSECT &&
    firstMiniFatSector <= MAXREGSECT &&
    numMiniFatSectors > 0;

  if (useMiniStream && rootEntry) {
    const miniStream = readFatChain(rootEntry.startSector, rootEntry.size);
    const miniFatRaw = readFatChain(
      firstMiniFatSector,
      numMiniFatSectors * sectorSize,
    );
    const miniFatCount = miniFatRaw.length >>> 2;
    const miniFatView = new DataView(
      miniFatRaw.buffer,
      miniFatRaw.byteOffset,
      miniFatRaw.byteLength,
    );
    const miniFat = new Uint32Array(miniFatCount);
    for (let i = 0; i < miniFatCount; i++) {
      miniFat[i] = miniFatView.getUint32(i * 4, true);
    }

    const targetSize = Math.min(workbookEntry.size, miniStream.length);
    const out = new Uint8Array(targetSize);
    let pos = 0;
    let sid = workbookEntry.startSector;
    const visited = new Set<number>();
    while (
      sid <= MAXREGSECT &&
      sid < miniFat.length &&
      pos < targetSize &&
      !visited.has(sid)
    ) {
      visited.add(sid);
      const off = sid * miniSectorSize;
      if (off >= miniStream.length) break;
      const take = Math.min(
        miniSectorSize,
        miniStream.length - off,
        targetSize - pos,
      );
      if (take <= 0) break;
      out.set(miniStream.subarray(off, off + take), pos);
      pos += take;
      sid = miniFat[sid];
    }
    if (pos > 0) return out.subarray(0, pos);
  }

  return readFatChain(workbookEntry.startSector, workbookEntry.size);
}

/** 解码 BIFF8 32 位 RK 压缩数值 */
function decodeRkNumber(rk: number): number {
  const isDiv100 = (rk & 0x01) !== 0;
  const isInt = (rk & 0x02) !== 0;
  let val: number;
  if (isInt) {
    val = (rk | 0) >> 2;
  } else {
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    dv.setUint32(0, 0, true);
    dv.setUint32(4, rk & 0xfffffffc, true);
    val = dv.getFloat64(0, true);
  }
  return isDiv100 ? val / 100 : val;
}

/** 读取跨 CONTINUE 记录边界的 BIFF8 SST 共享字符串表 */
function parseBiff8Sst(chunks: Uint8Array[]): string[] {
  if (!chunks.length || chunks[0].length < 8) return [];
  const headView = new DataView(
    chunks[0].buffer,
    chunks[0].byteOffset,
    chunks[0].byteLength,
  );
  const uniqueCount = Math.min(headView.getUint32(4, true), 500_000);

  let chunkIdx = 0;
  let pos = 8;

  const hasMore = (): boolean => chunkIdx < chunks.length;

  const advanceChunk = (): boolean => {
    chunkIdx++;
    pos = 0;
    return chunkIdx < chunks.length;
  };

  const ensureBytesInChunk = (needed: number): boolean => {
    while (chunkIdx < chunks.length && pos >= chunks[chunkIdx].length) {
      chunkIdx++;
      pos = 0;
    }
    return chunkIdx < chunks.length && pos + needed <= chunks[chunkIdx].length;
  };

  const readUint8 = (): number | null => {
    if (!ensureBytesInChunk(1)) return null;
    return chunks[chunkIdx][pos++];
  };

  const readUint16 = (): number | null => {
    const b0 = readUint8();
    const b1 = readUint8();
    if (b0 === null || b1 === null) return null;
    return b0 | (b1 << 8);
  };

  const readUint32 = (): number | null => {
    const lo = readUint16();
    const hi = readUint16();
    if (lo === null || hi === null) return null;
    return (lo | (hi << 16)) >>> 0;
  };

  const skipRawBytes = (count: number): void => {
    let rem = count;
    while (rem > 0 && hasMore()) {
      const avail = chunks[chunkIdx].length - pos;
      if (avail <= 0) {
        if (!advanceChunk()) break;
        continue;
      }
      const take = Math.min(rem, avail);
      pos += take;
      rem -= take;
    }
  };

  const strings: string[] = [];
  for (let s = 0; s < uniqueCount; s++) {
    const cch = readUint16();
    const flags = readUint8();
    if (cch === null || flags === null) break;

    let isUtf16 = (flags & 0x01) !== 0;
    const hasExt = (flags & 0x04) !== 0;
    const hasRich = (flags & 0x08) !== 0;

    const richRuns = hasRich ? (readUint16() ?? 0) : 0;
    const extBytes = hasExt ? (readUint32() ?? 0) : 0;

    let remainingChars = cch;
    let text = "";
    while (remainingChars > 0 && hasMore()) {
      let avail = chunks[chunkIdx].length - pos;
      if (avail <= 0) {
        if (!advanceChunk()) break;
        // BIFF8 规范：字符串跨 CONTINUE 块续写时，新块首字节为新的 grbit 编码标志
        if (chunks[chunkIdx].length === 0) continue;
        const contFlags = chunks[chunkIdx][pos++];
        isUtf16 = (contFlags & 0x01) !== 0;
        avail = chunks[chunkIdx].length - pos;
      }
      const unitBytes = isUtf16 ? 2 : 1;
      const takeChars = Math.min(remainingChars, Math.floor(avail / unitBytes));
      if (takeChars <= 0) {
        if (!advanceChunk()) break;
        continue;
      }
      if (isUtf16) {
        text += readUtf16LeString(chunks[chunkIdx], pos, takeChars);
      } else {
        text += readLatin1String(chunks[chunkIdx], pos, takeChars);
      }
      pos += takeChars * unitBytes;
      remainingChars -= takeChars;
    }

    if (richRuns > 0) skipRawBytes(richRuns * 4);
    if (extBytes > 0) skipRawBytes(extBytes);

    strings.push(normalizeCellText(text));
  }

  return strings;
}

/** 读取单条 BIFF8 Unicode 字符串（用于 LABEL / STRING / RSTRING） */
function readBiffStringPayload(
  payload: Uint8Array,
  offset: number,
  isBiff8: boolean,
  codepage: number,
): string {
  if (offset + 2 > payload.length) return "";
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const cch = view.getUint16(offset, true);
  if (!isBiff8) {
    const start = offset + 2;
    const slice = payload.subarray(start, Math.min(payload.length, start + cch));
    return normalizeCellText(
      codepage === 936 || codepage === 950
        ? decodeTextBytes(slice)
        : readLatin1String(slice, 0, slice.length),
    );
  }
  if (offset + 3 > payload.length) return "";
  const flags = payload[offset + 2];
  const isUtf16 = (flags & 0x01) !== 0;
  const hasExt = (flags & 0x04) !== 0;
  const hasRich = (flags & 0x08) !== 0;
  let pos = offset + 3;
  if (hasRich) pos += 2;
  if (hasExt) pos += 4;
  if (pos >= payload.length) return "";
  if (isUtf16) {
    const maxChars = Math.min(cch, Math.floor((payload.length - pos) / 2));
    return normalizeCellText(readUtf16LeString(payload, pos, maxChars));
  }
  const maxChars = Math.min(cch, payload.length - pos);
  return normalizeCellText(readLatin1String(payload, pos, maxChars));
}

function parseOle2Biff8ToTsv(bytes: Uint8Array): string {
  const wb = extractOle2WorkbookStream(bytes);
  const view = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);

  // 先扫描记录边界列表，便于合并 SST + CONTINUE 与 FORMULA + STRING
  interface BiffRecord {
    id: number;
    payload: Uint8Array;
  }
  const records: BiffRecord[] = [];
  let pos = 0;
  while (pos + 4 <= wb.length) {
    const id = view.getUint16(pos, true);
    const len = view.getUint16(pos + 2, true);
    const dataStart = pos + 4;
    const dataEnd = Math.min(wb.length, dataStart + len);
    records.push({ id, payload: wb.subarray(dataStart, dataEnd) });
    pos = dataEnd;
  }

  let sst: string[] = [];
  let isBiff8 = true;
  let codepage = 1200;
  let encrypted = false;

  type SheetGrid = Map<number, Map<number, string>>;
  const sheets: SheetGrid[] = [];
  let currentSheet: SheetGrid | null = null;
  let lastFormulaCell: { row: number; col: number } | null = null;

  const ensureSheet = (): SheetGrid => {
    if (!currentSheet) {
      currentSheet = new Map();
      sheets.push(currentSheet);
    }
    return currentSheet;
  };

  const setCell = (row: number, col: number, value: string) => {
    if (col < 0 || col > MAX_SHEET_COLUMNS) return;
    const clean = normalizeCellText(value);
    if (!clean) return;
    const grid = ensureSheet();
    let rowMap = grid.get(row);
    if (!rowMap) {
      rowMap = new Map();
      grid.set(row, rowMap);
    }
    rowMap.set(col, clean);
  };

  for (let i = 0; i < records.length; i++) {
    const { id, payload } = records[i];
    const pv = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );

    if (id === 0x002f) {
      // FILEPASS：工作簿加密标记
      encrypted = true;
      continue;
    }

    if (id === 0x0042 && payload.length >= 2) {
      // CODEPAGE
      codepage = pv.getUint16(0, true);
      continue;
    }

    if (id === 0x0809 && payload.length >= 4) {
      // BOF
      const version = pv.getUint16(0, true);
      const substreamType = pv.getUint16(2, true);
      if (version < 0x0600 && version > 0) isBiff8 = false;
      if (substreamType === 0x0010) {
        // 新工作表
        currentSheet = new Map();
        sheets.push(currentSheet);
      } else if (substreamType === 0x0005) {
        // Workbook Globals
        currentSheet = null;
      }
      lastFormulaCell = null;
      continue;
    }

    if (id === 0x000a) {
      // EOF
      lastFormulaCell = null;
      continue;
    }

    if (id === 0x00fc) {
      // SST + 紧随的 CONTINUE (0x003C)
      const sstChunks: Uint8Array[] = [payload];
      while (i + 1 < records.length && records[i + 1].id === 0x003c) {
        i++;
        sstChunks.push(records[i].payload);
      }
      sst = parseBiff8Sst(sstChunks);
      continue;
    }

    if (id === 0x00fd && payload.length >= 10) {
      // LABELSST
      const row = pv.getUint16(0, true);
      const col = pv.getUint16(2, true);
      const isst = pv.getUint32(6, true);
      if (isst < sst.length) setCell(row, col, sst[isst]);
      lastFormulaCell = null;
      continue;
    }

    if ((id === 0x0204 || id === 0x00d6) && payload.length >= 8) {
      // LABEL / RSTRING
      const row = pv.getUint16(0, true);
      const col = pv.getUint16(2, true);
      const str = readBiffStringPayload(payload, 6, isBiff8, codepage);
      setCell(row, col, str);
      lastFormulaCell = null;
      continue;
    }

    if (id === 0x0203 && payload.length >= 14) {
      // NUMBER
      const row = pv.getUint16(0, true);
      const col = pv.getUint16(2, true);
      const num = pv.getFloat64(6, true);
      setCell(row, col, formatExcelNumber(num));
      lastFormulaCell = null;
      continue;
    }

    if (id === 0x027e && payload.length >= 10) {
      // RK
      const row = pv.getUint16(0, true);
      const col = pv.getUint16(2, true);
      const rk = pv.getUint32(6, true);
      setCell(row, col, formatExcelNumber(decodeRkNumber(rk)));
      lastFormulaCell = null;
      continue;
    }

    if (id === 0x00bd && payload.length >= 12) {
      // MULRK: row(2), colFirst(2), [ixfe(2), rk(4)]*, colLast(2)
      const row = pv.getUint16(0, true);
      const colFirst = pv.getUint16(2, true);
      const colLast = pv.getUint16(payload.length - 2, true);
      const count = Math.min(
        Math.floor((payload.length - 6) / 6),
        colLast >= colFirst ? colLast - colFirst + 1 : 0,
      );
      for (let k = 0; k < count; k++) {
        const rk = pv.getUint32(4 + k * 6 + 2, true);
        setCell(row, colFirst + k, formatExcelNumber(decodeRkNumber(rk)));
      }
      lastFormulaCell = null;
      continue;
    }

    if (id === 0x0205 && payload.length >= 8) {
      // BOOLERR
      const row = pv.getUint16(0, true);
      const col = pv.getUint16(2, true);
      const val = payload[6];
      const isErr = payload[7];
      if (isErr === 0) setCell(row, col, val ? "TRUE" : "FALSE");
      lastFormulaCell = null;
      continue;
    }

    if (id === 0x0006 && payload.length >= 14) {
      // FORMULA
      const row = pv.getUint16(0, true);
      const col = pv.getUint16(2, true);
      if (payload[12] === 0xff && payload[13] === 0xff) {
        const tag = payload[6];
        if (tag === 0x00) {
          // 字符串结果在紧随的 STRING (0x0207) 记录里
          lastFormulaCell = { row, col };
        } else if (tag === 0x01) {
          setCell(row, col, payload[8] ? "TRUE" : "FALSE");
          lastFormulaCell = null;
        } else {
          lastFormulaCell = null;
        }
      } else {
        const num = pv.getFloat64(6, true);
        setCell(row, col, formatExcelNumber(num));
        lastFormulaCell = null;
      }
      continue;
    }

    if (id === 0x0207 && lastFormulaCell) {
      // STRING（紧随 FORMULA 的缓存文本结果）
      const str = readBiffStringPayload(payload, 0, isBiff8, codepage);
      setCell(lastFormulaCell.row, lastFormulaCell.col, str);
      lastFormulaCell = null;
      continue;
    }
  }

  const allLines: string[] = [];
  for (const grid of sheets) {
    const sortedRows = [...grid.keys()].sort((a, b) => a - b);
    for (const r of sortedRows) {
      const rowMap = grid.get(r)!;
      if (!rowMap.size) continue;
      let maxCol = 0;
      for (const c of rowMap.keys()) {
        if (c > maxCol) maxCol = c;
      }
      maxCol = Math.min(maxCol, MAX_SHEET_COLUMNS);
      const lineCells = Array.from(
        { length: maxCol + 1 },
        (_, c) => rowMap.get(c) ?? "",
      );
      if (lineCells.some((cell) => cell.length > 0)) {
        allLines.push(lineCells.join("\t").replace(/\t+$/, ""));
      }
    }
  }

  if (!allLines.length) {
    if (encrypted) {
      throw new Error(
        "该 XLS 表格已加密保护，请先另存为未加密的 Excel 后再导入",
      );
    }
    throw new Error("XLS 表格中没有可读取的单元格数据");
  }
  return allLines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  对外入口：自动识别 HTML 伪装 / SpreadsheetML XML / 真二进制 OLE2 BIFF8     */
/* -------------------------------------------------------------------------- */

export function parseXlsToTsv(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) {
    throw new Error("XLS 文件为空");
  }

  // 1) 真二进制 OLE2 Compound File (.xls)
  if (hasOle2Magic(bytes)) {
    return parseOle2Biff8ToTsv(bytes);
  }

  // 兼容：部分系统把 .xlsx 命名为 .xls 后缀导出
  if (hasZipMagic(bytes)) {
    return parseXlsxToTsv(bytes);
  }

  // 2) 文本型伪装 .xls（HTML / SpreadsheetML XML / 纯 TSV）
  const text = decodeTextBytes(bytes).trim();
  if (!text) {
    throw new Error("XLS 文件内容为空");
  }

  // SpreadsheetML XML（<?xml + <Worksheet / <Row / <Cell）
  const looksLikeXmlSpreadsheet =
    (/<\?xml\b/i.test(text) || /<(?:[a-zA-Z0-9_-]+:)?Workbook\b/i.test(text)) &&
    /<(?:[a-zA-Z0-9_-]+:)?(?:Worksheet|Row|Cell)\b/i.test(text);
  if (looksLikeXmlSpreadsheet) {
    return parseSpreadsheetMlToTsv(text);
  }

  // HTML 伪装 .xls（常见于正方 / 强智 / 青果 / URP 教务导出）
  if (/<(?:!doctype\s+html|html|table|tr|td|th)\b/i.test(text)) {
    const cleaned = cleanHtmlToText(text);
    if (!cleaned) {
      throw new Error("HTML 格式的 XLS 表格中没有可读取的内容");
    }
    return cleaned;
  }

  // 纯文本 TSV / CSV 兜底
  return text.replace(/\r\n?/g, "\n");
}
