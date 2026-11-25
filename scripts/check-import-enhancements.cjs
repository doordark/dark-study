const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const disk = new Map();
const storage = {
  getItem: async (k) => disk.get(k) ?? null,
  setItem: async (k, v) => { disk.set(k, v); },
  removeItem: async (k) => { disk.delete(k); },
  multiGet: async (keys) => keys.map((k) => [k, disk.get(k) ?? null]),
  multiSet: async (rows) => rows.forEach(([k, v]) => disk.set(k, v)),
  multiRemove: async (keys) => keys.forEach((k) => disk.delete(k)),
};

const load = require("./load-project-ts.cjs")({
  "@react-native-async-storage/async-storage": storage,
  "react-native": { Platform: { OS: "android" } },
  "rn-mlkit-ocr": { recognizeText: async () => ({ blocks: [] }) },
});

const { useStore } = load("src/store/useStore.ts");
const { useImportTask } = load("src/store/useImportTask.ts");
const offline = load("src/services/offlineImport.ts");
const docParser = load("src/utils/documentParser.ts");

// Helper: build a real DEFLATE-compressed ZIP (.xlsx) buffer in memory
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const raw = Buffer.from(content, "utf8");
    const comp = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); // DEFLATE
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + comp.length;
  }
  const cdSize = centrals.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, eocd]));
}

// 1. Schedule import preserves custom bell schedule and auto-extends if needed
useStore.getState().resetToSample();
const customPeriods = Array.from({ length: 10 }, (_, i) => ({
  index: i + 1,
  label: `第${i + 1}节`,
  startTime: `${String(8 + i).padStart(2, "0")}:30`,
  endTime: `${String(9 + i).padStart(2, "0")}:15`,
}));
useStore.getState().clearActiveCourses();
useStore.getState().setPeriods(customPeriods);
useStore.getState().importSchedule({
  id: "import-preview",
  name: "导入",
  kind: "fall",
  startDate: "2026-09-07",
  endDate: "2027-01-10",
  totalWeeks: 18,
  periods: [
    { index: 1, label: "第1节", startTime: "08:00", endTime: "08:45" },
  ],
  courses: [
    {
      id: "",
      name: "高等数学",
      teacher: "王老师",
      classroom: "教一101",
      weekday: 1,
      startPeriod: 1,
      endPeriod: 2,
      weeks: [1, 2, 3],
      color: "sky",
    },
    {
      id: "",
      name: "晚间实验",
      teacher: "李老师",
      classroom: "实验楼201",
      weekday: 2,
      startPeriod: 11,
      endPeriod: 12,
      weeks: [1, 2],
      color: "violet",
    },
  ],
});
const activeAfter = useStore.getState().schedules[0];
assert.equal(activeAfter.periods[0].startTime, "08:30", "must preserve custom 08:30 start");
assert.equal(activeAfter.periods.length, 12, "must auto-extend to cover period 12");

// Merge with identical custom bells preserves period indices without clock-shift drift
const mergeRep = useStore.getState().mergeIncoming({
  ...activeAfter,
  courses: [
    {
      id: "",
      name: "大学物理",
      teacher: "",
      classroom: "A102",
      weekday: 3,
      startPeriod: 1,
      endPeriod: 2,
      weeks: [1, 2],
      color: "emerald",
    },
  ],
});
assert.equal(mergeRep.added, 1);
const phys = useStore.getState().schedules[0].courses.find((c) => c.name === "大学物理");
assert.equal(phys.startPeriod, 1);
assert.equal(phys.endPeriod, 2);

// 2. Offline grade fixes: credit === gpa, 0 score, 0.25 credit, dynamic OCR clustering
const eqRow = offline.parseLooseGradeRow("高等数学 3 80 3.0", "fall");
assert.equal(eqRow.credit, 3);
assert.equal(eqRow.score, "80");
assert.equal(eqRow.gpa, 3.0);

const zeroRow = offline.parseLooseGradeRow("形势与政策 1 0分", "fall");
assert.equal(zeroRow.score, "0");
assert.equal(zeroRow.gpa, 0);

const microCredit = offline.parseLooseGradeRow("学术讲座 0.25 90", "fall");
assert.equal(microCredit.credit, 0.25);

// High-DPI OCR table (line height 60px, same-row y offset 30px > old hardcoded 20px!)
const hiDpiLines = [
  { text: "课程名称", frame: { x: 40, y: 100, width: 220, height: 60 } },
  { text: "学分", frame: { x: 340, y: 110, width: 100, height: 60 } },
  { text: "成绩", frame: { x: 500, y: 105, width: 100, height: 60 } },
  { text: "数据结构", frame: { x: 40, y: 240, width: 220, height: 60 } },
  { text: "4", frame: { x: 340, y: 268, width: 80, height: 60 } },
  { text: "92", frame: { x: 500, y: 255, width: 80, height: 60 } },
];
const parsedTableGrades = offline.parseGradeTable(hiDpiLines, "fall");
assert.equal(parsedTableGrades.length, 1);
assert.equal(parsedTableGrades[0].name, "数据结构");
assert.equal(parsedTableGrades[0].credit, 4);
assert.equal(parsedTableGrades[0].score, "92");

// 3. Offline multi-range weeks + date headers + merged-cell continuation + offline periods
assert.deepEqual(
  offline.parseWeeks("1-3周, 6-8周", 16),
  [1, 2, 3, 6, 7, 8],
);
assert.deepEqual(
  offline.parseWeeks("1-5单周, 8-10双周", 16),
  [1, 3, 5, 8, 10],
);

const scheduleOcrLines = [
  { text: "周一 9/2", frame: { x: 100, y: 20, width: 90, height: 24 } },
  { text: "周二 9/3", frame: { x: 220, y: 20, width: 90, height: 24 } },
  { text: "周三 9/4", frame: { x: 340, y: 20, width: 90, height: 24 } },
  { text: "1", frame: { x: 20, y: 100, width: 30, height: 24 } },
  { text: "2", frame: { x: 20, y: 180, width: 30, height: 24 } },
  { text: "3", frame: { x: 20, y: 260, width: 30, height: 24 } },
  { text: "高等数学", frame: { x: 100, y: 100, width: 90, height: 24 } },
  { text: "教一101 张三 1-16周", frame: { x: 100, y: 180, width: 90, height: 24 } },
];
const parsedTableCourses = offline.parseTable(scheduleOcrLines, 16);
assert.equal(parsedTableCourses.length, 1);
assert.equal(parsedTableCourses[0].name, "高等数学");
assert.equal(parsedTableCourses[0].startPeriod, 1);
assert.equal(parsedTableCourses[0].endPeriod, 2);
assert.equal(parsedTableCourses[0].classroom, "教一101");

const offlinePeriods = offline.recognizePeriodsFromTextOffline(`
  第2节 08：55-09：40
  第1节 8:00-8:45
  午休 12:00-14:00
  第3节 10:00~10:45
`);
assert.equal(offlinePeriods.length, 3);
assert.deepEqual(
  offlinePeriods.map((p) => `${p.index}:${p.startTime}-${p.endTime}`),
  ["1:08:00-08:45", "2:08:55-09:40", "3:10:00-10:45"],
);

// 4. Document parsers: HTML cleaner, GBK decode, ICS, and real deflated XLSX
const cleanedHtml = docParser.cleanHtmlToText(
  `<html><head><style>.a{color:red}</style><script>var x=1;</script></head><body><table><tr><th>课程名称</th><th>成绩</th></tr><tr><td>算法设计</td><td>94</td></tr></table></body></html>`,
);
assert(!cleanedHtml.includes("color:red"));
assert(cleanedHtml.includes("算法设计\t94"));

// UTF-8 BOM stripping
assert.equal(
  docParser.decodeTextBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x42])),
  "AB",
);
// GBK decoding ("高等数学")
const gbkDecoded = docParser.decodeTextBytes(
  new Uint8Array([0xb8, 0xdf, 0xb5, 0xc8, 0xca, 0xfd, 0xd1, 0xa7]),
);
assert.equal(gbkDecoded, "高等数学");

// ICS schedule with bi-weekly RRULE
const icsText = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "SUMMARY:操作系统",
  "LOCATION:教三201",
  "DESCRIPTION:教师: 陈老师",
  "DTSTART:20260907T080000",
  "DTEND:20260907T094000",
  "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const icsCourses = docParser.parseIcsSchedule(icsText, {
  startDate: "2026-09-07",
  totalWeeks: 18,
  periods: [
    { index: 1, label: "第1节", startTime: "08:00", endTime: "08:45" },
    { index: 2, label: "第2节", startTime: "08:55", endTime: "09:40" },
  ],
});
assert.equal(icsCourses.length, 1);
assert.equal(icsCourses[0].name, "操作系统");
assert.equal(icsCourses[0].teacher, "陈老师");
assert.deepEqual(icsCourses[0].weeks, [1, 3, 5]);
assert.equal(icsCourses[0].startPeriod, 1);
assert.equal(icsCourses[0].endPeriod, 2);

// Real deflated XLSX workbook
const xlsxBytes = makeZip({
  "xl/sharedStrings.xml":
    `<?xml version="1.0"?><sst><si><t>课程名称</t></si><si><t>学分</t></si><si><t>成绩</t></si><si><t>深度学习</t></si></sst>`,
  "xl/worksheets/sheet1.xml":
    `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>3</v></c><c r="C2"><v>93</v></c></row></sheetData></worksheet>`,
});
const tsv = docParser.parseXlsxToTsv(xlsxBytes);
assert.equal(tsv, "课程名称\t学分\t成绩\n深度学习\t3\t93");
const xlsxGrades = offline.recognizeGradesFromTextOffline(tsv, "spring");
assert.equal(xlsxGrades.length, 1);
assert.equal(xlsxGrades[0].name, "深度学习");
assert.equal(xlsxGrades[0].score, "93");

// 5. Task cancellation, monotonic progress, and preview edit/remove actions
const signal = useImportTask.getState().open("periods", "照片");
assert.equal(signal.aborted, false);
useImportTask.getState().setPhase("正在离线解析作息表…", 50);
useImportTask.getState().setPhase("旧进度不倒退", 20);
assert.equal(useImportTask.getState().progress, 50);
useImportTask.getState().cancel();
assert.equal(signal.aborted, true);
assert.equal(useImportTask.getState().status, "idle");

useImportTask.getState().open("periods", "粘贴文本");
useImportTask.getState().complete({ type: "periods", periods: offlinePeriods }, "完成");
const periodRes = useImportTask.getState().result;
assert(useImportTask.getState().removePeriod(periodRes, 1));
assert.equal(useImportTask.getState().result.periods.length, 2);
assert.equal(useImportTask.getState().result.periods[1].index, 2);
useImportTask.getState().clear();

console.log("PASS: bell preservation, offline OCR/periods/grades fixes, HTML/GBK/ICS/XLSX parsing, task cancel & preview edits");
