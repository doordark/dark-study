import { Platform } from "react-native";
import type { EdgeCuteVoiceId } from "@/store/useWhaleVoice";
import type { Mood } from "./whaleVoiceText";
import {
  EDGE_SEC_MS_GEC_VERSION,
  EDGE_WSS_HEADERS,
  EDGE_WSS_URL,
  generateMuid,
  generateRequestId,
  generateSecMsGecV2,
} from "./edgeTtsDrm";

export const BREEZE_BASE_URL = "https://api.breeze.blue/v1";
export const SILICONFLOW_SPEECH_URL = "https://api.siliconflow.cn/v1/audio/speech";
export const SILICONFLOW_MODEL = "FunAudioLLM/CosyVoice2-0.5B";

export const SILICON_PRESET_VOICES = [
  { id: `${SILICONFLOW_MODEL}:diana`, label: "Diana · 欢快少女", hint: "轻快甜润，贴合活泼大肥鱼" },
  { id: `${SILICONFLOW_MODEL}:claire`, label: "Claire · 温柔女声", hint: "轻声细语，适合安静陪伴" },
  { id: `${SILICONFLOW_MODEL}:bella`, label: "Bella · 元气女声", hint: "更有弹性，带一点傲娇劲儿" },
  { id: `${SILICONFLOW_MODEL}:anna`, label: "Anna · 清朗女声", hint: "清晰稳重，偏日常学习播报" },
] as const;

export const EDGE_CUTE_VOICES: { id: EdgeCuteVoiceId; label: string; hint: string }[] = [
  { id: "zh-CN-XiaoyiNeural", label: "晓伊 · 甜美少女（高萌调校）", hint: "清亮俏皮，适合傲娇元气大肥鱼" },
  { id: "zh-CN-XiaoshuangNeural", label: "晓双 · 幼态软萌", hint: "声音更圆润稚气，偏迷糊撒娇感" },
];

export interface BreezeVoiceItem {
  voiceId: string;
  name: string;
  description: string;
}

export class TtsProviderError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "TtsProviderError";
    this.status = status;
  }
}

function isValidMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  // ID3 tag or MPEG frame sync (0xFF 0xE0+)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
  // Some streaming MP3 encoders start after a few zero padding bytes.
  for (let i = 0; i < Math.min(64, bytes.length - 2); i++) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

async function fetchAudioBinary(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs: number,
  providerLabel: string,
): Promise<Uint8Array> {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const map: Record<number, string> = {
        400: `${providerLabel} 请求参数无效，请检查音色配置`,
        401: `${providerLabel} API Key 无效或未授权`,
        402: `${providerLabel} 额度不足（可在官网领取免费积分或充值）`,
        403: `${providerLabel} 无权访问该音色`,
        404: `${providerLabel} 音色 ID 不存在`,
        422: `${providerLabel} 文本或音色参数不受支持`,
        429: `${providerLabel} 请求过于频繁，稍后再试`,
      };
      throw new TtsProviderError(map[res.status] ?? `${providerLabel} 服务暂不可用 (${res.status})`, res.status);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/audio\/|application\/octet-stream/i.test(contentType)) {
      throw new TtsProviderError(`${providerLabel} 未返回有效音频流`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!isValidMp3(bytes)) {
      throw new TtsProviderError(`${providerLabel} 返回了空音频或无效 MP3`);
    }
    return bytes;
  } catch (err) {
    if (err instanceof TtsProviderError) throw err;
    if (signal.aborted) throw new TtsProviderError("已取消");
    if (timedOut) throw new TtsProviderError(`${providerLabel} 请求超时`);
    throw new TtsProviderError(`${providerLabel} 网络连接失败`);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export async function synthesizeBreezeBlue({
  text,
  voiceId,
  apiKey,
  signal,
}: {
  text: string;
  voiceId: string;
  apiKey: string;
  signal: AbortSignal;
}): Promise<Uint8Array> {
  const cleanVoice = voiceId.trim();
  if (!cleanVoice) throw new TtsProviderError("请先填写或匹配 BreezeBlue 音色 ID");
  return fetchAudioBinary(
    `${BREEZE_BASE_URL}/text-to-speech/${encodeURIComponent(cleanVoice)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey.trim(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "breeze-tts-2",
        language_code: "zh",
      }),
    },
    signal,
    12_000,
    "BreezeBlue",
  );
}

/** 从 BreezeBlue 音色库拉取可用音色，并把名称含「大肥鱼 / 鲸鱼 / 少女」的排到前面 */
export async function listBreezeBlueVoices(apiKey: string, query = "大肥鱼"): Promise<BreezeVoiceItem[]> {
  const key = apiKey.trim();
  if (!key) throw new TtsProviderError("请先输入 BreezeBlue API Key");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const qs = query ? `?search=${encodeURIComponent(query)}` : "";
    const res = await fetch(`${BREEZE_BASE_URL}/voices${qs}`, {
      method: "GET",
      headers: { "xi-api-key": key, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new TtsProviderError(
        res.status === 401 ? "BreezeBlue API Key 无效" : `拉取音色列表失败 (${res.status})`,
        res.status,
      );
    }
    const json = (await res.json()) as Record<string, unknown>;
    const rawList = Array.isArray(json)
      ? json
      : Array.isArray(json.voices)
        ? json.voices
        : Array.isArray(json.data)
          ? json.data
          : Array.isArray(json.items)
            ? json.items
            : [];
    const items: BreezeVoiceItem[] = [];
    for (const row of rawList) {
      if (!row || typeof row !== "object") continue;
      const obj = row as Record<string, unknown>;
      const id = String(obj.voice_id ?? obj.voiceId ?? obj.id ?? "").trim();
      const name = String(obj.name ?? obj.title ?? id).trim();
      const desc = String(obj.description ?? obj.labels ?? "").trim();
      if (id) items.push({ voiceId: id, name, description: desc });
    }
    const score = (item: BreezeVoiceItem) => {
      const hay = `${item.name} ${item.description}`;
      if (/大肥鱼|鲸鱼娘/.test(hay)) return 3;
      if (/少女|软萌|可爱|萌|傲娇/.test(hay)) return 2;
      return 1;
    };
    items.sort((a, b) => score(b) - score(a));
    return items.slice(0, 24);
  } catch (err) {
    if (err instanceof TtsProviderError) throw err;
    throw new TtsProviderError("连接 BreezeBlue 失败，请检查网络或手动粘贴 Voice ID");
  } finally {
    clearTimeout(timer);
  }
}

const SILICON_SPEED: Record<Mood, number> = {
  normal: 1.04,
  happy: 1.08,
  excited: 1.12,
  sleepy: 0.92,
  comfort: 0.95,
};

export async function synthesizeSiliconFlow({
  text,
  voice,
  apiKey,
  mood,
  signal,
}: {
  text: string;
  voice: string;
  apiKey: string;
  mood: Mood;
  signal: AbortSignal;
}): Promise<Uint8Array> {
  const cleanVoice = voice.trim() || `${SILICONFLOW_MODEL}:diana`;
  return fetchAudioBinary(
    SILICONFLOW_SPEECH_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SILICONFLOW_MODEL,
        input: text,
        voice: cleanVoice,
        response_format: "mp3",
        speed: SILICON_SPEED[mood],
        gain: 0,
      }),
    },
    signal,
    12_000,
    "硅基流动",
  );
}

const EDGE_PROSODY: Record<EdgeCuteVoiceId, Record<Mood, { pitch: string; rate: string }>> = {
  "zh-CN-XiaoyiNeural": {
    normal: { pitch: "+14Hz", rate: "+4%" },
    happy: { pitch: "+18Hz", rate: "+7%" },
    excited: { pitch: "+22Hz", rate: "+10%" },
    sleepy: { pitch: "+6Hz", rate: "-8%" },
    comfort: { pitch: "+9Hz", rate: "-4%" },
  },
  "zh-CN-XiaoshuangNeural": {
    normal: { pitch: "+6Hz", rate: "+2%" },
    happy: { pitch: "+10Hz", rate: "+5%" },
    excited: { pitch: "+14Hz", rate: "+9%" },
    sleepy: { pitch: "+0Hz", rate: "-8%" },
    comfort: { pitch: "+2Hz", rate: "-4%" },
  },
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function extractEdgeAudioPayload(frame: Uint8Array): Uint8Array | null {
  if (frame.byteLength < 4) return null;
  const headerLen = (frame[0] << 8) | frame[1];
  const payloadStart = 2 + headerLen;
  if (payloadStart >= frame.byteLength) return null;
  // Verify "Path:audio" marker inside ASCII header.
  let headerStr = "";
  for (let i = 2; i < payloadStart; i++) headerStr += String.fromCharCode(frame[i]);
  if (!headerStr.includes("Path:audio")) return null;
  return frame.subarray(payloadStart);
}

type RNWebSocketCtor = new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers?: Record<string, string> },
) => WebSocket;

export async function synthesizeEdgeTts({
  text,
  voice,
  mood,
  signal,
}: {
  text: string;
  voice: EdgeCuteVoiceId;
  mood: Mood;
  signal: AbortSignal;
}): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    throw new TtsProviderError("Web 浏览器限制直连 Edge TTS，请使用云端语音或软萌拟声");
  }

  const connectionId = generateRequestId();
  const secMsGec = generateSecMsGecV2();
  const url = `${EDGE_WSS_URL}&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${EDGE_SEC_MS_GEC_VERSION}`;
  const headers: Record<string, string> = {
    ...EDGE_WSS_HEADERS,
    Cookie: `muid=${generateMuid()};`,
  };
  const prosody = EDGE_PROSODY[voice]?.[mood] ?? EDGE_PROSODY["zh-CN-XiaoyiNeural"].normal;

  return new Promise<Uint8Array>((resolve, reject) => {
    if (signal.aborted) {
      reject(new TtsProviderError("已取消"));
      return;
    }

    const WsCtor = WebSocket as unknown as RNWebSocketCtor;
    let ws: WebSocket;
    try {
      ws = new WsCtor(url, null, { headers });
      ws.binaryType = "arraybuffer";
    } catch {
      reject(new TtsProviderError("Edge TTS WebSocket 初始化失败"));
      return;
    }

    const audioChunks: Uint8Array[] = [];
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {}
    };

    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new TtsProviderError(msg));
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const merged = concatChunks(audioChunks);
      if (!isValidMp3(merged)) {
        reject(new TtsProviderError("Edge TTS 返回空音频"));
        return;
      }
      resolve(merged);
    };

    const onAbort = () => fail("已取消");
    signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => fail("Edge TTS 连接超时"), 9_000);

    ws.onopen = () => {
      if (settled || signal.aborted) return;
      const nowStr = new Date().toUTCString();
      const configMsg =
        `X-Timestamp:${nowStr}\r\n` +
        "Content-Type:application/json; charset=utf-8\r\n" +
        "Path:speech.config\r\n\r\n" +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        }) +
        "\r\n";

      const requestId = generateRequestId();
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
        `<voice name='${voice}'>` +
        `<prosody pitch='${prosody.pitch}' rate='${prosody.rate}' volume='+0%'>` +
        `${escapeXml(text)}` +
        `</prosody></voice></speak>`;

      const ssmlMsg =
        `X-RequestId:${requestId}\r\n` +
        "Content-Type:application/ssml+xml\r\n" +
        `X-Timestamp:${nowStr}\r\n` +
        "Path:ssml\r\n\r\n" +
        ssml;

      try {
        ws.send(configMsg);
        ws.send(ssmlMsg);
      } catch {
        fail("Edge TTS 发送合成指令失败");
      }
    };

    ws.onmessage = (event) => {
      if (settled) return;
      const data = event.data;
      if (typeof data === "string") {
        if (data.includes("Path:turn.end")) succeed();
        return;
      }
      if (data instanceof ArrayBuffer) {
        const payload = extractEdgeAudioPayload(new Uint8Array(data));
        if (payload && payload.byteLength > 0) audioChunks.push(payload);
      } else if (ArrayBuffer.isView(data)) {
        const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const payload = extractEdgeAudioPayload(view);
        if (payload && payload.byteLength > 0) audioChunks.push(payload);
      }
    };

    ws.onerror = () => fail("Edge TTS 通道握手失败（可能网络受限或微软鉴权更新）");
    ws.onclose = () => {
      if (!settled) {
        if (audioChunks.length > 0) succeed();
        else fail("Edge TTS 连接已提前断开");
      }
    };
  });
}
