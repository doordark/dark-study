/* eslint-disable react-hooks/immutability -- Reanimated shared values drive UI-thread transitions. */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
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
import {
  loadFavoriteQuotes,
  saveFavoriteQuotes,
  toggleFavoriteQuote,
} from "@/utils/nightSkyData";
import { selectHaptic, tapHaptic } from "@/utils/haptics";

const HITOKOTO_URL =
  "https://v1.hitokoto.cn/?c=d&c=h&c=i&c=k&min_length=12&max_length=46";
const ONLINE_TIMEOUT_MS = 4000;
const MAX_SEEN_ONLINE = 40;

/** 跨多次进入星空共享的洗牌袋，避免每次夜航都停在第一句 */
const sharedQuoteBag = createQuoteBag(NIGHT_SKY_QUOTES);
const seenOnlineIds = new Set<string>();

type FetchOutcome =
  | { status: "ok"; quote: NightSkyQuote }
  | { status: "rate_limited" }
  | { status: "failed" };

async function fetchOnlineQuote(
  signal: AbortSignal,
  excludeText: string,
): Promise<FetchOutcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) return { status: "failed" };
    const response = await fetch(HITOKOTO_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
    if (response.status === 429 || response.status >= 500) {
      return { status: "rate_limited" };
    }
    if (!response.ok) return { status: "failed" };
    const data: unknown = await response.json();
    const parsed = parseHitokotoQuote(data);
    if (
      parsed &&
      parsed.text !== excludeText &&
      !seenOnlineIds.has(parsed.id)
    ) {
      if (seenOnlineIds.size >= MAX_SEEN_ONLINE) {
        const oldest = seenOnlineIds.values().next().value;
        if (oldest) seenOnlineIds.delete(oldest);
      }
      seenOnlineIds.add(parsed.id);
      return { status: "ok", quote: parsed };
    }
  }
  return { status: "failed" };
}

/** Isolated from the sky: changing quotes never rerenders background particles. */
export function NightSkyMessage({ closing }: { closing: boolean }) {
  const [quote, setQuote] = useState<NightSkyQuote>(() => sharedQuoteBag.next());
  const [busy, setBusy] = useState(false);
  const [fallbackKind, setFallbackKind] = useState<null | "offline" | "busy">(
    null,
  );
  const [favorites, setFavorites] = useState<NightSkyQuote[]>([]);
  const [viewSaved, setViewSaved] = useState(false);
  const [savedIndex, setSavedIndex] = useState(0);

  const reduceMotion = useReducedMotion();
  const currentRef = useRef<NightSkyQuote>(quote);
  const controllerRef = useRef<AbortController | null>(null);
  const serialRef = useRef(0);

  const opacity = useSharedValue(0);
  const lift = useSharedValue(4);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }],
  }));

  useEffect(() => {
    let alive = true;
    void loadFavoriteQuotes().then((loaded) => {
      if (alive) setFavorites(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  const displayedQuote =
    viewSaved && favorites.length > 0
      ? favorites[savedIndex % favorites.length]
      : quote;

  const isSaved = favorites.some((item) => item.id === displayedQuote.id);

  useEffect(() => {
    currentRef.current = displayedQuote;
    if (reduceMotion) {
      opacity.value = 1;
      lift.value = 0;
      return;
    }
    opacity.value = 0;
    lift.value = 5;
    opacity.value = withTiming(1, {
      duration: 360,
      easing: Easing.out(Easing.cubic),
    });
    lift.value = withTiming(0, {
      duration: 360,
      easing: Easing.out(Easing.cubic),
    });
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(lift);
    };
  }, [displayedQuote, lift, opacity, reduceMotion]);

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
    setFallbackKind(null);
    if (viewSaved && favorites.length > 0) {
      setSavedIndex((prev) => (prev + 1) % favorites.length);
      return;
    }
    const next = sharedQuoteBag.next(currentRef.current.id);
    setQuote(next);
  }, [closing, abortInFlight, viewSaved, favorites.length]);

  const handleFetchOnline = useCallback(async () => {
    if (closing || busy) return;
    tapHaptic();
    abortInFlight();
    setViewSaved(false);

    const id = ++serialRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), ONLINE_TIMEOUT_MS);

    setBusy(true);
    setFallbackKind(null);

    try {
      const outcome = await fetchOnlineQuote(
        controller.signal,
        currentRef.current.text,
      );
      if (controller.signal.aborted || id !== serialRef.current) return;
      if (outcome.status === "ok") {
        setQuote(outcome.quote);
      } else {
        setFallbackKind(
          outcome.status === "rate_limited" ? "busy" : "offline",
        );
        setQuote(sharedQuoteBag.next(currentRef.current.id));
      }
    } catch {
      if (id !== serialRef.current) return;
      setFallbackKind("offline");
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

  const handleToggleFavorite = useCallback(() => {
    if (closing) return;
    selectHaptic();
    const target = currentRef.current;
    const { next } = toggleFavoriteQuote(favorites, target);
    setFavorites(next);
    void saveFavoriteQuotes(next);
    if (viewSaved) {
      if (next.length === 0) {
        setViewSaved(false);
        setSavedIndex(0);
      } else {
        setSavedIndex((idx) => idx % next.length);
      }
    }
  }, [closing, favorites, viewSaved]);

  const handleToggleSavedMode = useCallback(() => {
    if (closing || favorites.length === 0) return;
    tapHaptic();
    abortInFlight();
    setBusy(false);
    setFallbackKind(null);
    const entering = !viewSaved;
    setViewSaved(entering);
    if (entering) setSavedIndex(0);
  }, [closing, favorites.length, abortInFlight, viewSaved]);

  const handleShare = useCallback(() => {
    if (closing) return;
    tapHaptic();
    const current = currentRef.current;
    const attr = formatQuoteAttribution(current);
    const body = attr
      ? `「${current.text}」\n${attr}\n\n—— 摘自星笺夜航`
      : `「${current.text}」\n\n—— 摘自星笺夜航`;
    void Share.share({ message: body }).catch(() => {});
  }, [closing]);

  const isFetching = busy && !closing;
  const headerLabel = isFetching
    ? "正在星海采一句…"
    : viewSaved && favorites.length > 0
      ? `已藏星笺 · ${(savedIndex % favorites.length) + 1}/${favorites.length}`
      : fallbackKind === "busy"
        ? "星海忙碌 · 书影精选"
        : fallbackKind === "offline"
          ? "离线 · 书影精选"
          : QUOTE_CATEGORY_LABELS[displayedQuote.category];
  const attribution = formatQuoteAttribution(displayedQuote);

  return (
    <View style={{ marginTop: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            flexShrink: 1,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              color: viewSaved ? "#FDE68A" : "#A8B6D1",
              fontSize: 10,
              letterSpacing: 1.5,
            }}
          >
            {headerLabel}
          </Text>
          {favorites.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                viewSaved ? "返回星海漫游" : `查看已收藏的 ${favorites.length} 句星笺`
              }
              disabled={closing}
              hitSlop={6}
              onPress={handleToggleSavedMode}
              style={({ pressed }) => ({
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: viewSaved
                  ? "rgba(253,230,138,0.45)"
                  : "rgba(253,230,138,0.22)",
                backgroundColor: viewSaved
                  ? "rgba(253,230,138,0.18)"
                  : pressed
                    ? "rgba(253,230,138,0.14)"
                    : "rgba(253,230,138,0.07)",
              })}
            >
              <Text style={{ color: "#FDE68A", fontSize: 9.5, fontWeight: "600" }}>
                {viewSaved ? "漫游" : `星匣 ${favorites.length}`}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSaved ? "取消收藏这句星笺" : "收藏这句星笺"}
            disabled={closing}
            hitSlop={6}
            onPress={handleToggleFavorite}
            style={({ pressed }) => ({
              width: 30,
              height: 30,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 15,
              borderWidth: 1,
              borderColor: isSaved
                ? "rgba(253,230,138,0.38)"
                : "rgba(186,211,255,0.16)",
              backgroundColor: isSaved
                ? "rgba(253,230,138,0.14)"
                : pressed
                  ? "rgba(186,211,255,0.16)"
                  : "rgba(186,211,255,0.06)",
            })}
          >
            <Ionicons
              name={isSaved ? "star" : "star-outline"}
              size={13}
              color={isSaved ? "#FDE68A" : "#B6C9E8"}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="分享这句星笺"
            disabled={closing}
            hitSlop={6}
            onPress={handleShare}
            style={({ pressed }) => ({
              width: 30,
              height: 30,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 15,
              borderWidth: 1,
              borderColor: "rgba(186,211,255,0.16)",
              backgroundColor: pressed
                ? "rgba(186,211,255,0.16)"
                : "rgba(186,211,255,0.06)",
            })}
          >
            <Ionicons name="share-outline" size={13} color="#B6C9E8" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="联网随机采一句书影名言"
            accessibilityState={{
              disabled: isFetching || closing,
              busy: isFetching,
            }}
            disabled={isFetching || closing}
            hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
            onPress={() => {
              void handleFetchOnline();
            }}
            style={({ pressed }) => ({
              minHeight: 30,
              justifyContent: "center",
              paddingHorizontal: 9,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: "rgba(125,211,252,0.24)",
              backgroundColor: pressed
                ? "rgba(125,211,252,0.18)"
                : "rgba(125,211,252,0.08)",
              opacity: isFetching ? 0.5 : 1,
            })}
          >
            <Text style={{ color: "#BAE6FD", fontSize: 10.5 }}>联网 ✦</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              viewSaved ? "切换下一句已收藏星笺" : "换一句精选书影语录"
            }
            accessibilityState={{ disabled: closing }}
            disabled={closing}
            hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
            onPress={handleNextLocal}
            style={({ pressed }) => ({
              minHeight: 30,
              justifyContent: "center",
              paddingHorizontal: 9,
              borderRadius: 15,
              backgroundColor: pressed
                ? "rgba(186,211,255,0.16)"
                : "rgba(186,211,255,0.08)",
            })}
          >
            <Text style={{ color: "#C5D7F3", fontSize: 10.5 }}>换一句 ↗</Text>
          </Pressable>
        </View>
      </View>

      {/* 固定紧凑高度，避免切换长短语录引起星图坐标垂直跳动 */}
      <Animated.View
        style={[
          {
            height: 104,
            paddingTop: 8,
            justifyContent: "space-between",
          },
          style,
        ]}
      >
        <Text
          numberOfLines={3}
          accessibilityLiveRegion="polite"
          style={{
            color: "#ECE9F5",
            fontSize: 14.5,
            lineHeight: 23,
            letterSpacing: 0.35,
          }}
        >
          {displayedQuote.text}
        </Text>
        {attribution ? (
          <Text
            numberOfLines={1}
            style={{
              color: "rgba(218,229,250,0.74)",
              fontSize: 11.5,
              textAlign: "right",
              letterSpacing: 0.5,
            }}
          >
            {attribution}
          </Text>
        ) : (
          <View style={{ height: 14 }} />
        )}
      </Animated.View>
    </View>
  );
}
