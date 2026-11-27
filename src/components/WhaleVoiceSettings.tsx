import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { GlassContainer } from "@/components/GlassContainer";
import { playSfx, type SfxId } from "@/services/soundEffects";
import {
  EDGE_CUTE_VOICES,
  listBreezeBlueVoices,
  SILICON_PRESET_VOICES,
  type BreezeVoiceItem,
} from "@/services/whaleTtsProviders";
import { previewWhaleVoice, stopWhaleVoice, type VoiceEngineResult } from "@/services/whaleVoice";
import { clearVoiceCache, getVoiceCacheSize } from "@/services/whaleVoiceCache";
import {
  deleteTtsApiKey,
  getTtsApiKey,
  setTtsApiKey,
  type TtsCredentialProvider,
} from "@/services/whaleVoiceCredentials";
import { useWhaleVoice, type WhaleVoiceEngine } from "@/store/useWhaleVoice";

const inputClass =
  "mt-2 rounded-2xl border border-sky-300/25 bg-white/35 px-3.5 py-2.5 text-[12.5px] leading-5 text-slate-800 dark:bg-white/[0.05] dark:text-slate-100";

const ENGINE_OPTIONS: { key: WhaleVoiceEngine; title: string; desc: string }[] = [
  {
    key: "auto",
    title: "智能混合（推荐）",
    desc: "优先已配云端软萌音色 → 免 Key Edge 少女音 → 离线自动切内置软萌拟声",
  },
  {
    key: "breezeblue",
    title: "BreezeBlue「大肥鱼」",
    desc: "官方定制大肥鱼迷糊/机灵少女音，Free 套餐每日可领 400 积分（约 2000 字）",
  },
  {
    key: "siliconflow",
    title: "硅基流动 CosyVoice2",
    desc: "国内直连低延迟，预置甜美少女音并支持 3 秒音频复刻专属声线",
  },
  {
    key: "edge",
    title: "免 Key Edge 少女音",
    desc: "无需注册、0 体积；晓伊/晓双软萌调校（网络受限或协议变动时平滑降级）",
  },
  {
    key: "cute_sfx",
    title: "纯离线软萌拟声",
    desc: "0 延迟、永不失效、全套仅 183 KB；类动森/桌宠气泡情绪声，告别机械朗读",
  },
  {
    key: "system",
    title: "系统自带朗读",
    desc: "使用手机系统 TTS 引擎（仅在明确偏好系统朗读时开启）",
  },
];

const ENGINE_LABELS: Record<VoiceEngineResult, string> = {
  breezeblue: "BreezeBlue 大肥鱼云端音色",
  siliconflow: "硅基流动 CosyVoice2",
  edge: "免 Key Edge 少女音",
  cute_sfx: "内置软萌鲸鱼拟声",
  system: "系统自带朗读",
  silent: "静音",
  cancelled: "已停止",
};

const CUTE_SAMPLES: { id: SfxId; label: string }[] = [
  { id: "whale_cute_happy", label: "开心" },
  { id: "whale_cute_tsun", label: "傲娇奶凶" },
  { id: "whale_cute_excited", label: "元气转圈" },
  { id: "whale_cute_sleepy", label: "困倦呼呼" },
  { id: "whale_cute_comfort", label: "温柔贴贴" },
];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Card({ children }: { children: ReactNode }) {
  return (
    <View className="mb-4">
      <GlassContainer radius={24}>
        <View className="p-4">{children}</View>
      </GlassContainer>
    </View>
  );
}

function ApiKeyRow({
  provider,
  label,
  placeholder,
  saved,
  onSavedChange,
}: {
  provider: TtsCredentialProvider;
  label: string;
  placeholder: string;
  saved: boolean;
  onSavedChange: (hasKey: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setNotice("");
    try {
      await setTtsApiKey(provider, draft);
      setDraft("");
      onSavedChange(true);
      setNotice("已加密保存在本机（不会明文进备份）");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await deleteTtsApiKey(provider);
      onSavedChange(false);
      setNotice("已清除本机保存的密钥");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="mt-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{label}</Text>
        <Text className={`text-[11px] font-semibold ${saved ? "text-emerald-600 dark:text-emerald-300" : "text-slate-400"}`}>
          {saved ? "已配置" : "未配置"}
        </Text>
      </View>
      <TextInput
        accessibilityLabel={label}
        value={draft}
        onChangeText={setDraft}
        placeholder={saved ? "已加密保存，如需更换请粘贴新 Key" : placeholder}
        placeholderTextColor="#94A3B8"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        className={inputClass}
      />
      <View className="mt-2 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          disabled={!draft.trim() || busy}
          onPress={() => void handleSave()}
          className={`min-h-10 flex-1 items-center justify-center rounded-xl ${draft.trim() ? "bg-sky-500" : "bg-sky-500/30"}`}
        >
          <Text className="text-[12px] font-bold text-white">保存密钥</Text>
        </Pressable>
        {saved ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void handleClear()}
            className="min-h-10 items-center justify-center rounded-xl border border-rose-400/35 px-3.5"
          >
            <Text className="text-[12px] font-semibold text-rose-500 dark:text-rose-300">清除</Text>
          </Pressable>
        ) : null}
      </View>
      {notice ? <Text className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{notice}</Text> : null}
    </View>
  );
}

export function WhaleVoiceSettings() {
  const voiceOn = useWhaleVoice((s) => s.on);
  const toggleVoice = useWhaleVoice((s) => s.toggle);
  const config = useWhaleVoice((s) => s.config);
  const setConfig = useWhaleVoice((s) => s.setConfig);

  const [hasBreezeKey, setHasBreezeKey] = useState(false);
  const [hasSiliconKey, setHasSiliconKey] = useState(false);
  const [breezeVoices, setBreezeVoices] = useState<BreezeVoiceItem[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voicesHint, setVoicesHint] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewStatus, setPreviewStatus] = useState("");
  const [cacheBytes, setCacheBytes] = useState(0);

  const refreshCache = async () => {
    try {
      setCacheBytes(await getVoiceCacheSize());
    } catch {
      setCacheBytes(0);
    }
  };

  useEffect(() => {
    let alive = true;
    void useWhaleVoice.getState().hydrate();
    void Promise.all([
      getTtsApiKey("breezeblue"),
      getTtsApiKey("siliconflow"),
      getVoiceCacheSize().catch(() => 0),
    ]).then(([b, s, size]) => {
      if (!alive) return;
      setHasBreezeKey(Boolean(b));
      setHasSiliconKey(Boolean(s));
      setCacheBytes(size);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleFetchBreezeVoices = async () => {
    if (loadingVoices) return;
    setLoadingVoices(true);
    setVoicesHint("");
    try {
      const key = await getTtsApiKey("breezeblue");
      if (!key) {
        setVoicesHint("请先在上方保存 BreezeBlue API Key");
        return;
      }
      const list = await listBreezeBlueVoices(key, "大肥鱼");
      setBreezeVoices(list);
      if (!list.length) {
        setVoicesHint("未检索到音色，可直接从 breezeblue.ai 音色页复制 Voice ID 粘贴到下方");
      } else {
        setVoicesHint(`已拉取 ${list.length} 个候选音色，点选即可应用`);
      }
    } catch (err) {
      setVoicesHint(err instanceof Error ? err.message : "拉取音色失败");
    } finally {
      setLoadingVoices(false);
    }
  };

  const handlePreview = async () => {
    if (previewBusy) return;
    setPreviewBusy(true);
    setPreviewStatus("正在合成并试听大肥鱼声音…");
    try {
      const res = await previewWhaleVoice();
      const label = ENGINE_LABELS[res.engine];
      const cacheTag = res.cached ? "（命中本地缓存）" : "";
      const errNote = res.error ? ` · 说明：${res.error}` : "";
      setPreviewStatus(`当前播报：${label}${cacheTag}${errNote}`);
      await refreshCache();
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleClearCache = async () => {
    await clearVoiceCache();
    await refreshCache();
    setPreviewStatus("已清空本地语音缓存");
  };

  const showBreeze = config.engine === "auto" || config.engine === "breezeblue";
  const showSilicon = config.engine === "auto" || config.engine === "siliconflow";
  const showEdge = config.engine === "auto" || config.engine === "edge";

  return (
    <>
      {/* 1. 总开关 */}
      <Card>
        <Text className="text-[15px] font-bold text-slate-800 dark:text-white">语音开关</Text>
        <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-sky-300/20 bg-white/25 px-3.5 py-2.5 dark:bg-white/[0.04]">
          <View className="mr-3 flex-1">
            <Text className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">大肥鱼鱼语</Text>
            <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              主聊天、桌宠与农场访客共用；内置轻量化方案不占百兆存储
            </Text>
          </View>
          <Switch
            accessibilityLabel="大肥鱼鱼语开关"
            value={voiceOn}
            onValueChange={toggleVoice}
            trackColor={{ true: "#38BDF8", false: "#64748B" }}
          />
        </View>
      </Card>

      {/* 2. 声线引擎选择 */}
      <Card>
        <Text className="text-[15px] font-bold text-slate-800 dark:text-white">大肥鱼声线方案</Text>
        <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          结合 B 站「大肥鱼」软萌 + 傲娇 + 奶凶少女音特点，按需切换云端人声、免 Key 少女音或零延迟软萌拟声。
        </Text>
        <View className="mt-3 gap-2">
          {ENGINE_OPTIONS.map((opt) => {
            const active = config.engine === opt.key;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setConfig({ engine: opt.key })}
                className={`rounded-2xl border px-3.5 py-3 ${
                  active
                    ? "border-sky-400/70 bg-sky-400/20"
                    : "border-sky-300/20 bg-white/20 dark:bg-white/[0.03]"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] font-bold text-slate-800 dark:text-white">{opt.title}</Text>
                  {active ? <Ionicons name="checkmark-circle" size={17} color="#38BDF8" /> : null}
                </View>
                <Text className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{opt.desc}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* 3. BreezeBlue 配置 */}
      {showBreeze ? (
        <Card>
          <Text className="text-[14.5px] font-bold text-slate-800 dark:text-white">BreezeBlue「大肥鱼」专属音色</Text>
          <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            在 breezeblue.ai 注册即可每日领取 400 免费积分，搜索「大肥鱼（机灵版/迷糊版）」获得同款软萌傲娇声线。
          </Text>
          <ApiKeyRow
            provider="breezeblue"
            label="BreezeBlue API Key (xi-api-key)"
            placeholder="例如：brz_xxxxxxxx"
            saved={hasBreezeKey}
            onSavedChange={setHasBreezeKey}
          />
          <View className="mt-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                音色 ID (Voice ID){config.breezeVoiceName ? ` · ${config.breezeVoiceName}` : ""}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={loadingVoices}
                onPress={() => void handleFetchBreezeVoices()}
                className="flex-row items-center rounded-full bg-sky-500/15 px-2.5 py-1"
              >
                {loadingVoices ? (
                  <ActivityIndicator size="small" color="#38BDF8" />
                ) : (
                  <Text className="text-[11px] font-semibold text-sky-600 dark:text-sky-300">自动搜大肥鱼音色</Text>
                )}
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="BreezeBlue Voice ID"
              value={config.breezeVoiceId}
              onChangeText={(v) => setConfig({ breezeVoiceId: v, breezeVoiceName: "" })}
              placeholder="粘贴大肥鱼音色 ID，或点右上角自动检索"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              className={inputClass}
            />
            {voicesHint ? <Text className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{voicesHint}</Text> : null}
            {breezeVoices.length > 0 ? (
              <View className="mt-2 gap-1.5">
                {breezeVoices.slice(0, 6).map((item) => {
                  const selected = config.breezeVoiceId === item.voiceId;
                  return (
                    <Pressable
                      key={item.voiceId}
                      onPress={() => setConfig({ breezeVoiceId: item.voiceId, breezeVoiceName: item.name })}
                      className={`rounded-xl border px-3 py-2 ${
                        selected ? "border-sky-400/70 bg-sky-400/20" : "border-sky-300/20 bg-white/20 dark:bg-white/[0.03]"
                      }`}
                    >
                      <Text className="text-[12px] font-bold text-slate-800 dark:text-slate-100">{item.name}</Text>
                      {item.description ? (
                        <Text numberOfLines={1} className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                          {item.description}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {/* 4. 硅基流动 CosyVoice2 配置 */}
      {showSilicon ? (
        <Card>
          <Text className="text-[14.5px] font-bold text-slate-800 dark:text-white">硅基流动 CosyVoice2-0.5B（国内直连）</Text>
          <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            除下方预置女声外，也可在硅基流动上传 3~10 秒 B 站大肥鱼参考干声，把生成的 `speech:...` 填进音色栏直接复刻。
          </Text>
          <ApiKeyRow
            provider="siliconflow"
            label="硅基流动 API Key"
            placeholder="例如：sk-xxxxxxxx"
            saved={hasSiliconKey}
            onSavedChange={setHasSiliconKey}
          />
          <View className="mt-3 flex-row flex-wrap gap-2">
            {SILICON_PRESET_VOICES.map((v) => {
              const selected = config.siliconVoice === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setConfig({ siliconVoice: v.id })}
                  className={`rounded-xl border px-3 py-2 ${
                    selected ? "border-sky-400/70 bg-sky-400/20" : "border-sky-300/20 bg-white/20 dark:bg-white/[0.03]"
                  }`}
                >
                  <Text className="text-[11.5px] font-bold text-slate-800 dark:text-slate-100">{v.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            accessibilityLabel="硅基流动音色名称或自定义 URI"
            value={config.siliconVoice}
            onChangeText={(v) => setConfig({ siliconVoice: v })}
            placeholder="FunAudioLLM/CosyVoice2-0.5B:diana 或 speech:..."
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            className={inputClass}
          />
        </Card>
      ) : null}

      {/* 5. 免 Key Edge 少女音配置 */}
      {showEdge ? (
        <Card>
          <Text className="text-[14.5px] font-bold text-slate-800 dark:text-white">免 Key Edge 少女音调校</Text>
          <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            未填云端 API Key 时自动启用，已按大肥鱼 5 种情绪预设高萌音调与语速微调（仅移动端支持，Web 端自动切拟声）。
          </Text>
          <View className="mt-2.5 gap-2">
            {EDGE_CUTE_VOICES.map((item) => {
              const selected = config.edgeVoice === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setConfig({ edgeVoice: item.id })}
                  className={`rounded-2xl border px-3.5 py-2.5 ${
                    selected ? "border-sky-400/70 bg-sky-400/20" : "border-sky-300/20 bg-white/20 dark:bg-white/[0.03]"
                  }`}
                >
                  <Text className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100">{item.label}</Text>
                  <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{item.hint}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}

      {/* 6. 试听、拟声体验与缓存管理 */}
      <Card>
        <Text className="text-[15px] font-bold text-slate-800 dark:text-white">试听与本地缓存</Text>
        <View className="mt-3 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            disabled={previewBusy}
            onPress={() => void handlePreview()}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-sky-500"
          >
            {previewBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="volume-high" size={16} color="#FFFFFF" />
            )}
            <Text className="text-[13px] font-bold text-white">试听大肥鱼声线</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              stopWhaleVoice();
              setPreviewBusy(false);
              setPreviewStatus("已停止播放");
            }}
            className="min-h-11 items-center justify-center rounded-2xl border border-sky-300/30 px-4"
          >
            <Text className="text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">停止</Text>
          </Pressable>
        </View>
        {previewStatus ? (
          <Text accessibilityLiveRegion="polite" className="mt-2 text-[11.5px] leading-5 text-sky-700 dark:text-sky-300">
            {previewStatus}
          </Text>
        ) : null}

        <Text className="mt-4 text-[12px] font-semibold text-slate-600 dark:text-slate-300">点按试听内置软萌拟声</Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {CUTE_SAMPLES.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => playSfx(item.id, { ignoreCooldown: true, bypassToggle: true, volume: 0.8 })}
              className="rounded-full border border-sky-300/30 bg-sky-400/15 px-3 py-1.5"
            >
              <Text className="text-[11.5px] font-semibold text-sky-700 dark:text-sky-200">♪ {item.label}</Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-4 flex-row items-center justify-between rounded-2xl border border-sky-300/20 bg-white/20 px-3.5 py-2.5 dark:bg-white/[0.03]">
          <View className="mr-3 flex-1">
            <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
              云端不可用时回退系统朗读
            </Text>
            <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
              建议保持关闭，离线时自动播软萌拟声而不是机械系统音
            </Text>
          </View>
          <Switch
            accessibilityLabel="云端不可用时回退系统朗读"
            value={config.fallbackToSystem}
            onValueChange={(v) => setConfig({ fallbackToSystem: v })}
            trackColor={{ true: "#38BDF8", false: "#64748B" }}
          />
        </View>

        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-[11.5px] text-slate-500 dark:text-slate-400">
            本地 MP3 语音缓存：{formatBytes(cacheBytes)} / 50 MB
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleClearCache()}
            className="rounded-xl border border-rose-400/30 px-3 py-1.5"
          >
            <Text className="text-[11.5px] font-semibold text-rose-500 dark:text-rose-300">清空缓存</Text>
          </Pressable>
        </View>
      </Card>
    </>
  );
}
