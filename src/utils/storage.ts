import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { StateStorage } from "zustand/middleware";

/**
 * 迁移存储：应用由 courseflow 更名 dark-study 时存储键同步改名。
 * 首次读取新键为空时回退读旧键，老数据自动带入；之后的写入全部落在新键。
 */
export function migratingStorage(legacyKey: string): StateStorage {
  // Expo Router renders web pages in Node, where AsyncStorage has no window.
  const server = Platform.OS === "web" && typeof window === "undefined";
  return {
    getItem: async (name) =>
      server ? null : (await AsyncStorage.getItem(name)) ??
        (await AsyncStorage.getItem(legacyKey)),
    setItem: async (name, value) => {
      if (!server) await AsyncStorage.setItem(name, value);
    },
    removeItem: async (name) => {
      if (!server) await AsyncStorage.removeItem(name);
    },
  };
}
