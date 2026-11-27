import { Platform } from "react-native";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  DEFAULT_AI_PROVIDER,
  isAiProviderId,
  normalizeBaseUrl,
  sanitizeAiModelName,
  type AiProviderId,
} from "@/constants/aiProviders";
import {
  resolveEffect,
  resolveTint,
  type BackgroundEffect,
  type BackgroundTint,
} from "@/constants/backgrounds";
import {
  deleteAiApiKey,
  getAiApiKey,
  setAiApiKey,
} from "@/services/aiCredentials";
import { areWritesSuspended } from "@/utils/coalescedWriter";
import { getStoredText, removeStoredKeys } from "@/utils/coordinatedStorage";
import { isGpaScaleId } from "@/utils/grades";
import type { RenderQuality } from "@/utils/renderQuality";
import { coordinatedJSONStorage } from "@/utils/storage";
import type { GpaScaleId } from "@/types";

/** 卡片材质：扁平实心 / 液态玻璃（毛玻璃折射） / 柔雾玻璃（奶润磨砂） / 清透（零模糊通透） */
export type CardMaterial = "flat" | "glass" | "frosted" | "clear";

export function resolveMaterial(value: unknown): CardMaterial {
  return value === "glass" || value === "frosted" || value === "clear"
    ? value
    : "flat";
}

interface SettingsState {
  renderQuality: RenderQuality;
  setRenderQuality: (quality: RenderQuality) => void;
  gpaScale: GpaScaleId;
  setGpaScale: (scale: GpaScaleId) => void;
  apiKey: string;
  apiKeyHydrated: boolean;
  hydrateApiKey: () => Promise<void>;
  /** AI 服务商预设 */
  aiProvider: AiProviderId;
  /** 自定义 Base URL（空字符串表示使用当前预设默认地址） */
  aiBaseUrl: string;
  /** 自定义文本模型（空字符串表示使用当前预设默认模型） */
  aiTextModel: string;
  /** 自定义视觉模型（空字符串表示使用当前预设默认模型） */
  aiVisionModel: string;
  /** 应用更新下载镜像前缀（空字符串表示 GitHub 直连） */
  updateMirrorPrefix: string;
  farmWebSearch: boolean;
  setFarmWebSearch: (enabled: boolean) => void;
  reminderEnabled: boolean;
  reminderMinutes: number;
  reminderCount: number;
  setReminder: (
    patch: Partial<
      Pick<SettingsState, "reminderEnabled" | "reminderMinutes" | "reminderCount">
    >,
  ) => void;
  /** 主题：跟随系统 / 浅色 / 深色 */
  appearance: "system" | "light" | "dark";
  /** 卡片材质：扁平实心 / 液态玻璃（毛玻璃折射） / 柔雾玻璃（奶润磨砂） / 清透（零模糊通透） */
  material: CardMaterial;
  /** 自定义背景图 uri，null = 使用默认渐变 */
  backgroundImage: string | null;
  /** 自定义背景图遮罩强度（0 ~ 0.65），提高文字对比度 */
  backgroundDim: number;
  /** 默认背景的色调（大肥鱼可代改） */
  backgroundTint: BackgroundTint;
  /** 默认背景的光效 */
  backgroundEffect: BackgroundEffect;
  /** 课表默认/上次使用的视图模式 */
  defaultScheduleView: "day" | "week";
  /** 周视图是否显示周六周日 */
  showWeekend: boolean;
  /** 周视图是否半透明展示非本周课程 */
  showOtherWeeks: boolean;
  /** 周视图是否按节次等高紧凑排布（折叠大段午休/晚休空白） */
  compactWeekGrid: boolean;
  /** 大肥鱼当前的召唤口令（大爹可代改） */
  whalePhrase: string;
  /** 是否允许大肥鱼在对话中参考成绩与空课概况 */
  whaleShareGrades: boolean;
  /** 是否开启常驻上课进度通知 */
  liveClassNotification: boolean;
  /** 毕业学分目标：课程类型 id（或 "_total" 总目标覆写）-> 目标学分 */
  graduationCreditTargets: Record<string, number>;
  setApiKey: (key: string) => void;
  setAiProvider: (provider: AiProviderId) => void;
  setAiBaseUrl: (url: string) => void;
  setAiTextModel: (model: string) => void;
  setAiVisionModel: (model: string) => void;
  setUpdateMirrorPrefix: (prefix: string) => void;
  setAppearance: (a: SettingsState["appearance"]) => void;
  setMaterial: (m: SettingsState["material"]) => void;
  setBackgroundImage: (uri: string | null) => void;
  setBackgroundDim: (dim: number) => void;
  setBackgroundTint: (t: BackgroundTint) => void;
  setBackgroundEffect: (e: BackgroundEffect) => void;
  setDefaultScheduleView: (v: "day" | "week") => void;
  setShowWeekend: (v: boolean) => void;
  setShowOtherWeeks: (v: boolean) => void;
  setCompactWeekGrid: (v: boolean) => void;
  setWhalePhrase: (p: string) => void;
  setWhaleShareGrades: (v: boolean) => void;
  setLiveClassNotification: (v: boolean) => void;
  setGraduationCreditTargets: (targets: Record<string, number>) => void;
  setGraduationCreditTarget: (typeId: string, target: number | null) => void;
}

type PersistedSettingsState = Pick<
  SettingsState,
  | "renderQuality"
  | "gpaScale"
  | "aiProvider"
  | "aiBaseUrl"
  | "aiTextModel"
  | "aiVisionModel"
  | "updateMirrorPrefix"
  | "farmWebSearch"
  | "reminderEnabled"
  | "reminderMinutes"
  | "reminderCount"
  | "appearance"
  | "material"
  | "backgroundImage"
  | "backgroundDim"
  | "backgroundTint"
  | "backgroundEffect"
  | "defaultScheduleView"
  | "showWeekend"
  | "showOtherWeeks"
  | "compactWeekGrid"
  | "whalePhrase"
  | "whaleShareGrades"
  | "liveClassNotification"
  | "graduationCreditTargets"
>;

const SETTINGS_STORAGE_KEY = "dark-study-settings";
const LEGACY_SETTINGS_STORAGE_KEY = "courseflow-settings";
const MAX_MIRROR_PREFIX_LENGTH = 256;

export function sanitizeUpdateMirrorPrefix(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = normalizeBaseUrl(value);
  if (!normalized || normalized.length > MAX_MIRROR_PREFIX_LENGTH) return "";
  return `${normalized}/`;
}

export function sanitizeGraduationCreditTargets(
  value: unknown,
): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const clean: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const key = rawKey.trim();
    if (
      !key ||
      key.length > 100 ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      continue;
    }
    const num = Number(rawVal);
    if (!Number.isFinite(num) || num <= 0) continue;
    clean[key] = Math.min(500, Math.round(num * 100) / 100);
  }
  return clean;
}

function syncUpdateMirrorPrefix(prefix: string): void {
  try {
    // 延迟加载避免未注入 Expo 原生模块的纯 Node 单测触发 updater 依赖链
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("./useUpdateTask") as {
      useUpdateTask?: {
        getState?: () => { setMirrorPrefix?: (p: string) => void };
      };
    };
    mod?.useUpdateTask?.getState?.().setMirrorPrefix?.(prefix);
  } catch {
    // 非完整原生运行环境下忽略同步
  }
}

function pickPersistedSettings(s: SettingsState): PersistedSettingsState {
  return {
    renderQuality: s.renderQuality,
    gpaScale: s.gpaScale,
    aiProvider: s.aiProvider,
    aiBaseUrl: s.aiBaseUrl,
    aiTextModel: s.aiTextModel,
    aiVisionModel: s.aiVisionModel,
    updateMirrorPrefix: s.updateMirrorPrefix,
    farmWebSearch: s.farmWebSearch,
    reminderEnabled: s.reminderEnabled,
    reminderMinutes: s.reminderMinutes,
    reminderCount: s.reminderCount,
    appearance: s.appearance,
    material: s.material,
    backgroundImage: s.backgroundImage,
    backgroundDim: s.backgroundDim,
    backgroundTint: s.backgroundTint,
    backgroundEffect: s.backgroundEffect,
    defaultScheduleView: s.defaultScheduleView,
    showWeekend: s.showWeekend,
    showOtherWeeks: s.showOtherWeeks,
    compactWeekGrid: s.compactWeekGrid,
    whalePhrase: s.whalePhrase,
    whaleShareGrades: s.whaleShareGrades,
    liveClassNotification: s.liveClassNotification,
    graduationCreditTargets: s.graduationCreditTargets,
  };
}

const rawSettingsStorage = coordinatedJSONStorage<PersistedSettingsState>(
  LEGACY_SETTINGS_STORAGE_KEY,
);

let apiKeyRevision = 0;
let pendingLegacyApiKey: string | null = null;
let unmigratedLegacyApiKey: string | null = null;
let needsPlaintextScrub = false;
let credentialWriteChain: Promise<void> = Promise.resolve();
let inFlightScrub: Promise<void> = Promise.resolve();

const settingsStorage: typeof rawSettingsStorage = {
  getItem: (name) => rawSettingsStorage.getItem(name),
  setItem: (name, value) => {
    // Never overwrite AsyncStorage while a legacy plaintext key is still waiting to
    // finish migrating into SecureStore (prevents losing the key if SecureStore fails).
    if (unmigratedLegacyApiKey) return Promise.resolve();
    return rawSettingsStorage.setItem(name, value);
  },
  removeItem: (name) => rawSettingsStorage.removeItem(name),
};

function enqueueCredentialWrite(task: () => Promise<void>): Promise<void> {
  const next = credentialWriteChain.then(task, task);
  credentialWriteChain = next.catch(() => {});
  return next;
}

async function scrubPlaintextSettingsNow(): Promise<void> {
  if (Platform.OS === "web" && typeof window === "undefined") return;
  if (areWritesSuspended()) return;
  await settingsStorage.setItem(SETTINGS_STORAGE_KEY, {
    state: pickPersistedSettings(useSettings.getState()),
    version: 0,
  });
  const legacyRaw = await getStoredText(LEGACY_SETTINGS_STORAGE_KEY);
  if (legacyRaw !== null) {
    await removeStoredKeys(LEGACY_SETTINGS_STORAGE_KEY, [
      LEGACY_SETTINGS_STORAGE_KEY,
    ]);
  }
}

function runPlaintextScrub(): Promise<void> {
  const next = inFlightScrub.then(
    () => scrubPlaintextSettingsNow(),
    () => scrubPlaintextSettingsNow(),
  );
  inFlightScrub = next.catch(() => {});
  return next;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      renderQuality: "standard",
      setRenderQuality: (renderQuality) => set({ renderQuality }),
      gpaScale: "five",
      setGpaScale: (scale) =>
        set({ gpaScale: isGpaScaleId(scale) ? scale : "five" }),
      // 默认为空：API Key 由用户在「设置」中填写，仅存系统安全存储（SecureStore），
      // 永远不要写入明文 AsyncStorage 或提交到仓库
      apiKey: "",
      apiKeyHydrated: false,
      aiProvider: DEFAULT_AI_PROVIDER,
      aiBaseUrl: "",
      aiTextModel: "",
      aiVisionModel: "",
      updateMirrorPrefix: "",
      hydrateApiKey: async () => {
        const startRevision = apiKeyRevision;
        const legacyKey = pendingLegacyApiKey;
        const shouldScrub = needsPlaintextScrub;
        pendingLegacyApiKey = null;
        needsPlaintextScrub = false;

        if (legacyKey) {
          let migrated = false;
          let resolvedKey = legacyKey;
          await enqueueCredentialWrite(async () => {
            if (apiKeyRevision !== startRevision) {
              unmigratedLegacyApiKey = null;
              migrated = true;
              return;
            }
            const existingSecureKey = await getAiApiKey();
            if (apiKeyRevision !== startRevision) {
              unmigratedLegacyApiKey = null;
              migrated = true;
              return;
            }
            if (existingSecureKey) {
              resolvedKey = existingSecureKey;
              unmigratedLegacyApiKey = null;
              migrated = true;
              return;
            }
            try {
              await setAiApiKey(legacyKey);
              unmigratedLegacyApiKey = null;
              migrated = true;
            } catch {
              // SecureStore unavailable: restore pending state BEFORE credentialWriteChain
              // settles so concurrent hydrateApiKey calls preserve the legacy key in memory
              // and AsyncStorage is not scrubbed before SecureStore holds the key.
              if (apiKeyRevision === startRevision) {
                pendingLegacyApiKey = legacyKey;
                unmigratedLegacyApiKey = legacyKey;
                needsPlaintextScrub = true;
              }
            }
          });

          if (apiKeyRevision === startRevision) {
            set({ apiKey: resolvedKey, apiKeyHydrated: true });
          }

          if (migrated) {
            await runPlaintextScrub().catch(() => {});
          }
          return;
        }

        await credentialWriteChain;
        if (apiKeyRevision !== startRevision) {
          if (shouldScrub) {
            await runPlaintextScrub().catch(() => {});
          }
          return;
        }

        if (pendingLegacyApiKey) {
          set({ apiKey: pendingLegacyApiKey, apiKeyHydrated: true });
          return;
        }

        const storedKey = await getAiApiKey();
        if (apiKeyRevision !== startRevision) {
          if (shouldScrub) {
            await runPlaintextScrub().catch(() => {});
          }
          return;
        }

        if (pendingLegacyApiKey && !storedKey) {
          set({ apiKey: pendingLegacyApiKey, apiKeyHydrated: true });
          return;
        }

        set({ apiKey: storedKey, apiKeyHydrated: true });
        if (shouldScrub) {
          await runPlaintextScrub().catch(() => {});
        } else {
          await inFlightScrub;
        }
      },
      farmWebSearch: false,
      setFarmWebSearch: (farmWebSearch) => set({ farmWebSearch }),
      reminderEnabled: false,
      reminderMinutes: 15,
      reminderCount: 1,
      setReminder: (patch) => set(patch),
      appearance: "system",
      material: "flat",
      backgroundImage: null,
      backgroundDim: 0.18,
      backgroundTint: "sky",
      backgroundEffect: "aurora",
      defaultScheduleView: "day",
      showWeekend: true,
      showOtherWeeks: false,
      compactWeekGrid: false,
      whalePhrase: "大爹来了",
      whaleShareGrades: true,
      liveClassNotification: false,
      graduationCreditTargets: {},
      setApiKey: (apiKey) => {
        const trimmed = apiKey.trim();
        apiKeyRevision += 1;
        pendingLegacyApiKey = null;
        unmigratedLegacyApiKey = null;
        set({ apiKey: trimmed, apiKeyHydrated: true });
        void enqueueCredentialWrite(() =>
          trimmed ? setAiApiKey(trimmed) : deleteAiApiKey(),
        ).catch(() => {});
      },
      setAiProvider: (provider) =>
        set({
          aiProvider: isAiProviderId(provider) ? provider : DEFAULT_AI_PROVIDER,
        }),
      setAiBaseUrl: (url) => set({ aiBaseUrl: normalizeBaseUrl(url) }),
      setAiTextModel: (model) => set({ aiTextModel: sanitizeAiModelName(model) }),
      setAiVisionModel: (model) =>
        set({ aiVisionModel: sanitizeAiModelName(model) }),
      setUpdateMirrorPrefix: (prefix) => {
        const clean = sanitizeUpdateMirrorPrefix(prefix);
        set({ updateMirrorPrefix: clean });
        syncUpdateMirrorPrefix(clean);
      },
      setAppearance: (appearance) => set({ appearance }),
      setMaterial: (material) => set({ material: resolveMaterial(material) }),
      setBackgroundImage: (backgroundImage) => set({ backgroundImage }),
      setBackgroundDim: (dim) =>
        set({
          backgroundDim: Number.isFinite(dim)
            ? Math.max(0, Math.min(0.65, Math.round(dim * 100) / 100))
            : 0.18,
        }),
      setBackgroundTint: (backgroundTint) =>
        set({ backgroundTint: resolveTint(backgroundTint) }),
      setBackgroundEffect: (backgroundEffect) =>
        set({ backgroundEffect: resolveEffect(backgroundEffect) }),
      setDefaultScheduleView: (defaultScheduleView) =>
        set({ defaultScheduleView }),
      setShowWeekend: (showWeekend) => set({ showWeekend }),
      setShowOtherWeeks: (showOtherWeeks) => set({ showOtherWeeks }),
      setCompactWeekGrid: (compactWeekGrid) => set({ compactWeekGrid }),
      setWhalePhrase: (whalePhrase) => {
        const phrase = whalePhrase.replace(/[\s「」"“”'']/g, "").slice(0, 12);
        if (phrase.length >= 2) set({ whalePhrase: phrase });
      },
      setWhaleShareGrades: (whaleShareGrades) =>
        set({ whaleShareGrades: Boolean(whaleShareGrades) }),
      setLiveClassNotification: (liveClassNotification) =>
        set({ liveClassNotification: Boolean(liveClassNotification) }),
      setGraduationCreditTargets: (targets) =>
        set({
          graduationCreditTargets: sanitizeGraduationCreditTargets(targets),
        }),
      setGraduationCreditTarget: (typeId, target) =>
        set((s) => {
          const key = typeId.trim();
          if (
            !key ||
            key.length > 100 ||
            key === "__proto__" ||
            key === "constructor" ||
            key === "prototype"
          ) {
            return {};
          }
          const next = { ...s.graduationCreditTargets };
          if (target == null || !Number.isFinite(target) || target <= 0) {
            delete next[key];
          } else {
            next[key] = Math.min(500, Math.round(target * 100) / 100);
          }
          return { graduationCreditTargets: next };
        }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: settingsStorage,
      partialize: pickPersistedSettings,
      merge: (persisted, current) => {
        const raw =
          persisted && typeof persisted === "object"
            ? (persisted as Partial<SettingsState> & Record<string, unknown>)
            : {};
        const legacyKey =
          typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
        const hasPlaintextKeyField = Object.hasOwn(raw, "apiKey");
        if (apiKeyRevision === 0 && legacyKey) {
          pendingLegacyApiKey = legacyKey;
          unmigratedLegacyApiKey = legacyKey;
        }
        if (hasPlaintextKeyField) {
          needsPlaintextScrub = true;
        }
        const {
          apiKey: _ignoredKey,
          apiKeyHydrated: _ignoredHydrated,
          ...safePersisted
        } = raw;
        const mergedAiProvider = Object.hasOwn(raw, "aiProvider")
          ? isAiProviderId(raw.aiProvider)
            ? raw.aiProvider
            : current.aiProvider
          : current.aiProvider;
        const mergedAiBaseUrl = Object.hasOwn(raw, "aiBaseUrl")
          ? typeof raw.aiBaseUrl === "string"
            ? normalizeBaseUrl(raw.aiBaseUrl)
            : ""
          : current.aiBaseUrl;
        const mergedAiTextModel = Object.hasOwn(raw, "aiTextModel")
          ? sanitizeAiModelName(raw.aiTextModel)
          : current.aiTextModel;
        const mergedAiVisionModel = Object.hasOwn(raw, "aiVisionModel")
          ? sanitizeAiModelName(raw.aiVisionModel)
          : current.aiVisionModel;
        const mergedUpdateMirrorPrefix = Object.hasOwn(raw, "updateMirrorPrefix")
          ? sanitizeUpdateMirrorPrefix(raw.updateMirrorPrefix)
          : current.updateMirrorPrefix;
        const mergedWhaleShareGrades =
          typeof raw.whaleShareGrades === "boolean"
            ? raw.whaleShareGrades
            : current.whaleShareGrades;
        const mergedLiveClassNotification =
          typeof raw.liveClassNotification === "boolean"
            ? raw.liveClassNotification
            : current.liveClassNotification;
        const mergedMaterial = Object.hasOwn(raw, "material")
          ? resolveMaterial(raw.material)
          : current.material;
        const mergedGraduationCreditTargets = Object.hasOwn(
          raw,
          "graduationCreditTargets",
        )
          ? sanitizeGraduationCreditTargets(raw.graduationCreditTargets)
          : current.graduationCreditTargets;
        return {
          ...current,
          ...safePersisted,
          material: mergedMaterial,
          aiProvider: mergedAiProvider,
          aiBaseUrl: mergedAiBaseUrl,
          aiTextModel: mergedAiTextModel,
          aiVisionModel: mergedAiVisionModel,
          updateMirrorPrefix: mergedUpdateMirrorPrefix,
          whaleShareGrades: mergedWhaleShareGrades,
          liveClassNotification: mergedLiveClassNotification,
          graduationCreditTargets: mergedGraduationCreditTargets,
          apiKey:
            apiKeyRevision > 0 ? current.apiKey : legacyKey || current.apiKey,
          apiKeyHydrated: current.apiKeyHydrated,
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        syncUpdateMirrorPrefix(state.updateMirrorPrefix);
        if (apiKeyRevision > 0) {
          if (needsPlaintextScrub) {
            needsPlaintextScrub = false;
            void runPlaintextScrub().catch(() => {});
          }
          return;
        }
        void state.hydrateApiKey().catch(() => {});
      },
    },
  ),
);
