/* eslint-disable react-hooks/immutability -- Reanimated shared values drive UI-thread transitions. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  NIGHT_SKY_QUOTES,
  QUOTE_CATEGORY_LABELS,
  createQuoteBag,
  formatQuoteAttribution,
  parseHitokotoQuote,
  type NightSkyQuote,
} from "@/constants/nightSkyQuotes";
import { tapHaptic } from "@/utils/haptics";

const HITOKOTO_URL =
  "https://v1.hitokoto.cn/?c=d&c=h&c=i&c=k&min_length=12&max_length=46";
const ONLINE_TIMEOUT_MS = 4000;

/** 跨多次进入星空共享的洗牌袋，避免每次夜航都停在第一句 */
const sharedQuoteBag = createQuoteBag(NIGHT_SKY_QUOTES);

async function fetchOnlineQuote(
  signal: AbortSignal,
  excludeText: string,
): Promise<NightSkyQuote | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) return null;
    const response = await fetch(HITOKOTO_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const parsed = parseHitokotoQuote(data);
    if (parsed && parsed.text !== excludeText) {
      return parsed;
    }
  }
  return null;
}

/** Isolated from the sky: changing quotes never rerenders background particles. */
export function NightSkyMessage({ closing }: { closing: boolean }) {
  const [quote, setQuote] = useState<NightSkyQuote>(() => sharedQuoteBag.next());
  const [busy, setBusy] = useState(false);
  const [fallbackNote, setFallbackNote] = useState(false);

  const currentRef = useRef<NightSkyQuote>(quote);
  const controllerRef = useRef<AbortController | null>(null);
  const serialRef = useRef(0);

  const opacity = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    currentRef.current = quote;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 420 });
  }, [quote, opacity]);

  const abortInFlight = useCallback(() => {
    serialRef.current += 1;
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (closing) abortInFlight();
  }, [closing, abortInFlight]);

  useEffect(() => () => abortInFlight(), [abortInFlight]);

  const handleNextLocal = useCallback(() => {
    if (closing) return;
    tapHaptic();
    abortInFlight();
    setBusy(false);
    setFallbackNote(false);
    const next = sharedQuoteBag.next(currentRef.current.id);
    setQuote(next);
  }, [closing, abortInFlight]);

  const handleFetchOnline = useCallback(async () => {
    if (closing || busy) return;
    tapHaptic();
    abortInFlight();

    const id = ++serialRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), ONLINE_TIMEOUT_MS);

    setBusy(true);
    setFallbackNote(false);

    try {
      const online = await fetchOnlineQuote(
        controller.signal,
        currentRef.current.text,
      );
      if (controller.signal.aborted || id !== serialRef.current) return;
      if (online) {
        setQuote(online);
      } else {
        setFallbackNote(true);
        setQuote(sharedQuoteBag.next(currentRef.current.id));
      }
    } catch {
      if (id !== serialRef.current) return;
      setFallbackNote(true);
      setQuote(sharedQuoteBag.next(currentRef.current.id));
    } finally {
      clearTimeout(timeout);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      if (id === serialRef.current) {
        setBusy(false);
      }
    }
  }, [closing, busy, abortInFlight]);

  const isFetching = busy && !closing;
  const headerLabel = isFetching
    ? "正在星海采一句…"
    : fallbackNote
      ? "离线 · 书影精选"
      : QUOTE_CATEGORY_LABELS[quote.category];
  const attribution = formatQuoteAttribution(quote);

  return (
    <View style={{ marginTop: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            color: "#A8B6D1",
            fontSize: 10,
            letterSpacing: 1.8,
          }}
        >
          {headerLabel}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="联网随机采一句书影名言"
            accessibilityState={{ disabled: isFetching || closing, busy: isFetching }}
            disabled={isFetching || closing}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            onPress={() => {
              void handleFetchOnline();
            }}
            style={({ pressed }) => ({
              minHeight: 34,
              justifyContent: "center",
              paddingHorizontal: 10,
              borderRadius: 17,
              borderWidth: 1,
              borderColor: "rgba(125,211,252,0.22)",
              backgroundColor: pressed
                ? "rgba(125,211,252,0.18)"
                : "rgba(125,211,252,0.08)",
              opacity: isFetching ? 0.5 : 1,
            })}
          >
            <Text style={{ color: "#BAE6FD", fontSize: 11 }}>联网 ✦</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="换一句精选书影语录"
            accessibilityState={{ disabled: closing }}
            disabled={closing}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            onPress={handleNextLocal}
            style={({ pressed }) => ({
              minHeight: 34,
              justifyContent: "center",
              paddingHorizontal: 11,
              borderRadius: 17,
              backgroundColor: pressed
                ? "rgba(186,211,255,0.16)"
                : "rgba(186,211,255,0.08)",
            })}
          >
            <Text style={{ color: "#C5D7F3", fontSize: 11 }}>换一句 ↗</Text>
          </Pressable>
        </View>
      </View>
      <Animated.View
        style={[
          {
            minHeight: 82,
            paddingTop: 8,
            justifyContent: "space-between",
          },
          style,
        ]}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: "#ECE9F5",
            fontSize: 15,
            lineHeight: 24,
            letterSpacing: 0.4,
          }}
        >
          {quote.text}
        </Text>
        {attribution ? (
          <Text
            numberOfLines={1}
            style={{
              color: "rgba(218,229,250,0.72)",
              fontSize: 11.5,
              marginTop: 6,
              textAlign: "right",
              letterSpacing: 0.5,
            }}
          >
            {attribution}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}
