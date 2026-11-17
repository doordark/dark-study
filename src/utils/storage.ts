import { Platform } from "react-native";
import type { PersistStorage, StateStorage } from "zustand/middleware";
import { getStoredText, setStoredJSON, setStoredText, removeStoredKeys } from './coordinatedStorage';

/**
 * 迁移存储：应用由 courseflow 更名 dark-study 时存储键同步改名。
 * 首次读取新键为空时回退读旧键，老数据自动带入；之后的写入全部落在新键。
 */
export function migratingStorage(legacyKey: string): StateStorage {
  // Expo Router renders web pages in Node, where AsyncStorage has no window.
  const server = Platform.OS === "web" && typeof window === "undefined";
  return {
    getItem: async (name) => {
      if (server) return null;
      const value = await getStoredText(name);
      return value ?? (name === legacyKey ? null : await getStoredText(legacyKey));
    },
    setItem: async (name, value) => {
      if (!server) await setStoredText(name, value);
    },
    removeItem: async (name) => {
      if (!server) {
        // Otherwise the next read resurrects the legacy data after a reset.
        await removeStoredKeys(name, [...new Set([legacyKey, name])]);
      }
    },
  };
}

/** Same on-disk format as createJSONStorage; stringify only the next actual write. */
export function coordinatedJSONStorage<S>(legacyKey: string): PersistStorage<S> {
  const storage = migratingStorage(legacyKey);
  const server = Platform.OS === 'web' && typeof window === 'undefined';
  return {
    getItem: async name => {
      const raw = await storage.getItem(name);
      return raw ? JSON.parse(raw) : null;
    },
    setItem: (name, value) => server ? Promise.resolve() : setStoredJSON(name, value),
    removeItem: name => storage.removeItem(name),
  };
}
