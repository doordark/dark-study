const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const load = require("./load-project-ts.cjs")({
  "expo-document-picker": { getDocumentAsync: async () => ({ canceled: true }) },
  "expo-file-system": { File: class {} },
  "expo-image-picker": {},
  "rn-mlkit-ocr": { recognizeText: async () => ({ blocks: [] }) },
  "react-native": { Platform: { OS: "android" } },
});

const { parsePdfToText } = load("src/utils/pdfParser.ts");
const { parseXlsToTsv } = load("src/utils/xlsParser.ts");
const edu = load("src/utils/eduAdapters.ts");
const offline = load("src/services/offlineImport.ts");
const fileImport = load("src/services/fileImport.ts");

/* -------------------------------------------------------------------------- */
/*  Helper 1：在内存中合成真实压缩 PDF（含 FlateDecode + ToUnicode CMap + 表格） */
/* -------------------------------------------------------------------------- */

function buildPdf(objects) {
  const parts = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  for (const obj of objects) {
    if (obj.stream != null) {
      const raw = Buffer.isBuffer(obj.stream)
        ? obj.stream
        : Buffer.from(obj.stream, "latin1");
      const data = obj.flate ? zlib.deflateSync(raw) : raw;
      const filterEntry = obj.flate ? " /Filter /FlateDecode" : "";
      const extra = obj.dictExtra ? ` ${obj.dictExtra}` : "";
      parts.push(
        Buffer.from(
          `${obj.id} 0 obj\n<< /Length ${data.length}${filterEntry}${extra} >>\nstream\n`,
          "latin1",
        ),
        data,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      );
    } else {
      parts.push(
        Buffer.from(`${obj.id} 0 obj\n${obj.body}\nendobj\n`, "latin1"),
      );
    }
  }
  parts.push(Buffer.from("%%EOF\n", "latin1"));
  return new Uint8Array(Buffer.concat(parts));
}

function toUtf16BeHex(str) {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    out += str.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return out;
}

function buildChineseTranscriptPdf() {
  // 分配 2 字节 CID 码位给成绩单字符，并构建 ToUnicode CMap（同时覆盖 beginbfchar 与 beginbfrange）
  const chars = [..."课程名称学分成绩高等数学数据结构操作系统"];
  const cidMap = new Map();
  chars.forEach((ch, idx) => {
    cidMap.set(ch, idx + 1);
  });
  const encodeCid = (str) =>
    [...str]
      .map((ch) => cidMap.get(ch).toString(16).toUpperCase().padStart(4, "0"))
      .join("");

  // 前 4 个用 beginbfrange 数组形式，其余用 beginbfchar
  const rangeTargets = chars
    .slice(0, 4)
    .map((ch) => `<${toUtf16BeHex(ch)}>`)
    .join(" ");
  const bfcharLines = chars
    .slice(4)
    .map((ch) => {
      const cid = cidMap.get(ch).toString(16).toUpperCase().padStart(4, "0");
      return `<${cid}> <${toUtf16BeHex(ch)}>`;
    })
    .join("\n");

  const cmapStream = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    "1 beginbfrange",
    `<0001> <0004> [${rangeTargets}]`,
    "endbfrange",
    `${chars.length - 4} beginbfchar`,
    bfcharLines,
    "endbfchar",
    "endcmap",
    "end end",
  ].join("\n");

  // 同时测试 ToUnicode CID 编码 + UTF-16BE BOM (<FEFF...>) + 普通括号字面量 + Td / TJ 表格定位
  const bomGpa = `FEFF${toUtf16BeHex("绩点")}`;
  const contentStream = [
    "BT",
    "/F1 12 Tf",
    "1 0 0 1 60 760 Tm",
    `<${encodeCid("课程名称")}> Tj`,
    "120 0 Td",
    `<${encodeCid("学分")}> Tj`,
    "80 0 Td",
    `<${encodeCid("成绩")}> Tj`,
    "80 0 Td",
    `<${bomGpa}> Tj`,
    // 第 2 行：高等数学 | 4 | 92 | 4.2（带 TJ 数组与字面量转义测试）
    "1 0 0 1 60 736 Tm",
    `[<${encodeCid("高等")}> -40 <${encodeCid("数学")}>] TJ`,
    "120 0 Td",
    "(4) Tj",
    "80 0 Td",
    "(92) Tj",
    "80 0 Td",
    "(4.2) Tj",
    // 第 3 行：数据结构 | 3.5 | 88 | 3.8
    "1 0 0 1 60 712 Tm",
    `<${encodeCid("数据结构")}> Tj`,
    "120 0 Td",
    "(3.5) Tj",
    "80 0 Td",
    "(88) Tj",
    "80 0 Td",
    "(3.8) Tj",
    // 第 4 行：操作系统 | 3 | 95 | 4.5（测试八进制转义 \063 = '3'）
    "1 0 0 1 60 688 Tm",
    `<${encodeCid("操作系统")}> Tj`,
    "120 0 Td",
    "(\\063) Tj",
    "80 0 Td",
    "(95) Tj",
    "80 0 Td",
    "(4.5) Tj",
    "ET",
  ].join("\n");

  return buildPdf([
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      id: 3,
      body: "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>",
    },
    {
      id: 4,
      body: "<< /Type /Font /Subtype /Type0 /BaseFont /SimSun /Encoding /Identity-H /ToUnicode 5 0 R >>",
    },
    { id: 5, stream: cmapStream, flate: true },
    { id: 6, stream: contentStream, flate: true },
  ]);
}

function buildScannedImagePdf() {
  return buildPdf([
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      id: 3,
      body: "<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    },
    {
      id: 4,
      dictExtra: "/Type /XObject /Subtype /Image /Width 100 /Height 100 /Filter /DCTDecode",
      stream: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      flate: false,
    },
    { id: 5, stream: "q 595 0 0 842 0 0 cm /Im0 Do Q", flate: true },
  ]);
}

/* -------------------------------------------------------------------------- */
/*  Helper 2：在内存中合成真二进制 OLE2 Compound File + BIFF8 Workbook (.xls)   */
/* -------------------------------------------------------------------------- */

function makeBiffRecord(id, payload) {
  const header = Buffer.alloc(4);
  header.writeUInt16LE(id, 0);
  header.writeUInt16LE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function makeBiff8String(text, forceUtf16 = true) {
  if (forceUtf16) {
    const body = Buffer.from(text, "utf16le");
    const head = Buffer.alloc(3);
    head.writeUInt16LE(text.length, 0);
    head.writeUInt8(0x01, 2); // UTF-16LE
    return Buffer.concat([head, body]);
  }
  const body = Buffer.from(text, "latin1");
  const head = Buffer.alloc(3);
  head.writeUInt16LE(text.length, 0);
  head.writeUInt8(0x00, 2); // compressed Latin1
  return Buffer.concat([head, body]);
}

function buildOle2Biff8Xls() {
  const sstStrings = ["课程名称", "学分", "成绩", "GPA", "计算机网络", "编译原理"];
  // 故意让 "GPA" 使用 8-bit 压缩 Latin1 编码、其余中文用 UTF-16LE，并把最后一条字符串拆进 CONTINUE 记录
  const sstHead = Buffer.alloc(8);
  sstHead.writeUInt32LE(sstStrings.length, 0);
  sstHead.writeUInt32LE(sstStrings.length, 4);

  const firstFive = Buffer.concat([
    sstHead,
    ...sstStrings.slice(0, 5).map((s, idx) => makeBiff8String(s, idx !== 3)),
    // "编译原理" 前 2 字放 SST 末尾，后 2 字放 CONTINUE 块
    Buffer.from([0x04, 0x00, 0x01]),
    Buffer.from("编译", "utf16le"),
  ]);
  const contChunk = Buffer.concat([
    Buffer.from([0x01]), // CONTINUE grbit = UTF-16LE
    Buffer.from("原理", "utf16le"),
  ]);

  const bofGlobals = Buffer.alloc(16);
  bofGlobals.writeUInt16LE(0x0600, 0);
  bofGlobals.writeUInt16LE(0x0005, 2);

  const bofSheet = Buffer.alloc(16);
  bofSheet.writeUInt16LE(0x0600, 0);
  bofSheet.writeUInt16LE(0x0010, 2);

  const makeLabelSst = (row, col, isst) => {
    const p = Buffer.alloc(10);
    p.writeUInt16LE(row, 0);
    p.writeUInt16LE(col, 2);
    p.writeUInt16LE(0, 4);
    p.writeUInt32LE(isst, 6);
    return makeBiffRecord(0x00fd, p);
  };

  const makeNumber = (row, col, val) => {
    const p = Buffer.alloc(14);
    p.writeUInt16LE(row, 0);
    p.writeUInt16LE(col, 2);
    p.writeUInt16LE(0, 4);
    p.writeDoubleLE(val, 6);
    return makeBiffRecord(0x0203, p);
  };

  const makeRkInt = (row, col, intVal, div100 = false) => {
    const p = Buffer.alloc(10);
    p.writeUInt16LE(row, 0);
    p.writeUInt16LE(col, 2);
    p.writeUInt16LE(0, 4);
    const rk = ((intVal << 2) | 0x02 | (div100 ? 0x01 : 0)) >>> 0;
    p.writeUInt32LE(rk, 6);
    return makeBiffRecord(0x027e, p);
  };

  // MULRK: 第 2 行第 1~3 列（学分 4, 成绩 91, 绩点 4.10）
  const makeMulRk = (row, colFirst, rkValues) => {
    const p = Buffer.alloc(4 + rkValues.length * 6 + 2);
    p.writeUInt16LE(row, 0);
    p.writeUInt16LE(colFirst, 2);
    rkValues.forEach((rk, idx) => {
      p.writeUInt16LE(0, 4 + idx * 6);
      p.writeUInt32LE(rk >>> 0, 4 + idx * 6 + 2);
    });
    p.writeUInt16LE(colFirst + rkValues.length - 1, p.length - 2);
    return makeBiffRecord(0x00bd, p);
  };

  const wbPayload = Buffer.concat([
    makeBiffRecord(0x0809, bofGlobals),
    makeBiffRecord(0x00fc, firstFive),
    makeBiffRecord(0x003c, contChunk),
    makeBiffRecord(0x000a, Buffer.alloc(0)),
    // Worksheet 1
    makeBiffRecord(0x0809, bofSheet),
    // Header row 0
    makeLabelSst(0, 0, 0),
    makeLabelSst(0, 1, 1),
    makeLabelSst(0, 2, 2),
    makeLabelSst(0, 3, 3),
    // Row 1: 计算机网络 | 3.5 (NUMBER) | 89 (RK int) | 3.90 (RK div100)
    makeLabelSst(1, 0, 4),
    makeNumber(1, 1, 3.5),
    makeRkInt(1, 2, 89, false),
    makeRkInt(1, 3, 390, true),
    // Row 2: 编译原理 (跨 CONTINUE SST) | MULRK (4, 91, 4.10) + 异常大列号 65535 保护测试
    makeLabelSst(2, 0, 5),
    makeMulRk(2, 1, [
      ((4 << 2) | 0x02) >>> 0,
      ((91 << 2) | 0x02) >>> 0,
      ((410 << 2) | 0x03) >>> 0,
    ]),
    makeRkInt(2, 65535, 999, false),
    makeBiffRecord(0x000a, Buffer.alloc(0)),
  ]);

  // 打包为标准 OLE2 Compound File（扇区大小 512，Workbook 填充到 >= 4096 走主 FAT）
  const sectorSize = 512;
  const wbSize = Math.max(4096, wbPayload.length);
  const wbSectors = Math.ceil(wbSize / sectorSize);
  const wbPadded = Buffer.alloc(wbSectors * sectorSize);
  wbPayload.copy(wbPadded);

  // 扇区布局：0 = FAT，1 = Directory，2..(2 + wbSectors - 1) = Workbook
  const header = Buffer.alloc(sectorSize, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(0x0003, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30); // sectorSize = 512
  header.writeUInt16LE(6, 32); // miniSectorSize = 64
  header.writeUInt32LE(1, 44); // numFatSectors
  header.writeUInt32LE(1, 48); // firstDirSector = 1
  header.writeUInt32LE(4096, 56); // miniStreamCutoff
  header.writeUInt32LE(0xfffffffe, 60); // firstMiniFatSector = ENDOFCHAIN
  header.writeUInt32LE(0, 64);
  header.writeUInt32LE(0xfffffffe, 68); // firstDifatSector = ENDOFCHAIN
  header.writeUInt32LE(0, 72);
  for (let i = 0; i < 109; i++) {
    header.writeUInt32LE(i === 0 ? 0 : 0xffffffff, 76 + i * 4);
  }

  const fatSector = Buffer.alloc(sectorSize, 0xff);
  fatSector.writeUInt32LE(0xfffffffd, 0); // sector 0 = FATSECT
  fatSector.writeUInt32LE(0xfffffffe, 4); // sector 1 = Directory ENDOFCHAIN
  for (let s = 0; s < wbSectors; s++) {
    const sid = 2 + s;
    const next = s + 1 < wbSectors ? sid + 1 : 0xfffffffe;
    fatSector.writeUInt32LE(next >>> 0, sid * 4);
  }

  const dirSector = Buffer.alloc(sectorSize, 0);
  const writeDirEntry = (slot, name, type, startSector, size) => {
    const base = slot * 128;
    const nameBuf = Buffer.from(name + "\0", "utf16le");
    nameBuf.copy(dirSector, base);
    dirSector.writeUInt16LE(nameBuf.length, base + 64);
    dirSector.writeUInt8(type, base + 66);
    dirSector.writeUInt32LE(0xffffffff, base + 68);
    dirSector.writeUInt32LE(0xffffffff, base + 72);
    dirSector.writeUInt32LE(slot === 0 ? 1 : 0xffffffff, base + 76);
    dirSector.writeUInt32LE(startSector >>> 0, base + 116);
    dirSector.writeUInt32LE(size >>> 0, base + 120);
  };
  writeDirEntry(0, "Root Entry", 5, 0xfffffffe, 0);
  writeDirEntry(1, "Workbook", 2, 2, wbPayload.length);

  return new Uint8Array(Buffer.concat([header, fatSector, dirSector, wbPadded]));
}

/* -------------------------------------------------------------------------- */
/*  1. 格式检测校验（.pdf / .xls / MIME types）                                */
/* -------------------------------------------------------------------------- */

assert.equal(fileImport.detectFormat("pdf"), "pdf");
assert.equal(fileImport.detectFormat("", "application/pdf"), "pdf");
assert.equal(fileImport.detectFormat("xls"), "xls");
assert.equal(fileImport.detectFormat("", "application/vnd.ms-excel"), "xls");
assert.equal(fileImport.detectFormat("xlsx"), "xlsx");

/* -------------------------------------------------------------------------- */
/*  2. PDF 解析测试：真实 FlateDecode + ToUnicode CMap + 扫描件友好报错        */
/* -------------------------------------------------------------------------- */

const pdfBytes = buildChineseTranscriptPdf();
const pdfText = parsePdfToText(pdfBytes);
assert.equal(
  pdfText,
  [
    "课程名称\t学分\t成绩\t绩点",
    "高等数学\t4\t92\t4.2",
    "数据结构\t3.5\t88\t3.8",
    "操作系统\t3\t95\t4.5",
  ].join("\n"),
);

const pdfGrades = offline.recognizeGradesFromTextOffline(pdfText, "fall");
assert.equal(pdfGrades.length, 3);
assert.equal(pdfGrades[0].name, "高等数学");
assert.equal(pdfGrades[0].credit, 4);
assert.equal(pdfGrades[0].score, "92");
assert.equal(pdfGrades[0].gpa, 4.2);
assert.equal(pdfGrades[2].name, "操作系统");
assert.equal(pdfGrades[2].credit, 3);
assert.equal(pdfGrades[2].score, "95");

const scannedPdfBytes = buildScannedImagePdf();
assert.throws(
  () => parsePdfToText(scannedPdfBytes),
  /相册识图|拍照识别/,
  "pure scanned PDF must throw friendly guidance toward image OCR",
);

// 2b) PDF 内容流含非字符串花括号 `{}` 回归测试（绝不死循环）
const bracePdfBytes = buildPdf([
  { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
  { id: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
  { id: 3, body: "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>" },
  {
    id: 4,
    stream: "BT /F1 12 Tf 50 700 Td { } (SafeText) Tj ET",
    flate: true,
  },
]);
assert.equal(parsePdfToText(bracePdfBytes), "SafeText");

/* -------------------------------------------------------------------------- */
/*  3. XLS 三格式解析测试：HTML 伪装 / SpreadsheetML XML / 真二进制 OLE2 BIFF8 */
/* -------------------------------------------------------------------------- */

// 3a) HTML 伪装 .xls（含中文表头）
const htmlXls = new Uint8Array(
  Buffer.from(
    `<html><head><meta charset="utf-8"><style>td{border:1px solid #000}</style></head><body><table><tr><th>课程名称</th><th>学分</th><th>成绩</th><th>绩点</th></tr><tr><td>离散数学</td><td>3</td><td>90</td><td>4.0</td></tr></table></body></html>`,
    "utf8",
  ),
);
const htmlTsv = parseXlsToTsv(htmlXls);
assert.equal(htmlTsv, "课程名称\t学分\t成绩\t绩点\n离散数学\t3\t90\t4.0");

// 3b) SpreadsheetML XML .xls（含 ss:Index 跳列）
const xmlXls = new Uint8Array(
  Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="成绩单">
    <Table>
      <Row>
        <Cell><Data ss:Type="String">课程名称</Data></Cell>
        <Cell><Data ss:Type="String">学分</Data></Cell>
        <Cell><Data ss:Type="String">成绩</Data></Cell>
        <Cell ss:Index="5"><Data ss:Type="String">绩点</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String">线性代数</Data></Cell>
        <Cell><Data ss:Type="Number">2.5</Data></Cell>
        <Cell><Data ss:Type="Number">87</Data></Cell>
        <Cell ss:Index="5"><Data ss:Type="Number">3.7</Data></Cell>
        <Cell ss:Index="999999"><Data ss:Type="String">越界列应忽略</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`,
    "utf8",
  ),
);
const xmlTsv = parseXlsToTsv(xmlXls);
assert.equal(xmlTsv, "课程名称\t学分\t成绩\t\t绩点\n线性代数\t2.5\t87\t\t3.7");
const xmlGrades = offline.recognizeGradesFromTextOffline(xmlTsv, "spring");
assert.equal(xmlGrades.length, 1);
assert.equal(xmlGrades[0].name, "线性代数");
assert.equal(xmlGrades[0].credit, 2.5);
assert.equal(xmlGrades[0].score, "87");
assert.equal(xmlGrades[0].gpa, 3.7);

// 3c) 真二进制 OLE2 / BIFF8 .xls（含 SST + CONTINUE + Latin1/UTF-16LE + LABELSST + NUMBER + RK + MULRK）
const ole2Xls = buildOle2Biff8Xls();
const ole2Tsv = parseXlsToTsv(ole2Xls);
assert.equal(
  ole2Tsv,
  [
    "课程名称\t学分\t成绩\tGPA",
    "计算机网络\t3.5\t89\t3.9",
    "编译原理\t4\t91\t4.1",
  ].join("\n"),
);
const ole2Grades = offline.recognizeGradesFromTextOffline(ole2Tsv, "fall");
assert.equal(ole2Grades.length, 2);
assert.equal(ole2Grades[0].name, "计算机网络");
assert.equal(ole2Grades[0].credit, 3.5);
assert.equal(ole2Grades[0].score, "89");
assert.equal(ole2Grades[0].gpa, 3.9);
assert.equal(ole2Grades[1].name, "编译原理");
assert.equal(ole2Grades[1].credit, 4);
assert.equal(ole2Grades[1].score, "91");
assert.equal(ole2Grades[1].gpa, 4.1);

/* -------------------------------------------------------------------------- */
/*  4. 教务系统 & WakeUp 直导测试                                              */
/* -------------------------------------------------------------------------- */

// 4a) WakeUp 5 行导出格式（含时间节点、课程表元数据、单双周明细）
const wakeUp5Line = [
  JSON.stringify([
    { node: 1, startTime: "08:00", endTime: "08:45", timeTable: 1 },
    { node: 2, startTime: "08:55", endTime: "09:40", timeTable: 1 },
    { node: 3, startTime: "10:00", endTime: "10:45", timeTable: 1 },
  ]),
  JSON.stringify({ courseLen: 45, id: 1, name: "默认作息", sameBreakLen: true }),
  JSON.stringify({ id: 1, maxWeek: 16, nodes: 12, startDate: "2026-09-07", tableName: "大三上" }),
  JSON.stringify([
    { id: 0, courseName: "机器学习", credit: 3, note: "带电脑" },
    { id: 1, courseName: "算法实验", credit: 1.5, note: "" },
  ]),
  JSON.stringify([
    { id: 0, day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, room: "计科楼301", teacher: "陈教授", type: 0 },
    { id: 1, day: 3, startNode: 3, step: 2, startWeek: 1, endWeek: 8, room: "实验中心B202", teacher: "刘老师", type: 1 },
  ]),
].join("\n");

const wakeUpCourses = offline.parseScheduleTextCourses(wakeUp5Line, 16);
assert.equal(wakeUpCourses.length, 2);
assert.equal(wakeUpCourses[0].name, "机器学习");
assert.equal(wakeUpCourses[0].weekday, 1);
assert.equal(wakeUpCourses[0].startPeriod, 1);
assert.equal(wakeUpCourses[0].endPeriod, 2);
assert.equal(wakeUpCourses[0].classroom, "计科楼301");
assert.equal(wakeUpCourses[0].teacher, "陈教授");
assert.equal(wakeUpCourses[0].credits, 3);
assert.equal(wakeUpCourses[0].note, "带电脑");
assert.equal(wakeUpCourses[0].weeks.length, 16);

assert.equal(wakeUpCourses[1].name, "算法实验");
assert.equal(wakeUpCourses[1].weekday, 3);
assert.equal(wakeUpCourses[1].startPeriod, 3);
assert.equal(wakeUpCourses[1].endPeriod, 4);
assert.deepEqual(wakeUpCourses[1].weeks, [1, 3, 5, 7]);

const wakeUpPeriods = offline.recognizePeriodsFromTextOffline(wakeUp5Line);
assert.equal(wakeUpPeriods.length, 3);
assert.equal(wakeUpPeriods[0].startTime, "08:00");
assert.equal(wakeUpPeriods[2].endTime, "10:45");

// 4b) 新正方教务系统 kbcx_cxXsKb JSON
const zhengfangKb = JSON.stringify({
  kbList: [
    {
      kcmc: "数据库系统原理",
      xm: "张明",
      cdmc: "教二405",
      xqj: "2",
      jcs: "3-4",
      zcd: "1-8周,10-16周(双)",
      xf: "3.5",
    },
    {
      kcmc: "软件工程",
      xm: "李华",
      cdmc: "信工楼108",
      xqj: "4",
      jcs: "5-7",
      zcd: "1-5周(单)",
      xf: "2",
    },
  ],
});
const zfCourses = offline.parseScheduleTextCourses(zhengfangKb, 16);
assert.equal(zfCourses.length, 2);
assert.equal(zfCourses[0].name, "数据库系统原理");
assert.equal(zfCourses[0].teacher, "张明");
assert.equal(zfCourses[0].classroom, "教二405");
assert.equal(zfCourses[0].weekday, 2);
assert.equal(zfCourses[0].startPeriod, 3);
assert.equal(zfCourses[0].endPeriod, 4);
assert.deepEqual(zfCourses[0].weeks, [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16]);
assert.equal(zfCourses[0].credits, 3.5);
assert.equal(zfCourses[1].name, "软件工程");
assert.deepEqual(zfCourses[1].weeks, [1, 3, 5]);
assert.equal(zfCourses[1].startPeriod, 5);
assert.equal(zfCourses[1].endPeriod, 7);

// 4c) 强智教务 HTML 课表表格（table#kbtable + kbcontent + <font title=...> + 多课分隔）
const qiangzhiHtml = `
<table id="kbtable">
  <tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr>
  <tr>
    <th>第一大节<br/>0102</th>
    <td>
      <div class="kbcontent1">计算机组成原理</div>
      <div class="kbcontent">
        计算机组成原理<br/>
        <font title="老师">王教授</font><br/>
        <font title="周次(节次)">1-12(周)[01-02节]</font><br/>
        <font title="教室">主楼203</font>
        ---------------------
        数字逻辑<br/>
        <font title="老师">赵老师</font><br/>
        <font title="周次(节次)">13-16(周)[01-02节]</font><br/>
        <font title="教室">主楼205</font>
      </div>
    </td>
    <td></td>
    <td></td>
  </tr>
</table>`;
const qzCourses = offline.parseScheduleTextCourses(qiangzhiHtml, 16);
assert.equal(qzCourses.length, 2);
assert.equal(qzCourses[0].name, "计算机组成原理");
assert.equal(qzCourses[0].teacher, "王教授");
assert.equal(qzCourses[0].classroom, "主楼203");
assert.equal(qzCourses[0].weekday, 1);
assert.equal(qzCourses[0].startPeriod, 1);
assert.equal(qzCourses[0].endPeriod, 2);
assert.equal(qzCourses[0].weeks.length, 12);
assert.equal(qzCourses[1].name, "数字逻辑");
assert.deepEqual(qzCourses[1].weeks, [13, 14, 15, 16]);

// 4d) 新正方成绩单 cjcx JSON
const zhengfangGradesJson = JSON.stringify({
  items: [
    { kcmc: "概率论与数理统计", xf: "3", cj: "94", jd: "4.4", kcxzmc: "学科必修课", xqm: "3" },
    { kcmc: "中国近代史纲要", xf: "2", cj: "优秀", jd: "4.5", kcxzmc: "通识选修课", xqm: "12" },
    { kcmc: "金工实习", xf: "1", cj: "合格", jd: "", kcxzmc: "实践选修", xqm: "16" },
  ],
});
const zfGrades = offline.recognizeGradesFromTextOffline(zhengfangGradesJson, "fall");
assert.equal(zfGrades.length, 3);
assert.equal(zfGrades[0].name, "概率论与数理统计");
assert.equal(zfGrades[0].credit, 3);
assert.equal(zfGrades[0].score, "94");
assert.equal(zfGrades[0].gpa, 4.4);
assert.equal(zfGrades[0].type, "required");
assert.equal(zfGrades[0].semester, "fall");

assert.equal(zfGrades[1].name, "中国近代史纲要");
assert.equal(zfGrades[1].score, "优秀");
assert.equal(zfGrades[1].type, "general");
assert.equal(zfGrades[1].semester, "spring");

assert.equal(zfGrades[2].name, "金工实习");
assert.equal(zfGrades[2].semester, "summer");
assert.equal(zfGrades[2].type, "elective");

// 4e) 只读浏览器提取脚本安全检查（严禁包含网络或凭据读写）
assert.equal(typeof edu.EDU_EXTRACT_SNIPPET, "string");
assert(edu.EDU_EXTRACT_SNIPPET.length > 80);
assert(!/fetch\(|XMLHttpRequest|document\.cookie|localStorage/i.test(edu.EDU_EXTRACT_SNIPPET));

console.log(
  "PASS: PDF FlateDecode/ToUnicode/scanned-error, XLS HTML/XML/OLE2-BIFF8, WakeUp/Zhengfang/Qiangzhi edu adapters & snippet checks",
);
