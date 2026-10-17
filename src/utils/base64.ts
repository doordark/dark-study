const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Uint8Array -> base64（Hermes 不保证有 btoa，故自实现） */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out +=
      i + 1 < bytes.length
        ? ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
        : "=";
    out += i + 2 < bytes.length ? ALPHABET[b2 & 63] : "=";
  }
  return out;
}

/**
 * 剥离 JSON 里的 `//` 行注释与 `/* *\/` 块注释，并去掉 `}` / `]` 前的尾逗号。
 * 模型常照抄示例里的注释，标准 JSON.parse 无法解析，故在此容错。
 * 逐字符扫描以避免误伤字符串值内部的 `//`（如 URL）。
 */
function stripJsonNoise(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    // 行注释
    if (ch === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    // 块注释
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/"))
        i++;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    out += ch;
  }

  // 去掉尾逗号：, 后跟空白再跟 } 或 ]
  return out.replace(/,\s*([}\]])/g, "$1");
}

/** 从字符串中提取第一个「括号平衡」的 JSON 对象或数组（容忍嵌入的杂文） */
function extractBalanced(
  input: string,
  open: string,
  close: string,
): string | null {
  const start = input.indexOf(open);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

/** 从字符串中宽松提取 JSON（容忍 ```json 围栏、注释、尾逗号与前后说明文字） */
export function extractJson<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1]?.trim(), trimmed].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const cleaned = stripJsonNoise(candidate);

    // 直接解析
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // 继续尝试截取 {...} / [...]
    }

    // 优先取对象，其次数组（按出现顺序，先开谁取谁）
    const objStart = cleaned.indexOf("{");
    const arrStart = cleaned.indexOf("[");
    const order: ("obj" | "arr")[] =
      objStart < 0
        ? ["arr"]
        : arrStart < 0
          ? ["obj"]
          : objStart < arrStart
            ? ["obj", "arr"]
            : ["arr", "obj"];

    for (const kind of order) {
      const frag =
        kind === "obj"
          ? extractBalanced(cleaned, "{", "}")
          : extractBalanced(cleaned, "[", "]");
      if (!frag) continue;
      try {
        return JSON.parse(frag) as T;
      } catch {
        // 忽略
      }
    }
  }
  return null;
}
