import type { GradeRule, GradeType, Schedule } from "@/types";
import { resolveSemester } from "@/utils/time";

/** 默认作息（12 节制，典型国内高校） */
export const DEFAULT_PERIODS = [
  { index: 1, label: "第1节", startTime: "08:00", endTime: "08:45" },
  { index: 2, label: "第2节", startTime: "08:55", endTime: "09:40" },
  { index: 3, label: "第3节", startTime: "10:00", endTime: "10:45" },
  { index: 4, label: "第4节", startTime: "10:55", endTime: "11:40" },
  { index: 5, label: "第5节", startTime: "14:00", endTime: "14:45" },
  { index: 6, label: "第6节", startTime: "14:55", endTime: "15:40" },
  { index: 7, label: "第7节", startTime: "16:00", endTime: "16:45" },
  { index: 8, label: "第8节", startTime: "16:55", endTime: "17:40" },
  { index: 9, label: "第9节", startTime: "19:00", endTime: "19:45" },
  { index: 10, label: "第10节", startTime: "19:55", endTime: "20:40" },
  { index: 11, label: "第11节", startTime: "20:50", endTime: "21:35" },
  { index: 12, label: "第12节", startTime: "21:45", endTime: "22:30" },
];

const allWeeks = (to: number, from = 1) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** 示例课表：学期按当前真实日期解析（上/下/短三种之一） */
const SAMPLE_SEM = resolveSemester();
export const SAMPLE_SCHEDULE: Schedule = {
  id: "sample",
  name: SAMPLE_SEM.name,
  kind: SAMPLE_SEM.kind,
  startDate: SAMPLE_SEM.startDate,
  endDate: SAMPLE_SEM.endDate,
  totalWeeks: SAMPLE_SEM.totalWeeks,
  periods: DEFAULT_PERIODS,
  courses: [
    {
      id: "c1",
      name: "数据结构与算法",
      teacher: "陈明远",
      classroom: "教三 305",
      weekday: 1,
      startPeriod: 1,
      endPeriod: 2,
      weeks: allWeeks(SAMPLE_SEM.totalWeeks),
      color: "sky",
      credits: 4,
    },
    {
      id: "c2",
      name: "高等数学 A",
      teacher: "林岚",
      classroom: "教一 201",
      weekday: 1,
      startPeriod: 3,
      endPeriod: 4,
      weeks: allWeeks(SAMPLE_SEM.totalWeeks),
      color: "violet",
      credits: 5,
    },
    {
      id: "c3",
      name: "大学英语",
      teacher: "Sophia Wang",
      classroom: "外语楼 402",
      weekday: 2,
      startPeriod: 3,
      endPeriod: 4,
      weeks: allWeeks(SAMPLE_SEM.totalWeeks),
      color: "emerald",
      credits: 2,
    },
    {
      id: "c4",
      name: "操作系统原理",
      teacher: "张浩宇",
      classroom: "教二 118",
      weekday: 2,
      startPeriod: 5,
      endPeriod: 6,
      weeks: allWeeks(SAMPLE_SEM.totalWeeks),
      color: "cyan",
      credits: 4,
    },
    {
      id: "c5",
      name: "计算机网络",
      teacher: "李思远",
      classroom: "教三 210",
      weekday: 3,
      startPeriod: 1,
      endPeriod: 2,
      weeks: allWeeks(SAMPLE_SEM.totalWeeks),
      color: "amber",
      credits: 3,
    },
    {
      id: "c6",
      name: "体育（篮球）",
      teacher: "赵铁柱",
      classroom: "风雨操场",
      weekday: 3,
      startPeriod: 7,
      endPeriod: 8,
      weeks: allWeeks(SAMPLE_SEM.totalWeeks),
      color: "rose",
      credits: 1,
    },
    {
      id: "c7",
      name: "编译原理",
      teacher: "陈明远",
      classroom: "教三 305",
      weekday: 4,
      startPeriod: 3,
      endPeriod: 4,
      weeks: allWeeks(Math.min(12, SAMPLE_SEM.totalWeeks)),
      color: "sky",
      credits: 3,
    },
    {
      id: "c8",
      name: "机器学习导论",
      teacher: "周雪",
      classroom: "实验楼 A305",
      weekday: 4,
      startPeriod: 5,
      endPeriod: 7,
      weeks: allWeeks(SAMPLE_SEM.totalWeeks),
      color: "violet",
      credits: 3,
    },
    {
      id: "c9",
      name: "形势与政策",
      teacher: "王建国",
      classroom: "教一 100",
      weekday: 5,
      startPeriod: 3,
      endPeriod: 4,
      weeks: allWeeks(SAMPLE_SEM.totalWeeks).filter((w) => w % 2 === 1),
      color: "emerald",
      credits: 1,
    },
    {
      id: "c10",
      name: "软件工程实践",
      teacher: "张浩宇",
      classroom: "实验楼 B210",
      weekday: 5,
      startPeriod: 5,
      endPeriod: 6,
      weeks: allWeeks(
        SAMPLE_SEM.totalWeeks,
        Math.min(3, SAMPLE_SEM.totalWeeks),
      ),
      color: "cyan",
      credits: 2,
    },
    {
      id: "c11",
      name: "学术写作工作坊",
      teacher: "林岚",
      classroom: "图书馆报告厅",
      weekday: 6,
      startPeriod: 3,
      endPeriod: 4,
      weeks: allWeeks(Math.min(8, SAMPLE_SEM.totalWeeks)).filter(
        (w) => w % 2 === 0,
      ),
      color: "amber",
      credits: 1,
    },
  ],
};

/** 默认课程类型 */
export const DEFAULT_GRADE_TYPES: GradeType[] = [
  { id: "required", name: "必修课" },
  { id: "elective", name: "选修课" },
  { id: "general", name: "通识选修课" },
];

/** 默认计算规则：全部成绩计入（用户可复制为「综测」「保研」等命名规则） */
export const DEFAULT_GRADE_RULES: GradeRule[] = [
  {
    id: "default",
    name: "全部计入",
    excludedTypes: [],
    excludedCourseIds: [],
  },
];
