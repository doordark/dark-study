import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '@/store/useStore';
import { useSettings } from '@/store/useSettings';
import { useWhaleMemory } from '@/store/useWhaleMemory';
import { useWhalePersona } from '@/store/useWhalePersona';
import { useWhalePet } from '@/store/useWhalePet';
import { useWidgetSettings } from '@/store/useWidgetSettings';
import { useStudyProgress } from '@/store/useStudyProgress';
import { usePeerSchedules } from '@/store/usePeerSchedules';
import { normalizeWhaleVoiceConfig, useWhaleVoice, VOICE_CONFIG_KEY, VOICE_KEY } from '@/store/useWhaleVoice';
import { SOUND_EFFECTS_KEY, useSoundEffects } from '@/store/useSoundEffects';
import { useDataSession } from '@/store/useDataSession';
import { useImportTask } from '@/store/useImportTask';
import { BACKUP_KEYS, buildRestorePlan, createBackup, parseBackup, type Backup } from '@/utils/backup';
import { flushPendingWrites, withPendingWritesSuspended } from '@/utils/coalescedWriter';
import { aiRequests } from '@/utils/requestCoordinator';
import { commitRestore, recoverInterruptedRestore } from './restoreTransaction';

export async function hydrateBackupStores() {
  const stores = [useStore, useSettings, useWhaleMemory, useWhalePersona, useWhalePet, useWidgetSettings, useStudyProgress, usePeerSchedules];
  await Promise.all(stores.map(store => store.persist.rehydrate()));
  if (stores.some(store => !store.persist.hasHydrated())) throw new Error('部分数据无法重新加载，正在恢复原数据');
  const [voice, voiceConfigRaw, sfx] = await Promise.all([
    AsyncStorage.getItem(VOICE_KEY),
    AsyncStorage.getItem(VOICE_CONFIG_KEY),
    AsyncStorage.getItem(SOUND_EFFECTS_KEY),
  ]);
  let parsedVoiceConfig: unknown = null;
  if (voiceConfigRaw) {
    try { parsedVoiceConfig = JSON.parse(voiceConfigRaw); } catch { parsedVoiceConfig = null; }
  }
  useWhaleVoice.setState({ on: voice !== '0', config: normalizeWhaleVoiceConfig(parsedVoiceConfig), loaded: true });
  useSoundEffects.setState({ on: sfx !== '0', loaded: true });
}
export async function collectBackup() {
  await flushPendingWrites();
  const stores = [useStore, useSettings, useWhaleMemory, useWhalePersona, useWhalePet, useWidgetSettings, useStudyProgress, usePeerSchedules];
  await Promise.all(stores.filter(store => !store.persist.hasHydrated()).map(store => store.persist.rehydrate()));
  if (stores.some(store => !store.persist.hasHydrated())) throw new Error('数据尚未读取完成，请稍后重试');
  const records = new Map(await AsyncStorage.multiGet([...BACKUP_KEYS]));
  // Capture live state so a just-changed preference is not missed by a pending disk write.
  records.set('dark-study-storage', JSON.stringify({ state: useStore.getState(), version: 6 }));
  records.set('dark-study-settings', JSON.stringify({ state: useSettings.getState(), version: 0 }));
  records.set('dark-study-whale-memory', JSON.stringify({ state: useWhaleMemory.getState(), version: 0 }));
  records.set('dark-study-whale-persona', JSON.stringify({ state: useWhalePersona.getState(), version: 0 }));
  records.set('dark-study-whale-pet', JSON.stringify({ state: useWhalePet.getState(), version: 0 }));
  records.set('dark-study-widget-settings', JSON.stringify({ state: useWidgetSettings.getState(), version: 0 }));
  records.set('dark-study-study-progress', JSON.stringify({ state: useStudyProgress.getState(), version: 0 }));
  records.set('dark-study-peer-schedules', JSON.stringify({ state: usePeerSchedules.getState(), version: 0 }));
  await Promise.all([useWhaleVoice.getState().hydrate(), useSoundEffects.getState().hydrate()]);
  records.set(VOICE_KEY, useWhaleVoice.getState().on ? '1' : '0');
  records.set(VOICE_CONFIG_KEY, JSON.stringify(useWhaleVoice.getState().config));
  records.set(SOUND_EFFECTS_KEY, useSoundEffects.getState().on ? '1' : '0');
  return createBackup([...records]);
}
export async function restoreBackup(backup: Backup, mode: 'replace' | 'merge') {
  if (useDataSession.getState().restoring) throw new Error('数据恢复正在进行');
  if (useImportTask.getState().status === 'analyzing') throw new Error('请等待当前导入分析完成后再恢复备份');
  const checked = parseBackup(JSON.stringify(backup));
  useDataSession.setState({ restoring: true });
  aiRequests.setPaused(true);
  try {
    await withPendingWritesSuspended(async () => {
      await recoverInterruptedRestore();
      const current = await AsyncStorage.multiGet([...BACKUP_KEYS]);
      const plan = buildRestorePlan(checked, current, mode);
      await commitRestore(plan, hydrateBackupStores);
      useDataSession.setState(state => ({ revision: state.revision + 1 }));
    });
  } finally { aiRequests.setPaused(false); useDataSession.setState({ restoring: false }); }
}
