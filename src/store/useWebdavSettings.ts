import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  deleteWebdavPassword,
  hasWebdavPassword,
  setWebdavPassword,
} from "@/services/webdavCredentials";
import {
  DEFAULT_WEBDAV_PRESET,
  DEFAULT_WEBDAV_REMOTE_PATH,
  getWebdavPreset,
  isWebdavPresetId,
  type WebdavPresetId,
} from "@/services/webdavSync";
import { coordinatedJSONStorage } from "@/utils/storage";

export const WEBDAV_SETTINGS_STORAGE_KEY = "dark-study-webdav-settings";

interface WebdavSettingsState {
  preset: WebdavPresetId;
  serverUrl: string;
  username: string;
  remotePath: string;
  autoSyncOnLaunch: boolean;
  lastSyncAt: number | null;
  lastSyncMessage: string;
  /** 仅内存态标记，绝不持久化到 AsyncStorage；真实密码仅存 SecureStore */
  hasPassword: boolean;
  setPreset: (preset: WebdavPresetId) => void;
  setServerUrl: (serverUrl: string) => void;
  setUsername: (username: string) => void;
  setRemotePath: (remotePath: string) => void;
  setAutoSyncOnLaunch: (enabled: boolean) => void;
  setLastSync: (patch: {
    lastSyncAt?: number | null;
    lastSyncMessage?: string;
  }) => void;
  setHasPassword: (hasPassword: boolean) => void;
  refreshPasswordStatus: () => Promise<boolean>;
  savePassword: (password: string) => Promise<boolean>;
  clearPassword: () => Promise<void>;
}

type PersistedWebdavSettings = Pick<
  WebdavSettingsState,
  | "preset"
  | "serverUrl"
  | "username"
  | "remotePath"
  | "autoSyncOnLaunch"
  | "lastSyncAt"
  | "lastSyncMessage"
>;

function pickPersistedWebdavSettings(
  s: WebdavSettingsState,
): PersistedWebdavSettings {
  return {
    preset: s.preset,
    serverUrl: s.serverUrl,
    username: s.username,
    remotePath: s.remotePath,
    autoSyncOnLaunch: s.autoSyncOnLaunch,
    lastSyncAt: s.lastSyncAt,
    lastSyncMessage: s.lastSyncMessage,
  };
}

let passwordStatusRevision = 0;

export const useWebdavSettings = create<WebdavSettingsState>()(
  persist(
    (set, get) => ({
      preset: DEFAULT_WEBDAV_PRESET,
      serverUrl: getWebdavPreset(DEFAULT_WEBDAV_PRESET).defaultServerUrl,
      username: "",
      remotePath: DEFAULT_WEBDAV_REMOTE_PATH,
      autoSyncOnLaunch: false,
      lastSyncAt: null,
      lastSyncMessage: "",
      hasPassword: false,

      setPreset: (nextPresetId) => {
        const safePresetId = isWebdavPresetId(nextPresetId)
          ? nextPresetId
          : DEFAULT_WEBDAV_PRESET;
        const prevPreset = getWebdavPreset(get().preset);
        const nextPreset = getWebdavPreset(safePresetId);
        const currentUrl = get().serverUrl.trim();

        let nextServerUrl = currentUrl;
        if (nextPreset.defaultServerUrl) {
          if (
            !currentUrl ||
            currentUrl === prevPreset.defaultServerUrl ||
            !currentUrl.startsWith(nextPreset.defaultServerUrl)
          ) {
            nextServerUrl = nextPreset.defaultServerUrl;
          }
        } else if (currentUrl === prevPreset.defaultServerUrl) {
          nextServerUrl = "";
        }

        set({
          preset: safePresetId,
          serverUrl: nextServerUrl,
        });
      },

      setServerUrl: (serverUrl) => set({ serverUrl }),
      setUsername: (username) => set({ username }),
      setRemotePath: (remotePath) => set({ remotePath }),
      setAutoSyncOnLaunch: (autoSyncOnLaunch) => set({ autoSyncOnLaunch }),

      setLastSync: (patch) =>
        set((state) => ({
          lastSyncAt:
            patch.lastSyncAt !== undefined ? patch.lastSyncAt : state.lastSyncAt,
          lastSyncMessage:
            patch.lastSyncMessage !== undefined
              ? patch.lastSyncMessage
              : state.lastSyncMessage,
        })),

      setHasPassword: (hasPassword) => {
        passwordStatusRevision += 1;
        set({ hasPassword: Boolean(hasPassword) });
      },

      refreshPasswordStatus: async () => {
        const rev = passwordStatusRevision;
        const exists = await hasWebdavPassword();
        if (passwordStatusRevision === rev) {
          set({ hasPassword: exists });
        }
        return exists;
      },

      savePassword: async (password) => {
        const trimmed = password.trim();
        passwordStatusRevision += 1;
        await setWebdavPassword(trimmed);
        const saved = trimmed.length > 0;
        set({ hasPassword: saved });
        return saved;
      },

      clearPassword: async () => {
        passwordStatusRevision += 1;
        await deleteWebdavPassword();
        set({ hasPassword: false });
      },
    }),
    {
      name: WEBDAV_SETTINGS_STORAGE_KEY,
      storage: coordinatedJSONStorage<PersistedWebdavSettings>(
        WEBDAV_SETTINGS_STORAGE_KEY,
      ),
      partialize: pickPersistedWebdavSettings,
      merge: (persisted, current) => {
        const raw =
          persisted && typeof persisted === "object"
            ? (persisted as Partial<PersistedWebdavSettings> &
                Record<string, unknown>)
            : {};
        const preset = isWebdavPresetId(raw.preset)
          ? raw.preset
          : current.preset;
        const serverUrl =
          typeof raw.serverUrl === "string" ? raw.serverUrl : current.serverUrl;
        const username =
          typeof raw.username === "string" ? raw.username : current.username;
        const remotePath =
          typeof raw.remotePath === "string" && raw.remotePath.trim()
            ? raw.remotePath
            : current.remotePath;
        const autoSyncOnLaunch =
          typeof raw.autoSyncOnLaunch === "boolean"
            ? raw.autoSyncOnLaunch
            : current.autoSyncOnLaunch;
        const lastSyncAt =
          typeof raw.lastSyncAt === "number" && Number.isFinite(raw.lastSyncAt)
            ? raw.lastSyncAt
            : raw.lastSyncAt === null
              ? null
              : current.lastSyncAt;
        const lastSyncMessage =
          typeof raw.lastSyncMessage === "string"
            ? raw.lastSyncMessage
            : current.lastSyncMessage;

        return {
          ...current,
          preset,
          serverUrl,
          username,
          remotePath,
          autoSyncOnLaunch,
          lastSyncAt,
          lastSyncMessage,
          // 永远不从持久化数据恢复 hasPassword 或密码字段
          hasPassword: current.hasPassword,
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        void state.refreshPasswordStatus().catch(() => {});
      },
    },
  ),
);
