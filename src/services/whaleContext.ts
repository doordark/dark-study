import { useWhaleMemory, type WhaleCognitiveUpdate } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhalePet } from "@/store/useWhalePet";
import { buildWhalePersonaPrompt, normalizeWhaleHistory } from "@/utils/whalePersona";
import { buildWhaleMemoryPrompt, WHALE_MEMORY_INSTRUCTIONS, type WhaleHistoryMessage } from "@/utils/whaleMemory";
import { buildWhaleEmotionPrompt, decayWhaleEmotion, resolveBondStage } from "@/utils/whaleEmotion";

export interface WhaleLiveStudySnapshot {
  nowLabel: string;
  todayCourses?: string;
  nextCourseHint?: string;
  pendingTasks?: string;
  freeSlots?: string;
  gradesSummary?: string;
  attendanceAlerts?: string;
  focusSummary?: string;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

export function formatTimeContext(now = Date.now()): string {
  const d = new Date(now);
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const period =
    h < 5 ? "深夜" : h < 8 ? "清晨" : h < 11 ? "上午" : h < 14 ? "中午" : h < 18 ? "下午" : h < 22 ? "晚上" : "夜深";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${WEEKDAYS[d.getDay()]} ${String(h).padStart(2, "0")}:${min}（${period}）`;
}

export function buildLiveContextBlock(snapshot?: WhaleLiveStudySnapshot, now = Date.now()): string {
  const lines = [`- 当前时间：${snapshot?.nowLabel ?? formatTimeContext(now)}`];
  if (snapshot?.nextCourseHint) lines.push(`- 近期课程提醒：${snapshot.nextCourseHint}`);
  if (snapshot?.todayCourses) lines.push(`- 今日课程概览：${snapshot.todayCourses}`);
  if (snapshot?.pendingTasks) lines.push(`- 未完成课程待办：${snapshot.pendingTasks}`);
  if (snapshot?.freeSlots) lines.push(`- 本周空课安排：${snapshot.freeSlots}`);
  if (snapshot?.gradesSummary) lines.push(`- 成绩与绩点概况：${snapshot.gradesSummary}`);
  if (snapshot?.attendanceAlerts) lines.push(`- 考勤红线预警：${snapshot.attendanceAlerts}`);
  if (snapshot?.focusSummary) lines.push(`- 近期学习专注：${snapshot.focusSummary}`);
  return `【现实时间与生活感知（用于自然接话、提醒或关心作息，不生硬播报）】\n${lines.join("\n")}`;
}

/** 每次请求读取最新保存的人设、情绪、羁绊与四层记忆；两种聊天入口共享全部状态。 */
export function createWhaleContext(
  history: WhaleHistoryMessage[],
  extract = true,
  liveSnapshot?: WhaleLiveStudySnapshot,
) {
  const state = useWhaleMemory.getState();
  const persona = useWhalePersona.getState().persona;
  const startedAt = Date.now();
  const care = useWhalePet.getState().care;
  const emotion = decayWhaleEmotion(state.emotion, startedAt, persona);
  const bondStage = resolveBondStage(state.bond, care.bond, state.facts.length);
  const gapMinutes =
    state.lastInteractionAt > 0 ? Math.max(0, Math.round((startedAt - state.lastInteractionAt) / 60_000)) : undefined;

  const logs = [...new Map([...state.memory, ...state.messages, ...state.petMessages].map((m) => [m.id, m])).values()]
    .sort((a, b) => a.timestamp - b.timestamp);
  const latest = history.filter((m) => m.role === "user").at(-1);

  const memoryPrompt = buildWhaleMemoryPrompt(
    state.facts,
    normalizeWhaleHistory(logs, persona),
    history,
    {
      episodes: state.episodes,
      openLoops: state.openLoops,
      reflections: state.reflections,
      now: startedAt,
    },
  );
  const emotionPrompt = buildWhaleEmotionPrompt(emotion, bondStage, state.bond, care, gapMinutes);
  const livePrompt = buildLiveContextBlock(liveSnapshot, startedAt);

  return {
    prompt: `${buildWhalePersonaPrompt(persona)}\n${emotionPrompt}\n${livePrompt}\n${memoryPrompt}${extract && state.autoMemory ? WHALE_MEMORY_INSTRUCTIONS : "\n不要生成 memoryUpdates、episode 或 openLoop。"}`,
    history: normalizeWhaleHistory(history, persona),
    remember: (payload: unknown) => {
      if (!extract) return;
      const store = useWhaleMemory.getState();
      // 兼容旧调用（直接传 memoryUpdates 数组）与新认知对象（包含 memoryUpdates / episode / openLoop / moodShift）
      if (Array.isArray(payload)) {
        store.learn(payload, latest, state.revision, startedAt);
      } else if (payload && typeof payload === "object") {
        store.learnCognitive(payload as WhaleCognitiveUpdate, latest, state.revision, startedAt);
      }
    },
  };
}
