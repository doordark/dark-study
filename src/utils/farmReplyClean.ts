/** 对话层“防口头画饼”真实送礼事实边界（1v1、群聊、访客、摊主共用） */
export const FARM_REAL_GIFT_BOUNDARY =
  '【真实送礼事实边界】只有系统上下文明确标注【真实递出礼物】、[真实送礼] 或已有真实送礼事件记录时，玩家才算真的从背包把东西递给了你。如果玩家只在聊天框嘴上说“送你一个萝卜/给你吃苹果/请你喝汤/送你XX”却没有任何真实送礼系统记录，绝对不能当真道谢或装作已经收下/吃到！要像真实家人朋友一样清醒拆台、打趣或反问（比如“光嘴上画饼可不算数啊，萝卜呢？点上面送礼真掏出来我才信～”）；同时结构化字段中口头画饼 reaction 保持 neutral（勿给 warm 加分），且严禁在 memoryUpdates / episode / memory 里把口头说送的东西记成“收到礼物”或“送过XX”。';

const SPEAKER_ALIAS_MAP: Record<string, readonly string[]> = {
  door: ['door', '爸爸', '老爸'],
  gu: ['顾', '妈妈', '老妈'],
  xiaoba: ['小八', '大哥', '老大'],
  yujie: ['玉洁', '二哥', '校草'],
  weigang: ['唯刚', '伟刚', '伟纲', '唯纲', '小弟'],
  chicken: ['坤坤', '小鸡坤坤', '小鸡'],
  smith: ['铁匠老周', '老周', '铁匠'],
  farmer: ['花农阿青', '阿青', '花农'],
  chemist: ['药师温宁', '温宁', '药师'],
  traveler: ['旅人阿远', '阿远', '旅人'],
  dafeiyu: ['大肥鱼', '肥鱼', '鲸鱼娘'],
  huboqi: ['胡波奇', '胡博棋'],
  xushuiyin: ['徐睡阴'],
  dark_xushuiyin: ['恐怖徐睡阴', '黑暗徐睡阴'],
  huangbingqi: ['黄冰骑', '黄炳棋'],
  claude: ['克劳德', 'Claude', 'claude', '克劳德大小姐'],
  gpt: ['小G', '小g', 'ChatGPT', 'GPT', 'gpt', '龙娘'],
  gemini: ['哈基米', 'Gemini', 'gemini', '小吉', '双子星'],
};

const DEFAULT_SPEAKER_NAMES = [
  ...new Set([
    ...Object.keys(SPEAKER_ALIAS_MAP),
    ...Object.values(SPEAKER_ALIAS_MAP).flat(),
    '英雄', '助手', '回复', '回答',
  ]),
];

const REPLY_JSON_KEYS = [
  'reply', 'response', 'text', 'content', 'message', 'answer', 'output', 'saying', 'line', 'speech', 'dialogue',
] as const;

const REPLY_KEY_PATTERN = REPLY_JSON_KEYS.join('|');

export function speakerAliasesFor(speakerIdOrName?: string): string[] {
  if (!speakerIdOrName) return [];
  const trimmed = speakerIdOrName.trim();
  if (!trimmed) return [];
  const mapped = SPEAKER_ALIAS_MAP[trimmed] ?? [];
  return [...new Set([trimmed, ...mapped, '回复', '回答'])];
}

function stripCodeFences(input: string): string {
  const trimmed = input.trim();
  const full = /^```[a-zA-Z0-9_-]*\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/.exec(trimmed);
  if (full) return full[1].trim();
  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*\r?\n?/, '')
    .replace(/\r?\n?```\s*$/, '')
    .trim();
}

function decodeJsonStringFragment(fragment: string, quoteChar: '"' | "'" = '"'): string {
  let out = '';
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if (ch !== '\\' || i + 1 >= fragment.length) {
      out += ch;
      continue;
    }
    const next = fragment[++i];
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === '"' || next === "'" || next === '\\' || next === '/') out += next;
    else if (next === 'u' && i + 4 < fragment.length) {
      const hex = fragment.slice(i + 1, i + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        out += '\\u';
      }
    } else if (next === quoteChar) {
      out += quoteChar;
    } else {
      out += next;
    }
  }
  return out;
}

function extractStringFromJsonObject(obj: Record<string, unknown>): string | null {
  for (const key of REPLY_JSON_KEYS) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val;
  }
  if (Array.isArray(obj.lines)) {
    const joined = obj.lines
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const lineObj = item as Record<string, unknown>;
          for (const k of ['text', 'reply', 'response', 'content', 'line'] as const) {
            if (typeof lineObj[k] === 'string') return lineObj[k] as string;
          }
        }
        return '';
      })
      .map(s => s.trim())
      .filter(Boolean)
      .join(' ');
    if (joined) return joined;
  }
  const keys = Object.keys(obj);
  if (keys.length === 1 && typeof obj[keys[0]] === 'string' && (obj[keys[0]] as string).trim()) {
    return obj[keys[0]] as string;
  }
  return null;
}

function scanQuotedJsonValue(rest: string, quoteChar: '"' | "'"): string {
  let end = -1;
  let escaped = false;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === quoteChar) {
      const after = rest.slice(i + 1).trim();
      if (!after || /^[,}\]]/.test(after)) {
        end = i;
        break;
      }
    }
  }
  const rawPayload = end >= 0 ? rest.slice(0, end) : rest.replace(/\\$/, '');
  return decodeJsonStringFragment(rawPayload, quoteChar).trim();
}

function extractTruncatedJsonReply(input: string): string | null {
  const trimmed = input.trim();
  const direct = new RegExp(
    `^\\{?\\s*(['"]?)(?:${REPLY_KEY_PATTERN})\\1\\s*:\\s*(['"])([\\s\\S]*)$`,
    'i',
  ).exec(trimmed);
  if (direct) {
    const quoteChar = direct[2] as '"' | "'";
    const decoded = scanQuotedJsonValue(direct[3], quoteChar);
    return decoded || null;
  }

  if (trimmed.startsWith('{')) {
    const embedded = new RegExp(
      `[,{\\s](['"])(?:${REPLY_KEY_PATTERN})\\1\\s*:\\s*(['"])([\\s\\S]*)$`,
      'i',
    ).exec(trimmed);
    if (embedded) {
      const quoteChar = embedded[2] as '"' | "'";
      const decoded = scanQuotedJsonValue(embedded[3], quoteChar);
      return decoded || null;
    }
  }

  return null;
}

function stripOrphanJsonTail(text: string): string {
  if (text.includes('{')) return text;
  let cur = text;
  cur = cur.replace(
    /\\?"(?:\s*,\s*"[a-zA-Z_][a-zA-Z0-9_]*"\s*:\s*(?:"(?:[^"\\]|\\.)*"|null|true|false|-?\d+(?:\.\d+)?))*\s*\}\s*$/,
    '',
  );
  cur = cur.replace(/\\?["']\s*\}\s*$/, '');
  return cur.trim();
}

function stripSpeakerPrefix(text: string, scopedNames?: readonly string[]): string {
  const pool = scopedNames && scopedNames.length ? scopedNames : DEFAULT_SPEAKER_NAMES;
  const names = [...new Set(pool.map(n => n.trim()).filter(Boolean))];
  if (!names.length) return text;
  const escaped = names
    .sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(
    `^[\\s【\\[「]*(?:${escaped})(?:\\s*[（(][^）)\\n]{1,12}[）)])?[\\s】\\]」]*\\s*[:：]\\s*`,
    'i',
  );
  let cur = text;
  for (let i = 0; i < 2; i++) {
    const next = cur.replace(pattern, '').trim();
    if (!next || next === cur) break;
    cur = next;
  }
  return cur;
}

function stripWrappingQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 2) return trimmed;
  const pairs: readonly [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['「', '」'],
  ];
  for (const [open, close] of pairs) {
    if (trimmed.startsWith(open) && trimmed.endsWith(close)) {
      const inner = trimmed.slice(open.length, trimmed.length - close.length);
      if (!inner.includes(close) && !inner.includes(open)) {
        return inner.trim();
      }
    }
  }
  return trimmed;
}

/**
 * 统一强健的模型回复文本清洗器：
 * 彻底剥离 JSON 外壳（response/reply/text/content/message 等）、嵌套 JSON、markdown 代码围栏、
 * 未闭合截断 JSON、头部截断残留的 `"}` / `","emotion":"..."}` 尾部碎片以及多余的角色名前缀。
 */
export function unwrapModelReplyText(
  raw: string,
  options?: { speakerNames?: readonly string[] },
): string {
  if (typeof raw !== 'string') return '';
  let cur = raw.trim();
  if (!cur) return '';

  for (let pass = 0; pass < 4; pass++) {
    const before = cur;
    cur = stripCodeFences(cur);
    cur = stripSpeakerPrefix(cur, options?.speakerNames);

    if (!cur.startsWith('{') && /\{\s*"(?:reply|response|text|content|message)"\s*:/i.test(cur)) {
      const idx = cur.search(/\{\s*"(?:reply|response|text|content|message)"\s*:/i);
      const prefix = cur.slice(0, idx).trim();
      if (prefix.length <= 24 && /(?:回复|如下|输出|JSON)[:：]?$/i.test(prefix)) {
        cur = cur.slice(idx).trim();
      }
    }

    if (
      (cur.startsWith('{') && cur.endsWith('}')) ||
      (cur.startsWith('"') && cur.endsWith('"'))
    ) {
      try {
        const parsed = JSON.parse(cur);
        if (typeof parsed === 'string') {
          cur = parsed.trim();
          continue;
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const extracted = extractStringFromJsonObject(parsed as Record<string, unknown>);
          if (extracted !== null) {
            cur = extracted.trim();
            continue;
          }
        }
      } catch {
        // Fall through to truncated / single-quoted recovery below
      }
    }

    const truncated = extractTruncatedJsonReply(cur);
    if (truncated !== null) {
      cur = truncated;
      continue;
    }

    cur = stripOrphanJsonTail(cur);
    cur = stripWrappingQuotes(cur);

    if (cur === before) break;
  }

  cur = stripSpeakerPrefix(cur, options?.speakerNames);
  cur = stripOrphanJsonTail(cur);
  cur = stripWrappingQuotes(cur);
  return cur.trim();
}

/** 从带围栏或杂音的模型输出中提取最外层 JSON 对象字符串，供结构化解析器复用。 */
export function extractJsonObjectText(raw: string): string {
  const cleaned = stripCodeFences(raw);
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) return cleaned;
  const start = cleaned.indexOf('{');
  if (start < 0) return cleaned;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return cleaned.slice(start, i + 1);
      }
    }
  }
  return cleaned.slice(start);
}
