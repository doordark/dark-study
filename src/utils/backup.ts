import { isWhaleSticker } from './whaleExpression';
import { normalizeCourseTasks } from './courseTasks';
export const BACKUP_KEYS = [
  'dark-study-storage', 'dark-study-settings', 'dark-study-whale-memory', 'dark-study-whale-persona',
  'dark-study-whale-pet', 'dark-study-widget-settings', 'dark-study-whale-voice',
  'dark-study-farm', 'dark-study-farm-life-settings', 'dark-study-farm-life-log',
] as const;
export type BackupKey = typeof BACKUP_KEYS[number];
export interface Backup { format: 'dark-study-backup'; version: 1; createdAt: string; data: Partial<Record<BackupKey, unknown>> }
type Obj = Record<string, any>;
const object = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);
const fields: Partial<Record<BackupKey, string[]>> = {
  'dark-study-storage': ['schedules', 'activeScheduleId', 'grades', 'gradeYears', 'activeGradeYearId', 'gradeTypes', 'gradeRules', 'activeGradeRuleId', 'activeGradeSemester', 'courseTasks'],
  'dark-study-settings': ['farmWebSearch', 'reminderEnabled', 'reminderMinutes', 'reminderCount', 'appearance', 'material', 'backgroundTint', 'backgroundEffect', 'whalePhrase', 'renderQuality'],
  'dark-study-whale-memory': ['active', 'messages', 'memory', 'petMessages', 'facts', 'autoMemory'],
  'dark-study-whale-persona': ['persona'], 'dark-study-whale-pet': ['care'],
  'dark-study-widget-settings': ['shape', 'theme', 'accent', 'count'],
};
function safeTree(value: unknown, depth = 0) {
  if (depth > 24) throw new Error('备份数据嵌套过深');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('备份含无效数值');
  if (Array.isArray(value) && value.length > 30000) throw new Error('备份列表过大');
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('备份含无效字段');
    safeTree(item, depth + 1);
  }
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function cleanModule(key: BackupKey, value: unknown): unknown {
  if (key === 'dark-study-whale-voice') { check(value === '0' || value === '1', '语音设置无效'); return value; }
  if (key === 'dark-study-farm-life-log') { check(Array.isArray(value), '居民记录无效'); return value.slice(-40); }
  check(object(value), `${key} 数据无效`);
  const allowed = fields[key];
  if (!allowed) {
    if (key === 'dark-study-farm') check(value.v === 4 && Array.isArray(value.plots) && value.plots.length === 16, '农场存档版本或田地数据无效');
    if (key === 'dark-study-farm-life-settings') check(value.version === 3, '居民设置版本不兼容');
    return value;
  }
  check(object(value.state) && Number.isInteger(value.version ?? 0), '设置存储格式无效');
  check((value.version ?? 0) === (key === 'dark-study-storage' ? 6 : 0), '备份中的数据版本不兼容，请使用对应版本的应用恢复');
  const state = Object.fromEntries(allowed.filter(field => Object.hasOwn(value.state, field)).map(field => [field, value.state[field]]));
  if (key === 'dark-study-storage') {
    if ('courseTasks' in state) {
      const tasks = normalizeCourseTasks(state.courseTasks);
      check(Array.isArray(state.courseTasks) && tasks.length === state.courseTasks.length, '课程待办数据无效');
      state.courseTasks = tasks;
    }
    for (const field of ['schedules', 'grades', 'gradeYears', 'gradeTypes', 'gradeRules']) check(Array.isArray(state[field]), '课表或成绩列表无效');
    check(state.schedules.length && state.gradeYears.length && state.gradeTypes.length && state.gradeRules.length, '课表或成绩分组为空');
    for (const schedule of state.schedules) {
      check(object(schedule) && typeof schedule.id === 'string' && typeof schedule.name === 'string' && Array.isArray(schedule.courses) && Array.isArray(schedule.periods) && typeof schedule.startDate === 'string' && Number.isFinite(schedule.totalWeeks), '课表结构无效');
      for (const course of schedule.courses) check(object(course) && typeof course.id === 'string' && typeof course.name === 'string' && Array.isArray(course.weeks) && course.weeks.every((week: unknown) => Number.isInteger(week) && Number(week) > 0) && Number.isInteger(course.weekday) && course.weekday >= 1 && course.weekday <= 7 && Number.isInteger(course.startPeriod) && Number.isInteger(course.endPeriod), '课程数据无效');
      for (const period of schedule.periods) check(object(period) && typeof period.startTime === 'string' && typeof period.endTime === 'string' && Number.isInteger(period.index), '作息数据无效');
    }
    for (const field of ['grades', 'gradeYears', 'gradeTypes', 'gradeRules']) for (const row of state[field]) check(object(row) && typeof row.id === 'string' && typeof row.name === 'string', '成绩数据无效');
    for (const grade of state.grades) check(typeof grade.score === 'string' && typeof grade.yearId === 'string' && typeof grade.type === 'string', '成绩记录无效');
    for (const rule of state.gradeRules) check(Array.isArray(rule.excludedTypes) && Array.isArray(rule.excludedCourseIds), '成绩规则无效');
    for (const [field, collection] of [['activeScheduleId', 'schedules'], ['activeGradeYearId', 'gradeYears'], ['activeGradeRuleId', 'gradeRules']]) check(state[collection].some((row: Obj) => row.id === state[field]), '备份中的当前分组不存在');
  }
  if (key === 'dark-study-whale-memory') for (const field of ['messages', 'memory', 'petMessages']) {
    check(Array.isArray(state[field]), '聊天记忆无效');
    state[field] = state[field].slice(-200).map((message: unknown) => {
      check(object(message) && typeof message.id === 'string' && typeof message.content === 'string' && ['user', 'assistant'].includes(message.role) && Number.isFinite(message.timestamp), '聊天消息无效');
      if (message.sticker !== undefined) check(isWhaleSticker(message.sticker), '聊天表情数据无效');
      if (message.sources !== undefined) check(Array.isArray(message.sources) && message.sources.every((source: unknown) => object(source) && typeof source.title === 'string' && typeof source.url === 'string' && /^https?:\/\//.test(source.url)), '聊天来源无效');
      // Pending course actions and device-local image files are not portable.
      const { actions: _actions, imageUri, ...rest } = message;
      return { ...rest, ...(typeof imageUri === 'string' && /^https?:\/\//.test(imageUri) ? { imageUri } : {}) };
    });
  }
  if (key === 'dark-study-whale-memory') {
    for (const field of ['active', 'autoMemory']) if (field in state) check(typeof state[field] === 'boolean', '记忆开关无效');
    check(Array.isArray(state.facts), '长期记忆无效');
    for (const fact of state.facts) check(object(fact) && typeof fact.id === 'string' && typeof fact.key === 'string' && typeof fact.text === 'string', '长期记忆条目无效');
    state.facts = state.facts.slice(-60);
  }
  if (key === 'dark-study-whale-persona') check(object(state.persona), '人设数据无效');
  if (key === 'dark-study-whale-pet') check(object(state.care), '桌宠数据无效');
  if (key === 'dark-study-settings') {
    for (const name of ['farmWebSearch', 'reminderEnabled']) if (name in state) check(typeof state[name] === 'boolean', '偏好设置无效');
    for (const name of ['reminderMinutes', 'reminderCount']) if (name in state) check(Number.isFinite(state[name]), '提醒设置无效');
    if ('appearance' in state) check(['system', 'light', 'dark'].includes(state.appearance), '主题设置无效');
    if ('material' in state) check(['flat', 'glass'].includes(state.material), '材质设置无效');
    if ('whalePhrase' in state) check(typeof state.whalePhrase === 'string' && state.whalePhrase.length >= 2 && state.whalePhrase.length <= 12, '召唤口令无效');
    if ('renderQuality' in state) check(['smooth', 'standard', 'beautiful'].includes(state.renderQuality), '画质设置无效');
  }
  return { state, version: value.version ?? 0 };
}
export function parseBackup(text: string): Backup {
  check(text.length <= 20_000_000, '备份文件超过 20 MB');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('文件不是有效的 JSON 备份'); }
  safeTree(value);
  check(object(value) && value.format === 'dark-study-backup' && value.version === 1 && object(value.data), '备份格式或版本不兼容');
  check(typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)), '备份日期无效');
  const data: Backup['data'] = {};
  for (const key of Object.keys(value.data)) {
    check(BACKUP_KEYS.includes(key as BackupKey), '备份包含不支持的数据模块');
    data[key as BackupKey] = cleanModule(key as BackupKey, value.data[key]);
  }
  check(Object.keys(data).length, '备份中没有可恢复的数据');
  return { format: 'dark-study-backup', version: 1, createdAt: value.createdAt, data };
}
export function createBackup(records: readonly (readonly [string, string | null])[], at = new Date()): Backup {
  const data: Backup['data'] = {};
  for (const [key, raw] of records) if (raw !== null && BACKUP_KEYS.includes(key as BackupKey)) data[key as BackupKey] = key === 'dark-study-whale-voice' ? raw : JSON.parse(raw);
  return parseBackup(JSON.stringify({ format: 'dark-study-backup', version: 1, createdAt: at.toISOString(), data }));
}
export function backupSummary(backup: Backup) {
  const main = backup.data['dark-study-storage'] as Obj | undefined;
  const whale = backup.data['dark-study-whale-memory'] as Obj | undefined;
  const farm = backup.data['dark-study-farm'] as Obj | undefined;
  return { modules: Object.keys(backup.data).length, schedules: main?.state.schedules.length ?? 0,
    courses: main?.state.schedules.reduce((count: number, s: Obj) => count + s.courses.length, 0) ?? 0,
    tasks: main?.state.courseTasks?.length ?? 0,
    grades: main?.state.grades.length ?? 0,
    messages: ['messages', 'memory', 'petMessages'].reduce((count, field) => count + (whale?.state[field]?.length ?? 0), 0),
    farm: !!farm, coins: farm?.coins ?? 0 };
}
function union(current: Obj[], incoming: Obj[], cap = 30000) {
  const seen = new Set(current.map(row => row.id));
  return [...current, ...incoming.filter(row => !seen.has(row.id) && !!seen.add(row.id))].slice(0, cap);
}
export function buildRestorePlan(backup: Backup, current: readonly (readonly [string, string | null])[], mode: 'replace' | 'merge'): [string, string][] {
  const disk = new Map(current);
  return Object.entries(backup.data).map(([name, raw]) => {
    const key = name as BackupKey;
    let incoming = cleanModule(key, raw) as Obj;
    const existingRaw = disk.get(key);
    const existing = existingRaw ? key === 'dark-study-whale-voice' ? existingRaw : JSON.parse(existingRaw) : undefined;
    if (key === 'dark-study-settings') incoming = { ...incoming, state: { ...incoming.state, apiKey: existing?.state?.apiKey ?? '', backgroundImage: existing?.state?.backgroundImage ?? null } };
    if (key === 'dark-study-storage' && !('courseTasks' in incoming.state) && Array.isArray(existing?.state?.courseTasks)) {
      incoming.state.courseTasks = normalizeCourseTasks(existing.state.courseTasks);
    }
    if (mode === 'merge' && existing !== undefined) {
      if (key === 'dark-study-storage') {
        incoming = { ...incoming, state: { ...incoming.state, ...existing.state } };
        for (const field of ['schedules', 'grades', 'gradeYears', 'gradeTypes', 'gradeRules']) incoming.state[field] = union(existing.state[field], (raw as Obj).state[field]);
        incoming.state.courseTasks = union(normalizeCourseTasks(existing.state.courseTasks), normalizeCourseTasks((raw as Obj).state.courseTasks), 3000);
      } else if (key === 'dark-study-whale-memory') {
        incoming = { ...incoming, state: { ...incoming.state, ...existing.state } };
        for (const field of ['messages', 'memory', 'petMessages', 'facts']) incoming.state[field] = union(existing.state[field] ?? [], (raw as Obj).state[field] ?? [], field === 'facts' ? 60 : 200);
        for (const field of ['messages', 'memory', 'petMessages']) incoming.state[field].sort((a: Obj, b: Obj) => a.timestamp - b.timestamp);
      } else return [key, existingRaw!] as [string, string];
    }
    return [key, key === 'dark-study-whale-voice' ? String(incoming) : JSON.stringify(incoming)];
  });
}
