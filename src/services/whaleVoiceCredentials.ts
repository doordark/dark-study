import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "dark-study.fish-api-key";
// Web has no OS keystore. Keep the key only for this tab's lifetime.
let webKey: string | null = null;

export async function getFishApiKey(): Promise<string | null> {
  if (Platform.OS === "web") return webKey;
  return SecureStore.getItemAsync(KEY);
}

export async function setFishApiKey(value: string): Promise<void> {
  const key = value.trim();
  if (!key) throw new Error("请先输入 Fish API Key");
  if (Platform.OS === "web") { webKey = key; return; }
  await SecureStore.setItemAsync(KEY, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function deleteFishApiKey(): Promise<void> {
  if (Platform.OS === "web") { webKey = null; return; }
  await SecureStore.deleteItemAsync(KEY);
}
