import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Switch, Text, TextInput, View } from "react-native";
import { useWhaleVoice } from "@/store/useWhaleVoice";
import { useWhalePersona } from "@/store/useWhalePersona";
import { deleteFishApiKey, getFishApiKey, setFishApiKey } from "@/services/whaleVoiceCredentials";
import { clearVoiceCache, getVoiceCacheSize } from "@/services/whaleVoiceCache";
import { speakWhale, stopWhaleVoice, type Mood } from "@/services/whaleVoice";
import { GlassContainer } from "./GlassContainer";

const inputClass = "mt-2 rounded-2xl border border-sky-300/25 bg-white/35 px-3.5 py-3 text-[13px] text-slate-800 dark:bg-white/[0.05] dark:text-slate-100";
const samples: { label: string; mood: Mood; text: string }[] = [
  { label: "普通", mood: "tender", text: "今天也一起加油吧，我就在旁边陪着你。" },
  { label: "开心", mood: "happy", text: "哇，做完啦！还挺厉害的嘛。" },
  { label: "兴奋", mood: "excited", text: "耶！真的过了！我就知道你可以！" },
  { label: "困困", mood: "sleepy", text: "嗯……已经很晚啦，要不今天先到这里？" },
  { label: "安慰", mood: "sad", text: "没关系啦，这道题先放一会儿也没事，我们慢慢来。" },
];


function VoiceButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} className={`min-h-11 items-center justify-center rounded-xl bg-sky-400/15 px-4 ${disabled ? "opacity-40" : ""}`}><Text className="text-[12px] font-bold text-sky-600 dark:text-sky-300">{label}</Text></Pressable>;
}

export function WhaleVoiceSettings() {
  const { on, loaded, engine, referenceId, hydrate, toggle, configure } = useWhaleVoice();
  const userName = useWhalePersona((s) => s.persona.userName);
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [bytes, setBytes] = useState<number | null>(null);
  const mounted = useRef(true);
  const preview = useRef(0);
  const configured = hasKey && !!referenceId;
  const natural = engine === "fish" || (engine === "auto" && configured);

  useEffect(() => {
    mounted.current = true;
    const ticket = preview;
    void hydrate();
    getFishApiKey().then((v) => { if (mounted.current) setHasKey(!!v); }).catch(() => {
      if (mounted.current) setMessage("无法读取安全存储，请重新保存 Key");
    });
    getVoiceCacheSize().then((v) => { if (mounted.current) setBytes(v); }).catch(() => {});
    return () => { mounted.current = false; ticket.current++; stopWhaleVoice(); };
  }, [hydrate]);

  const stop = () => { preview.current++; stopWhaleVoice(); setBusy(false); };
  const test = async (mood: Mood = "tender", text = "嘿嘿，我在呢。今天也陪你一起学一会儿吧。") => {
    stop();
    const request = ++preview.current;
    setBusy(true);
    setMessage("正在试听…");
    const result = await speakWhale(text, { mood, preview: natural, forceSystem: !natural });
    if (!mounted.current || request !== preview.current) return;
    setBusy(false);
    setMessage(result.error ?? (result.engine === "cancelled" ? "试听已停止" : result.engine === "system" ? "正在使用系统语音" : result.engine === "silent" ? "没有可播放的声音" : "自然鱼语试听完成"));
    getVoiceCacheSize().then((v) => { if (mounted.current) setBytes(v); }).catch(() => {});
  };

  return <GlassContainer radius={24}><View className="p-4">
    <View className="flex-row items-center justify-between">
      <View><Text className="text-[17px] font-bold text-slate-800 dark:text-white">鱼语</Text><Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">主聊天和桌宠共用一个声音</Text></View>
      <Switch accessibilityLabel="开启鱼语" disabled={!loaded} value={on} onValueChange={() => { stop(); toggle(); }} />
    </View>
    <Text className="mt-5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">声音引擎</Text>
    <View className="mt-2 flex-row gap-2">{(["fish", "system"] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: (value === "fish") === natural }} disabled={!loaded} onPress={() => { stop(); configure(value, referenceId); setMessage(""); }} className={`min-h-11 flex-1 items-center justify-center rounded-xl ${(value === "fish") === natural ? "bg-sky-400/30" : "bg-slate-400/10"}`}><Text className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{value === "fish" ? "自然鱼语" : "系统语音"}</Text></Pressable>)}</View>
    <Text className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{configured ? "自然语音已配置 · 以试听结果为准" : "未配置 Fish，自然回退为系统语音"}</Text>
    <Text className="mt-5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">Fish API Key {hasKey ? "· 已保存" : ""}</Text>
    <TextInput accessibilityLabel="Fish API Key" secureTextEntry autoCapitalize="none" autoCorrect={false} value={key} onChangeText={setKey} placeholder="输入你自己的 Fish API Key" placeholderTextColor="#94A3B8" className={inputClass} />
    <Text className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{Platform.OS === "web" ? "Web 仅在当前会话中保留 Key，刷新后需重新输入。" : "仅保存在本机安全存储中。"} 自然语音会将朗读文本发送至 Fish Audio，并使用你账户的额度。</Text>
    <View className="mt-3 flex-row flex-wrap gap-2">
      {<VoiceButton label={"保存 Key"} onPress={() => { stop(); void (async () => { try { await setFishApiKey(key); if (mounted.current) { setHasKey(true); setKey(""); setMessage("Key 已保存"); } } catch { if (mounted.current) setMessage("Key 保存失败，请检查安全存储后重试"); } })(); }} disabled={!loaded || !key.trim()} />}
      {<VoiceButton label={"删除 Key"} onPress={() => { stop(); void (async () => { try { await deleteFishApiKey(); if (mounted.current) { setHasKey(false); setKey(""); setMessage("Key 已删除"); } } catch { if (mounted.current) setMessage("Key 删除失败，请重试"); } })(); }} disabled={!loaded} />}
    </View>
    <Text className="mt-5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">Fish Voice ID</Text>
    <TextInput accessibilityLabel="Fish Voice ID" autoCapitalize="none" autoCorrect={false} value={voiceId ?? referenceId} onChangeText={setVoiceId} maxLength={200} placeholder="填入原创大肥鱼音色的 Voice ID" placeholderTextColor="#94A3B8" className={inputClass} />
    <View className="mt-3">{<VoiceButton label={"保存 Voice ID"} onPress={() => { stop(); configure(engine, voiceId ?? referenceId); setMessage("Voice ID 已保存，新台词会使用这个音色"); }} disabled={!loaded} />}</View>
    <Text className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">请在 Fish 创建原创成年角色音色后填写 ID。先保存，再试听；未保存的输入不会用于播放。</Text>
    <View className="mt-5 flex-row flex-wrap gap-2">
      {<VoiceButton label={busy ? "正在试听…" : "试听大肥鱼"} onPress={() => { void test(); }} disabled={!loaded || !on || busy} />}
      {<VoiceButton label={"停止试听"} onPress={stop} />}
      {<VoiceButton label={"试听当前称呼"} onPress={() => { void test("tender", `${userName}，我在呢。`); }} disabled={!loaded || !on || busy} />}
    </View>
    <View className="mt-3 flex-row flex-wrap gap-2">{samples.map((s) => <VoiceButton key={s.label} label={`试听${s.label}`} onPress={() => { void test(s.mood, s.text); }} disabled={!loaded || !on || busy} />)}</View>
    <Text accessibilityLiveRegion="polite" className="mt-3 text-[12px] leading-5 text-sky-700 dark:text-sky-200">{message || (on ? "选一种语气，听听她的声音。" : "鱼语已关闭，开启后可试听。")}</Text>
    <Text className="mt-5 text-[11px] text-slate-500 dark:text-slate-400">{Platform.OS === "web" ? "Web 使用临时音频，不保存磁盘缓存" : `缓存大小：${bytes === null ? "暂不可用" : `${(bytes / 1024 / 1024).toFixed(2)} MB`}`}</Text>
    <View className="mt-2">{<VoiceButton label={"清理语音缓存"} onPress={() => { stop(); void clearVoiceCache().then(() => { if (mounted.current) { setBytes(0); setMessage("语音缓存已清理"); } }).catch(() => { if (mounted.current) setMessage("缓存清理失败，请重试"); }); }} />}</View>
  </View></GlassContainer>;
}
