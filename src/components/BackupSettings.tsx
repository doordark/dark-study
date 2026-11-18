import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { GlassContainer } from './GlassContainer';
import { backupSummary, type Backup } from '@/utils/backup';

export function BackupSettings() {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : '操作未完成，请重试'); }
    finally { setBusy(false); }
  };
  const summary = backup ? backupSummary(backup) : null;
  return <GlassContainer><View style={{ padding: 18, gap: 14 }}>
    <Text className="text-lg font-bold text-slate-800 dark:text-white">备份与恢复</Text>
    <Text className="text-sm text-slate-600 dark:text-slate-300">保存课表、成绩、农场进度、人物记忆和偏好，便于换设备或恢复数据。</Text>
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
      <Text className="text-sm text-slate-600 dark:text-slate-300">{summary.schedules} 份课表 · {summary.courses} 条课程 · {summary.tasks} 项待办 · {summary.grades} 条成绩 · {summary.messages} 条聊天{summary.farm ? ` · 含农场进度（${summary.coins} 金币）` : ''}</Text>
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
  </View></GlassContainer>;
}
