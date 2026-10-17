import type { CourseColor } from '@/types';

/**
 * 课程主题色板 —— 全部为 Tailwind 完整类名（避免动态拼接导致样式丢失）。
 * solid 用于 Reanimated 阴影 / 光晕等需要运行时颜色值的场景。
 */
export const coursePalette: Record<
  CourseColor,
  { tint: string; bar: string; text: string; badge: string; solid: string }
> = {
  sky: {
    tint: 'bg-sky-400/15',
    bar: 'bg-sky-400',
    text: 'text-sky-300',
    badge: 'bg-sky-400/20 border-sky-300/40',
    solid: '#38BDF8',
  },
  violet: {
    tint: 'bg-violet-400/15',
    bar: 'bg-violet-400',
    text: 'text-violet-300',
    badge: 'bg-violet-400/20 border-violet-300/40',
    solid: '#A78BFA',
  },
  emerald: {
    tint: 'bg-emerald-400/15',
    bar: 'bg-emerald-400',
    text: 'text-emerald-300',
    badge: 'bg-emerald-400/20 border-emerald-300/40',
    solid: '#34D399',
  },
  amber: {
    tint: 'bg-amber-400/15',
    bar: 'bg-amber-400',
    text: 'text-amber-300',
    badge: 'bg-amber-400/20 border-amber-300/40',
    solid: '#FBBF24',
  },
  rose: {
    tint: 'bg-rose-400/15',
    bar: 'bg-rose-400',
    text: 'text-rose-300',
    badge: 'bg-rose-400/20 border-rose-300/40',
    solid: '#FB7185',
  },
  cyan: {
    tint: 'bg-cyan-400/15',
    bar: 'bg-cyan-400',
    text: 'text-cyan-300',
    badge: 'bg-cyan-400/20 border-cyan-300/40',
    solid: '#22D3EE',
  },
};

export const courseColorNames: CourseColor[] = [
  'sky',
  'violet',
  'emerald',
  'amber',
  'rose',
  'cyan',
];

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
