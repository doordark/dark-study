import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";

import { GlassContainer } from "@/components/GlassContainer";
import {
  AI_PROVIDER_PRESETS,
  getAiProviderPreset,
  normalizeBaseUrl,
  resolveAiRuntimeConfig,
  type AiProviderId,
} from "@/constants/aiProviders";
import { testDeepSeekConnection } from "@/services/deepseek";
import { useSettings } from "@/store/useSettings";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";

import { useCardEnter } from "./SettingsShared";

export function AiPetSettings() {
  const enter0 = useCardEnter(0);
  const enter1 = useCardEnter(60);
  const enter2 = useCardEnter(110);
  const personaName = useWhalePersona((s) => s.persona.name);
  const whaleActive = useWhaleMemory((s) => s.active);
  const apiKey = useSettings((s) => s.apiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const aiProvider = useSettings((s) => s.aiProvider);
  const aiBaseUrl = useSettings((s) => s.aiBaseUrl);
  const aiTextModel = useSettings((s) => s.aiTextModel);
  const aiVisionModel = useSettings((s) => s.aiVisionModel);
  const setAiProvider = useSettings((s) => s.setAiProvider);
  const setAiBaseUrl = useSettings((s) => s.setAiBaseUrl);
  const setAiTextModel = useSettings((s) => s.setAiTextModel);
  const setAiVisionModel = useSettings((s) => s.setAiVisionModel);
  const whalePhrase = useSettings((s) => s.whalePhrase);
  const setWhalePhrase = useSettings((s) => s.setWhalePhrase);

  const activePreset = getAiProviderPreset(aiProvider);
  const runtimeConfig = resolveAiRuntimeConfig({
    aiProvider,
    aiBaseUrl,
    aiTextModel,
    aiVisionModel,
  });

  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft ?? apiKey;
  const [keyOpen, setKeyOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);
  const testGenRef = useRef(0);
  const [phraseDraft, setPhraseDraft] = useState<string | null>(null);
  const [phraseSaved, setPhraseSaved] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(
    () =>
      aiProvider === "custom" ||
      Boolean(aiBaseUrl || aiTextModel || aiVisionModel),
  );
  const [baseUrlDraft, setBaseUrlDraft] = useState<string | null>(null);
  const [textModelDraft, setTextModelDraft] = useState<string | null>(null);
  const [visionModelDraft, setVisionModelDraft] = useState<string | null>(null);
  const [endpointNotice, setEndpointNotice] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const currentBaseUrlInput = baseUrlDraft ?? aiBaseUrl;
  const currentTextModelInput = textModelDraft ?? aiTextModel;
  const currentVisionModelInput = visionModelDraft ?? aiVisionModel;
  const hasCustomOverrides = Boolean(
    currentBaseUrlInput.trim() ||
      currentTextModelInput.trim() ||
      currentVisionModelInput.trim(),
  );

  const cancelTest = () => {
    testGenRef.current += 1;
    testAbortRef.current?.abort();
    testAbortRef.current = null;
    setTesting(false);
  };

  useEffect(
    () => () => {
      testAbortRef.current?.abort();
    },
    [],
  );

  const selectProvider = (nextId: AiProviderId) => {
    if (nextId === aiProvider) {
      if (nextId === "custom") setAdvancedOpen(true);
      return;
    }
    cancelTest();
    setTestResult(null);
    setEndpointNotice(null);
    setAiProvider(nextId);
    setAiBaseUrl("");
    setAiTextModel("");
    setAiVisionModel("");
    setBaseUrlDraft(null);
    setTextModelDraft(null);
    setVisionModelDraft(null);
    if (nextId === "custom") setAdvancedOpen(true);
  };

  const resetProviderDefaults = () => {
    cancelTest();
    setTestResult(null);
    setAiBaseUrl("");
    setAiTextModel("");
    setAiVisionModel("");
    setBaseUrlDraft(null);
    setTextModelDraft(null);
    setVisionModelDraft(null);
    setEndpointNotice({
      ok: true,
      text: `已恢复「${activePreset.label}」默认接口与模型`,
    });
  };

  const saveEndpointConfig = () => {
    const rawUrl = currentBaseUrlInput.trim();
    if (rawUrl && !normalizeBaseUrl(rawUrl)) {
      setEndpointNotice({
        ok: false,
        text: "接口地址无效，请输入以 http:// 或 https:// 开头的完整地址",
      });
      return;
    }
    setAiBaseUrl(rawUrl);
    setAiTextModel(currentTextModelInput);
    setAiVisionModel(currentVisionModelInput);
    setBaseUrlDraft(null);
    setTextModelDraft(null);
    setVisionModelDraft(null);
    setEndpointNotice({
      ok: true,
      text: "已保存接口与模型配置",
    });
  };

  const canTestConnection =
    !testing &&
    Boolean(runtimeConfig.baseUrl) &&
    (!activePreset.requiresApiKey || Boolean(editing.trim()));

  const runTest = async () => {
    cancelTest();
    const gen = testGenRef.current;
    const controller = new AbortController();
    testAbortRef.current = controller;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testDeepSeekConnection(editing, controller.signal);
      if (testGenRef.current !== gen) return;
      setTestResult({
        ok: true,
        text: `连接成功（${res.latencyMs}ms${res.modelCount ? ` · 可用模型 ${res.modelCount} 个` : ""}）`,
      });
    } catch (error) {
      if (testGenRef.current !== gen) return;
      setTestResult({
        ok: false,
        text:
          error instanceof Error ? error.message : "连接失败，请检查密钥与网络",
      });
    } finally {
      if (testGenRef.current === gen) {
        testAbortRef.current = null;
        setTesting(false);
      }
    }
  };

  const closeKeyModal = () => {
    cancelTest();
    setKeyOpen(false);
  };

  const currentPhraseInput = phraseDraft ?? whalePhrase;
  const keyStatusSummary = !activePreset.requiresApiKey
    ? apiKey
      ? "免密钥直连 · 已填可选密钥"
      : "免密钥本地直连（可测试连通性）"
    : apiKey
      ? "已配置密钥（可测试连通性）"
      : "点击配置 API Key";

  return (
    <>
      <Animated.View entering={enter0}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              cancelTest();
              setDraft(apiKey);
              setSaved(false);
              setReveal(false);
              setTestResult(null);
              setKeyOpen(true);
            }}
            className="min-h-20 flex-row items-center px-4 py-4"
          >
            <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/20">
              <Ionicons name="key-outline" size={22} color="#38BDF8" />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                AI 连接
              </Text>
              <Text
                numberOfLines={1}
                className="mt-1 text-[11px] text-slate-500 dark:text-slate-400"
              >
                {activePreset.label} · {keyStatusSummary}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
          </Pressable>

          <View className="border-t border-slate-300/25 px-4 pb-4 pt-3 dark:border-white/10">
            <Text className="mb-2 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
              服务商预设
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {AI_PROVIDER_PRESETS.map((preset) => {
                const selected = aiProvider === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => selectProvider(preset.id)}
                    className={`rounded-xl border px-3 py-1.5 ${
                      selected
                        ? "border-sky-500/75 bg-sky-500/20"
                        : "border-slate-300/30 bg-white/25 dark:border-white/10 dark:bg-white/[0.05]"
                    }`}
                  >
                    <Text
                      className={`text-[11.5px] font-semibold ${
                        selected
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text className="mt-2 text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
              {activePreset.hint}
              {!activePreset.supportsDeepSeekServerTools
                ? " · 联网搜索自动走通用通道"
                : ""}
            </Text>

            <View className="mt-3 flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                onPress={() => setAdvancedOpen((v) => !v)}
                className="flex-row items-center gap-1.5 py-1"
              >
                <Text className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
                  接口与模型配置
                </Text>
                <Text className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  {runtimeConfig.textModel || "待填写"}
                </Text>
                <Ionicons
                  name={advancedOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color="#94A3B8"
                />
              </Pressable>

              {hasCustomOverrides ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={resetProviderDefaults}
                  className="rounded-lg border border-slate-300/35 bg-white/25 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <Text className="text-[10.5px] font-semibold text-sky-600 dark:text-sky-300">
                    恢复默认
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {advancedOpen ? (
              <View className="mt-2.5 gap-y-2.5">
                <View>
                  <Text className="mb-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Base URL
                  </Text>
                  <TextInput
                    accessibilityLabel="AI Base URL"
                    value={currentBaseUrlInput}
                    onChangeText={(v) => {
                      setBaseUrlDraft(v);
                      setEndpointNotice(null);
                    }}
                    placeholder={
                      activePreset.baseUrl ||
                      "https://your-gateway.example.com/v1"
                    }
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2 text-[12.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                  />
                </View>

                <View>
                  <Text className="mb-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    文本模型（Text Model）
                  </Text>
                  <TextInput
                    accessibilityLabel="文本模型"
                    value={currentTextModelInput}
                    onChangeText={(v) => {
                      setTextModelDraft(v);
                      setEndpointNotice(null);
                    }}
                    placeholder={
                      activePreset.defaultTextModel ||
                      "如 deepseek-flash / gemini-3.8-flash / qwen3.8-flash"
                    }
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2 text-[12.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                  />
                </View>

                <View>
                  <Text className="mb-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    视觉模型（Vision Model）
                  </Text>
                  <TextInput
                    accessibilityLabel="视觉模型"
                    value={currentVisionModelInput}
                    onChangeText={(v) => {
                      setVisionModelDraft(v);
                      setEndpointNotice(null);
                    }}
                    placeholder={
                      activePreset.defaultVisionModel || "留空则复用文本模型"
                    }
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2 text-[12.5px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                  />
                </View>

                <View className="flex-row gap-2 pt-0.5">
                  <Pressable
                    accessibilityRole="button"
                    onPress={resetProviderDefaults}
                    className="flex-1 items-center rounded-xl border border-slate-300/35 bg-white/25 py-2 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <Text className="text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
                      恢复默认
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={saveEndpointConfig}
                    className="flex-1 items-center rounded-xl bg-sky-500 py-2"
                  >
                    <Text className="text-[11.5px] font-bold text-white">
                      保存接口与模型
                    </Text>
                  </Pressable>
                </View>

                {endpointNotice ? (
                  <Text
                    className={`text-[11px] font-semibold ${
                      endpointNotice.ok
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-rose-600 dark:text-rose-300"
                    }`}
                  >
                    {endpointNotice.text}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </GlassContainer>
      </Animated.View>

      {keyOpen ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={closeKeyModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-center bg-black/55 px-5"
          >
            <View
              accessibilityViewIsModal
              className="max-h-[85%] w-full max-w-lg self-center overflow-hidden rounded-[28px] bg-slate-50 dark:bg-slate-900"
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 24 }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sky-400/15">
                    <Ionicons
                      name="sparkles-outline"
                      size={25}
                      color="#38BDF8"
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="关闭 AI 连接设置"
                    onPress={closeKeyModal}
                    className="h-11 w-11 items-center justify-center rounded-full bg-slate-200/60 dark:bg-white/10"
                  >
                    <Ionicons name="close" size={22} color="#64748B" />
                  </Pressable>
                </View>
                <Text className="mt-5 text-[23px] font-bold text-slate-800 dark:text-white">
                  连接你的 AI
                </Text>
                <Text className="mt-2 text-[13px] leading-6 text-slate-500 dark:text-slate-400">
                  当前服务商：{activePreset.label}（
                  {runtimeConfig.baseUrl || "未设置接口地址"}）。
                </Text>
                <Text className="mb-2 mt-6 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                  {activePreset.label} API Key
                  {activePreset.requiresApiKey ? "" : "（可选）"}
                </Text>
                <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                  <TextInput
                    accessibilityLabel={`${activePreset.label} API Key`}
                    value={editing}
                    onChangeText={(v) => {
                      cancelTest();
                      setDraft(v);
                      setSaved(false);
                      setTestResult(null);
                    }}
                    placeholder={
                      !activePreset.requiresApiKey
                        ? "本地服务可留空"
                        : activePreset.id === "gemini"
                          ? "输入或粘贴 AIza…（Google AI Studio Key）"
                          : activePreset.id === "openrouter"
                            ? "输入或粘贴 sk-or-…"
                            : "输入或粘贴 sk-…"
                    }
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!reveal}
                    className="min-h-14 flex-1 px-4 py-3 text-[14px] text-slate-800 dark:text-slate-100"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={reveal ? "隐藏密钥" : "显示密钥"}
                    onPress={() => setReveal(!reveal)}
                    className="h-12 w-12 items-center justify-center"
                  >
                    <Ionicons
                      name={reveal ? "eye-off-outline" : "eye-outline"}
                      size={21}
                      color="#94A3B8"
                    />
                  </Pressable>
                </View>
                <Text className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  密钥仅保存在本机系统安全存储中，调用时发送至所选服务商。可点击下方「测试连接」零消耗验证连通性。
                </Text>

                {testResult ? (
                  <View
                    className={`mt-3 rounded-2xl px-3.5 py-2.5 ${
                      testResult.ok ? "bg-emerald-500/15" : "bg-rose-500/15"
                    }`}
                  >
                    <Text
                      accessibilityLiveRegion="polite"
                      className={`text-[12px] font-semibold ${
                        testResult.ok
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-rose-600 dark:text-rose-300"
                      }`}
                    >
                      {testResult.text}
                    </Text>
                  </View>
                ) : null}

                <View className="mt-5 flex-row gap-2.5">
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canTestConnection}
                    onPress={() => void runTest()}
                    className={`min-h-12 flex-1 items-center justify-center rounded-2xl border border-sky-500/50 bg-sky-500/12 ${
                      !canTestConnection ? "opacity-40" : ""
                    }`}
                  >
                    <Text className="text-[13.5px] font-bold text-sky-700 dark:text-sky-300">
                      {testing ? "测试中…" : "测试连接"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setApiKey(editing);
                      setDraft(editing.trim());
                      setSaved(true);
                      setReveal(false);
                    }}
                    className="min-h-12 flex-1 items-center justify-center rounded-2xl bg-sky-500"
                  >
                    <Text className="text-[14px] font-bold text-white">
                      保存配置
                    </Text>
                  </Pressable>
                </View>

                <Text
                  accessibilityLiveRegion="polite"
                  className="mt-3 text-center text-[12px] text-slate-500 dark:text-slate-400"
                >
                  {saved
                    ? editing.trim()
                      ? "已保存，下次请求使用新密钥"
                      : "已清除密钥"
                    : "关闭窗口会放弃未保存的修改"}
                </Text>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}

      <Animated.View entering={enter1} style={{ marginTop: 14 }}>
        <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/whale-settings")}
            className="min-h-20 flex-row items-center px-4 py-4"
          >
            <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/20">
              <Ionicons name="options" size={22} color="#38BDF8" />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                {personaName} · Agent 人设与记忆
              </Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                配置社区大肥鱼提示词、DeepSeek 官方联网搜索、思考深度、成绩感知、临时指令与记忆
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
          </Pressable>
        </GlassContainer>
      </Animated.View>

      {whaleActive ? (
        <Animated.View entering={enter2} style={{ marginTop: 14 }}>
          <GlassContainer radius={24} intensity={42} borderOpacity={0.22}>
            <View className="px-4 py-4">
              <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
                召唤口令
              </Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                在助手对话中发送该口令可快速唤出 {personaName}（2～12 个字）
              </Text>
              <View className="mt-3 flex-row items-center gap-2">
                <TextInput
                  accessibilityLabel="召唤口令"
                  value={currentPhraseInput}
                  onChangeText={(v) => {
                    setPhraseDraft(v);
                    setPhraseSaved(false);
                  }}
                  maxLength={12}
                  placeholder="2～12 个字"
                  placeholderTextColor="#94A3B8"
                  className="flex-1 rounded-xl border border-slate-300/35 bg-white/40 px-3 py-2 text-[13px] text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
                />
                <Pressable
                  onPress={() => {
                    const cleaned = currentPhraseInput
                      .replace(/[\s「」"“”'']/g, "")
                      .slice(0, 12);
                    if (cleaned.length < 2) {
                      Alert.alert("口令太短", "请至少输入 2 个有效字符。");
                      return;
                    }
                    setWhalePhrase(cleaned);
                    setPhraseDraft(null);
                    setPhraseSaved(true);
                  }}
                  className="rounded-xl bg-sky-500 px-3.5 py-2.5"
                >
                  <Text className="text-xs font-bold text-white">保存</Text>
                </Pressable>
              </View>
              {phraseSaved ? (
                <Text className="mt-1.5 text-[11px] text-emerald-600 dark:text-emerald-300">
                  已更新召唤口令为「{whalePhrase}」
                </Text>
              ) : null}
            </View>
          </GlassContainer>
        </Animated.View>
      ) : null}
    </>
  );
}

export default AiPetSettings;
