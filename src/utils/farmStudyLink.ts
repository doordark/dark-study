import type { GradeRecord, Schedule } from '@/types';
import { mondayOf, parseIsoDate } from './time';

export interface FarmStudyContext {
  enabled: boolean;
  weekday: number; // 1..7
  weekNumber: number | null;
  todayCourseCount: number;
  workload: 'free' | 'light' | 'busy' | 'packed';
  lateNight: boolean;
  recentGradesCount: number;
  /** 仅包含宏观、无敏感明细的关怀摘要，供农场对话与日报温柔联动 */
  brief: string;
  gazetteNote: string;
}

/**
 * 纯本地计算当前学习节奏宏观摘要（绝不包含具体成绩分数或隐私明细），
 * 让 doordoor 农场的家人能温柔感知你今天是不是满课、周末休息或深夜还在学习。
 */
export function summarizeStudyDay(
  schedule: Schedule | undefined,
  grades: readonly GradeRecord[] | undefined,
  at: number,
  enabled = true,
): FarmStudyContext {
  const date = new Date(at);
  const hour = date.getHours();
  const lateNight = hour >= 23 || hour < 5;
  const weekday = date.getDay() === 0 ? 7 : date.getDay();

  if (!enabled) {
    return {
      enabled: false,
      weekday,
      weekNumber: null,
      todayCourseCount: 0,
      workload: 'free',
      lateNight,
      recentGradesCount: 0,
      brief: '',
      gazetteNote: '',
    };
  }

  let weekNumber: number | null = null;
  let todayCourseCount = 0;
  if (schedule?.startDate) {
    const startMon = mondayOf(parseIsoDate(schedule.startDate));
    const todayMon = mondayOf(date);
    const diffWeeks = Math.floor((todayMon.getTime() - startMon.getTime()) / (7 * 86_400_000)) + 1;
    if (diffWeeks >= 1 && diffWeeks <= schedule.totalWeeks) {
      weekNumber = diffWeeks;
      todayCourseCount = schedule.courses.filter(
        c => c.weekday === weekday && c.weeks.includes(diffWeeks),
      ).length;
    }
  }

  const workload: FarmStudyContext['workload'] =
    todayCourseCount >= 5 ? 'packed' : todayCourseCount >= 3 ? 'busy' : todayCourseCount >= 1 ? 'light' : 'free';
  const recentGradesCount = grades?.length ?? 0;

  let brief = '';
  let gazetteNote = '';
  if (lateNight) {
    brief = `现实里已是深夜（${hour}点），客人今天${todayCourseCount ? `上了 ${todayCourseCount} 节课` : '忙了一天'}还在刷手机/学习，可以自然温柔关心一句早点休息，别说教。`;
    gazetteNote = '深夜点灯提醒：顾在厨房留了一碗热汤，门边小灯一直亮着，忙完早点歇着呀。';
  } else if (workload === 'packed') {
    brief = `现实里客人今天排了 ${todayCourseCount} 节满课，来农场喘口气；聊天时可以体贴轻松一点，不用讲大道理。`;
    gazetteNote = `学习贴士：今天现实里排了 ${todayCourseCount} 节课，辛苦啦！来农场收收菜、听玉洁哼两句放松一下吧。`;
  } else if (workload === 'busy') {
    brief = `现实里客人今天有 ${todayCourseCount} 节课，节奏不算轻松，顺便祝他上课顺利。`;
    gazetteNote = `今日节奏：现实里有 ${todayCourseCount} 节课，课间记得抬头看看农场里刚发芽的小苗。`;
  } else if (workload === 'light') {
    brief = `现实里客人今天只有 ${todayCourseCount} 节课，节奏相对松快。`;
    gazetteNote = `轻松一日：现实里今天只有 ${todayCourseCount} 节课，刚好有空来院子里和家人们唠唠嗑。`;
  } else {
    brief = weekday >= 6
      ? '今天是周末，现实里没排课，客人在农场轻松摸鱼。'
      : '现实里今天没排课，客人时间比较充裕。';
    gazetteNote = weekday >= 6
      ? '周末清闲时光：今天没排课，一家人正打算在院子里好好晒晒太阳！'
      : '难得的无课日：院子里的风正好，适合和家人们开场家庭群聊。';
  }

  return {
    enabled: true,
    weekday,
    weekNumber,
    todayCourseCount,
    workload,
    lateNight,
    recentGradesCount,
    brief,
    gazetteNote,
  };
}
