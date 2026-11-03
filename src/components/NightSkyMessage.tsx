/* eslint-disable react-hooks/immutability -- Reanimated shared values drive UI-thread transitions. */
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { chat } from "@/services/deepseek";
import { useSettings } from "@/store/useSettings";
import { tapHaptic } from "@/utils/haptics";

const LETTERS = [
  "今晚不用成为很厉害的人。在这里，安静地待一会儿就很好。",
  "没有赶上的日落，可以留给明天。此刻的晚风也值得停一停。",
  "有些日子只是好好吃饭、慢慢呼吸，就已经很用力了。",
  "星星也有被云遮住的时候，你不必每一天都闪闪发光。",
  "把暂时想不明白的事放在这里。回去时，只带走一点轻盈。",
  "今天的进度可以停在这里，你的生活还有很多温柔的空白。",
];

/** Isolated from the sky: fetching and changing a letter never rerender its particles. */
export function NightSkyMessage({ closing }: { closing: boolean }) {
  const apiKey = useSettings((s) => s.apiKey);
  const [letter, setLetter] = useState(LETTERS[0]);
  const [source, setSource] = useState("星空来信");
  const [busy, setBusy] = useState(Boolean(apiKey));
  const [request, setRequest] = useState(0);
  const previous = useRef(LETTERS[0]);
  const serial = useRef(0);
  const opacity = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 480 });
  }, [letter, opacity]);

  useEffect(() => {
    if (closing) return;
    const controller = new AbortController();
    const id = ++serial.current;
    // Let the entrance settle before starting network work.
    const timer = setTimeout(async () => {
      setBusy(Boolean(apiKey));
      if (!apiKey) {
        const text = LETTERS[request % LETTERS.length];
        previous.current = text;
        setLetter(text);
        setSource("星空来信");
        return;
      }
      try {
        const raw = await chat([
          { role: "system", content: "为星空休憩空间写一句原创中文治愈短笺，24到50字。温柔、具体、克制，允许休息，不说教、不许诺、不诊断、不冒充名人名言。只返回句子，不加标题、引号或Markdown。" },
          { role: "user", content: `现在是本地${new Date().getHours()}点。用星光、晚风或日常的小事表达陪伴。换一个意象，不重复这句：${previous.current}` },
        ], apiKey, { temperature: 0.9, timeoutMs: 12000, signal: controller.signal });
        const text = raw.trim().replace(/^[“"「]+|[”"」]+$/g, "");
        if (text.length < 8 || text.length > 64 || /[\r\n#*<>]/.test(text)) throw new Error("Invalid letter");
        if (controller.signal.aborted || id !== serial.current) return;
        previous.current = text;
        setLetter(text);
        setSource("AI 星笺 · 原创");
      } catch {
        if (controller.signal.aborted || id !== serial.current) return;
        const text = LETTERS[request % LETTERS.length];
        previous.current = text;
        setLetter(text);
        setSource("离线星笺");
      } finally {
        if (!controller.signal.aborted && id === serial.current) setBusy(false);
      }
    }, request === 0 ? 850 : 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [apiKey, request, closing]);

  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: "#A8B6D1", fontSize: 10, letterSpacing: 2 }}>{busy ? "星光正在写信…" : source}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="换一句治愈星笺" accessibilityState={{ disabled: busy || closing, busy }}
          disabled={busy || closing} hitSlop={4}
          onPress={() => { tapHaptic(); setBusy(Boolean(apiKey)); setRequest((v) => v + 1); }}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 22, backgroundColor: pressed ? "rgba(186,211,255,0.14)" : "rgba(186,211,255,0.06)", opacity: busy ? 0.5 : 1 })}>
          <Text style={{ color: "#C5D7F3", fontSize: 11 }}>换一封 ↗</Text>
        </Pressable>
      </View>
      <Animated.View style={style}>
        <Text accessibilityLiveRegion="polite" style={{ color: "#ECE9F5", fontSize: 15, lineHeight: 25, minHeight: 75, paddingTop: 6, letterSpacing: 0.5 }}>
          {letter}
        </Text>
      </Animated.View>
    </View>
  );
}
