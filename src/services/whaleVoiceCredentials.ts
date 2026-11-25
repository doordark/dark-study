import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export type TtsCredentialProvider = "breezeblue" | "siliconflow";

const KEYS: Record<TtsCredentialProvider, string> = {
  breezeblue: "dark-study.breeze-tts-key",
  siliconflow: "dark-study.siliconflow-tts-key",
};

// Web has no OS keystore. Keep keys only for this tab's lifetime.
const webKeys: Partial<Record<TtsCredentialProvider, string>> = {};

export async function getTtsApiKey(provider: TtsCredentialProvider): Promise<string | null> {
  if (Platform.OS === "web") return webKeys[provider] ?? null;
  try {
    return await SecureStore.getItemAsync(KEYS[provider]);
  } catch {
    return null;
  }
}

export async function setTtsApiKey(provider: TtsCredentialProvider, value: string): Promise<void> {
  const key = value.trim();
  if (!key) throw new Error("请先填写 API Key");
  if (Platform.OS === "web") {
    webKeys[provider] = key;
    return;
  }
  await SecureStore.setItemAsync(KEYS[provider], key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function deleteTtsApiKey(provider: TtsCredentialProvider): Promise<void> {
  if (Platform.OS === "web") {
    delete webKeys[provider];
    return;
  }
  try {
    await SecureStore.deleteItemAsync(KEYS[provider]);
  } catch {
    // Ignore already-absent credential errors.
  }
}

export async function hasTtsApiKey(provider: TtsCredentialProvider): Promise<boolean> {
  const key = await getTtsApiKey(provider);
  return Boolean(key && key.trim().length > 0);
}
