import { isAiProviderId, normalizeBaseUrl } from '../constants/aiProviders';
import { isWhaleSticker } from './whaleExpression';
import { normalizeCourseTasks } from './courseTasks';
import {
  normalizeAttendanceRecord,
  normalizeCourseFocusLog,
  normalizePendingFarmReward,
} from './studyProgress';
export const BACKUP_KEYS = [
  'dark-study-storage', 'dark-study-settings', 'dark-study-whale-memory', 'dark-study-whale-persona',
  'dark-study-whale-pet', 'dark-study-widget-settings', 'dark-study-whale-voice',
  'dark-study-whale-voice-config', 'dark-study-sound-effects',
  'dark-study-farm', 'dark-study-farm-life-settings', 'dark-study-farm-life-log',
  'dark-study-study-progress', 'dark-study-peer-schedules',
] as const;
export type BackupKey = typeof BACKUP_KEYS[number];
export interface Backup { format: 'dark-study-backup'; version: 1; createdAt: string; data: Partial<Record<BackupKey, unknown>> }
type Obj = Record<string, any>;
const object = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);
const fields: Partial<Record<BackupKey, string[]>> = {
  'dark-study-storage': ['schedules', 'activeScheduleId', 'grades', 'gradeYears', 'activeGradeYearId', 'gradeTypes', 'gradeRules', 'activeGradeRuleId', 'activeGradeSemester', 'courseTasks'],
  'dark-study-settings': ['farmWebSearch', 'reminderEnabled', 'reminderMinutes', 'reminderCount', 'appearance', 'material', 'backgroundDim', 'backgroundTint', 'backgroundEffect', 'defaultScheduleView', 'showWeekend', 'showOtherWeeks', 'compactWeekGrid', 'whalePhrase', 'renderQuality', 'gpaScale', 'aiProvider', 'aiBaseUrl', 'aiTextModel', 'aiVisionModel', 'updateMirrorPrefix', 'whaleShareGrades', 'liveClassNotification'],
  'dark-study-whale-memory': [
    'active', 'messages', 'memory', 'petMessages', 'facts', 'episodes', 'openLoops', 'reflections',
    'emotion', 'bond', 'autoMemory', 'autoReflect', 'turnsSinceReflect', 'lastReflectedAt', 'lastInteractionAt',
  ],
  'dark-study-whale-persona': ['persona'], 'dark-study-whale-pet': ['care'],
  'dark-study-widget-settings': ['shape', 'theme', 'accent', 'style', 'mode', 'count'],
  'dark-study-study-progress': ['attendanceByCourse', 'customAbsenceLimits', 'focusLogs', 'pendingFarmRewards'],
  'dark-study-peer-schedules': ['peers'],
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
  if (key === 'dark-study-sound-effects') { check(value === '0' || value === '1', '音效设置无效'); return value; }
  if (key === 'dark-study-whale-voice-config') {
    check(object(value), '语音配置无效');
    const clean: Obj = {};
    if (typeof value.engine === 'string' && ['auto', 'breezeblue', 'siliconflow', 'edge', 'cute_sfx', 'system'].includes(value.engine)) clean.engine = value.engine;
    if (typeof value.breezeVoiceId === 'string') clean.breezeVoiceId = value.breezeVoiceId.slice(0, 128);
    if (typeof value.breezeVoiceName === 'string') clean.breezeVoiceName = value.breezeVoiceName.slice(0, 64);
    if (typeof value.siliconVoice === 'string') clean.siliconVoice = value.siliconVoice.slice(0, 180);
    if (typeof value.edgeVoice === 'string' && ['zh-CN-XiaoyiNeural', 'zh-CN-XiaoshuangNeural'].includes(value.edgeVoice)) clean.edgeVoice = value.edgeVoice;
    if (typeof value.fallbackToSystem === 'boolean') clean.fallbackToSystem = value.fallbackToSystem;
    return clean;
  }
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
    for (const field of ['active', 'autoMemory', 'autoReflect']) if (field in state) check(typeof state[field] === 'boolean', '记忆开关无效');
    check(Array.isArray(state.facts), '长期记忆无效');
    for (const fact of state.facts) check(object(fact) && typeof fact.id === 'string' && typeof fact.key === 'string' && typeof fact.text === 'string', '长期记忆条目无效');
    state.facts = state.facts.slice(-100);
    if ('episodes' in state) {
      check(Array.isArray(state.episodes), '情景回忆无效');
      for (const ep of state.episodes) check(object(ep) && typeof ep.id === 'string' && typeof ep.summary === 'string', '情景回忆条目无效');
      state.episodes = state.episodes.slice(-50);
    }
    if ('openLoops' in state) {
      check(Array.isArray(state.openLoops), '近期牵挂无效');
      for (const loop of state.openLoops) check(object(loop) && typeof loop.id === 'string' && typeof loop.topic === 'string', '牵挂条目无效');
      state.openLoops = state.openLoops.slice(-20);
    }
    if ('reflections' in state) {
      check(Array.isArray(state.reflections), '反思手账无效');
      for (const ref of state.reflections) check(object(ref) && typeof ref.id === 'string' && typeof ref.text === 'string', '反思条目无效');
      state.reflections = state.reflections.slice(-24);
    }
    if ('emotion' in state) check(object(state.emotion), '情绪状态无效');
    if ('bond' in state) check(object(state.bond), '羁绊数据无效');
  }
  if (key === 'dark-study-whale-persona') check(object(state.persona), '人设数据无效');
  if (key === 'dark-study-whale-pet') check(object(state.care), '桌宠数据无效');
  if (key === 'dark-study-settings') {
    for (const name of ['farmWebSearch', 'reminderEnabled', 'showWeekend', 'showOtherWeeks', 'compactWeekGrid', 'whaleShareGrades', 'liveClassNotification']) if (name in state) check(typeof state[name] === 'boolean', '偏好设置无效');
    for (const name of ['reminderMinutes', 'reminderCount']) if (name in state) check(Number.isFinite(state[name]), '提醒设置无效');
    if ('backgroundDim' in state) check(typeof state.backgroundDim === 'number' && Number.isFinite(state.backgroundDim) && state.backgroundDim >= 0 && state.backgroundDim <= 0.7, '背景遮罩设置无效');
    if ('defaultScheduleView' in state) check(['day', 'week'].includes(state.defaultScheduleView), '默认课表视图设置无效');
    if ('appearance' in state) check(['system', 'light', 'dark'].includes(state.appearance), '主题设置无效');
    if ('material' in state) check(['flat', 'glass', 'frosted', 'clear'].includes(state.material), '材质设置无效');
    if ('whalePhrase' in state) check(typeof state.whalePhrase === 'string' && state.whalePhrase.length >= 2 && state.whalePhrase.length <= 12, '召唤口令无效');
    if ('renderQuality' in state) check(['smooth', 'standard', 'beautiful'].includes(state.renderQuality), '画质设置无效');
    if ('gpaScale' in state) check(['five', 'four_std', 'four_pku', 'four_three', 'four_linear'].includes(state.gpaScale), '绩点制设置无效');
    if ('aiProvider' in state) check(isAiProviderId(state.aiProvider), 'AI 服务商设置无效');
    if ('aiBaseUrl' in state) {
      check(typeof state.aiBaseUrl === 'string' && state.aiBaseUrl.trim().length <= 512, 'AI 接口地址设置无效');
      const trimmedUrl = state.aiBaseUrl.trim();
      const normalizedUrl = trimmedUrl ? normalizeBaseUrl(trimmedUrl) : '';
      check(!trimmedUrl || normalizedUrl, 'AI 接口地址必须为有效的 http 或 https 地址');
      state.aiBaseUrl = normalizedUrl;
    }
    if ('aiTextModel' in state) {
      check(typeof state.aiTextModel === 'string' && !/[\r\n\t\u0000-\u001f\u007f]/.test(state.aiTextModel) && state.aiTextModel.trim().length <= 160, 'AI 文本模型设置无效');
      state.aiTextModel = state.aiTextModel.trim();
    }
    if ('aiVisionModel' in state) {
      check(typeof state.aiVisionModel === 'string' && !/[\r\n\t\u0000-\u001f\u007f]/.test(state.aiVisionModel) && state.aiVisionModel.trim().length <= 160, 'AI 视觉模型设置无效');
      state.aiVisionModel = state.aiVisionModel.trim();
    }
    if ('updateMirrorPrefix' in state) {
      check(typeof state.updateMirrorPrefix === 'string' && state.updateMirrorPrefix.trim().length <= 256, '更新镜像地址设置无效');
      const trimmedMirror = state.updateMirrorPrefix.trim();
      const normalizedMirror = trimmedMirror ? normalizeBaseUrl(trimmedMirror) : '';
      check(!trimmedMirror || (normalizedMirror && normalizedMirror.length < 256), '更新镜像地址必须为有效的 http 或 https 地址');
      state.updateMirrorPrefix = normalizedMirror ? `${normalizedMirror}/` : '';
    }
  }
  if (key === 'dark-study-widget-settings') {
    if ('shape' in state) check(['square', 'rectangle', 'large'].includes(state.shape), '小组件形状无效');
    if ('theme' in state) check(['system', 'dark', 'light'].includes(state.theme), '小组件主题无效');
    if ('style' in state) check(['frosted', 'porcelain', 'tinted'].includes(state.style), '小组件质感无效');
    if ('mode' in state) check(['upcoming', 'today', 'week'].includes(state.mode), '小组件模式无效');
    if ('count' in state) check(Number.isFinite(state.count) && state.count >= 1 && state.count <= 5, '小组件数量无效');
  }
  if (key === 'dark-study-study-progress') {
    if ('attendanceByCourse' in state) {
      check(object(state.attendanceByCourse), '考勤记录无效');
      const cleanedMap: Obj = {};
      for (const [courseKey, list] of Object.entries(state.attendanceByCourse)) {
        check(typeof courseKey === 'string' && courseKey.length > 0 && courseKey.length <= 200 && Array.isArray(list), '考勤记录无效');
        const cleanedList = list.map((item: unknown) => {
          const rec = normalizeAttendanceRecord(item);
          check(rec !== null, '考勤记录条目无效');
          return rec;
        });
        cleanedMap[courseKey] = cleanedList.slice(0, 120);
      }
      state.attendanceByCourse = cleanedMap;
    }
    if ('customAbsenceLimits' in state) {
      check(object(state.customAbsenceLimits), '缺勤红线设置无效');
      const cleanedLimits: Obj = {};
      for (const [courseKey, limit] of Object.entries(state.customAbsenceLimits)) {
        check(typeof courseKey === 'string' && courseKey.length > 0 && courseKey.length <= 200 && typeof limit === 'number' && Number.isFinite(limit) && limit >= 1 && limit <= 60, '缺勤红线设置无效');
        cleanedLimits[courseKey] = Math.floor(limit);
      }
      state.customAbsenceLimits = cleanedLimits;
    }
    if ('focusLogs' in state) {
      check(Array.isArray(state.focusLogs), '专注记录无效');
      state.focusLogs = state.focusLogs.map((item: unknown) => {
        const log = normalizeCourseFocusLog(item);
        check(log !== null, '专注记录条目无效');
        return log;
      }).slice(0, 500);
    }
    if ('pendingFarmRewards' in state) {
      check(Array.isArray(state.pendingFarmRewards), '待结算奖励无效');
      state.pendingFarmRewards = state.pendingFarmRewards.map((item: unknown) => {
        const reward = normalizePendingFarmReward(item);
        check(reward !== null, '待结算奖励条目无效');
        return reward;
      }).slice(0, 100);
    }
  }
  if (key === 'dark-study-peer-schedules') {
    if ('peers' in state) {
      check(Array.isArray(state.peers), '好友课表数据无效');
      for (const peer of state.peers) {
        check(
          object(peer) &&
            typeof peer.id === 'string' &&
            peer.id.length > 0 &&
            typeof peer.nickname === 'string' &&
            typeof peer.scheduleName === 'string' &&
            Number.isFinite(peer.totalWeeks) &&
            peer.totalWeeks >= 1 &&
            Array.isArray(peer.courses),
          '好友课表数据无效',
        );
        if (peer.active !== undefined) check(typeof peer.active === 'boolean', '好友课表状态无效');
        if (peer.startDate !== undefined) check(typeof peer.startDate === 'string', '好友课表日期无效');
        if (peer.color !== undefined) check(['sky', 'violet', 'emerald', 'amber', 'rose', 'cyan'].includes(peer.color), '好友课表颜色无效');
        if (peer.importedAt !== undefined) check(typeof peer.importedAt === 'number' && Number.isFinite(peer.importedAt), '好友课表导入时间无效');
        for (const c of peer.courses) {
          check(
            object(c) &&
              typeof c.n === 'string' &&
              Number.isInteger(c.d) &&
              c.d >= 1 &&
              c.d <= 7 &&
              Number.isInteger(c.s) &&
              c.s >= 1 &&
              Number.isInteger(c.e) &&
              c.e >= c.s &&
              Array.isArray(c.w) &&
              c.w.every((w: unknown) => Number.isInteger(w) && Number(w) > 0),
            '好友课表课程数据无效',
          );
        }
      }
      state.peers = state.peers.slice(0, 50);
    }
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
const RAW_STRING_KEYS = new Set<BackupKey>(['dark-study-whale-voice', 'dark-study-sound-effects']);
export function createBackup(records: readonly (readonly [string, string | null])[], at = new Date()): Backup {
  const data: Backup['data'] = {};
  for (const [key, raw] of records) if (raw !== null && BACKUP_KEYS.includes(key as BackupKey)) data[key as BackupKey] = RAW_STRING_KEYS.has(key as BackupKey) ? raw : JSON.parse(raw);
  return parseBackup(JSON.stringify({ format: 'dark-study-backup', version: 1, createdAt: at.toISOString(), data }));
}
export function backupSummary(backup: Backup) {
  const main = backup.data['dark-study-storage'] as Obj | undefined;
  const whale = backup.data['dark-study-whale-memory'] as Obj | undefined;
  const farm = backup.data['dark-study-farm'] as Obj | undefined;
  return { modules: Object.keys(backup.data).length, schedules: main?.state.schedules.length ?? 0,
    courses: main?.state.schedules.reduce((count: number, s: Obj) => count + s.courses.length, 0) ?? 0,
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
    const existing = existingRaw ? RAW_STRING_KEYS.has(key) ? existingRaw : JSON.parse(existingRaw) : undefined;
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
        for (const [field, limit] of [
          ['messages', 200], ['memory', 200], ['petMessages', 200],
          ['facts', 100], ['episodes', 50], ['openLoops', 20], ['reflections', 24],
        ] as const) {
          if (Array.isArray(existing.state[field]) || Array.isArray((raw as Obj).state[field])) {
            incoming.state[field] = union(existing.state[field] ?? [], (raw as Obj).state[field] ?? [], limit);
          }
        }
        for (const field of ['messages', 'memory', 'petMessages']) incoming.state[field].sort((a: Obj, b: Obj) => a.timestamp - b.timestamp);
      } else if (key === 'dark-study-study-progress') {
        const existingState = existing.state ?? {};
        const incomingState = incoming.state ?? {};
        const mergedAttendance: Obj = {};
        const allKeys = new Set([
          ...Object.keys(existingState.attendanceByCourse ?? {}),
          ...Object.keys(incomingState.attendanceByCourse ?? {}),
        ]);
        for (const courseKey of allKeys) {
          const mergedList = union(
            existingState.attendanceByCourse?.[courseKey] ?? [],
            incomingState.attendanceByCourse?.[courseKey] ?? [],
            120,
          );
          mergedList.sort((a: Obj, b: Obj) => b.at - a.at);
          mergedAttendance[courseKey] = mergedList;
        }
        const mergedFocus = union(
          existingState.focusLogs ?? [],
          incomingState.focusLogs ?? [],
          500,
        ).sort((a: Obj, b: Obj) => b.at - a.at);
        const mergedRewards = union(
          existingState.pendingFarmRewards ?? [],
          incomingState.pendingFarmRewards ?? [],
          100,
        );
        incoming = {
          ...incoming,
          state: {
            ...incomingState,
            ...existingState,
            attendanceByCourse: mergedAttendance,
            customAbsenceLimits: {
              ...(incomingState.customAbsenceLimits ?? {}),
              ...(existingState.customAbsenceLimits ?? {}),
            },
            focusLogs: mergedFocus,
            pendingFarmRewards: mergedRewards,
          },
        };
      } else if (key === 'dark-study-peer-schedules') {
        incoming = {
          ...incoming,
          state: {
            ...incoming.state,
            ...(existing.state ?? {}),
            peers: union(existing.state?.peers ?? [], incoming.state?.peers ?? [], 50),
          },
        };
      } else return [key, existingRaw!] as [string, string];
    }
    return [key, RAW_STRING_KEYS.has(key) ? String(incoming) : JSON.stringify(incoming)];
  });
}
