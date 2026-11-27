import { Platform } from "react-native";
import type * as SecureStoreTypes from "expo-secure-store";

type SecureStoreModule = Pick<
  typeof SecureStoreTypes,
  "getItemAsync" | "setItemAsync" | "deleteItemAsync" | "WHEN_UNLOCKED_THIS_DEVICE_ONLY"
>;

const AI_API_KEY_STORAGE_KEY = "dark-study.ai-api-key";

// Web has no OS keystore. Keep the key only for this session's lifetime.
let webApiKey = "";

function getSecureStore(): SecureStoreModule | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-secure-store") as Partial<SecureStoreModule> | null;
    if (
      mod &&
      typeof mod.getItemAsync === "function" &&
      typeof mod.setItemAsync === "function" &&
      typeof mod.deleteItemAsync === "function"
    ) {
      return mod as SecureStoreModule;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getAiApiKey(): Promise<string> {
  const store = getSecureStore();
  if (!store) return webApiKey;
  try {
    const value = await store.getItemAsync(AI_API_KEY_STORAGE_KEY);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export async function setAiApiKey(value: string): Promise<void> {
  const key = value.trim();
  if (!key) {
    await deleteAiApiKey();
    return;
  }
  const store = getSecureStore();
  if (!store) {
    webApiKey = key;
    return;
  }
  await store.setItemAsync(AI_API_KEY_STORAGE_KEY, key, {
    keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function deleteAiApiKey(): Promise<void> {
  const store = getSecureStore();
  if (!store) {
    webApiKey = "";
    return;
  }
  try {
    await store.deleteItemAsync(AI_API_KEY_STORAGE_KEY);
  } catch {
    // Ignore already-absent credential errors.
  }
}

export async function hasAiApiKey(): Promise<boolean> {
  const key = await getAiApiKey();
  return key.length > 0;
}
