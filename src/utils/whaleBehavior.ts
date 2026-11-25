import type { Course, PetActionKind, Schedule } from "@/types";
import type { WhaleCare } from "@/store/useWhalePet";
import type { WhaleEmotion } from "@/utils/whaleEmotion";
import type { WhalePersona } from "@/utils/whalePersona";
import { describeWhaleEmotion } from "@/utils/whaleEmotion";
import { getCourseTime, getDateInfo, getSemesterStatus } from "@/utils/time";

export type PetAutonomousDecision =
  | { kind: "walk"; bubble?: string }
  | { kind: "peek"; bubble: string }
  | { kind: "action"; action: PetActionKind; bubble?: string }
  | { kind: "bubble"; bubble: string };

export interface UpcomingCourseAlert {
  courseId: string;
  name: string;
  classroom: string;
  startTime: string;
  minutesUntil: number;
  summary: string;
  /** 发给原生悬浮窗用于离线倒计时提醒的毫秒时间戳 */
  startAtMs: number;
}

const pick = <T,>(pool: readonly T[]): T =>
  pool[Math.floor(Math.random() * pool.length)];

/** 查找今天即将开始的下一节课（默认提前 20 分钟内触发提醒，同时可提取未来 3 小时内下节课给原生桌宠） */
export function findUpcomingCourse(
  schedule: Schedule | undefined,
  now = new Date(),
  lookaheadMinutes = 20,
): UpcomingCourseAlert | null {
  if (!schedule || !schedule.courses.length) return null;
  const semester = getSemesterStatus(schedule, now);
  if (semester.phase !== "active") return null;
  const { weekIndex, weekday } = getDateInfo(schedule.startDate, now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let best: { course: Course; startMinutes: number; startTime: string; diff: number } | null = null;
  for (const course of schedule.courses) {
    if (course.weekday !== weekday || !course.weeks.includes(weekIndex)) continue;
    const t = getCourseTime(schedule.periods, course.startPeriod, course.endPeriod, course);
    if (!t.startMinutes) continue;
    const diff = t.startMinutes - nowMinutes;
    if (diff >= 1 && diff <= lookaheadMinutes && (!best || diff < best.diff)) {
      best = { course, startMinutes: t.startMinutes, startTime: t.startTime, diff };
    }
  }
  if (!best) return null;
  const place = best.course.classroom ? `（${best.course.classroom}）` : "";
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return {
    courseId: best.course.id,
    name: best.course.name,
    classroom: best.course.classroom,
    startTime: best.startTime,
    minutesUntil: best.diff,
    summary: `还有 ${best.diff} 分钟要上「${best.course.name}」${place}，别忘带东西哦～`,
    startAtMs: dayStart + best.startMinutes * 60_000,
  };
}

/** 根据人设滑条与情绪生成贴合性格的摸头/戳肚/闲聊气泡 */
export function pickPersonaLine(
  category: "headpat" | "poke_belly" | "poke_spam" | "shake_dizzy" | "peek" | "hungry" | "lonely" | "night" | "meal" | "ambient" | "close" | "throw_snack",
  persona: WhalePersona,
  emotion?: WhaleEmotion,
): string {
  const { tsundere, affection, warmth, playfulness } = persona.traits;
  const highTsun = tsundere >= 68;
  const highWarm = warmth >= 72;
  const highPlay = playfulness >= 68;
  const highAff = affection >= 68;
  const moodId = emotion ? describeWhaleEmotion(emotion).id : "calm";

  switch (category) {
    case "headpat":
      if (highTsun) {
        return pick([
          "唔…才不是喜欢被摸头呢，头发都要揉乱啦。",
          "哼，看在是{{user}}的份上，多摸两下也不是不行…",
          "别摸太久呀！……好吧，其实还挺舒服的。",
        ]);
      }
      if (highAff || highWarm) {
        return pick([
          "嘿嘿…{{user}}的手好暖，再多摸一小会儿嘛～",
          "（眯起眼睛蹭蹭）有{{user}}摸头，今天也很安心。",
          "唔嗯～充电完成！感觉尾巴都能摇出风来啦。",
        ]);
      }
      return pick([
        "嗯，谢谢{{user}}，感觉轻松多了。",
        "（轻轻蹭了蹭）心情变好啦。",
      ]);

    case "poke_belly":
      if (highTsun) {
        return pick([
          "喂！摸头可以，戳肚子不行！",
          "再戳我就把你的白米饭全吃光咯！",
          "干嘛老戳我呀，{{user}}是不是手痒了？",
        ]);
      }
      if (highPlay) {
        return pick([
          "呀！痒痒的～{{user}}别欺负小鲸鱼呀！",
          "再戳我就鼓成一只蓝气球飘走咯！",
          "戳我干嘛呀～要不要看我转个圈？",
        ]);
      }
      return pick([
        "在呢在呢，{{user}}找我有事吗？",
        "戳我一下，我就多陪你一会儿。",
      ]);

    case "poke_spam":
      if (highTsun) {
        return pick([
          "够了啦！再连戳我真的要气鼓鼓躲到边上去了！",
          "呜哇——{{user}}怎么欺负鱼呀，罚你喂我白饭！",
        ]);
      }
      return pick([
        "哎呀哎呀投降啦！头都要被{{user}}点晕咯～",
        "好啦好啦我在这儿呢，{{user}}别戳啦，抱抱行不行？",
      ]);

    case "shake_dizzy":
      return pick([
        "呜哇哇——别晃啦，鱼脑子要晃成浆糊了…",
        "天旋地转…{{user}}快放我下来啦！",
        "晕、晕了…眼冒小星星了啦！",
      ]);

    case "peek":
      if (highAff) {
        return pick([
          "（从边上悄悄探头）我不挡屏幕，偷偷看着{{user}}～",
          "（晃晃小脚）坐边上陪你，叫我我就蹦出来！",
        ]);
      }
      return pick([
        "（贴在屏幕边探头）{{user}}在忙什么呀？",
        "我就在边上歇歇脚，不打扰你哦。",
      ]);

    case "hungry":
      return pick(
        highTsun
          ? [
              "才、才没有饿呢……只是肚子刚好咕噜了一声。",
              "喂，{{user}}，是不是该进贡白米饭了？",
            ]
          : [
              "肚子空空的…{{user}}有没有白饭团子？",
              "呜，再不吃东西尾巴都要没力气摆了…",
            ],
      );

    case "lonely":
      return pick(
        highTsun
          ? [
              "哼，忙完记得理我一下啊，我才没在等你呢。",
              "自己晃悠了好久，{{user}}都不看我一眼。",
            ]
          : [
              "……{{user}}是不是把我忘了呀。",
              "我自己在屏幕边游了好久，点一下我就好～",
            ],
      );

    case "night":
      return pick(
        highWarm
          ? [
              "这么晚啦，{{user}}早点歇息吧，明天我再陪你。",
              "夜深了眼睛会累的，收完手头这一小段就睡好不好？",
            ]
          : [
              "熬夜对鲸鱼和{{user}}都不好哦，快去睡觉啦！",
              "（打哈欠）好困呀…{{user}}还不睡吗？",
            ],
      );

    case "meal":
      return pick([
        "到饭点啦！{{user}}今天吃什么，顺便分我一口白饭嘛～",
        "闻到饭香了！学习再忙也要好好吃饭呀。",
      ]);

    case "throw_snack":
      return pick([
        "哇！是团子——我来接住啦！嗷呜！",
        "白饭团子飞过来啦！冲鸭——！",
      ]);

    case "close":
      return pick([
        "{{user}}在的地方，我就想多待一会儿。",
        "有你在旁边，连发呆都觉得好开心呀。",
        "今天也一起稳稳推进吧，我一直陪着你。",
      ]);

    case "ambient":
    default:
      if (moodId === "pouty" || moodId === "anxious") {
        return pick([
          "（小声嘀咕）要是有人摸摸头就好了…",
          "哼，轻轻晃会儿尾巴自己哄自己。",
        ]);
      }
      if (highPlay) {
        return pick([
          "（晃晃尾巴）无聊的话点我三下，陪你聊天或跳支舞呀！",
          "偷偷巡逻一圈，看看屏幕里有没有藏着小鱼干～",
          "伸个大懒腰！{{user}}也活动一下肩膀吧。",
        ]);
      }
      return pick([
        "{{user}}，看屏幕久了记得眨眨眼歇会儿。",
        "我不占地方，就在边上乖乖陪你。",
        "悄悄把尾巴卷好，等你忙完再来找我。",
      ]);
  }
}

/**
 * 自主行为决策大脑（Autonomous Pet Decision Engine）：
 * 根据饱食/心情/情绪/时间段/位置综合决定下一个主动行为，
 * 让桌宠会自己散步、贴边探头、跳舞、转圈、坐下学习、打盹或关心你。
 */
export function decideAutonomousBehavior(params: {
  care: WhaleCare;
  persona: WhalePersona;
  emotion?: WhaleEmotion;
  nearEdge: boolean;
  hour: number;
  upcomingCourse?: UpcomingCourseAlert | null;
  remindedCourseId?: string;
}): PetAutonomousDecision {
  const { care, persona, emotion, nearEdge, hour, upcomingCourse, remindedCourseId } = params;

  // 1. 课前提醒最高优先级（同一节课只提醒一次）
  if (upcomingCourse && upcomingCourse.courseId !== remindedCourseId) {
    return { kind: "action", action: "wave", bubble: upcomingCourse.summary };
  }

  const roll = Math.random();

  // 2. 生理与情绪需求优先
  if (care.fullness < 25 && roll < 0.55) {
    return { kind: "bubble", bubble: pickPersonaLine("hungry", persona, emotion) };
  }
  if (care.mood < 32 && roll < 0.5) {
    return { kind: "bubble", bubble: pickPersonaLine("lonely", persona, emotion) };
  }

  // 3. 深夜劝睡 / 饭点提醒
  if ((hour >= 23 || hour < 5) && roll < 0.35) {
    return { kind: "action", action: "sleep", bubble: pickPersonaLine("night", persona, emotion) };
  }
  if ((hour === 12 || hour === 18) && roll < 0.24) {
    return { kind: "bubble", bubble: pickPersonaLine("meal", persona, emotion) };
  }

  // 4. 靠近屏幕左右边缘时：高概率贴边探头坐下晃脚（Shimeji 风格）
  if (nearEdge && roll < 0.36) {
    return { kind: "peek", bubble: pickPersonaLine("peek", persona, emotion) };
  }

  // 5. 活泼度越高，越爱自主跑动与做动作
  const playFactor = persona.traits.playfulness / 100;
  if (roll < 0.28 + playFactor * 0.16) {
    return { kind: "walk" };
  }
  if (roll < 0.52 + playFactor * 0.18) {
    const actions: PetActionKind[] =
      hour >= 8 && hour <= 22
        ? ["jump", "wave", "spin", "dance", "study"]
        : ["wave", "study", "sleep"];
    return { kind: "action", action: pick(actions) };
  }
  if (roll < 0.78) {
    return { kind: "peek", bubble: pickPersonaLine("peek", persona, emotion) };
  }
  return {
    kind: "bubble",
    bubble:
      care.bond > 75 && Math.random() < 0.45
        ? pickPersonaLine("close", persona, emotion)
        : pickPersonaLine("ambient", persona, emotion),
  };
}
