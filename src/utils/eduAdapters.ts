import type {
  Course,
  CourseColor,
  GpaScaleId,
  GradeDraft,
  GradeType,
  Period,
  SemesterKind,
} from "@/types";
import { normalizeParsedPeriods } from "@/utils/courseEditing";
import { decodeEntities } from "@/utils/documentParser";
import { normalizeGradeInput, normalizeSemester } from "@/utils/grades";

/* -------------------------------------------------------------------------- */
/*  教务系统（新正方 / 强智 / 青果）与 WakeUp 课程表直导解析器                 */
/* -------------------------------------------------------------------------- */

const COLOR_VALUES: CourseColor[] = [
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

/**
 * 桌面浏览器 / 油猴只读提取脚本：
 * 严禁发起任何网络请求或读取 Cookie/Token，仅从当前教务页面 DOM 读取课表或成绩表格并复制到剪贴板。
 */
export const EDU_EXTRACT_SNIPPET = `(()=>{const t=e=>(e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();const cp=v=>{if(typeof copy==='function')copy(v);else navigator.clipboard?.writeText?.(v);};const kb=document.querySelector('table#kbtable');if(kb){const out=kb.outerHTML;cp(out);console.log('[DarkStudy] 已提取强智课表 HTML，请粘贴到 App 导入');return out;}const grid=document.querySelector('#kbgrid_table_0,#ylkbTable,table.timetable');if(grid){const out=grid.outerHTML;cp(out);console.log('[DarkStudy] 已提取教务课表 HTML，请粘贴到 App 导入');return out;}const tables=[...document.querySelectorAll('table')];const gradeTbl=tables.find(tb=>/课程名称|课程名/.test(t(tb))&&/成绩|分数/.test(t(tb)))||tables.sort((a,b)=>b.rows.length-a.rows.length)[0];if(!gradeTbl){console.warn('[DarkStudy] 当前页面未找到课表或成绩表格');return '';}const tsv=[...gradeTbl.rows].map(r=>[...r.cells].map(c=>t(c)).join('\\t')).filter(Boolean).join('\\n');cp(tsv);console.log('[DarkStudy] 已复制表格 TSV（'+gradeTbl.rows.length+' 行），请粘贴到 App 导入');return tsv;})();`;

/* -------------------------------------------------------------------------- */
/*  通用工具：星期、节次、周次解析                                              */
/* -------------------------------------------------------------------------- */

const CN_DIGIT: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  日: 7,
  天: 7,
};

function parseWeekdayLoose(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 7) {
    return raw;
  }
  const s = String(raw ?? "").replace(/\s+/g, "").trim();
  if (!s) return null;
  if (/^[1-7]$/.test(s)) return Number(s);
  const cn = s.match(/^(?:星期|周|礼拜)([一二三四五六日天1-7])/);
  if (cn) {
    return /^[1-7]$/.test(cn[1]) ? Number(cn[1]) : (CN_DIGIT[cn[1]] ?? null);
  }
  const lower = s.toLowerCase();
  if (/^(mon|monday)(?:$|[^a-z])/.test(lower)) return 1;
  if (/^(tue|tues|tuesday)(?:$|[^a-z])/.test(lower)) return 2;
  if (/^(wed|wednesday)(?:$|[^a-z])/.test(lower)) return 3;
  if (/^(thu|thur|thurs|thursday)(?:$|[^a-z])/.test(lower)) return 4;
  if (/^(fri|friday)(?:$|[^a-z])/.test(lower)) return 5;
  if (/^(sat|saturday)(?:$|[^a-z])/.test(lower)) return 6;
  if (/^(sun|sunday)(?:$|[^a-z])/.test(lower)) return 7;
  return null;
}

function expandWeekRange(
  startWeek: number,
  endWeek: number,
  parity: 0 | 1 | 2,
  totalWeeks: number,
): number[] {
  const first = Math.max(1, Math.min(startWeek, endWeek));
  const last = Math.min(Math.max(1, totalWeeks), Math.max(startWeek, endWeek));
  const out: number[] = [];
  for (let w = first; w <= last; w++) {
    if (parity === 1 && w % 2 === 0) continue;
    if (parity === 2 && w % 2 === 1) continue;
    out.push(w);
  }
  return out;
}

/**
 * 解析教务周次字符串，支持：
 * - 新正方：`1-16周`、`1-15周(单)`、`2-16周(双)`、`1-4周,7-16周`、`3周,5-10周(双)`
 * - 强智：`1-16(周)`、`1-8,10-16(单周)`、`1-16(周)[01-02节]`
 * - 青果：`{第1-16周|单周}`、`1-16`
 */
function parseEduWeeks(raw: unknown, totalWeeks: number): number[] {
  const maxW = Math.max(1, totalWeeks);
  const all = Array.from({ length: maxW }, (_, i) => i + 1);
  if (Array.isArray(raw)) {
    const nums = raw
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= maxW);
    return nums.length ? [...new Set(nums)].sort((a, b) => a - b) : all;
  }
  const text = String(raw ?? "").trim();
  if (!text) return all;

  // 先剔除中括号里的节次标注（如强智 `[01-02节]`），避免把节次当周次
  const cleaned = text
    .replace(/\[[^\]]*节[^\]]*\]/g, "")
    .replace(/[（(][^（）()]*节[^（）()]*[）)]/g, "")
    .replace(/[{}]/g, "");

  const collected = new Set<number>();
  const globalParity: 0 | 1 | 2 =
    /\|\s*单周|^\s*单周/.test(cleaned)
      ? 1
      : /\|\s*双周|^\s*双周/.test(cleaned)
        ? 2
        : 0;

  const segments = cleaned.split(/[,，、;；|]+/);
  for (const segRaw of segments) {
    const seg = segRaw.trim();
    if (!seg) continue;
    const parity: 0 | 1 | 2 = /单/.test(seg)
      ? 1
      : /双/.test(seg)
        ? 2
        : globalParity;
    const rangeRe = /(\d{1,2})\s*[-~—–至到]\s*(\d{1,2})|(\d{1,2})/g;
    let m: RegExpExecArray | null;
    while ((m = rangeRe.exec(seg)) !== null) {
      const a = Number(m[1] ?? m[3]);
      const b = m[2] ? Number(m[2]) : a;
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) {
        continue;
      }
      for (const w of expandWeekRange(a, b, parity, maxW)) {
        collected.add(w);
      }
    }
  }

  return collected.size ? [...collected].sort((a, b) => a - b) : all;
}

function parsePeriodBounds(raw: unknown): [number, number] | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  // 强智 / 青果显式标注 `[01-02节]` / `(3-4节)` / `1-2节` / `1-2`
  const bracket = text.match(/[\[（(]\s*(\d{1,2})\s*[-~—–至到,，、]\s*(\d{1,2})\s*节?\s*[\]）)]/);
  if (bracket) {
    const a = Number(bracket[1]);
    const b = Number(bracket[2]);
    if (a >= 1 && b >= a) return [a, b];
  }

  const range = text.match(/第?\s*(\d{1,2})\s*[-~—–至到,，、]\s*(\d{1,2})\s*节?/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 1 && b >= a) return [a, b];
  }

  // 强智左侧节次码：`0102` -> [1, 2]，`0304` -> [3, 4]，`091011` -> [9, 11]
  const codePairs = text.match(/(?:^|\s)((?:0\d|1\d|2\d){2,})(?=$|\s|节)/);
  if (codePairs && codePairs[1].length % 2 === 0) {
    const nums: number[] = [];
    for (let i = 0; i < codePairs[1].length; i += 2) {
      nums.push(Number(codePairs[1].slice(i, i + 2)));
    }
    if (nums.length >= 2 && nums[0] >= 1 && nums[nums.length - 1] >= nums[0]) {
      return [nums[0], nums[nums.length - 1]];
    }
  }

  // `第一大节` / `第2大节` -> [1, 2] / [3, 4]
  const bigCn = text.match(/第\s*([一二三四五六七八九十\d])\s*大节/);
  if (bigCn) {
    const n = /^\d$/.test(bigCn[1]) ? Number(bigCn[1]) : (CN_DIGIT[bigCn[1]] ?? 0);
    if (n >= 1) return [n * 2 - 1, n * 2];
  }

  const single = text.match(/第?\s*(\d{1,2})\s*节/);
  if (single) {
    const n = Number(single[1]);
    if (n >= 1) return [n, n];
  }

  if (/^\d{1,2}$/.test(text)) {
    const n = Number(text);
    if (n >= 1) return [n, n];
  }

  return null;
}

function dedupeCourses(list: Course[]): Course[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const key = JSON.stringify([
      c.name,
      c.weekday,
      c.startPeriod,
      c.endPeriod,
      c.classroom,
      c.teacher,
      c.weeks,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/*  1) WakeUp 课程表导出 / 分享 JSON 适配器                                    */
/* -------------------------------------------------------------------------- */

interface WakeUpParsed {
  courses: Course[];
  periods: Period[];
}

function parseWakeUpPayload(rawText: string, totalWeeks: number): WakeUpParsed | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // 1A) 多行 WakeUp 导出块（通常 5 行 JSON：[nodes, settings, table, courses, details]）
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("[") || l.startsWith("{"));

  const parsedChunks: unknown[] = [];
  if (lines.length >= 2) {
    for (const line of lines) {
      try {
        parsedChunks.push(JSON.parse(line));
      } catch {
        // 忽略包裹提示文字等非 JSON 行
      }
    }
  } else if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const single = JSON.parse(trimmed);
      if (Array.isArray(single)) {
        // 可能是 5 段数组套数组 `[nodes, settings, table, courses, details]`，或直接是详情数组
        if (
          single.length >= 2 &&
          single.every((x) => Array.isArray(x) || (x && typeof x === "object")) &&
          single.some((x) => Array.isArray(x))
        ) {
          parsedChunks.push(...single);
        } else {
          parsedChunks.push(single);
        }
      } else if (single && typeof single === "object") {
        const obj = single as Record<string, unknown>;
        if (Array.isArray(obj.nodes)) parsedChunks.push(obj.nodes);
        if (Array.isArray(obj.timeNodes)) parsedChunks.push(obj.timeNodes);
        if (Array.isArray(obj.courses)) parsedChunks.push(obj.courses);
        if (Array.isArray(obj.details)) parsedChunks.push(obj.details);
        if (Array.isArray(obj.courseDetails)) parsedChunks.push(obj.courseDetails);
        if (Array.isArray(obj.data)) parsedChunks.push(obj.data);
      }
    } catch {
      return null;
    }
  }

  if (!parsedChunks.length) return null;

  const isWakeUpNode = (x: any): boolean =>
    x &&
    typeof x === "object" &&
    typeof x.node === "number" &&
    typeof x.startTime === "string" &&
    typeof x.endTime === "string";

  const isWakeUpCourseMeta = (x: any): boolean =>
    x &&
    typeof x === "object" &&
    typeof x.courseName === "string" &&
    x.id != null &&
    x.day == null &&
    x.startNode == null;

  const isWakeUpDetail = (x: any): boolean =>
    x &&
    typeof x === "object" &&
    x.day != null &&
    x.startNode != null;

  // 提取作息节点（如有）
  let periods: Period[] = [];
  for (const chunk of parsedChunks) {
    if (Array.isArray(chunk) && chunk.length > 0 && isWakeUpNode(chunk[0])) {
      const rawPeriods = chunk
        .filter(isWakeUpNode)
        .filter((n: any) => n.startTime && n.endTime && n.startTime !== n.endTime)
        .sort((a: any, b: any) => Number(a.node) - Number(b.node))
        .map((n: any) => ({
          label: `第${n.node}节`,
          startTime: String(n.startTime),
          endTime: String(n.endTime),
        }));
      periods = normalizeParsedPeriods(rawPeriods);
      break;
    }
  }

  // 构建 course id -> 元数据映射（第 4 行 courses）
  const metaMap = new Map<
    string,
    { courseName: string; credit?: number; note: string }
  >();
  for (const chunk of parsedChunks) {
    if (Array.isArray(chunk) && chunk.length > 0 && isWakeUpCourseMeta(chunk[0])) {
      for (const item of chunk) {
        if (!item || typeof item !== "object") continue;
        const name = String(item.courseName ?? "").trim();
        if (!name || item.id == null) continue;
        const creditNum = Number(item.credit);
        metaMap.set(String(item.id), {
          courseName: name,
          credit:
            item.credit != null && Number.isFinite(creditNum) && creditNum > 0
              ? creditNum
              : undefined,
          note: String(item.note ?? "").trim(),
        });
      }
    }
  }

  // 解析第 5 行 details 或单数组 WakeUp JSON
  const detailArrays = parsedChunks.filter(
    (chunk): chunk is any[] =>
      Array.isArray(chunk) && chunk.length > 0 && chunk.some(isWakeUpDetail),
  );
  if (!detailArrays.length && !periods.length) return null;

  const courses: Course[] = [];
  for (const arr of detailArrays) {
    for (const item of arr) {
      if (!isWakeUpDetail(item)) continue;
      const meta = item.id != null ? metaMap.get(String(item.id)) : undefined;
      const name = String(
        item.courseName ?? item.name ?? meta?.courseName ?? "",
      ).trim();
      if (!name) continue;

      const weekday = parseWeekdayLoose(item.day);
      if (!weekday) continue;

      const startPeriod = Math.max(1, Math.floor(Number(item.startNode) || 1));
      const step = Math.max(1, Math.floor(Number(item.step) || 1));
      const endPeriod = startPeriod + step - 1;

      const startWeek = Math.max(1, Math.floor(Number(item.startWeek) || 1));
      const endWeek = Math.max(
        startWeek,
        Math.floor(Number(item.endWeek) || totalWeeks),
      );
      const rawType = Number(item.type);
      const parity: 0 | 1 | 2 = rawType === 1 ? 1 : rawType === 2 ? 2 : 0;
      const weeks = expandWeekRange(startWeek, endWeek, parity, totalWeeks);
      if (!weeks.length) continue;

      const creditNum = Number(item.credit);
      const credits =
        item.credit != null && Number.isFinite(creditNum) && creditNum > 0
          ? creditNum
          : meta?.credit;

      courses.push({
        id: "",
        name: name.slice(0, 40),
        teacher: String(item.teacher ?? "").trim(),
        classroom: String(item.room ?? item.classroom ?? "").trim(),
        weekday,
        startPeriod,
        endPeriod,
        weeks,
        color: COLOR_VALUES[courses.length % COLOR_VALUES.length],
        credits,
        note: String(item.note ?? meta?.note ?? "").trim(),
      });
    }
  }

  if (!courses.length && !periods.length) return null;
  return { courses: dedupeCourses(courses), periods };
}

/* -------------------------------------------------------------------------- */
/*  2) 新正方教务系统 (`kbcx_cxXsKb`) JSON 适配器                               */
/* -------------------------------------------------------------------------- */

function parseZhengfangKbJson(rawText: string, totalWeeks: number): Course[] {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const list: any[] | null = Array.isArray(parsed?.kbList)
    ? parsed.kbList
    : Array.isArray(parsed?.data?.kbList)
      ? parsed.data.kbList
      : Array.isArray(parsed) &&
          parsed.some(
            (x: any) => x && typeof x === "object" && "kcmc" in x && "xqj" in x,
          )
        ? parsed
        : null;

  if (!list || !list.length) return [];

  const courses: Course[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.kcmc ?? "").trim();
    if (!name) continue;

    const weekday = parseWeekdayLoose(item.xqj ?? item.xqjmc);
    if (!weekday) continue;

    const bounds = parsePeriodBounds(item.jcs ?? item.jcor ?? item.jc);
    if (!bounds) continue;

    const weeks = parseEduWeeks(item.zcd, totalWeeks);
    if (!weeks.length) continue;

    const creditNum = Number(item.xf);
    courses.push({
      id: "",
      name: name.slice(0, 40),
      teacher: String(item.xm ?? "").trim(),
      classroom: String(item.cdmc ?? item.cdlbmc ?? "").trim(),
      weekday,
      startPeriod: bounds[0],
      endPeriod: bounds[1],
      weeks,
      color: COLOR_VALUES[courses.length % COLOR_VALUES.length],
      credits:
        item.xf != null && Number.isFinite(creditNum) && creditNum > 0
          ? creditNum
          : undefined,
      note: String(item.xkbz ?? item.bz ?? "").trim(),
    });
  }
  return dedupeCourses(courses);
}

/* -------------------------------------------------------------------------- */
/*  3) 强智 / 青果 / 通用教务 HTML 课表表格适配器                               */
/* -------------------------------------------------------------------------- */

function stripHtmlKeepBreaks(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function parseQiangzhiOrHtmlCell(
  cellHtml: string,
  weekday: number,
  defaultStart: number,
  defaultEnd: number,
  totalWeeks: number,
  colorOffset: number,
): Course[] {
  // 强智系统常在同一个 td 内同时放 kbcontent1（简版）和 kbcontent（完整版），优先只取 kbcontent
  const fullDivs = [
    ...cellHtml.matchAll(
      /<div\b[^>]*class="[^"]*\bkbcontent\b(?!1)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ),
  ].map((m) => m[1]);

  const targetHtml = fullDivs.length ? fullDivs.join("\n-----\n") : cellHtml;
  const blocks = targetHtml
    .split(/(?:-{5,}|<hr\b[^>]*>|<br\s*\/?>\s*<br\s*\/?>)/i)
    .map((b) => b.trim())
    .filter(Boolean);

  const out: Course[] = [];
  for (const block of blocks) {
    // 提取强智 `<font title="老师/周次/教室">` 结构化字段
    const fontFields: { title: string; value: string }[] = [];
    const fontRe = /<font\b[^>]*title=["']([^"']+)["'][^>]*>([\s\S]*?)<\/font>/gi;
    let fm: RegExpExecArray | null;
    while ((fm = fontRe.exec(block)) !== null) {
      const val = stripHtmlKeepBreaks(fm[2]).replace(/\s+/g, " ").trim();
      if (val) fontFields.push({ title: fm[1], value: val });
    }

    if (fontFields.length > 0) {
      const withoutFonts = block.replace(fontRe, "\n");
      const headLines = stripHtmlKeepBreaks(withoutFonts)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length >= 2 && !/^[-—_=*]+$/.test(l));
      const name = headLines[0] ?? "";
      if (!name) continue;

      let teacher = "";
      let classroom = "";
      let weeksRaw = "";
      let explicitPeriod: [number, number] | null = null;

      for (const f of fontFields) {
        if (/老师|教师|主讲/.test(f.title)) {
          teacher = f.value;
        } else if (/教室|地点|场地/.test(f.title)) {
          classroom = f.value;
        } else if (/周次|节次|时间/.test(f.title)) {
          weeksRaw = weeksRaw ? `${weeksRaw},${f.value}` : f.value;
          explicitPeriod = explicitPeriod ?? parsePeriodBounds(f.value);
        }
      }

      const [startPeriod, endPeriod] = explicitPeriod ?? [
        defaultStart,
        defaultEnd,
      ];
      out.push({
        id: "",
        name: name.slice(0, 40),
        teacher,
        classroom,
        weekday,
        startPeriod,
        endPeriod,
        weeks: parseEduWeeks(weeksRaw, totalWeeks),
        color: COLOR_VALUES[(colorOffset + out.length) % COLOR_VALUES.length],
        note: "",
      });
      continue;
    }

    // 青果 / 旧正方 / 通用 `<br>` 分隔单元格
    const lines = stripHtmlKeepBreaks(block)
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l.length > 0 && !/^[-—_=*]+$/.test(l));
    if (lines.length < 2) continue;

    let name = "";
    let teacher = "";
    let classroom = "";
    let weeksRaw = "";
    let explicitPeriod: [number, number] | null = null;

    for (const line of lines) {
      const teacherLabel = line.match(/^(?:教师|老师|任课教师)\s*[:：]\s*(.+)$/);
      if (teacherLabel) {
        teacher = teacherLabel[1].trim();
        continue;
      }
      const roomLabel = line.match(/^(?:教室|地点|上课地点)\s*[:：]\s*(.+)$/);
      if (roomLabel) {
        classroom = roomLabel[1].trim();
        continue;
      }
      const weekLabel = line.match(/^(?:周次|时间|周次\(节次\))\s*[:：]\s*(.+)$/);
      if (weekLabel) {
        weeksRaw = weeksRaw ? `${weeksRaw},${weekLabel[1]}` : weekLabel[1];
        explicitPeriod = explicitPeriod ?? parsePeriodBounds(weekLabel[1]);
        continue;
      }
      if (!name) {
        name = line.replace(/^(?:课程名称|课程)\s*[:：]\s*/, "").trim();
        continue;
      }
      if (/\d{1,2}\s*[-~—–]\s*\d{1,2}\s*(?:[(（]?(?:单|双)?周[)）]?)|第?\d{1,2}周/.test(line)) {
        weeksRaw = weeksRaw ? `${weeksRaw},${line}` : line;
        explicitPeriod = explicitPeriod ?? parsePeriodBounds(line);
        continue;
      }
      if (
        !classroom &&
        /[A-Za-z\u4e00-\u9fa5]{0,6}\d{2,4}(?:室|楼|馆|栋)?/.test(line) &&
        line.length <= 20
      ) {
        classroom = line;
        continue;
      }
      if (!teacher && /^[\u4e00-\u9fa5·]{2,5}(?:\([^)]*\))?$/.test(line)) {
        teacher = line;
      }
    }

    if (!name || name.length < 2) continue;
    if (!weeksRaw && !classroom && !teacher) continue;

    const [startPeriod, endPeriod] = explicitPeriod ?? [
      defaultStart,
      defaultEnd,
    ];
    out.push({
      id: "",
      name: name.slice(0, 40),
      teacher,
      classroom,
      weekday,
      startPeriod,
      endPeriod,
      weeks: parseEduWeeks(weeksRaw, totalWeeks),
      color: COLOR_VALUES[(colorOffset + out.length) % COLOR_VALUES.length],
      note: "",
    });
  }
  return out;
}

function parseEduHtmlTable(rawText: string, totalWeeks: number): Course[] {
  if (!/<table\b/i.test(rawText)) return [];
  const hasEduSignal =
    /id=["']kbtable["']|class=["'][^"']*kbcontent|kbgrid_table|星期[一二三四五]|周[一二三四五]/i.test(
      rawText,
    );
  if (!hasEduSignal) return [];

  const sanitized = rawText
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // 逐个 table 尝试，优先挑含 kbtable / kbcontent 的表
  const tableMatches = [...sanitized.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)];
  if (!tableMatches.length) return [];

  tableMatches.sort((a, b) => {
    const score = (m: RegExpMatchArray) =>
      (/id=["']kbtable["']/i.test(m[1]) ? 4 : 0) +
      (/kbcontent/i.test(m[2]) ? 3 : 0) +
      (/星期一|周一/.test(m[2]) ? 1 : 0);
    return score(b) - score(a);
  });

  for (const tm of tableMatches) {
    const tableHtml = tm[2];
    const trMatches = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (trMatches.length < 2) continue;

    interface GridCell {
      html: string;
      text: string;
      rowspan: number;
      colspan: number;
      origin: boolean;
    }

    // 按 rowspan/colspan 展开为规整二维矩阵
    const grid: (GridCell | undefined)[][] = [];
    for (let r = 0; r < trMatches.length; r++) {
      if (!grid[r]) grid[r] = [];
      let col = 0;
      const cellRe = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(trMatches[r][1])) !== null) {
        while (grid[r][col]) col++;
        const attrs = cm[2] ?? "";
        const inner = cm[3] ?? "";
        const rsMatch = attrs.match(/\browspan\s*=\s*["']?(\d+)/i);
        const csMatch = attrs.match(/\bcolspan\s*=\s*["']?(\d+)/i);
        const rowspan = Math.max(1, Number(rsMatch?.[1] ?? 1));
        const colspan = Math.max(1, Number(csMatch?.[1] ?? 1));
        const text = stripHtmlKeepBreaks(inner).replace(/\s+/g, " ").trim();

        for (let dr = 0; dr < rowspan; dr++) {
          if (!grid[r + dr]) grid[r + dr] = [];
          for (let dc = 0; dc < colspan; dc++) {
            grid[r + dr][col + dc] = {
              html: inner,
              text,
              rowspan,
              colspan,
              origin: dr === 0 && dc === 0,
            };
          }
        }
        col += colspan;
      }
    }

    // 查找星期表头行（至少含 3 个不同的星期列）
    let headerRow = -1;
    let weekdayCols = new Map<number, number>();
    for (let r = 0; r < Math.min(grid.length, 4); r++) {
      const map = new Map<number, number>();
      const row = grid[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell || !cell.origin || cell.text.length > 16) continue;
        const wd = parseWeekdayLoose(cell.text);
        if (wd) map.set(c, wd);
      }
      if (new Set(map.values()).size >= 3) {
        headerRow = r;
        weekdayCols = map;
        break;
      }
    }
    if (headerRow < 0) continue;

    const firstWeekdayCol = Math.min(...weekdayCols.keys());
    const courses: Course[] = [];
    let fallbackPeriod = 1;

    for (let r = headerRow + 1; r < grid.length; r++) {
      const row = grid[r] ?? [];
      let labelText = "";
      for (let c = 0; c < firstWeekdayCol; c++) {
        if (row[c]?.text) labelText += ` ${row[c]!.text}`;
      }
      labelText = labelText.trim();
      const parsedLabel = parsePeriodBounds(labelText);
      const rowStart = parsedLabel ? parsedLabel[0] : fallbackPeriod;
      const rowEnd = parsedLabel ? parsedLabel[1] : fallbackPeriod;
      fallbackPeriod = rowEnd + 1;

      for (const [c, weekday] of weekdayCols) {
        const cell = row[c];
        if (!cell || !cell.origin || !cell.text) continue;
        const cellStart = rowStart;
        const cellEnd =
          rowStart === rowEnd && cell.rowspan > 1
            ? rowStart + cell.rowspan - 1
            : rowEnd;

        const parsed = parseQiangzhiOrHtmlCell(
          cell.html,
          weekday,
          cellStart,
          cellEnd,
          totalWeeks,
          courses.length,
        );
        courses.push(...parsed);
      }
    }

    if (courses.length) return dedupeCourses(courses);
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/*  4) 通用教务成绩单 JSON 适配器（新正方 `cjcx` items 等）                     */
/* -------------------------------------------------------------------------- */

function mapZhengfangSemester(
  item: Record<string, unknown>,
  fallback: SemesterKind,
): SemesterKind {
  const xqmmc = String(item.xqmmc ?? "").trim();
  if (xqmmc === "1") return "fall";
  if (xqmmc === "2") return "spring";
  if (xqmmc === "3") return "summer";

  const xqm = String(item.xqm ?? "").trim();
  if (xqm === "3") return "fall";
  if (xqm === "12") return "spring";
  if (xqm === "16") return "summer";

  return (
    normalizeSemester(item.semester ?? xqmmc ?? xqm) ?? fallback
  );
}

/** 解析教务系统 / 通用成绩单 JSON（兼容新正方 `cjcx` items 与标准 JSON 数组） */
export function parseEduGrades(
  rawText: string,
  fallbackSemester: SemesterKind = "fall",
  opts?: {
    scale?: GpaScaleId;
    types?: readonly GradeType[];
  },
): GradeDraft[] {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const list: any[] | null = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed?.data?.items)
        ? parsed.data.items
        : Array.isArray(parsed?.grades)
          ? parsed.grades
          : Array.isArray(parsed?.rows)
            ? parsed.rows
            : Array.isArray(parsed?.list)
              ? parsed.list
              : null;

  if (!list || !list.length) return [];

  const looksLikeGradeList = list.some(
    (x) =>
      x &&
      typeof x === "object" &&
      ("kcmc" in x || "cj" in x || "bfzcj" in x || ("name" in x && ("score" in x || "gpa" in x))),
  );
  if (!looksLikeGradeList) return [];

  const drafts: GradeDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.kcmc ?? item.courseName ?? item.name ?? "").trim();
    if (!name) continue;

    const rawScore = item.cj ?? item.bfzcj ?? item.score ?? item.grade;
    const rawCredit = item.xf ?? item.credit;
    const rawGpa = item.jd ?? item.gpa;
    const rawType = item.kcxzmc ?? item.kclbmc ?? item.type ?? "required";

    const draft = normalizeGradeInput(
      {
        name,
        credit: rawCredit,
        score: rawScore,
        gpa: rawGpa,
        type: rawType,
        semester: mapZhengfangSemester(item as Record<string, unknown>, fallbackSemester),
      },
      opts,
    );
    if (draft) drafts.push(draft);
  }

  return drafts;
}

/* -------------------------------------------------------------------------- */
/*  对外课表 & 作息直导入口                                                     */
/* -------------------------------------------------------------------------- */

/** 自动识别并直导 WakeUp / 新正方 JSON / 强智·青果 HTML 课表 */
export function parseEduCourses(rawText: string, totalWeeks: number): Course[] {
  const wakeUp = parseWakeUpPayload(rawText, totalWeeks);
  if (wakeUp?.courses.length) return wakeUp.courses;

  const zhengfang = parseZhengfangKbJson(rawText, totalWeeks);
  if (zhengfang.length) return zhengfang;

  const htmlCourses = parseEduHtmlTable(rawText, totalWeeks);
  if (htmlCourses.length) return htmlCourses;

  return [];
}

/** 从 WakeUp 导出块中提取作息时间节点（若存在） */
export function parseEduPeriods(rawText: string): Period[] {
  const wakeUp = parseWakeUpPayload(rawText, 20);
  return wakeUp?.periods ?? [];
}
