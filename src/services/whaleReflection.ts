import { chatJson, TEXT_MODEL } from "@/services/deepseek";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import { describeWhaleMessage } from "@/utils/whaleExpression";
import type { WhaleReflection } from "@/utils/whaleMemory";

const REFLECT_TURN_THRESHOLD = 14;
const REFLECT_MIN_COOLDOWN_MS = 15 * 60_000;

let inFlight = false;

interface ReflectionResponse {
  reflections?: {
    kind?: "insight" | "inside_joke" | "milestone";
    text?: string;
    importance?: number;
  }[];
  prunedFactIds?: string[];
  resolvedLoopIds?: string[];
}

/**
 * Generative Agents 风格的记忆整理与反思（Sleep-time Reflection）：
 * - 从近期跨入口对话、事实与情景中提炼 1~3 条高阶洞察、共同梗或相处里程碑；
 * - 识别明显重复/已过期的自动事实 ID（绝不触碰手动事实）以及明显已完结的牵挂 ID；
 * - 严格遵守 epoch / revision 竞态保护：若反思期间用户清空或修改记忆，丢弃旧结果。
 */
export async function consolidateWhaleMemory(
  apiKey: string,
  opts: { manual?: boolean; signal?: AbortSignal } = {},
): Promise<{ added: number; pruned: number; resolved: number }> {
  if (!apiKey.trim()) throw new Error("请先在设置里填写 DeepSeek API Key");
  if (inFlight) return { added: 0, pruned: 0, resolved: 0 };

  const state = useWhaleMemory.getState();
  const now = Date.now();
  if (!opts.manual) {
    if (!state.autoReflect || !state.autoMemory) return { added: 0, pruned: 0, resolved: 0 };
    if (state.turnsSinceReflect < REFLECT_TURN_THRESHOLD) return { added: 0, pruned: 0, resolved: 0 };
    if (now - state.lastReflectedAt < REFLECT_MIN_COOLDOWN_MS) return { added: 0, pruned: 0, resolved: 0 };
  }

  const allLogs = [
    ...new Map([...state.memory, ...state.messages, ...state.petMessages].map((m) => [m.id, m])).values(),
  ]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(describeWhaleMessage)
    .filter((m) => m.content.trim())
    .slice(-26);

  if (allLogs.length < 4 && state.facts.length < 2 && state.episodes.length < 1) {
    return { added: 0, pruned: 0, resolved: 0 };
  }

  const { epoch, revision } = state;
  const persona = useWhalePersona.getState().persona;
  const autoFacts = state.facts.filter((f) => f.source !== "manual");
  const openLoops = state.openLoops.filter((l) => !l.resolvedAt);

  inFlight = true;
  try {
    const system = `你是角色「${persona.name}」的潜意识记忆整理器（不直接面向用户说话）。
请审视近期对话、长期事实、情景回忆和未完结的牵挂，只提炼真正有长期价值、能让你更懂「${persona.userName}」的高阶洞察或共同梗。

输出严格 JSON（不要多余文本）：
{
  "reflections": [
    {"kind":"insight|inside_joke|milestone","text":"简明精炼，不超过90字","importance":7}
  ],
  "prunedFactIds": [],
  "resolvedLoopIds": []
}

规则：
1. reflections 最多 3 条，宁缺毋滥；没有真正新洞察就返回 []。
   - insight：跨多轮看出的习惯/情绪模式/沟通偏好（例如“熬夜赶作业时压力大，更喜欢轻松陪伴而不是被说教”）。
   - inside_joke：两人反复玩过或约定好的专属称呼/默契梗。
   - milestone：值得记住的共同经历或重要节点。
2. 绝不编造对话中没发生的事，绝不记录密码/密钥/隐私敏感凭据，不要重复已有反思。
3. prunedFactIds：只填写**自动记忆**列表中高度重复或明显已被新事实取代的旧 fact id（宁可不删，绝不误删有用信息）。
4. resolvedLoopIds：只填写近期对话中用户已明确说完成/考完/结束的 openLoop id。`;

    const userPrompt = JSON.stringify({
      existingReflections: state.reflections.map((r) => ({ kind: r.kind, text: r.text })),
      autoFacts: autoFacts.slice(-40).map((f) => ({ id: f.id, key: f.key, text: f.text })),
      episodes: state.episodes.slice(-15).map((e) => ({ summary: e.summary, emotion: e.emotion })),
      openLoops: openLoops.map((l) => ({ id: l.id, topic: l.topic, dueHint: l.dueHint })),
      recentDialogue: allLogs.map((m) => ({ role: m.role, text: m.content.slice(0, 220) })),
    });

    const parsed = await chatJson<ReflectionResponse>(
      [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      apiKey,
      {
        model: TEXT_MODEL,
        temperature: 0.35,
        timeoutMs: 35_000,
        attempts: 2,
        priority: "background",
        signal: opts.signal,
      },
    );

    if (opts.signal?.aborted) return { added: 0, pruned: 0, resolved: 0 };
    const validKinds = new Set(["insight", "inside_joke", "milestone"]);
    const reflections: WhaleReflection[] = (Array.isArray(parsed?.reflections) ? parsed.reflections : [])
      .slice(0, 3)
      .map((item, idx) => {
        const text = typeof item?.text === "string" ? item.text.trim().slice(0, 100) : "";
        const kind = validKinds.has(String(item?.kind)) ? (item.kind as WhaleReflection["kind"]) : "insight";
        const importance =
          typeof item?.importance === "number" && Number.isFinite(item.importance)
            ? Math.max(1, Math.min(10, Math.round(item.importance)))
            : 7;
        return text.length >= 6 ? { id: `ref-${now}-${idx}`, kind, text, importance, updatedAt: now } : null;
      })
      .filter((x): x is WhaleReflection => x !== null);

    const allowedFactIds = new Set(autoFacts.map((f) => f.id));
    const prunedFactIds = (Array.isArray(parsed?.prunedFactIds) ? parsed.prunedFactIds : []).filter(
      (id): id is string => typeof id === "string" && allowedFactIds.has(id),
    );
    const allowedLoopIds = new Set(openLoops.map((l) => l.id));
    const resolvedLoopIds = (Array.isArray(parsed?.resolvedLoopIds) ? parsed.resolvedLoopIds : []).filter(
      (id): id is string => typeof id === "string" && allowedLoopIds.has(id),
    );

    useWhaleMemory.getState().applyReflection(
      { reflections, prunedFactIds, resolvedLoopIds },
      epoch,
      revision,
      now,
    );
    return {
      added: reflections.length,
      pruned: prunedFactIds.length,
      resolved: resolvedLoopIds.length,
    };
  } finally {
    inFlight = false;
  }
}

/** 对话结束后静默检查是否达到自动反思阈值；绝不阻塞主对话，失败静默忽略。 */
export function maybeScheduleWhaleReflection(apiKey: string) {
  if (!apiKey.trim() || inFlight) return;
  const s = useWhaleMemory.getState();
  if (!s.autoReflect || !s.autoMemory || s.turnsSinceReflect < REFLECT_TURN_THRESHOLD) return;
  if (Date.now() - s.lastReflectedAt < REFLECT_MIN_COOLDOWN_MS) return;
  void consolidateWhaleMemory(apiKey, { manual: false }).catch(() => {});
}
