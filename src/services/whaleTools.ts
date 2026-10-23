import { chat } from "@/services/deepseek";
import type { ChatSource } from "@/types";

/**
 * 大爹专属工具：联网检索 + 生图。
 *
 * - 搜索：无需 Key，先试 Bing 国内站，失败再试 DuckDuckGo；
 *   只取标题 / 摘要 / 链接，交给 DeepSeek 汇总，避免把整页 HTML 塞给模型。
 * - 生图：DeepSeek 文本 API 不提供绘图，改用无需 Key 的 Pollinations 图片接口，
 *   直接把 URL 交给 <Image> 加载，不占用模型额度。
 */

export interface SearchHit extends ChatSource {
  snippet: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
};

function decodeEntities(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}

function stripTags(input: string) {
  return decodeEntities(input.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`搜索接口返回 ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** 解析 Bing 国内站结果页 */
function parseBing(html: string): SearchHit[] {
  const blocks = html.split('<li class="b_algo"').slice(1);
  const hits: SearchHit[] = [];
  for (const block of blocks) {
    const link = block.match(
      /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!link) continue;
    const url = decodeEntities(link[1]);
    const title = stripTags(link[2]);
    const snip = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!title || !url.startsWith("http")) continue;
    hits.push({ title, url, snippet: snip ? stripTags(snip[1]) : "" });
    if (hits.length >= 5) break;
  }
  return hits;
}

/** 解析 DuckDuckGo 结果页 */
function parseDuckDuckGo(html: string): SearchHit[] {
  const links: { url: string; title: string }[] = [];
  const re =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let url = decodeEntities(m[1]);
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith("//")) url = `https:${url}`;
    if (!url.startsWith("http")) continue;
    links.push({ url, title: stripTags(m[2]) });
    if (links.length >= 5) break;
  }

  const snippets: string[] = [];
  const sre =
    /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = sre.exec(html))) {
    snippets.push(stripTags(m[1]));
    if (snippets.length >= 5) break;
  }

  return links.map((l, i) => ({ ...l, snippet: snippets[i] ?? "" }));
}

/** 联网搜索，返回前 5 条结果（无需 API Key） */
export async function searchWeb(query: string): Promise<SearchHit[]> {
  const q = query.trim().slice(0, 120);
  if (!q) return [];

  const engines: ((q: string) => Promise<SearchHit[]>)[] = [
    async (text) =>
      parseBing(
        await fetchHtml(
          `https://cn.bing.com/search?q=${encodeURIComponent(text)}&setlang=zh-Hans&ensearch=0`,
        ),
      ),
    async (text) =>
      parseBing(
        await fetchHtml(
          `https://www.bing.com/search?q=${encodeURIComponent(text)}&setmkt=zh-CN`,
        ),
      ),
    async (text) =>
      parseDuckDuckGo(
        await fetchHtml(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(text)}`,
        ),
      ),
  ];

  for (const engine of engines) {
    try {
      const hits = await engine(q);
      if (hits.length) return hits;
    } catch {
      // 换下一个引擎
    }
  }
  throw new Error("联网搜索没有响应");
}

/** 把搜索结果交给 DeepSeek 汇总成一句可爱回答 */
export async function answerFromSearch(
  question: string,
  hits: SearchHit[],
  apiKey: string,
): Promise<string> {
  const brief = hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.title}\n${h.snippet || "（无摘要）"}\n${h.url}`,
    )
    .join("\n\n");

  const text = await chat(
    [
      {
        role: "system",
        content:
          "你是「蓝色大肥鱼」，用户是你最亲的大爹。用可爱、简短的中文回答（不超过 120 字），可以带一个颜文字。只能依据给定资料，资料不足就直说没查到；不要编造事实，不要输出链接。",
      },
      {
        role: "user",
        content: `大爹的问题：${question}\n\n搜索结果：\n${brief}`,
      },
    ],
    apiKey,
    { temperature: 0.7, timeoutMs: 45_000 },
  );
  return text.trim();
}

const IMAGE_SIZES = {
  square: [768, 768],
  portrait: [768, 1024],
  landscape: [1024, 768],
} as const;

export type ImageSize = keyof typeof IMAGE_SIZES;

/** 生成无需鉴权的图片 URL（Pollinations） */
export function buildImageUrl(prompt: string, size?: string): string {
  const key: ImageSize =
    size === "portrait" || size === "landscape" ? size : "square";
  const [w, h] = IMAGE_SIZES[key];
  const seed = Math.floor(Math.random() * 999_999);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt.trim().slice(0, 300) || "a cute blue whale girl eating white rice",
  )}?width=${w}&height=${h}&nologo=true&seed=${seed}`;
}

export function imageAspect(size?: string): number {
  if (size === "portrait") return 0.75;
  if (size === "landscape") return 4 / 3;
  return 1;
}
