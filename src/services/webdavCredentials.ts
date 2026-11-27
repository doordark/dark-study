import { Platform } from "react-native";
import type * as SecureStoreTypes from "expo-secure-store";

type SecureStoreModule = Pick<
  typeof SecureStoreTypes,
  | "getItemAsync"
  | "setItemAsync"
  | "deleteItemAsync"
  | "WHEN_UNLOCKED_THIS_DEVICE_ONLY"
>;

export const WEBDAV_PASSWORD_STORAGE_KEY = "dark-study.webdav-password";

// Web and pure-Node tests have no OS keystore; keep the password in memory only for this session.
let sessionWebdavPassword = "";

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

export async function getWebdavPassword(): Promise<string> {
  const store = getSecureStore();
  if (!store) return sessionWebdavPassword;
  try {
    const value = await store.getItemAsync(WEBDAV_PASSWORD_STORAGE_KEY);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export async function setWebdavPassword(value: string): Promise<void> {
  const password = value.trim();
  if (!password) {
    await deleteWebdavPassword();
    return;
  }
  const store = getSecureStore();
  if (!store) {
    sessionWebdavPassword = password;
    return;
  }
  await store.setItemAsync(WEBDAV_PASSWORD_STORAGE_KEY, password, {
    keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function deleteWebdavPassword(): Promise<void> {
  sessionWebdavPassword = "";
  const store = getSecureStore();
  if (!store) return;
  try {
    await store.deleteItemAsync(WEBDAV_PASSWORD_STORAGE_KEY);
  } catch {
    // Ignore already-absent credential errors.
  }
}

export async function hasWebdavPassword(): Promise<boolean> {
  const password = await getWebdavPassword();
  return password.length > 0;
}
