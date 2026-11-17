import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKUP_KEYS } from '@/utils/backup';
const JOURNAL = 'dark-study-restore-journal';
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem' | 'multiGet' | 'multiSet' | 'multiRemove'>;
async function rollback(records: readonly (readonly [string, string | null])[], storage: Storage) {
  const saved: [string, string][] = [], absent: string[] = [];
  for (const [key, value] of records) { if (value === null) absent.push(key); else saved.push([key, value]); }
  if (saved.length) await storage.multiSet(saved);
  if (absent.length) await storage.multiRemove(absent);
}
export async function recoverInterruptedRestore(storage: Storage = AsyncStorage): Promise<boolean> {
  const raw = await storage.getItem(JOURNAL);
  if (!raw) return false;
  const records: [string, string | null][] = JSON.parse(raw);
  if (!Array.isArray(records) || !records.every(row => Array.isArray(row) && row.length === 2 && BACKUP_KEYS.includes(row[0] as typeof BACKUP_KEYS[number]) && (row[1] === null || typeof row[1] === 'string'))) throw new Error('恢复日志损坏，请保留应用数据后重试');
  await rollback(records, storage);
  await storage.removeItem(JOURNAL);
  return true;
}
/** Journal first; commit only after disk and in-memory stores both succeed. */
export async function commitRestore(plan: [string, string][], hydrate: () => Promise<void>, storage: Storage = AsyncStorage) {
  const before = await storage.multiGet(plan.map(([key]) => key));
  await storage.setItem(JOURNAL, JSON.stringify(before));
  try {
    await storage.multiSet(plan);
    await hydrate();
    await storage.removeItem(JOURNAL);
  } catch (error) {
    try { await rollback(before, storage); await hydrate(); await storage.removeItem(JOURNAL); }
    catch { throw new Error('恢复未完成，原数据恢复日志已保留。重新打开应用会重试恢复原数据。'); }
    throw error;
  }
}
