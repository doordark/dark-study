import { Platform, Share } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { parseBackup, type Backup } from '@/utils/backup';

export async function saveBackupFile(backup: Backup): Promise<boolean> {
  const text = JSON.stringify(backup, null, 2);
  const name = `DarkStudy-${backup.createdAt.replace(/[:.]/g, '-')}.json`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  if (Platform.OS === 'android') {
    const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return false;
    const uri = await StorageAccessFramework.createFileAsync(permission.directoryUri, name, 'application/json');
    await StorageAccessFramework.writeAsStringAsync(uri, text);
    return true;
  }
  const file = new File(Paths.cache, name); file.create({ overwrite: true }); file.write(text);
  const result = await Share.share({ url: file.uri, title: 'Dark Study 数据备份' });
  return result.action !== Share.dismissedAction;
}
export async function pickBackupFile(): Promise<Backup | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > 20_000_000) throw new Error('备份文件超过 20 MB');
  const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
  return parseBackup(text);
}
