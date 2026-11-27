import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import { PersonaSlider } from "@/components/PersonaSlider";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { DesktopPetSettings } from "@/components/DesktopPetSettings";
import { WhaleVoiceSettings } from "@/components/WhaleVoiceSettings";
import { buildWhaleAgentPromptPreview } from "@/services/whaleAgent";
import { consolidateWhaleMemory } from "@/services/whaleReflection";
import { useSettings } from "@/store/useSettings";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePet } from "@/store/useWhalePet";
import {
  COMMUNITY_WHALE_SKILL_PROMPT,
  COMMUNITY_WHALE_TEMPLATES,
  DEFAULT_WHALE_PERSONA,
  getWhaleAgentConfig,
  getWhaleStylePreview,
  normalizeWhalePersona,
  WHALE_DESCRIPTION_MAX,
  WHALE_PRESETS,
  WHALE_QUICK_DIRECTIVE_MAX,
  WHALE_TRAITS,
  type WhalePersona,
  type WhaleThinkingMode,
} from "@/utils/whalePersona";
import { MAX_WHALE_FACTS, inferFactCategory, type WhaleFactCategory } from "@/utils/whaleMemory";
import { decayWhaleEmotion, describeWhaleEmotion, resolveBondStage } from "@/utils/whaleEmotion";

const inputClass =
  "mt-2 rounded-2xl border border-sky-300/25 bg-white/35 px-3.5 py-3 text-[13px] leading-5 text-slate-800 dark:bg-white/[0.05] dark:text-slate-100";

const CATEGORY_LABELS: Record<WhaleFactCategory, string> = {
  identity: "身份称呼",
  preference: "偏好喜好",
  goal: "目标学习",
  relationship: "关系约定",
  habit: "习惯作息",
  boundary: "交流边界",
};

const REFLECTION_LABELS = {
  insight: "相处洞察",
  inside_joke: "共同默契",
  milestone: "重要节点",
} as const;

const QUICK_DIRECTIVE_CHIPS = [
  {
    label: "查资料求严谨",
    text: "查资料、榜单或技术问题时务必先联网核实，重点列清来源依据和数据，先给结论再吐槽。",
  },
  {
    label: "嘴硬吐槽拉满",
    text: "今天多一点社区大肥鱼的嘴硬护短和干饭梗，吐槽利索点，但干活依然靠谱。",
  },
  {
    label: "今天求温柔哄哄",
    text: "我今天有点累，先温柔接住我的情绪、多夸夸我，收起吐槽。",
  },
  {
    label: "学习高效模式",
    text: "正在专注复习，回答尽量精炼抓重点、分点给干货，少闲聊。",
  },
] as const;

const THINKING_OPTIONS: readonly {
  mode: WhaleThinkingMode;
  label: string;
  badge: string;
  desc: string;
}[] = [
  {
    mode: "auto",
    label: "智能按需",
    badge: "推荐",
    desc: "查资料、问榜单或复杂问题自动开启深度思考；日常闲聊极速灵动",
  },
  {
    mode: "enabled",
    label: "始终深思",
    badge: "最聪明",
    desc: "每轮都开启 DeepSeek 深度推理与多步检索引证，响应略慢但更稳",
  },
  {
    mode: "disabled",
    label: "极速直出",
    badge: "省流",
    desc: "关闭思考链，最快响应、最省 Token，仍支持一键联网搜索",
  },
];

function Card({ children }: { children: ReactNode }) {
  return (
    <View className="mb-4">
      <GlassContainer radius={24}>
        <View className="p-4">{children}</View>
      </GlassContainer>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  multiline = false,
  minHeight = 140,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  multiline?: boolean;
  minHeight?: number;
  placeholder?: string;
}) {
  return (
    <View className="mt-4">
      <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        maxLength={maxLength}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        className={inputClass}
        style={multiline ? { minHeight } : undefined}
      />
      {multiline ? (
        <Text className="mt-1 text-right text-[10px] text-slate-400">
          {value.length}/{maxLength}
        </Text>
      ) : null}
    </View>
  );
}

function PersonaAgentEditor({ persona }: { persona: WhalePersona }) {
  const [draft, setDraft] = useState(() => normalizeWhalePersona(persona));
  const [saved, setSaved] = useState(false);
  const [showSliders, setShowSliders] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const save = useWhalePersona((s) => s.save);
  const updateAgent = useWhalePersona((s) => s.updateAgent);

  const liveAgent = getWhaleAgentConfig(persona);
  const [quickDraft, setQuickDraft] = useState(liveAgent.quickDirective);
  const [quickSaved, setQuickSaved] = useState(false);

  const update = (patch: Partial<WhalePersona>) => {
    setDraft((p) => ({ ...p, ...patch }));
    setSaved(false);
  };

  const dirty =
    JSON.stringify({
      name: normalizeWhalePersona(draft).name,
      userName: normalizeWhalePersona(draft).userName,
      description: normalizeWhalePersona(draft).description,
      traits: normalizeWhalePersona(draft).traits,
    }) !==
    JSON.stringify({
      name: normalizeWhalePersona(persona).name,
      userName: normalizeWhalePersona(persona).userName,
      description: normalizeWhalePersona(persona).description,
      traits: normalizeWhalePersona(persona).traits,
    });

  const isCommunityPrompt =
    draft.description.trim() === COMMUNITY_WHALE_SKILL_PROMPT.trim();

  const applyQuickDirective = (nextText: string, enabled = true) => {
    setQuickDraft(nextText);
    updateAgent({ quickDirective: nextText, quickDirectiveEnabled: enabled });
    setQuickSaved(true);
  };

  const handleSavePersona = () => {
    const latestAgent = getWhaleAgentConfig(useWhalePersona.getState().persona);
    const merged = normalizeWhalePersona({ ...draft, agent: latestAgent });
    save(merged);
    setDraft(merged);
    setSaved(true);
  };

  return (
    <>
      {/* 1. 临时指令便签：随时临时调整修改，不动核心人设 */}
      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="flash" size={15} color="#38BDF8" />
              <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                临时指令便签
              </Text>
            </View>
            <Text className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              想临时改口风或加任务要求直接写这里，立即注入 Agent，不破坏下方主体人设。
            </Text>
          </View>
          <Switch
            accessibilityLabel="启用临时补充指令"
            value={liveAgent.quickDirectiveEnabled}
            onValueChange={(v) => updateAgent({ quickDirectiveEnabled: v })}
            trackColor={{ true: "#38BDF8", false: "#64748B" }}
          />
        </View>

        <View className="mt-3 flex-row flex-wrap gap-1.5">
          {QUICK_DIRECTIVE_CHIPS.map((chip) => (
            <Pressable
              key={chip.label}
              accessibilityRole="button"
              onPress={() => applyQuickDirective(chip.text, true)}
              className="rounded-full border border-sky-400/35 bg-sky-400/12 px-2.5 py-1"
            >
              <Text className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                + {chip.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          accessibilityLabel="临时补充指令"
          value={quickDraft}
          onChangeText={(t) => {
            setQuickDraft(t);
            setQuickSaved(false);
          }}
          maxLength={WHALE_QUICK_DIRECTIVE_MAX}
          multiline
          textAlignVertical="top"
          placeholder="例如：今天帮我查资料时尽量给时间线和原始结论，少废话但保留大肥鱼语气…"
          placeholderTextColor="#94A3B8"
          className={inputClass}
          style={{ minHeight: 74 }}
        />

        <View className="mt-2.5 flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-[10.5px] text-slate-500 dark:text-slate-400">
            {quickSaved
              ? "已实时同步到 Agent"
              : quickDraft.trim() !== liveAgent.quickDirective
                ? "点击右侧立即生效"
                : liveAgent.quickDirective
                  ? liveAgent.quickDirectiveEnabled
                    ? "当前临时指令生效中"
                    : "已暂停（保留草稿）"
                  : "留空则按下方大肥鱼主设定运行"}
          </Text>
          {quickDraft.trim() ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => applyQuickDirective("", liveAgent.quickDirectiveEnabled)}
              className="min-h-9 justify-center rounded-xl border border-slate-300/35 px-3"
            >
              <Text className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-300">
                清空
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => applyQuickDirective(quickDraft, true)}
            className="min-h-9 justify-center rounded-xl bg-sky-500 px-3.5"
          >
            <Text className="text-[11.5px] font-bold text-white">立即生效</Text>
          </Pressable>
        </View>
      </Card>

      {/* 2. 核心身份 + 中国社区大肥鱼 Skill / SOUL 提示词 */}
      <Card>
        <View className="flex-row items-center">
          <View className="mr-3 rounded-2xl bg-sky-400/15 p-1">
            <WhaleAvatar size={50} />
          </View>
          <View className="flex-1">
            <Text className="text-[16px] font-bold text-slate-800 dark:text-white">
              大肥鱼 Agent 灵魂与 Skill 提示词
            </Text>
            <Text className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              默认搭载社区经典“蓝色大肥鱼” SOUL + Skill 设定；保存后主聊天、桌宠与农场访客同步生效。
            </Text>
          </View>
        </View>

        <View className="mt-4">
          <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            一键套用社区风味模板（保留你的名字与称呼）
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {COMMUNITY_WHALE_TEMPLATES.map((tpl) => {
              const active = draft.description.trim() === tpl.description.trim();
              return (
                <Pressable
                  key={tpl.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() =>
                    update({
                      description: tpl.description,
                      traits: { ...tpl.traits },
                    })
                  }
                  className={`min-w-[46%] flex-1 rounded-2xl border p-2.5 ${
                    active
                      ? "border-sky-400/65 bg-sky-400/15"
                      : "border-slate-300/25 bg-white/15 dark:bg-white/[0.03]"
                  }`}
                >
                  <Text
                    className={`text-[12.5px] font-bold ${
                      active
                        ? "text-sky-600 dark:text-sky-300"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {tpl.label}
                    {active ? " ✓" : ""}
                  </Text>
                  <Text className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    {tpl.subtitle}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Field
          label="她的名字"
          value={draft.name}
          onChange={(name) => update({ name })}
          maxLength={20}
        />
        <Field
          label="她怎么称呼你"
          value={draft.userName}
          onChange={(userName) => update({ userName })}
          maxLength={20}
        />

        <View className="mt-4 flex-row items-center justify-between">
          <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            角色灵魂与 Skill Agent 提示词
          </Text>
          {!isCommunityPrompt ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => update({ description: COMMUNITY_WHALE_SKILL_PROMPT })}
              className="rounded-lg bg-sky-400/15 px-2.5 py-1"
            >
              <Text className="text-[10.5px] font-bold text-sky-600 dark:text-sky-300">
                载入社区默认大肥鱼 Skill
              </Text>
            </Pressable>
          ) : (
            <Text className="text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-300">
              已使用社区原味 Skill
            </Text>
          )}
        </View>
        <TextInput
          accessibilityLabel="角色灵魂与 Skill Agent 提示词"
          value={draft.description}
          onChangeText={(description) => update({ description })}
          maxLength={WHALE_DESCRIPTION_MAX}
          multiline
          textAlignVertical="top"
          placeholder="填写大肥鱼核心身份、世界观、玩梗分寸与 Agent 工作准则…"
          placeholderTextColor="#94A3B8"
          className={inputClass}
          style={{ minHeight: 220 }}
        />
        <Text className="mt-1 text-right text-[10px] text-slate-400">
          {draft.description.length}/{WHALE_DESCRIPTION_MAX}
        </Text>

        {/* 性格微调滑条（折叠收纳，避免淹没主提示词） */}
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowSliders((v) => !v)}
          className="mt-3 flex-row items-center justify-between rounded-2xl border border-slate-300/25 bg-white/20 px-3.5 py-3 dark:bg-white/[0.04]"
        >
          <View className="flex-1 pr-2">
            <Text className="text-[12.5px] font-bold text-slate-700 dark:text-slate-100">
              性格维度微调（5 项滑条与话风预览）
            </Text>
            <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
              {WHALE_TRAITS.map((t) => `${t.label} ${draft.traits[t.key]}`).join(" · ")}
            </Text>
          </View>
          <Ionicons
            name={showSliders ? "chevron-up" : "chevron-down"}
            size={18}
            color="#64748B"
          />
        </Pressable>

        {showSliders ? (
          <View className="mt-3 rounded-2xl bg-sky-400/10 p-3">
            <View className="flex-row flex-wrap gap-2">
              {WHALE_PRESETS.map((preset) => {
                const selected = WHALE_TRAITS.every(
                  ({ key }) => draft.traits[key] === preset.traits[key],
                );
                return (
                  <Pressable
                    key={preset.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => update({ traits: { ...preset.traits } })}
                    className={`min-w-[45%] flex-1 rounded-xl border p-2.5 ${
                      selected
                        ? "border-sky-400/65 bg-sky-400/15"
                        : "border-slate-300/25 bg-white/20 dark:bg-white/[0.03]"
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-bold ${
                        selected
                          ? "text-sky-600 dark:text-sky-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {preset.label}
                      {selected ? " ✓" : ""}
                    </Text>
                    <Text className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {preset.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
              预设仅微调下方 5 项滑条，你写的角色提示词全文会完整保留。
            </Text>
            {WHALE_TRAITS.map((trait) => (
              <PersonaSlider
                key={trait.key}
                label={trait.label}
                low={trait.low}
                high={trait.high}
                hint={trait.hint}
                value={draft.traits[trait.key]}
                onChange={(value) =>
                  update({ traits: { ...draft.traits, [trait.key]: value } })
                }
              />
            ))}
            <View className="mt-3 rounded-2xl bg-white/30 p-3 dark:bg-white/[0.04]">
              <Text className="text-[11px] font-bold text-sky-600 dark:text-sky-300">
                话风参考预览
              </Text>
              {getWhaleStylePreview(draft).map((item) => (
                <View key={item.key} className="mt-2.5">
                  <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {item.label} · {item.behavior}
                  </Text>
                  <Text className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                    你：{item.user}
                  </Text>
                  <Text className="text-[12px] leading-5 text-slate-700 dark:text-slate-200">
                    {draft.name.trim() || DEFAULT_WHALE_PERSONA.name}：{item.reply}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={handleSavePersona}
          className="mt-4 min-h-12 items-center justify-center rounded-2xl bg-sky-500"
        >
          <Text className="text-[14px] font-bold text-white">保存 Agent 人设</Text>
        </Pressable>
        <Text
          accessibilityLiveRegion="polite"
          className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400"
        >
          {saved
            ? "已保存 · 主聊天、桌宠与农场访客大肥鱼实时共用"
            : dirty
              ? "有未保存的人设改动，请点击上方按钮保存"
              : "人设保存在本机，与桌宠和农场彩蛋访客自动同步"}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirmReset(true)}
          className="mt-2 min-h-11 items-center justify-center"
        >
          <Text className="text-[12px] text-slate-500 dark:text-slate-400">
            恢复社区默认大肥鱼人设
          </Text>
        </Pressable>
      </Card>

      <Confirm
        visible={confirmReset}
        title="恢复社区默认大肥鱼？"
        body="将名字、称呼、提示词和滑条恢复为社区默认「蓝色大肥鱼」Skill 设定。点击保存后生效，聊天和长期记忆都会保留。"
        confirm="恢复"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          update(normalizeWhalePersona(DEFAULT_WHALE_PERSONA));
          setConfirmReset(false);
        }}
      />
    </>
  );
}

function AgentSkillsEditor() {
  const persona = useWhalePersona((s) => s.persona);
  const updateAgent = useWhalePersona((s) => s.updateAgent);
  const apiKey = useSettings((s) => s.apiKey);
  const whalePhrase = useSettings((s) => s.whalePhrase);
  const setWhalePhrase = useSettings((s) => s.setWhalePhrase);
  const whaleShareGrades = useSettings((s) => s.whaleShareGrades);
  const setWhaleShareGrades = useSettings((s) => s.setWhaleShareGrades);

  const agent = getWhaleAgentConfig(persona);
  const [phraseDraft, setPhraseDraft] = useState<string | null>(null);
  const [phraseSaved, setPhraseSaved] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  const promptPreview = useMemo(
    () => (showPromptPreview ? buildWhaleAgentPromptPreview(persona) : ""),
    [persona, showPromptPreview],
  );

  const currentPhrase = phraseDraft ?? whalePhrase;

  const skillItems: readonly {
    key: keyof typeof agent.skills;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    desc: string;
  }[] = [
    {
      key: "schedule",
      icon: "calendar-outline",
      title: "课表操控技能",
      desc: "允许通过自然语言增删改课程、按周调课与合并课表",
    },
    {
      key: "wallpaper",
      icon: "color-palette-outline",
      title: "背景色调与口令技能",
      desc: "允许聊天时直接帮她换软件色调光效、修改召唤口令",
    },
    {
      key: "image",
      icon: "image-outline",
      title: "氛围配图技能",
      desc: "允许按描述生成插画配图（不占用 DeepSeek Token）",
    },
    {
      key: "pet",
      icon: "sparkles-outline",
      title: "桌宠呼出与收回",
      desc: "允许在对话中叫她跳到屏幕边陪着你或乖乖游回水里",
    },
  ];

  return (
    <>
      {/* 1. DeepSeek 官方联网搜索 & 读网页 */}
      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="globe-outline" size={16} color="#38BDF8" />
              <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                DeepSeek 官方联网搜索
              </Text>
            </View>
            <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              直连 DeepSeek 官方内置工具（deepseek_web_search + deepseek_read_url）与官方搜索接口，自动多词检索、精读网页正文并附可点击参考来源，复用你已填的 DeepSeek API Key。
            </Text>
          </View>
          <Switch
            accessibilityLabel="开启 DeepSeek 官方联网搜索"
            value={agent.webSearchEnabled}
            onValueChange={(webSearchEnabled) => updateAgent({ webSearchEnabled })}
            trackColor={{ true: "#38BDF8", false: "#64748B" }}
          />
        </View>
        {!apiKey ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/settings/ai")}
            className="mt-3 flex-row items-center justify-between rounded-2xl border border-amber-400/40 bg-amber-400/12 px-3.5 py-2.5"
          >
            <Text className="flex-1 text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">
              尚未填写 DeepSeek API Key，点此前往配置后即可使用官方联网搜索
            </Text>
            <Ionicons name="chevron-forward" size={15} color="#D97706" />
          </Pressable>
        ) : (
          <View className="mt-3 rounded-2xl bg-emerald-400/12 px-3 py-2">
            <Text className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              ✓ 已绑定 DeepSeek API Key · 遇到不支持内置工具的第三方代理会自动无缝回退备用检索
            </Text>
          </View>
        )}
      </Card>

      {/* 2. 深度思考策略 */}
      <Card>
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="bulb-outline" size={16} color="#A78BFA" />
          <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
            思考深度模式
          </Text>
        </View>
        <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          控制大肥鱼回答前是否开启 DeepSeek 深度思考链，让查资料、排课和复杂推理更聪明。
        </Text>
        <View className="mt-3 gap-2">
          {THINKING_OPTIONS.map((opt) => {
            const active = agent.thinkingMode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => updateAgent({ thinkingMode: opt.mode })}
                className={`rounded-2xl border p-3 ${
                  active
                    ? "border-sky-400/65 bg-sky-400/15"
                    : "border-slate-300/25 bg-white/15 dark:bg-white/[0.03]"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className={`text-[13px] font-bold ${
                        active
                          ? "text-sky-600 dark:text-sky-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {opt.label}
                    </Text>
                    <View className="rounded-full bg-sky-400/15 px-2 py-0.5">
                      <Text className="text-[10px] font-bold text-sky-600 dark:text-sky-300">
                        {opt.badge}
                      </Text>
                    </View>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={18} color="#38BDF8" />
                  ) : null}
                </View>
                <Text className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                  {opt.desc}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* 3. 本地 App 技能开关 */}
      <Card>
        <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
          Agent 本地技能权限
        </Text>
        <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          按需启停大肥鱼能主动触发的应用能力，实时作用于下一轮对话。
        </Text>
        <View className="mt-3 gap-2.5">
          {skillItems.map((item) => (
            <View
              key={item.key}
              className="flex-row items-center justify-between rounded-2xl bg-white/25 px-3 py-2.5 dark:bg-white/[0.04]"
            >
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-sky-400/15">
                <Ionicons name={item.icon} size={18} color="#38BDF8" />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100">
                  {item.title}
                </Text>
                <Text className="mt-0.5 text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
                  {item.desc}
                </Text>
              </View>
              <Switch
                accessibilityLabel={item.title}
                value={agent.skills[item.key]}
                onValueChange={(v) =>
                  updateAgent({ skills: { ...agent.skills, [item.key]: v } })
                }
                trackColor={{ true: "#38BDF8", false: "#64748B" }}
              />
            </View>
          ))}
        </View>
      </Card>

      {/* 4. 成绩与空课感知开关 */}
      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="school-outline" size={16} color="#38BDF8" />
              <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
                允许大肥鱼参考成绩与空课
              </Text>
            </View>
            <Text className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              开启后大肥鱼可结合成绩绩点与空课表给出复习规划建议，关闭后不再向 AI 传入成绩数据
            </Text>
          </View>
          <Switch
            accessibilityLabel="允许大肥鱼参考成绩与空课"
            value={whaleShareGrades}
            onValueChange={setWhaleShareGrades}
            trackColor={{ true: "#38BDF8", false: "#64748B" }}
          />
        </View>
      </Card>

      {/* 5. 召唤口令 */}
      <Card>
        <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
          召唤口令
        </Text>
        <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          在普通助手对话中发送该口令可快速唤出 {persona.name}（2～12 个字）
        </Text>
        <View className="mt-3 flex-row items-center gap-2">
          <TextInput
            accessibilityLabel="召唤口令"
            value={currentPhrase}
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
            accessibilityRole="button"
            onPress={() => {
              const cleaned = currentPhrase.replace(/[\s「」"“”'']/g, "").slice(0, 12);
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
      </Card>

      {/* 5. 完整系统提示词只读预览 */}
      <Card>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowPromptPreview((v) => !v)}
          className="flex-row items-center justify-between"
        >
          <View className="flex-1 pr-2">
            <Text className="text-[14px] font-bold text-slate-800 dark:text-white">
              预览当前实际 Agent 系统提示词
            </Text>
            <Text className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
              查看人设、临时指令、滑条与技能协议拼装后的真实上下文
            </Text>
          </View>
          <Ionicons
            name={showPromptPreview ? "chevron-up" : "chevron-down"}
            size={18}
            color="#64748B"
          />
        </Pressable>
        {showPromptPreview ? (
          <View className="mt-3 rounded-2xl bg-slate-900/5 p-3 dark:bg-black/25">
            <Text
              selectable
              className="text-[11px] leading-5 text-slate-600 dark:text-slate-300"
            >
              {promptPreview}
            </Text>
          </View>
        ) : null}
      </Card>
    </>
  );
}

function Confirm({
  visible,
  title,
  body,
  confirm,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View
          accessibilityViewIsModal
          className="w-full max-w-md rounded-3xl bg-slate-100 p-5 dark:bg-slate-900"
        >
          <Text className="text-[17px] font-bold text-slate-900 dark:text-white">{title}</Text>
          <Text className="mt-3 text-[13px] leading-6 text-slate-600 dark:text-slate-300">
            {body}
          </Text>
          <View className="mt-4 flex-row justify-end gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              className="min-h-11 justify-center px-4"
            >
              <Text className="text-slate-500">取消</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              className="min-h-11 justify-center rounded-xl bg-sky-500 px-4"
            >
              <Text className="font-bold text-white">{confirm}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MemoryEditor() {
  const persona = useWhalePersona((s) => s.persona);
  const apiKey = useSettings((s) => s.apiKey);
  const careBond = useWhalePet((s) => s.care.bond);
  const facts = useWhaleMemory((s) => s.facts);
  const episodes = useWhaleMemory((s) => s.episodes);
  const openLoops = useWhaleMemory((s) => s.openLoops);
  const reflections = useWhaleMemory((s) => s.reflections);
  const emotionRaw = useWhaleMemory((s) => s.emotion);
  const bond = useWhaleMemory((s) => s.bond);
  const autoMemory = useWhaleMemory((s) => s.autoMemory);
  const autoReflect = useWhaleMemory((s) => s.autoReflect);
  const setAutoMemory = useWhaleMemory((s) => s.setAutoMemory);
  const setAutoReflect = useWhaleMemory((s) => s.setAutoReflect);
  const saveFact = useWhaleMemory((s) => s.saveFact);
  const removeFact = useWhaleMemory((s) => s.removeFact);
  const removeEpisode = useWhaleMemory((s) => s.removeEpisode);
  const removeOpenLoop = useWhaleMemory((s) => s.removeOpenLoop);
  const resolveOpenLoop = useWhaleMemory((s) => s.resolveOpenLoop);
  const removeReflection = useWhaleMemory((s) => s.removeReflection);
  const clearMemory = useWhaleMemory((s) => s.clearMemory);

  const [section, setSection] = useState<"facts" | "loops" | "reflections">("facts");
  const [editingId, setEditingId] = useState<string | undefined>();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflectHint, setReflectHint] = useState("");
  const [openedAt] = useState(() => Date.now());

  const emotion = decayWhaleEmotion(emotionRaw, openedAt, persona);
  const emotionDesc = describeWhaleEmotion(emotion);
  const stage = resolveBondStage(bond, careBond, facts.length);
  const activeLoops = openLoops.filter((l) => !l.resolvedAt);
  const full = facts.length >= MAX_WHALE_FACTS;
  const visibleFacts = facts.filter((f) =>
    f.text.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const runReflectNow = async () => {
    if (reflecting) return;
    setReflecting(true);
    setReflectHint("");
    try {
      const res = await consolidateWhaleMemory(apiKey, { manual: true });
      setReflectHint(
        res.added || res.pruned || res.resolved
          ? `整理完成：沉淀 ${res.added} 条新洞察，合并清理 ${res.pruned} 条重复旧记忆，完结 ${res.resolved} 条牵挂。`
          : "已经很整齐啦，暂时没有需要新增的洞察或合并的条目。",
      );
    } catch (error) {
      setReflectHint(
        error instanceof Error ? error.message : "整理回忆失败，请稍后重试。",
      );
    } finally {
      setReflecting(false);
    }
  };

  return (
    <>
      {/* 动态情绪温度 & 羁绊成长卡片 */}
      <Card>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
              她的心境与默契
            </Text>
            <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              陪伴 {bond.daysActive} 天 · {bond.chatTurns} 轮对话 · {bond.interactions} 次互动
            </Text>
          </View>
          <View className="rounded-full bg-sky-400/15 px-3 py-1">
            <Text className="text-[11px] font-bold text-sky-600 dark:text-sky-300">
              Lv.{stage.level} {stage.title}
            </Text>
          </View>
        </View>
        <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-300/40 dark:bg-white/10">
          <View
            style={{
              width: `${Math.max(6, Math.round(stage.progress * 100))}%`,
              height: "100%",
              backgroundColor: "#38BDF8",
            }}
          />
        </View>
        <View className="mt-3 rounded-2xl bg-white/25 px-3 py-2.5 dark:bg-white/[0.04]">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-[12px] font-bold text-slate-700 dark:text-slate-100">
                此刻心境：{emotionDesc.label}
              </Text>
              <Text className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                {emotion.reason ? `因为「${emotion.reason}」· ` : ""}
                {emotionDesc.hint}
              </Text>
            </View>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: emotionDesc.color,
              }}
            />
          </View>
          <View className="mt-2.5 flex-row gap-2">
            {[
              { label: "愉悦", val: Math.round((emotion.pleasure + 100) / 2), color: "#38BDF8" },
              { label: "活力", val: Math.round((emotion.arousal + 100) / 2), color: "#34D399" },
              { label: "小傲娇", val: Math.round((emotion.dominance + 100) / 2), color: "#A78BFA" },
            ].map((m) => (
              <View key={m.label} className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    {m.label}
                  </Text>
                  <Text style={{ color: m.color }} className="text-[10px] font-bold">
                    {m.val}
                  </Text>
                </View>
                <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-300/40 dark:bg-white/10">
                  <View
                    style={{
                      width: `${Math.max(5, Math.min(100, m.val))}%`,
                      height: "100%",
                      backgroundColor: m.color,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </Card>

      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-[15px] font-bold text-slate-800 dark:text-white">
              记忆小本本
            </Text>
            <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {facts.length}/{MAX_WHALE_FACTS} 事实 · {activeLoops.length} 牵挂 · {episodes.length} 回忆 · {reflections.length} 洞察
            </Text>
          </View>
          <Switch
            accessibilityLabel="自动记住长期偏好"
            value={autoMemory}
            onValueChange={setAutoMemory}
            trackColor={{ true: "#38BDF8", false: "#64748B" }}
          />
        </View>

        <View className="mt-3 flex-row items-center justify-between rounded-2xl bg-white/20 px-3 py-2.5 dark:bg-white/[0.04]">
          <View className="flex-1 pr-3">
            <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
              自动反思与整理记忆
            </Text>
            <Text className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
              每积累 14 轮对话静默整理一次重复事实、沉淀相处洞察与共同梗
            </Text>
          </View>
          <Switch
            accessibilityLabel="自动反思与整理记忆"
            value={autoReflect}
            onValueChange={setAutoReflect}
            trackColor={{ true: "#38BDF8", false: "#64748B" }}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={reflecting || !apiKey}
          onPress={() => void runReflectNow()}
          className={`mt-3 min-h-10 items-center justify-center rounded-xl border ${
            reflecting || !apiKey
              ? "border-slate-300/30 bg-slate-400/20"
              : "border-sky-400/45 bg-sky-400/15"
          }`}
        >
          <Text className="text-[12px] font-bold text-sky-700 dark:text-sky-200">
            {reflecting
              ? "正在整理回忆与默契…"
              : apiKey
                ? "立即帮她整理一次回忆"
                : "填写 API Key 后可手动整理回忆"}
          </Text>
        </Pressable>
        {reflectHint ? (
          <Text
            accessibilityLiveRegion="polite"
            className="mt-2 text-[11px] leading-5 text-sky-700 dark:text-sky-300"
          >
            {reflectHint}
          </Text>
        ) : null}

        {/* 记忆分层子标签 */}
        <View className="mt-4 flex-row rounded-xl bg-white/20 p-1 dark:bg-white/[0.05]">
          {(
            [
              { key: "facts", label: `核心事实 (${facts.length})` },
              { key: "loops", label: `牵挂回忆 (${activeLoops.length + episodes.length})` },
              { key: "reflections", label: `洞察默契 (${reflections.length})` },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: section === item.key }}
              onPress={() => setSection(item.key)}
              className={`min-h-9 flex-1 items-center justify-center rounded-lg ${
                section === item.key ? "bg-sky-400/25" : ""
              }`}
            >
              <Text
                className={`text-[11px] font-bold ${
                  section === item.key
                    ? "text-sky-600 dark:text-sky-300"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {section === "facts" ? (
          <>
            <Text className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              {autoMemory
                ? "自动按相关度、时间与重要度三维召回，并支持冲突自动更新；手动编辑的记忆永不被覆盖。"
                : "自动记忆已暂停，已有记忆仍会用于回答。"}
            </Text>
            <Field
              label={editingId ? "修改这条记忆" : "亲手告诉她一件事"}
              value={text}
              onChange={setText}
              maxLength={180}
              placeholder="例如：我喜欢被叫阿顾，不喜欢香菜。"
            />
            <View className="mt-3 flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                disabled={!text.trim() || (full && !editingId)}
                onPress={() => {
                  saveFact(text, editingId);
                  setText("");
                  setEditingId(undefined);
                }}
                className={`min-h-11 flex-1 items-center justify-center rounded-xl ${
                  text.trim() && (!full || editingId) ? "bg-sky-500" : "bg-slate-400/50"
                }`}
              >
                <Text className="text-[12px] font-bold text-white">
                  {editingId ? "保存记忆" : "添加记忆"}
                </Text>
              </Pressable>
              {editingId ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setEditingId(undefined);
                    setText("");
                  }}
                  className="min-h-11 justify-center px-3"
                >
                  <Text className="text-slate-500">取消</Text>
                </Pressable>
              ) : null}
            </View>
            {full ? (
              <Text className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">
                核心事实已满额，新增高重要度自动事实会自动替换最久未用的低权重条目。
              </Text>
            ) : null}
            <TextInput
              accessibilityLabel="搜索长期记忆"
              value={query}
              onChangeText={setQuery}
              placeholder="找一条记忆…"
              placeholderTextColor="#94A3B8"
              className={inputClass}
            />
            {!visibleFacts.length ? (
              <Text className="py-6 text-center text-[12px] text-slate-500 dark:text-slate-400">
                {query ? "没找到匹配的记忆" : "还没有长期记忆，聊聊你喜欢什么吧。"}
              </Text>
            ) : null}
            {[...visibleFacts]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((f) => {
                const cat = f.category ?? inferFactCategory(f.key, f.text);
                return (
                  <View
                    key={f.id}
                    className="mt-3 rounded-2xl bg-white/25 p-3 dark:bg-white/[0.04]"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="rounded-md bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                        {CATEGORY_LABELS[cat]}
                      </Text>
                      <Text className="text-[10px] text-slate-400">
                        {new Date(f.updatedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text
                      selectable
                      className="mt-1.5 text-[13px] leading-6 text-slate-700 dark:text-slate-100"
                    >
                      {f.text}
                    </Text>
                    <Text className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      {f.source === "manual" ? "你亲手写的 · 不会被自动覆盖" : "从聊天中记住"}
                    </Text>
                    {f.evidence ? (
                      <Text className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                        原话：「{f.evidence}」
                      </Text>
                    ) : null}
                    <View className="mt-1 flex-row justify-end gap-4">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`编辑记忆：${f.text}`}
                        onPress={() => {
                          setEditingId(f.id);
                          setText(f.text);
                        }}
                        className="min-h-11 justify-center"
                      >
                        <Text className="text-[12px] text-sky-600 dark:text-sky-300">编辑</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`删除记忆：${f.text}`}
                        onPress={() => setConfirm(f.id)}
                        className="min-h-11 justify-center"
                      >
                        <Text className="text-[12px] text-rose-500 dark:text-rose-300">删除</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
          </>
        ) : null}

        {section === "loops" ? (
          <View className="mt-3">
            <Text className="text-[12px] font-bold text-slate-700 dark:text-slate-200">
              近期牵挂与约定
            </Text>
            {!activeLoops.length ? (
              <Text className="py-3 text-[11px] text-slate-500 dark:text-slate-400">
                聊到考试、DDL、出行或约定，她会自动记在这里并在临近时主动关心你。
              </Text>
            ) : (
              activeLoops.map((loop) => (
                <View
                  key={loop.id}
                  className="mt-2 rounded-2xl bg-white/25 p-3 dark:bg-white/[0.04]"
                >
                  <Text className="text-[13px] font-medium text-slate-700 dark:text-slate-100">
                    {loop.topic}
                  </Text>
                  {loop.dueHint ? (
                    <Text className="mt-1 text-[10px] text-sky-600 dark:text-sky-300">
                      时间线索：{loop.dueHint}
                    </Text>
                  ) : null}
                  <View className="mt-1.5 flex-row justify-end gap-4">
                    <Pressable
                      onPress={() => resolveOpenLoop(loop.id)}
                      className="min-h-9 justify-center"
                    >
                      <Text className="text-[11px] text-emerald-600 dark:text-emerald-300">
                        标记已完成
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeOpenLoop(loop.id)}
                      className="min-h-9 justify-center"
                    >
                      <Text className="text-[11px] text-rose-500 dark:text-rose-300">移除</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
            <Text className="mt-4 text-[12px] font-bold text-slate-700 dark:text-slate-200">
              重要情景回忆
            </Text>
            {!episodes.length ? (
              <Text className="py-3 text-[11px] text-slate-500 dark:text-slate-400">
                聊到有情绪起伏或值得记住的事情时，她会悄悄记下那段回忆。
              </Text>
            ) : (
              [...episodes]
                .sort((a, b) => b.at - a.at)
                .map((ep) => (
                  <View
                    key={ep.id}
                    className="mt-2 rounded-2xl bg-white/25 p-3 dark:bg-white/[0.04]"
                  >
                    <Text className="text-[12.5px] leading-5 text-slate-700 dark:text-slate-100">
                      {ep.summary}
                    </Text>
                    <View className="mt-1 flex-row items-center justify-between">
                      <Text className="text-[10px] text-slate-500 dark:text-slate-400">
                        {ep.emotion ? `当时情绪：${ep.emotion} · ` : ""}
                        {new Date(ep.at).toLocaleDateString()}
                      </Text>
                      <Pressable
                        onPress={() => removeEpisode(ep.id)}
                        className="min-h-8 justify-center"
                      >
                        <Text className="text-[11px] text-rose-500 dark:text-rose-300">删除</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
            )}
          </View>
        ) : null}

        {section === "reflections" ? (
          <View className="mt-3">
            {!reflections.length ? (
              <Text className="py-5 text-center text-[11.5px] leading-5 text-slate-500 dark:text-slate-400">
                相处一阵子后，她会把对你的理解、你们的共同梗和相处里程碑沉淀在这里，也可以点上方按钮手动整理。
              </Text>
            ) : (
              [...reflections]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((item) => (
                  <View
                    key={item.id}
                    className="mt-2 rounded-2xl bg-white/25 p-3 dark:bg-white/[0.04]"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="rounded-md bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300">
                        {REFLECTION_LABELS[item.kind]}
                      </Text>
                      <Pressable
                        onPress={() => removeReflection(item.id)}
                        className="min-h-8 justify-center"
                      >
                        <Text className="text-[11px] text-rose-500 dark:text-rose-300">删除</Text>
                      </Pressable>
                    </View>
                    <Text className="mt-1.5 text-[12.5px] leading-5 text-slate-700 dark:text-slate-100">
                      {item.text}
                    </Text>
                  </View>
                ))
            )}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirm("all")}
          className="mt-4 min-h-12 items-center justify-center rounded-2xl border border-rose-400/30"
        >
          <Text className="text-[12px] text-rose-500 dark:text-rose-300">
            清空全部对话与记忆
          </Text>
        </Pressable>
      </Card>
      <Confirm
        visible={confirm !== null}
        title={confirm === "all" ? "让她忘掉全部对话？" : "删除这条记忆？"}
        body={
          confirm === "all"
            ? "主聊天、归档、桌宠记录、长期事实、回忆、牵挂与反思都会删除，无法恢复。你保存的 Agent 人设会保留。"
            : "这条长期记忆会删除；自动记忆对应的来源消息也会移除，避免再次被旧对话找回。"
        }
        confirm="删除"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "all") clearMemory();
          else if (confirm) removeFact(confirm);
          setConfirm(null);
          setEditingId(undefined);
          setText("");
        }}
      />
    </>
  );
}

function CompanionSettingsPanel() {
  const [sub, setSub] = useState<"voice" | "pet">("voice");
  return (
    <>
      <View className="mb-4 flex-row rounded-2xl bg-white/25 p-1 dark:bg-white/[0.05]">
        {(
          [
            { key: "voice", label: "声音与音效" },
            { key: "pet", label: "屏幕桌宠" },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: sub === item.key }}
            onPress={() => setSub(item.key)}
            className={`min-h-10 flex-1 items-center justify-center rounded-xl ${
              sub === item.key ? "bg-sky-400/25" : ""
            }`}
          >
            <Text
              className={`text-[12px] font-bold ${
                sub === item.key
                  ? "text-sky-600 dark:text-sky-300"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {sub === "voice" ? <WhaleVoiceSettings /> : <DesktopPetSettings />}
    </>
  );
}

export function WhaleSettingsScreen() {
  const persona = useWhalePersona((s) => s.persona);
  const personaHydrated = useWhalePersona((s) => s.hydrated);
  const memoryHydrated = useWhaleMemory((s) => s.hydrated);
  const [tab, setTab] = useState<"soul" | "skills" | "memory" | "companion">("soul");

  return (
    <View className="flex-1">
      <Backdrop>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View className="flex-row items-center px-5 pb-3 pt-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回"
              onPress={() => router.back()}
              className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"
            >
              <Ionicons name="chevron-back" size={20} color="#94A3B8" />
            </Pressable>
            <View>
              <Text className="text-[22px] font-extrabold text-slate-800 dark:text-white">
                {persona.name} Agent
              </Text>
              <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                人设灵魂 · 官方搜索技能 · 记忆与桌宠一站调整
              </Text>
            </View>
          </View>

          <View className="mx-5 mb-4 flex-row rounded-2xl bg-white/20 p-1 dark:bg-white/[0.05]">
            {(
              [
                { key: "soul", label: "灵魂人设" },
                { key: "skills", label: "技能大脑" },
                { key: "memory", label: "记忆大脑" },
                { key: "companion", label: "声音桌宠" },
              ] as const
            ).map((t) => (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
                aria-selected={tab === t.key}
                onPress={() => setTab(t.key)}
                className={`min-h-11 flex-1 items-center justify-center rounded-xl ${
                  tab === t.key ? "bg-sky-400/25" : ""
                }`}
              >
                <Text
                  className={`text-[12px] font-bold ${
                    tab === t.key
                      ? "text-sky-600 dark:text-sky-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          >
            {personaHydrated && memoryHydrated ? (
              <>
                <View style={{ display: tab === "soul" ? "flex" : "none" }}>
                  <PersonaAgentEditor persona={persona} />
                </View>
                <View style={{ display: tab === "skills" ? "flex" : "none" }}>
                  <AgentSkillsEditor />
                </View>
                <View style={{ display: tab === "memory" ? "flex" : "none" }}>
                  <MemoryEditor />
                </View>
                {tab === "companion" ? <CompanionSettingsPanel /> : null}
              </>
            ) : (
              <Text className="py-6 text-center text-slate-500">正在翻开小本本…</Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Backdrop>
    </View>
  );
}
