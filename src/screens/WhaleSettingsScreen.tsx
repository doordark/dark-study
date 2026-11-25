import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Backdrop } from "@/components/Backdrop";
import { GlassContainer } from "@/components/GlassContainer";
import { PersonaSlider } from "@/components/PersonaSlider";
import { WhaleAvatar } from "@/components/WhaleAvatar";
import { DesktopPetSettings } from "@/components/DesktopPetSettings";
import { WhaleVoiceSettings } from "@/components/WhaleVoiceSettings";
import { consolidateWhaleMemory } from "@/services/whaleReflection";
import { useSettings } from "@/store/useSettings";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePet } from "@/store/useWhalePet";
import { DEFAULT_WHALE_PERSONA, getWhaleStylePreview, normalizeWhalePersona, WHALE_PRESETS, WHALE_TRAITS, type WhalePersona } from "@/utils/whalePersona";
import { MAX_WHALE_FACTS, inferFactCategory, type WhaleFactCategory } from "@/utils/whaleMemory";
import { decayWhaleEmotion, describeWhaleEmotion, resolveBondStage } from "@/utils/whaleEmotion";

const inputClass = "mt-2 rounded-2xl border border-sky-300/25 bg-white/35 px-3.5 py-3 text-[13px] leading-5 text-slate-800 dark:bg-white/[0.05] dark:text-slate-100";

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

function Card({ children }: { children: ReactNode }) {
  return <View className="mb-4"><GlassContainer radius={24}><View className="p-4">{children}</View></GlassContainer></View>;
}

function Field({ label, value, onChange, maxLength, multiline = false, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; maxLength: number; multiline?: boolean; placeholder?: string;
}) {
  return <View className="mt-4">
    <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} maxLength={maxLength} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} placeholder={placeholder} placeholderTextColor="#94A3B8" className={inputClass} style={multiline ? { minHeight: 140 } : undefined} />
    {multiline ? <Text className="mt-1 text-right text-[10px] text-slate-400">{value.length}/{maxLength}</Text> : null}
  </View>;
}

function PersonaEditor({ persona }: { persona: WhalePersona }) {
  const [draft, setDraft] = useState(() => normalizeWhalePersona(persona));
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const save = useWhalePersona((s) => s.save);
  const update = (patch: Partial<WhalePersona>) => { setDraft((p) => ({ ...p, ...patch })); setSaved(false); };
  const dirty = JSON.stringify(normalizeWhalePersona(draft)) !== JSON.stringify(normalizeWhalePersona(persona));

  return <>
    <Card>
      <View className="flex-row items-center">
        <View className="mr-3 rounded-2xl bg-sky-400/15 p-1"><WhaleAvatar size={50} /></View>
        <View className="flex-1">
          <Text className="text-[17px] font-bold text-slate-800 dark:text-white">让她更像你喜欢的样子</Text>
          <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">选个起点，再慢慢调。保存后主聊天、桌宠与农场访客大肥鱼实时同步生效。</Text>
        </View>
      </View>
      <View className="mt-4 flex-row flex-wrap gap-2">
        {WHALE_PRESETS.map((preset) => {
          const selected = WHALE_TRAITS.every(({ key }) => draft.traits[key] === preset.traits[key]);
          return <Pressable key={preset.label} accessibilityRole="button" accessibilityState={{ selected }} aria-pressed={selected} onPress={() => update({ traits: { ...preset.traits } })} className={`min-w-[45%] flex-1 rounded-2xl border p-3 ${selected ? "border-sky-400/65 bg-sky-400/15" : "border-slate-300/25 bg-white/15 dark:bg-white/[0.03]"}`}>
            <Text className={`text-[13px] font-bold ${selected ? "text-sky-600 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"}`}>{preset.label}{selected ? " ✓" : ""}</Text>
            <Text className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{preset.description}</Text>
          </Pressable>;
        })}
      </View>
      <Text className="mt-3 text-[10px] leading-4 text-slate-500 dark:text-slate-400">预设只调整滑条，你写的角色背景会保留。</Text>
      {WHALE_TRAITS.map((trait) => <PersonaSlider key={trait.key} label={trait.label} low={trait.low} high={trait.high} hint={trait.hint} value={draft.traits[trait.key]} onChange={(value) => update({ traits: { ...draft.traits, [trait.key]: value } })} />)}
    </Card>

    <Card>
      <Text className="text-[15px] font-bold text-slate-800 dark:text-white">自定义人设</Text>
      <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">这里设置背景、关系、口头禅和交流边界；五项性格强度以滑条为准，调整后请保存。</Text>
      <Field label="她的名字" value={draft.name} onChange={(name) => update({ name })} maxLength={20} />
      <Field label="她怎么称呼你" value={draft.userName} onChange={(userName) => update({ userName })} maxLength={20} />
      <Field label="角色背景与说话习惯" value={draft.description} onChange={(description) => update({ description })} maxLength={1500} multiline placeholder="例如：嘴上傲娇但行动很温柔。叫我阿顾；我烦恼时先听我说，不急着给建议。少用括号动作。" />
      <View className="mt-3 rounded-2xl bg-sky-400/10 p-3">
        <Text className="text-[11px] font-bold text-sky-600 dark:text-sky-300">当前设定概览</Text>
        <Text className="mt-1 text-[12px] leading-5 text-slate-700 dark:text-slate-200">{draft.name.trim() || DEFAULT_WHALE_PERSONA.name} · 称呼你为「{draft.userName.trim() || DEFAULT_WHALE_PERSONA.userName}」</Text>
        <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{WHALE_TRAITS.map((t) => `${t.label} ${draft.traits[t.key]}`).join(" · ")}</Text>
        <Text className="mt-3 text-[11px] font-bold text-sky-600 dark:text-sky-300">说话风格预览</Text>
        <Text className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">每组只演示一项，实际聊天会结合全部设置、动态心境和当前语境。</Text>
        {getWhaleStylePreview(draft).map((item) => <View key={item.key} className="mt-3">
          <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{item.label} · {item.behavior}</Text>
          <Text className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">你：{item.user}</Text>
          <Text className="text-[12px] leading-5 text-slate-700 dark:text-slate-200">{draft.name.trim() || DEFAULT_WHALE_PERSONA.name}：{item.reply}</Text>
        </View>)}
      </View>
      <Pressable accessibilityRole="button" onPress={() => { save(draft); setDraft(normalizeWhalePersona(draft)); setSaved(true); }} className="mt-4 min-h-12 items-center justify-center rounded-2xl bg-sky-500">
        <Text className="text-[14px] font-bold text-white">保存人设</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">{saved ? "已保存 · 主聊天、桌宠与农场访客大肥鱼实时共用" : dirty ? "有未保存的修改，请保存后再离开" : "人设保存在本机，与农场彩蛋访客自动同步"}</Text>
      <Pressable accessibilityRole="button" onPress={() => setConfirmReset(true)} className="mt-2 min-h-11 items-center justify-center">
        <Text className="text-[12px] text-slate-500 dark:text-slate-400">恢复默认人设</Text>
      </Pressable>
    </Card>
    <Confirm visible={confirmReset} title="恢复默认人设？" body="将名字、称呼、角色背景和滑条恢复为经典大肥鱼。点击保存后生效，聊天和记忆会保留。" confirm="恢复" onCancel={() => setConfirmReset(false)} onConfirm={() => { update(normalizeWhalePersona(DEFAULT_WHALE_PERSONA)); setConfirmReset(false); }} />
  </>;
}

function Confirm({ visible, title, body, confirm, onConfirm, onCancel }: {
  visible: boolean; title: string; body: string; confirm: string; onConfirm: () => void; onCancel: () => void;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View className="flex-1 items-center justify-center bg-black/60 px-6">
      <View accessibilityViewIsModal className="w-full max-w-md rounded-3xl bg-slate-100 p-5 dark:bg-slate-900">
        <Text className="text-[17px] font-bold text-slate-900 dark:text-white">{title}</Text>
        <Text className="mt-3 text-[13px] leading-6 text-slate-600 dark:text-slate-300">{body}</Text>
        <View className="mt-4 flex-row justify-end gap-3">
          <Pressable accessibilityRole="button" onPress={onCancel} className="min-h-11 justify-center px-4"><Text className="text-slate-500">取消</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onConfirm} className="min-h-11 justify-center rounded-xl bg-sky-500 px-4"><Text className="font-bold text-white">{confirm}</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
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
  const visibleFacts = facts.filter((f) => f.text.toLowerCase().includes(query.trim().toLowerCase()));

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
      setReflectHint(error instanceof Error ? error.message : "整理回忆失败，请稍后重试。");
    } finally {
      setReflecting(false);
    }
  };

  return <>
    {/* 动态情绪温度 & 羁绊成长卡片 */}
    <Card>
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-[15px] font-bold text-slate-800 dark:text-white">她的心境与默契</Text>
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
        <View style={{ width: `${Math.max(6, Math.round(stage.progress * 100))}%`, height: "100%", backgroundColor: "#38BDF8" }} />
      </View>
      <View className="mt-3 rounded-2xl bg-white/25 px-3 py-2.5 dark:bg-white/[0.04]">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-[12px] font-bold text-slate-700 dark:text-slate-100">
              此刻心境：{emotionDesc.label}
            </Text>
            <Text className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {emotion.reason ? `因为「${emotion.reason}」· ` : ""}{emotionDesc.hint}
            </Text>
          </View>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: emotionDesc.color }} />
        </View>
        <View className="mt-2.5 flex-row gap-2">
          {[
            { label: "愉悦", val: Math.round((emotion.pleasure + 100) / 2), color: "#38BDF8" },
            { label: "活力", val: Math.round((emotion.arousal + 100) / 2), color: "#34D399" },
            { label: "小傲娇", val: Math.round((emotion.dominance + 100) / 2), color: "#A78BFA" },
          ].map((m) => (
            <View key={m.label} className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{m.label}</Text>
                <Text style={{ color: m.color }} className="text-[10px] font-bold">{m.val}</Text>
              </View>
              <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-300/40 dark:bg-white/10">
                <View style={{ width: `${Math.max(5, Math.min(100, m.val))}%`, height: "100%", backgroundColor: m.color }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </Card>

    <Card>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-[15px] font-bold text-slate-800 dark:text-white">记忆小本本</Text>
          <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {facts.length}/{MAX_WHALE_FACTS} 事实 · {activeLoops.length} 牵挂 · {episodes.length} 回忆 · {reflections.length} 洞察
          </Text>
        </View>
        <Switch accessibilityLabel="自动记住长期偏好" value={autoMemory} onValueChange={setAutoMemory} trackColor={{ true: "#38BDF8", false: "#64748B" }} />
      </View>

      <View className="mt-3 flex-row items-center justify-between rounded-2xl bg-white/20 px-3 py-2.5 dark:bg-white/[0.04]">
        <View className="flex-1 pr-3">
          <Text className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">自动反思与整理记忆</Text>
          <Text className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
            每积累 14 轮对话静默整理一次重复事实、沉淀相处洞察与共同梗
          </Text>
        </View>
        <Switch accessibilityLabel="自动反思与整理记忆" value={autoReflect} onValueChange={setAutoReflect} trackColor={{ true: "#38BDF8", false: "#64748B" }} />
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
          {reflecting ? "正在整理回忆与默契…" : apiKey ? "立即帮她整理一次回忆" : "填写 API Key 后可手动整理回忆"}
        </Text>
      </Pressable>
      {reflectHint ? (
        <Text accessibilityLiveRegion="polite" className="mt-2 text-[11px] leading-5 text-sky-700 dark:text-sky-300">
          {reflectHint}
        </Text>
      ) : null}

      {/* 记忆分层子标签 */}
      <View className="mt-4 flex-row rounded-xl bg-white/20 p-1 dark:bg-white/[0.05]">
        {([
          { key: "facts", label: `核心事实 (${facts.length})` },
          { key: "loops", label: `牵挂回忆 (${activeLoops.length + episodes.length})` },
          { key: "reflections", label: `洞察默契 (${reflections.length})` },
        ] as const).map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === item.key }}
            onPress={() => setSection(item.key)}
            className={`min-h-9 flex-1 items-center justify-center rounded-lg ${section === item.key ? "bg-sky-400/25" : ""}`}
          >
            <Text className={`text-[11px] font-bold ${section === item.key ? "text-sky-600 dark:text-sky-300" : "text-slate-500 dark:text-slate-400"}`}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {section === "facts" ? (
        <>
          <Text className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            {autoMemory ? "自动按相关度、时间与重要度三维召回，并支持冲突自动更新；手动编辑的记忆永不被覆盖。" : "自动记忆已暂停，已有记忆仍会用于回答。"}
          </Text>
          <Field label={editingId ? "修改这条记忆" : "亲手告诉她一件事"} value={text} onChange={setText} maxLength={180} placeholder="例如：我喜欢被叫阿顾，不喜欢香菜。" />
          <View className="mt-3 flex-row items-center gap-3">
            <Pressable accessibilityRole="button" disabled={!text.trim() || (full && !editingId)} onPress={() => { saveFact(text, editingId); setText(""); setEditingId(undefined); }} className={`min-h-11 flex-1 items-center justify-center rounded-xl ${text.trim() && (!full || editingId) ? "bg-sky-500" : "bg-slate-400/50"}`}>
              <Text className="text-[12px] font-bold text-white">{editingId ? "保存记忆" : "添加记忆"}</Text>
            </Pressable>
            {editingId ? <Pressable accessibilityRole="button" onPress={() => { setEditingId(undefined); setText(""); }} className="min-h-11 justify-center px-3"><Text className="text-slate-500">取消</Text></Pressable> : null}
          </View>
          {full ? <Text className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">核心事实已满额，新增高重要度自动事实会自动替换最久未用的低权重条目。</Text> : null}
          <TextInput accessibilityLabel="搜索长期记忆" value={query} onChangeText={setQuery} placeholder="找一条记忆…" placeholderTextColor="#94A3B8" className={inputClass} />
          {!visibleFacts.length ? <Text className="py-6 text-center text-[12px] text-slate-500 dark:text-slate-400">{query ? "没找到匹配的记忆" : "还没有长期记忆，聊聊你喜欢什么吧。"}</Text> : null}
          {[...visibleFacts].sort((a, b) => b.updatedAt - a.updatedAt).map((f) => {
            const cat = f.category ?? inferFactCategory(f.key, f.text);
            return (
              <View key={f.id} className="mt-3 rounded-2xl bg-white/25 p-3 dark:bg-white/[0.04]">
                <View className="flex-row items-center justify-between">
                  <Text className="rounded-md bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                    {CATEGORY_LABELS[cat]}
                  </Text>
                  <Text className="text-[10px] text-slate-400">{new Date(f.updatedAt).toLocaleDateString()}</Text>
                </View>
                <Text selectable className="mt-1.5 text-[13px] leading-6 text-slate-700 dark:text-slate-100">{f.text}</Text>
                <Text className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{f.source === "manual" ? "你亲手写的 · 不会被自动覆盖" : "从聊天中记住"}</Text>
                {f.evidence ? <Text className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">原话：「{f.evidence}」</Text> : null}
                <View className="mt-1 flex-row justify-end gap-4">
                  <Pressable accessibilityRole="button" accessibilityLabel={`编辑记忆：${f.text}`} onPress={() => { setEditingId(f.id); setText(f.text); }} className="min-h-11 justify-center"><Text className="text-[12px] text-sky-600 dark:text-sky-300">编辑</Text></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`删除记忆：${f.text}`} onPress={() => setConfirm(f.id)} className="min-h-11 justify-center"><Text className="text-[12px] text-rose-500 dark:text-rose-300">删除</Text></Pressable>
                </View>
              </View>
            );
          })}
        </>
      ) : null}

      {section === "loops" ? (
        <View className="mt-3">
          <Text className="text-[12px] font-bold text-slate-700 dark:text-slate-200">近期牵挂与约定</Text>
          {!activeLoops.length ? (
            <Text className="py-3 text-[11px] text-slate-500 dark:text-slate-400">聊到考试、DDL、出行或约定，她会自动记在这里并在临近时主动关心你。</Text>
          ) : (
            activeLoops.map((loop) => (
              <View key={loop.id} className="mt-2 rounded-2xl bg-white/25 p-3 dark:bg-white/[0.04]">
                <Text className="text-[13px] font-medium text-slate-700 dark:text-slate-100">{loop.topic}</Text>
                {loop.dueHint ? <Text className="mt-1 text-[10px] text-sky-600 dark:text-sky-300">时间线索：{loop.dueHint}</Text> : null}
                <View className="mt-1.5 flex-row justify-end gap-4">
                  <Pressable onPress={() => resolveOpenLoop(loop.id)} className="min-h-9 justify-center"><Text className="text-[11px] text-emerald-600 dark:text-emerald-300">标记已完成</Text></Pressable>
                  <Pressable onPress={() => removeOpenLoop(loop.id)} className="min-h-9 justify-center"><Text className="text-[11px] text-rose-500 dark:text-rose-300">移除</Text></Pressable>
                </View>
              </View>
            ))
          )}
          <Text className="mt-4 text-[12px] font-bold text-slate-700 dark:text-slate-200">重要情景回忆</Text>
          {!episodes.length ? (
            <Text className="py-3 text-[11px] text-slate-500 dark:text-slate-400">聊到有情绪起伏或值得记住的事情时，她会悄悄记下那段回忆。</Text>
          ) : (
            [...episodes].sort((a, b) => b.at - a.at).map((ep) => (
              <View key={ep.id} className="mt-2 rounded-2xl bg-white/25 p-3 dark:bg-white/[0.04]">
                <Text className="text-[12.5px] leading-5 text-slate-700 dark:text-slate-100">{ep.summary}</Text>
                <View className="mt-1 flex-row items-center justify-between">
                  <Text className="text-[10px] text-slate-500 dark:text-slate-400">{ep.emotion ? `当时情绪：${ep.emotion} · ` : ""}{new Date(ep.at).toLocaleDateString()}</Text>
                  <Pressable onPress={() => removeEpisode(ep.id)} className="min-h-8 justify-center"><Text className="text-[11px] text-rose-500 dark:text-rose-300">删除</Text></Pressable>
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
            [...reflections].sort((a, b) => b.updatedAt - a.updatedAt).map((item) => (
              <View key={item.id} className="mt-2 rounded-2xl bg-white/25 p-3 dark:bg-white/[0.04]">
                <View className="flex-row items-center justify-between">
                  <Text className="rounded-md bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300">
                    {REFLECTION_LABELS[item.kind]}
                  </Text>
                  <Pressable onPress={() => removeReflection(item.id)} className="min-h-8 justify-center">
                    <Text className="text-[11px] text-rose-500 dark:text-rose-300">删除</Text>
                  </Pressable>
                </View>
                <Text className="mt-1.5 text-[12.5px] leading-5 text-slate-700 dark:text-slate-100">{item.text}</Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => setConfirm("all")} className="mt-4 min-h-12 items-center justify-center rounded-2xl border border-rose-400/30">
        <Text className="text-[12px] text-rose-500 dark:text-rose-300">清空全部对话与记忆</Text>
      </Pressable>
    </Card>
    <Confirm visible={confirm !== null} title={confirm === "all" ? "让她忘掉全部对话？" : "删除这条记忆？"} body={confirm === "all" ? "主聊天、归档、桌宠记录、长期事实、回忆、牵挂与反思都会删除，无法恢复。你保存的人设会保留。" : "这条长期记忆会删除；自动记忆对应的来源消息也会移除，避免再次被旧对话找回。"} confirm="删除" onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm === "all") clearMemory(); else if (confirm) removeFact(confirm); setConfirm(null); setEditingId(undefined); setText(""); }} />
  </>;
}

export function WhaleSettingsScreen() {
  const persona = useWhalePersona((s) => s.persona);
  const personaHydrated = useWhalePersona((s) => s.hydrated);
  const memoryHydrated = useWhaleMemory((s) => s.hydrated);
  const [tab, setTab] = useState<"persona" | "memory" | "voice" | "pet">("persona");
  return <View className="flex-1"><Backdrop>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View className="flex-row items-center px-5 pb-3 pt-3">
        <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-white/20 dark:bg-white/[0.07]"><Ionicons name="chevron-back" size={20} color="#94A3B8" /></Pressable>
        <View><Text className="text-[22px] font-extrabold text-slate-800 dark:text-white">人设与记忆</Text><Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">属于你的{persona.name}</Text></View>
      </View>
      <View className="mx-5 mb-4 flex-row rounded-2xl bg-white/20 p-1 dark:bg-white/[0.05]">
        {([{ key: "persona", label: "捏捏性格" }, { key: "memory", label: "记忆大脑" }, { key: "voice", label: "声音音效" }, { key: "pet", label: "桌宠" }] as const).map((t) => <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} aria-selected={tab === t.key} onPress={() => setTab(t.key)} className={`min-h-11 flex-1 items-center justify-center rounded-xl ${tab === t.key ? "bg-sky-400/25" : ""}`}><Text className={`text-[12px] font-bold ${tab === t.key ? "text-sky-600 dark:text-sky-300" : "text-slate-500 dark:text-slate-400"}`}>{t.label}</Text></Pressable>)}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {personaHydrated && memoryHydrated ? <>
          <View style={{ display: tab === "persona" ? "flex" : "none" }}><PersonaEditor persona={persona} /></View>
          <View style={{ display: tab === "memory" ? "flex" : "none" }}><MemoryEditor /></View>
          {tab === "voice" ? <WhaleVoiceSettings /> : null}
          {tab === "pet" ? <DesktopPetSettings /> : null}
        </> : <Text className="py-6 text-center text-slate-500">正在翻开小本本…</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </Backdrop></View>;
}
