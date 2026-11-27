import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { GlassContainer } from './GlassContainer';
import { WebdavSyncCard } from './WebdavSyncCard';
import { backupSummary, type Backup } from '@/utils/backup';
import { useStore } from '@/store/useStore';
import { countDistinctCourses } from '@/utils/time';

export function BackupSettings() {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const schedules = useStore((s) => s.schedules);
  const grades = useStore((s) => s.grades);
  const resetToSample = useStore((s) => s.resetToSample);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : '操作未完成，请重试'); }
    finally { setBusy(false); }
  };
  const totalCourses = schedules.reduce((sum, s) => sum + countDistinctCourses(s.courses), 0);
  const confirmResetAll = () => {
    Alert.alert(
      '重置全部课表与成绩？',
      `此操作将清空当前全部 ${schedules.length} 份课表（共 ${totalCourses} 门课）以及 ${grades.length} 条成绩和绩点规则，并恢复为默认示例数据。操作不可撤销，建议先导出备份。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认重置',
          style: 'destructive',
          onPress: () => {
            resetToSample();
            setMessage('已重置为示例数据。');
          },
        },
      ],
    );
  };
  const summary = backup ? backupSummary(backup) : null;
  return <View style={{ gap: 14 }}><GlassContainer radius={24} intensity={42} borderOpacity={0.22}><View style={{ padding: 18, gap: 14 }}>
    <Text className="text-lg font-bold text-slate-800 dark:text-white">备份与恢复</Text>
    <Text className="text-sm text-slate-600 dark:text-slate-300">保存课表、成绩、农场进度、星空记录、人物记忆和偏好，便于换设备或恢复数据。</Text>
    <Text className="text-xs text-slate-500 dark:text-slate-400">备份不含 API 密钥、联网用量及本地图片文件；聊天中的待应用课程操作不会恢复。</Text>
    <Pressable disabled={busy} accessibilityRole="button" onPress={() => void run(async () => {
      const { collectBackup } = await import('@/services/backupStorage');
      const { saveBackupFile } = await import('@/services/backupFiles');
      if (await saveBackupFile(await collectBackup())) setMessage('备份已导出，请保存好备份文件。');
    })} className="rounded-xl bg-sky-500 p-3"><Text className="text-center font-bold text-white">导出备份</Text></Pressable>
    <Pressable disabled={busy} accessibilityRole="button" onPress={() => void run(async () => {
      const { pickBackupFile } = await import('@/services/backupFiles');
      const value = await pickBackupFile(); if (value) { setBackup(value); setMode('merge'); }
    })} className="rounded-xl bg-slate-400/20 p-3"><Text className="text-center font-bold text-slate-700 dark:text-white">选择备份并预览</Text></Pressable>
    {backup && summary ? <View style={{ gap: 12 }}>
      <Text className="font-bold text-slate-800 dark:text-white">文件校验通过 · {new Date(backup.createdAt).toLocaleString()}</Text>
      <Text className="text-sm text-slate-600 dark:text-slate-300">{summary.schedules} 份课表 · {summary.courses} 条课程 · {summary.grades} 条成绩 · {summary.messages} 条聊天{summary.farm ? ` · 含农场进度（${summary.coins} dark币）` : ''}</Text>
      {(['merge', 'replace'] as const).map(value => <Pressable key={value} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: mode === value }} onPress={() => setMode(value)} className={mode === value ? 'rounded-xl bg-sky-400/25 p-3' : 'rounded-xl bg-slate-400/10 p-3'}>
        <Text className="font-bold text-slate-800 dark:text-white">{value === 'merge' ? '合并导入' : '覆盖恢复'}{mode === value ? ' ✓' : ''}</Text>
        <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">{value === 'merge' ? '追加不同 ID 的课表、成绩和记忆，同 ID 保留当前内容。已有农场进度与偏好继续使用当前数据。' : '覆盖备份中包含的数据。当前 API 密钥、自定义背景与联网用量保持不变。'}</Text>
      </Pressable>)}
      <Pressable disabled={busy} accessibilityRole="button" onPress={() => void run(async () => {
        const { restoreBackup } = await import('@/services/backupStorage');
        await restoreBackup(backup, mode); setBackup(null); setMessage('数据已恢复。');
      })} className="rounded-xl bg-emerald-600 p-3"><Text className="text-center font-bold text-white">{mode === 'replace' ? '确认覆盖以上数据' : '确认合并以上数据'}</Text></Pressable>
      <Pressable disabled={busy} onPress={() => setBackup(null)}><Text className="text-center text-slate-500 dark:text-slate-400">取消恢复</Text></Pressable>
    </View> : null}
    {busy ? <ActivityIndicator color="#38BDF8" /> : null}
    {message ? <Text accessibilityLiveRegion="polite" className="text-sm text-slate-600 dark:text-slate-300">{message}</Text> : null}
  </View></GlassContainer>
  <WebdavSyncCard />
  <GlassContainer radius={24} intensity={42} borderOpacity={0.22}><View style={{ padding: 18, gap: 10 }}>
    <Text className="text-[14px] font-bold text-slate-800 dark:text-white">危险操作</Text>
    <Text className="text-xs leading-5 text-slate-500 dark:text-slate-400">当前共有 {schedules.length} 份课表（{totalCourses} 门课）和 {grades.length} 条成绩记录。重置将一并清空全部课表、成绩与绩点规则，建议先导出备份。</Text>
    <Pressable disabled={busy} accessibilityRole="button" onPress={confirmResetAll} className="items-center rounded-2xl border border-rose-500/35 bg-rose-500/12 py-3">
      <Text className="text-[13px] font-bold text-rose-600 dark:text-rose-300">重置全部课表与成绩为示例数据</Text>
    </Pressable>
  </View></GlassContainer></View>;
}
