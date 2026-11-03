import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { AppState, Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chat } from "@/services/deepseek";
import { DEFAULT_LIFE, LOCAL_SCENES, RESIDENT_IDS, RESIDENTS, normalizeLifeSettings, normalizeLifeUsage, readLifeReply, reserveLifeRequest, type LifeLine, type LifeSettings, type LifeUsage, type ResidentId } from "@/utils/farmLife";
import { FarmResident, type ResidentMeeting } from "./FarmResident";

const PREFS = "dark-study-farm-life-settings";
const BUDGET = "dark-study-farm-life-budget";
const LOG = "dark-study-farm-life-log";
const now = () => Date.now();
const parse = (value: string | null) => value ? JSON.parse(value) : null;
type Round = { pair: readonly ResidentId[]; lines: { speaker: ResidentId; text: string }[]; online: boolean };

function Choice({ title, values, value, onChange, suffix = "" }: { title: string; values: number[]; value: number; onChange: (value: number) => void; suffix?: string }) {
  return <View style={{ gap: 8 }}><Text style={{ color: "#B5C6AF", fontSize: 12 }}>{title}</Text><View style={{ flexDirection: "row", gap: 8 }}>{values.map((n) => <Pressable accessibilityRole="button" key={n} onPress={() => onChange(n)} style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: value === n ? "#50713A" : "#293D2C" }}><Text style={{ color: "#F5EEDC", fontWeight: "600" }}>{n}{suffix}</Text></Pressable>)}</View></View>;
}

export function FarmLifeLayer({ scale, active, night, apiKey, panelOpen, onClosePanel, onTalk }: {
  scale: number; active: boolean; night: boolean; apiKey: string; panelOpen: boolean; onClosePanel: () => void;
  onTalk: (who: ResidentId, position: { x: number; y: number }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<LifeSettings>(DEFAULT_LIFE);
  const [usage, setUsage] = useState<LifeUsage>(() => normalizeLifeUsage(null, now()));
  const [history, setHistory] = useState<LifeLine[]>([]);
  const [meeting, setMeeting] = useState<ResidentMeeting | null>(null);
  const [foreground, setForeground] = useState(!AppState.currentState || AppState.currentState === "active");
  const [notice, setNotice] = useState("");
  const budget = useRef(usage);
  const blocked = useRef(false);
  const running = useRef(false);
  const generation = useRef(0);
  const sequence = useRef(0);
  const lastRoundAt = useRef(0);
  const request = useRef<AbortController | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latest = useRef({ settings, active, foreground, panelOpen, night, apiKey, loaded });
  const run = useRef<() => Promise<void>>(async () => {});
  const awake = active && foreground && !panelOpen && loaded;

  useEffect(() => {
    latest.current = { settings, active, foreground, panelOpen, night, apiKey, loaded };
  }, [settings, active, foreground, panelOpen, night, apiKey, loaded]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    let alive = true;
    void Promise.all([AsyncStorage.getItem(PREFS), AsyncStorage.getItem(BUDGET), AsyncStorage.getItem(LOG)]).then(([prefs, rawUsage, logs]) => {
      if (!alive) return;
      try { setSettings(normalizeLifeSettings(parse(prefs))); } catch { setSettings(DEFAULT_LIFE); }
      try { const restored = normalizeLifeUsage(parse(rawUsage), now()); budget.current = restored; setUsage(restored); }
      catch { blocked.current = true; setNotice("用量记录读取失败，联网互聊已暂停，本地对白仍可使用。"); }
      try {
        const parsed = parse(logs);
        if (Array.isArray(parsed)) setHistory(parsed.filter((line) => line && RESIDENT_IDS.includes(line.speaker) && typeof line.text === "string" && line.text.length <= 44 && Number.isFinite(line.at)).slice(-40));
      } catch { /* A broken log must not erase settings or enable online chatter. */ }
    }).catch(() => {
      if (alive) { blocked.current = true; setNotice("本地存储暂不可用，联网互聊保持关闭。"); }
    }).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (loaded) void AsyncStorage.setItem(PREFS, JSON.stringify(settings)).catch(() => setNotice("设置保存失败，本次设置仅在当前会话生效。")); }, [settings, loaded]);
  useEffect(() => { if (loaded) void AsyncStorage.setItem(LOG, JSON.stringify(history)).catch(() => {}); }, [history, loaded]);

  const stopRound = () => {
    generation.current += 1;
    request.current?.abort(); request.current = null;
    timers.current.forEach(clearTimeout); timers.current = [];
    running.current = false;
    setMeeting(null);
  };
  const playRound = (round: Round, token: number) => {
    if (generation.current !== token) return;
    setMeeting({ id: now(), pair: round.pair });
    // Allow time to walk along the lawn before speaking; no dialogue chain or follow-up requests.
    round.lines.forEach((line, index) => {
      timers.current.push(setTimeout(() => {
        if (generation.current !== token) return;
        setMeeting((m) => m ? { ...m, speaking: line.speaker, text: line.text } : null);
        setHistory((log) => [...log, { ...line, at: now(), online: round.online }].slice(-40));
      }, 7200 + index * 4200));
    });
    timers.current.push(setTimeout(() => { if (generation.current === token) { setMeeting(null); running.current = false; } }, 15_600));
  };
  const runRound = async () => {
    const current = latest.current;
    if (!current.active || !current.foreground || current.panelOpen || !current.loaded || !current.settings.chatter || running.current) return;
    if (lastRoundAt.current && now() - lastRoundAt.current < current.settings.interval * 1000) return;
    lastRoundAt.current = now();
    running.current = true;
    const token = generation.current;
    const scene = LOCAL_SCENES[sequence.current++ % LOCAL_SCENES.length];
    let round: Round = { pair: scene.pair, lines: scene.pair.map((speaker, i) => ({ speaker, text: scene.lines[i] })), online: false };
    const reserved = current.apiKey && !blocked.current ? reserveLifeRequest(budget.current, current.settings, now()) : null;
    if (reserved) {
      budget.current = reserved; setUsage(reserved);
      try {
        // Persist the reservation BEFORE issuing a request; remounting cannot reset today's cap.
        await AsyncStorage.setItem(BUDGET, JSON.stringify(reserved));
      } catch {
        blocked.current = true; setNotice("无法保存用量，已停止联网互聊，改用本地对白。");
      }
      if (!blocked.current && generation.current === token) {
        const controller = new AbortController(); request.current = controller;
        try {
          const [a,b] = scene.pair;
          const raw = await chat([
            { role: "system", content: `写两句温暖自然的中文农场闲聊。${a}：${RESIDENTS[a].persona}。${b}：${RESIDENTS[b].persona}。当前${current.night ? "夜晚" : "白天"}。两人互相回应，主题为种植、家人或休息。每句不超过30字，不涉及用户私密信息，不写旁白或追问。只输出JSON：{"lines":[{"speaker":"${a}","text":"一句话"},{"speaker":"${b}","text":"一句回应"}]}。` },
            { role: "user", content: "只生成这一轮的两句对话，结束后停止。" },
          ], current.apiKey, { jsonMode: true, maxTokens: 220, timeoutMs: 12_000, signal: controller.signal });
          const lines = readLifeReply(raw, scene.pair);
          if (lines) round = { ...round, lines, online: true };
          else setNotice("生成内容未通过长度或角色校验，本轮使用本地对白。" );
        } catch {
          if (generation.current === token) setNotice("联网互聊暂不可用，本轮使用本地对白；本次请求已计入次数。" );
        } finally { if (request.current === controller) request.current = null; }
      }
    }
    if (generation.current === token) playRound(round, token);
  };
  useEffect(() => { run.current = runRound; });
  useEffect(() => {
    if (!awake || !settings.chatter) {
      const stop = setTimeout(stopRound, 0);
      return () => clearTimeout(stop);
    }
    let repeat: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      void run.current();
      repeat = setInterval(() => { void run.current(); }, settings.interval * 1000);
    }, 10_000);
    return () => { clearTimeout(first); clearInterval(repeat); stopRound(); };
    // stopRound uses stable ref containers; option changes deliberately cancel the current round.
  }, [awake, settings.chatter, settings.interval, settings.online, settings.aiMinutes, settings.dailyLimit]);
  const update = (patch: Partial<LifeSettings>) => setSettings((previous) => normalizeLifeSettings({ ...previous, ...patch }));
  const today = normalizeLifeUsage(usage, now());

  return <>
    {RESIDENT_IDS.map((who) => <FarmResident key={who} who={who} scale={scale} active={awake} roaming={settings.roaming} meeting={meeting} onTalk={onTalk} />)}
    <Modal visible={panelOpen} transparent animationType="slide" onRequestClose={onClosePanel}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
        <Pressable accessibilityLabel="关闭居民生活" onPress={onClosePanel} style={{ position: "absolute", width: "100%", height: "100%" }} />
        <View style={{ maxHeight: "90%", backgroundColor: "#14231A", borderTopLeftRadius: 26, borderTopRightRadius: 26 }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: "#F6EEDC", fontSize: 19, fontWeight: "800" }}>居民生活与聊天记录</Text><Pressable onPress={onClosePanel} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 10 }}><Text style={{ color: "#BFE19E" }}>收起</Text></Pressable></View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ color: "#E9E4D0" }}>人物散步</Text><Switch value={settings.roaming} onValueChange={(roaming) => update({ roaming })} /></View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ color: "#E9E4D0" }}>居民互聊</Text><Switch value={settings.chatter} onValueChange={(chatter) => update({ chatter })} /></View>
            <Choice title="互聊间隔（秒），每轮仅两句" values={[45,90,180]} value={settings.interval} onChange={(interval) => update({ interval })} suffix="秒" />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ color: "#E9E4D0" }}>允许联网生成互聊</Text><Switch disabled={!apiKey || !loaded} value={settings.online} onValueChange={(online) => update({ online })} /></View>
            <Text style={{ color: "#B7C6AB", fontSize: 12, lineHeight: 19 }}>默认本地对白，0 模型 token。联网后使用你配置的 API Key，每次最多 220 输出 token，另计一段固定短提示的输入；不附带聊天历史，不接龙，不重试。以下限额仅针对居民自动互聊。</Text>
            {!apiKey ? <Text style={{ color: "#E6C38E", fontSize: 12 }}>配置 API Key 后才可开启联网；本地散步和聊天不受影响。</Text> : null}
            <Choice title="联网最短间隔（分钟）" values={[5,10,20]} value={settings.aiMinutes} onChange={(aiMinutes) => update({ aiMinutes })} suffix="分钟" />
            <Choice title="每日最多联网请求次数" values={[1,3,5]} value={settings.dailyLimit} onChange={(dailyLimit) => update({ dailyLimit })} suffix="次" />
            <Text style={{ color: "#D6E3C7", fontSize: 12 }}>今日已请求 {today.count} / {settings.dailyLimit} 次 · 失败或取消也计入次数。超额或冷却中自动使用本地对白。</Text>
            <Text style={{ color: "#AEBDA4", fontSize: 12 }}>切到后台、打开操作面板或与人物聊天时暂停活动。开启系统“减少动态效果”会静止人物动画。</Text>
            {notice ? <Text style={{ color: "#F2C680", fontSize: 12 }}>{notice}</Text> : null}
            <Text style={{ color: "#F6EEDC", fontSize: 15, fontWeight: "700" }}>最近 40 句</Text>
            {!history.length ? <Text style={{ color: "#AEBDA4", lineHeight: 20 }}>居民见面后，对话会显示在头顶气泡，并保存在这里。</Text> : history.slice().reverse().map((line, index) => <View key={`${line.at}-${index}`} style={{ padding: 12, borderRadius: 12, backgroundColor: "#203327", gap: 5 }}><Text style={{ color: "#B8D894", fontSize: 11 }}>{RESIDENTS[line.speaker].name} · {line.online ? "联网" : "本地"} · {new Date(line.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text><Text style={{ color: "#EEE8D6", fontSize: 13, lineHeight: 19 }}>{line.text}</Text></View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
