/* eslint-disable react-hooks/immutability --
   Reanimated 共享值（fade/flightClock/travel/pureAnim/dragCoords/dragActive 等）
   本质是跨渲染、跨线程可变的容器，在 effect 与回调中赋值是官方标准用法，React 编译器的不可变假设不适用 */

import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";

import { AtlasSprite } from "@/components/AtlasSprite";
import {
  FireflySwarm,
  MeteorShower,
  StarDragTrail,
  WhaleSkyCameo,
} from "@/components/nightSky/NightSkyEffects";
import {
  ARRIVAL_MS,
  DEPARTURE_MS,
  OWL_BRANCH,
  Owl,
  OwlFlight,
  type OwlStage,
} from "@/components/nightSky/NightSkyOwl";
import {
  AuroraVeil,
  Burst,
  CollectStar,
  ConstellationReveal,
  FireflyDot,
  HarpStarNode,
  INITIAL_DRAG_COORDS,
  Moon,
  NIGHT_SPRITES,
  NightMotion,
  ShootingStar,
  SkyPanCanvas,
  SkyTapRipple,
  Twinkle,
  WishMeteor,
} from "@/components/nightSky/NightSkyPrimitives";
import { nightSkyStyles } from "@/components/nightSky/NightSkyStyles";
import { useNightSkyState } from "@/components/nightSky/useNightSkyState";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { playSfx, playStarScaleNote, risingRate } from "@/services/soundEffects";
import { useSettings } from "@/store/useSettings";
import { successHaptic, tapHaptic, thumpHaptic } from "@/utils/haptics";
import {
  DEFAULT_NIGHT_CHRONICLE,
  NIGHT_CONSTELLATIONS,
  TOTAL_STARS,
  writeStarDewBlessing,
  type MoonPhaseInfo,
} from "@/utils/nightSkyData";

/* -------------------------------------------------------------------------- */
/*  重型次级界域与低频浮层懒加载（未激活时不加载模块、不解码额外 WebP 贴图）   */
/* -------------------------------------------------------------------------- */

const BloodMoonRealm = lazy(() =>
  import("@/components/nightSky/BloodMoonRealm").then((m) => ({ default: m.BloodMoonRealm })),
);
const NightSkyMessage = lazy(() =>
  import("@/components/NightSkyMessage").then((m) => ({ default: m.NightSkyMessage })),
);
const StarAtlasModal = lazy(() =>
  import("@/components/nightSky/NightSkyOverlays").then((m) => ({ default: m.StarAtlasModal })),
);
const WishComposerModal = lazy(() =>
  import("@/components/nightSky/NightSkyOverlays").then((m) => ({ default: m.WishComposerModal })),
);

/* -------------------------------------------------------------------------- */
/*  主星空彩蛋组件                                                             */
/* -------------------------------------------------------------------------- */

export const BLOOD_MOON_ENTRY_LOCK_MS = 3000;
export type BloodMoonPhase = "idle" | "entering" | "active" | "exiting";

export interface NightSkyProps {
  onClose: () => void;
  /** 夜空最深处的那条小径 */
  onEnterFarm?: () => void;
  /** 课表里的课程名：会去重轮播变成流星尾巴上的小标签 */
  courseNames?: string[];
  /** 今日真实课程节数：用于猫头鹰语境共情与夜空暖心提示 */
  todayCourseCount?: number;
}

export function NightSky({
  onClose,
  onEnterFarm,
  courseNames = [],
  todayCourseCount,
}: NightSkyProps) {
  const { width: w, height: h } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const qualityMode = useSettings((s) => s.renderQuality);

  const [bloodMoonPhase, setBloodMoonPhase] = useState<BloodMoonPhase>("idle");
  const [farmHandoffActive, setFarmHandoffActive] = useState(false);

  const awake = useAnimationActive();
  const reduceMotion = useReducedMotion();
  const bloodMoon = bloodMoonPhase !== "idle";
  const bloodMoonRealmMounted = bloodMoonPhase === "active" || bloodMoonPhase === "exiting";
  const allowRichDecor = !reduceMotion && qualityMode !== "smooth";
  const allowFullDecor = !reduceMotion && qualityMode === "beautiful";
  const motionEnabled = awake && !reduceMotion && !farmHandoffActive && bloodMoonPhase === "idle";
  const bloodMoonMotionEnabled = awake && !reduceMotion && !farmHandoffActive;

  const sky = useNightSkyState({
    w, h, insetTop: insets.top, insetBottom: insets.bottom, qualityMode,
    courseNames, todayCourseCount, motionEnabled, reduceMotion, allowRichDecor, allowFullDecor,
  });

  const {
    compact, stablePanelHeight, chronicle, constellationRun, pickOrder, closing,
    isClosing, markClosing, moonInfo, owlLanded, setOwlLanded, followingOwl,
    setFollowingOwl, setOwlBounceToken, setOwlHint, pureMode, setPureMode,
    atlasOpen, setAtlasOpen, wishOpen, setWishOpen, activeConstellation,
    picked, lit, done, celestial, owlLines, owlTapsNeeded, showOwlHint,
    showSkyBanner, unlockBadge, markOwlPathUnlocked, recordMoonTapAndCheckBloodMoon,
    resetMoonTaps,
  } = sky;

  const flightClock = useSharedValue(0);
  const travel = useSharedValue(0);
  const fade = useSharedValue(0);
  const pureAnim = useSharedValue(0);
  const dragCoords = useSharedValue<number[]>(INITIAL_DRAG_COORDS);
  const dragActive = useSharedValue(0);
  const whaleBubbleAnim = useSharedValue(0);
  const bloodMoonShakeX = useSharedValue(0);
  const bloodMoonShakeY = useSharedValue(0);
  const bloodMoonShock = useSharedValue(0);
  const bloodMoonSweep = useSharedValue(0);
  const bloodMoonVeil = useSharedValue(0);

  const owlTaps = useRef(0);
  const bloodMoonEnteredAtRef = useRef<number>(0);
  const bloodMoonPhaseRef = useRef<BloodMoonPhase>("idle");
  const bloodMoonTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bloodMoonHapticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const constellationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowDragTrail = allowRichDecor && !done;

  useEffect(() => () => {
    if (constellationTimer.current) clearTimeout(constellationTimer.current);
    if (bloodMoonTransitionTimer.current) clearTimeout(bloodMoonTransitionTimer.current);
    if (bloodMoonHapticTimer.current) clearTimeout(bloodMoonHapticTimer.current);
  }, []);

  // 集齐七星：触发胜利触感与高音 Do' 星座和弦收束
  useEffect(() => {
    if (!done) return;
    successHaptic();
    constellationTimer.current = setTimeout(() => {
      if (!isClosing()) {
        playSfx("star_constellation", { volume: 0.76, ignoreCooldown: true });
      }
    }, 220);
    return () => {
      if (constellationTimer.current) {
        clearTimeout(constellationTimer.current);
        constellationTimer.current = null;
      }
    };
  }, [done, isClosing]);

  const owlStage: OwlStage = followingOwl
    ? "leaving"
    : !done && !owlLanded
      ? "waiting"
      : owlLanded || reduceMotion
        ? "perched"
        : "arriving";

  const landOwl = useCallback(() => setOwlLanded(true), [setOwlLanded]);
  const travelStyle = useAnimatedStyle(() => ({ opacity: travel.value }));

  useEffect(() => {
    if (!done || owlLanded || reduceMotion || isClosing()) return;
    flightClock.value = 0;
    flightClock.value = withDelay(
      340,
      withTiming(ARRIVAL_MS, { duration: ARRIVAL_MS, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(landOwl)();
      }),
    );
    return () => cancelAnimation(flightClock);
  }, [done, flightClock, isClosing, landOwl, owlLanded, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      pureAnim.value = pureMode ? 1 : 0;
      return;
    }
    pureAnim.value = withTiming(pureMode ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(pureAnim);
  }, [pureAnim, pureMode, reduceMotion]);

  useEffect(() => {
    if (!sky.whaleBubble) {
      whaleBubbleAnim.value = 0;
      return;
    }
    if (reduceMotion) {
      whaleBubbleAnim.value = 1;
      return;
    }
    whaleBubbleAnim.value = 0;
    whaleBubbleAnim.value = withSpring(1, { damping: 13, stiffness: 185 });
    return () => cancelAnimation(whaleBubbleAnim);
  }, [reduceMotion, sky.whaleBubble, whaleBubbleAnim]);

  useEffect(() => {
    if (done || !allowRichDecor) {
      dragActive.value = 0;
      dragCoords.value = INITIAL_DRAG_COORDS;
    }
  }, [allowRichDecor, done, dragActive, dragCoords]);

  useEffect(() => () => {
    cancelAnimation(flightClock);
    cancelAnimation(travel);
    cancelAnimation(pureAnim);
    cancelAnimation(dragActive);
    cancelAnimation(dragCoords);
    cancelAnimation(whaleBubbleAnim);
    cancelAnimation(bloodMoonShakeX);
    cancelAnimation(bloodMoonShakeY);
    cancelAnimation(bloodMoonShock);
    cancelAnimation(bloodMoonSweep);
    cancelAnimation(bloodMoonVeil);
  }, [
    bloodMoonShakeX, bloodMoonShakeY, bloodMoonShock, bloodMoonSweep, bloodMoonVeil,
    dragActive, dragCoords, flightClock, pureAnim, travel, whaleBubbleAnim,
  ]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const sceneStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: reduceMotion ? 1 : 1.045 - fade.value * 0.045 + travel.value * 0.06 },
      { translateX: (reduceMotion ? 0 : -travel.value * 14) + bloodMoonShakeX.value },
      { translateY: bloodMoonShakeY.value },
    ],
  }));
  const skyShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bloodMoonShakeX.value }, { translateY: bloodMoonShakeY.value }],
  }));
  const bloodShockStyle = useAnimatedStyle(() => ({
    opacity: bloodMoonShock.value > 0 ? (1 - bloodMoonShock.value) * 0.85 : 0,
    transform: [{ scale: 0.25 + bloodMoonShock.value * 7.8 }],
  }));
  const bloodSweepStyle = useAnimatedStyle(() => ({
    opacity: bloodMoonSweep.value > 0 && bloodMoonSweep.value < 1
      ? Math.sin(bloodMoonSweep.value * Math.PI) * 0.85 : 0,
    transform: [
      { translateX: (1 - bloodMoonSweep.value) * 260 - 130 },
      { translateY: bloodMoonSweep.value * 140 - 40 },
      { scale: 0.9 + bloodMoonSweep.value * 1.4 },
    ],
  }));
  const bloodVeilStyle = useAnimatedStyle(() => ({ opacity: bloodMoonVeil.value }));
  const whaleBubbleStyle = useAnimatedStyle(() => ({
    opacity: whaleBubbleAnim.value,
    transform: [
      { translateY: (1 - whaleBubbleAnim.value) * -6 },
      { scale: 0.9 + whaleBubbleAnim.value * 0.1 },
    ],
  }));
  const panelStyle = useAnimatedStyle(() => {
    const enterOpacity = Math.max(0, (fade.value - 0.2) / 0.8);
    const pureVisible = 1 - pureAnim.value;
    return {
      opacity: enterOpacity * pureVisible,
      transform: [
        {
          translateY: reduceMotion
            ? pureAnim.value * 420
            : (1 - fade.value) * 32 + pureAnim.value * (stablePanelHeight + 80),
        },
      ],
    };
  });

  useEffect(() => {
    if (isClosing()) return;
    fade.value = withTiming(1, { duration: reduceMotion ? 180 : 760, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(fade);
  }, [fade, isClosing, reduceMotion]);

  const close = useCallback(() => {
    if (!markClosing()) return;
    cancelAnimation(flightClock);
    fade.value = withTiming(
      0,
      { duration: reduceMotion ? 150 : 420, easing: Easing.inOut(Easing.cubic) },
      (finished) => { if (finished) runOnJS(onClose)(); },
    );
  }, [fade, flightClock, markClosing, onClose, reduceMotion]);

  const handleRequestExitBloodMoon = useCallback(() => {
    if (isClosing() || bloodMoonPhaseRef.current !== "active") return;
    bloodMoonPhaseRef.current = "exiting";
    setBloodMoonPhase("exiting");
    tapHaptic();
    playSfx("horror_banish", { volume: 0.72, ignoreCooldown: true });
  }, [isClosing]);

  const handleBloodMoonExited = useCallback(() => {
    bloodMoonPhaseRef.current = "idle";
    setBloodMoonPhase("idle");
    resetMoonTaps();
    playStarScaleNote(4, { volume: 0.48 });
    showSkyBanner("银月复明，清辉重回夜空。", 2600);
    if (owlStage === "perched") {
      showOwlHint("银月回来啦，晚风也跟着温柔下来了。", 2800);
    }
  }, [owlStage, resetMoonTaps, showOwlHint, showSkyBanner]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (bloodMoonPhaseRef.current === "entering" || bloodMoonPhaseRef.current === "exiting") return true;
      if (bloodMoonPhaseRef.current === "active") {
        if (Date.now() - bloodMoonEnteredAtRef.current < BLOOD_MOON_ENTRY_LOCK_MS) return true;
        handleRequestExitBloodMoon();
        return true;
      }
      if (atlasOpen) { setAtlasOpen(false); return true; }
      if (wishOpen) { setWishOpen(false); return true; }
      if (pureMode) { setPureMode(false); return true; }
      close();
      return true;
    });
    return () => subscription.remove();
  }, [atlasOpen, close, handleRequestExitBloodMoon, pureMode, setAtlasOpen, setPureMode, setWishOpen, wishOpen]);

  const openFarm = useCallback(() => {
    if (!onEnterFarm) { onClose(); return; }
    setFarmHandoffActive(true);
    onEnterFarm();
    fade.value = withDelay(600, withTiming(0, { duration: 0 }, (finished) => {
      if (finished) runOnJS(onClose)();
    }));
  }, [fade, onClose, onEnterFarm]);

  const enterFarm = useCallback(() => {
    if (!markClosing()) return;
    setOwlHint("");
    setFollowingOwl(true);
    if (done) void writeStarDewBlessing(activeConstellation);
    markOwlPathUnlocked();
    flightClock.value = 0;
    if (!reduceMotion) {
      flightClock.value = withTiming(DEPARTURE_MS, { duration: DEPARTURE_MS, easing: Easing.linear });
    }
    travel.value = withDelay(
      reduceMotion ? 0 : DEPARTURE_MS - 190,
      withTiming(1, { duration: reduceMotion ? 150 : 430, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(openFarm)();
      }),
    );
  }, [activeConstellation, done, flightClock, markClosing, markOwlPathUnlocked, openFarm, reduceMotion, setFollowingOwl, setOwlHint, travel]);

  const handleMoonInspect = useCallback((info: MoonPhaseInfo) => {
    if (isClosing()) return;
    const now = Date.now();
    if (bloodMoonPhaseRef.current !== "idle" || now - bloodMoonEnteredAtRef.current < BLOOD_MOON_ENTRY_LOCK_MS) return;

    if (recordMoonTapAndCheckBloodMoon(info, now)) {
      bloodMoonEnteredAtRef.current = now;
      bloodMoonPhaseRef.current = "entering";
      setBloodMoonPhase("entering");
      unlockBadge("blood-moon");
      thumpHaptic();
      playSfx("horror_appear", { volume: 0.78, ignoreCooldown: true });
      if (bloodMoonHapticTimer.current) clearTimeout(bloodMoonHapticTimer.current);
      bloodMoonHapticTimer.current = setTimeout(() => {
        if (bloodMoonPhaseRef.current === "entering") thumpHaptic();
      }, 480);

      const transitionMs = reduceMotion ? 260 : 1500;
      if (!reduceMotion) {
        bloodMoonShakeX.value = withSequence(
          withTiming(-6, { duration: 55 }), withTiming(6, { duration: 60 }),
          withTiming(-5, { duration: 60 }), withTiming(4, { duration: 60 }),
          withTiming(-3, { duration: 70 }), withTiming(2, { duration: 75 }),
          withTiming(0, { duration: 120 }),
        );
        bloodMoonShakeY.value = withSequence(
          withTiming(4, { duration: 55 }), withTiming(-5, { duration: 60 }),
          withTiming(4, { duration: 60 }), withTiming(-3, { duration: 60 }),
          withTiming(2, { duration: 75 }), withTiming(0, { duration: 120 }),
        );
        bloodMoonShock.value = 0;
        bloodMoonShock.value = withTiming(1, { duration: 1120, easing: Easing.out(Easing.cubic) });
        bloodMoonSweep.value = 0;
        bloodMoonSweep.value = withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.cubic) });
        bloodMoonVeil.value = 0;
        bloodMoonVeil.value = withSequence(
          withTiming(0.48, { duration: 160 }), withTiming(0.14, { duration: 180 }),
          withTiming(0.76, { duration: 170 }), withTiming(0.32, { duration: 220 }),
          withTiming(0.96, { duration: 680, easing: Easing.inOut(Easing.cubic) }),
        );
      } else {
        bloodMoonVeil.value = 0.85;
      }

      if (bloodMoonTransitionTimer.current) clearTimeout(bloodMoonTransitionTimer.current);
      bloodMoonTransitionTimer.current = setTimeout(() => {
        bloodMoonTransitionTimer.current = null;
        if (isClosing()) return;
        bloodMoonPhaseRef.current = "active";
        setBloodMoonPhase("active");
        bloodMoonShakeX.value = 0;
        bloodMoonShakeY.value = 0;
        bloodMoonShock.value = 0;
        bloodMoonSweep.value = 0;
        bloodMoonVeil.value = 0;
      }, transitionMs);
      return;
    }

    tapHaptic();
    playStarScaleNote(4, { volume: 0.48 });
  }, [
    bloodMoonShakeX, bloodMoonShakeY, bloodMoonShock, bloodMoonSweep, bloodMoonVeil,
    isClosing, recordMoonTapAndCheckBloodMoon, reduceMotion, unlockBadge,
  ]);

  const handleOwlTap = useCallback(() => {
    setOwlBounceToken((prev) => prev + 1);
    const n = owlTaps.current + 1;
    owlTaps.current = n;
    if (n >= owlTapsNeeded) {
      thumpHaptic();
      playSfx("owl_hoot", { volume: 0.74, ignoreCooldown: true });
      enterFarm();
      return;
    }
    tapHaptic();
    playSfx("owl_hoot", { rate: risingRate(n - 1, 0.05, 0.96), volume: 0.68 });
    showOwlHint(owlLines[n - 1] ?? "", 3400);
  }, [enterFarm, owlLines, owlTapsNeeded, setOwlBounceToken, showOwlHint]);

  return (
    <NightMotion.Provider value={motionEnabled}>
      <Animated.View accessibilityViewIsModal style={[nightSkyStyles.rootOverlay, fadeStyle]}>
        <StatusBar style="light" />
        <LinearGradient
          colors={["#03060F", "#071022", "#0E1A33"]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={nightSkyStyles.fill}
        />

        {!bloodMoonRealmMounted ? (
          <Animated.View style={[nightSkyStyles.fill, skyShakeStyle]}>
            <Animated.Image
              pointerEvents="none"
              source={require("../../assets/images/night-forest-v2.webp")}
              resizeMode="cover"
              fadeDuration={0}
              style={[nightSkyStyles.absolute, { width: w, height: h, opacity: 0.7 }, sceneStyle]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(3,6,15,0.12)", "transparent", "rgba(3,6,15,0.7)"]}
              style={[nightSkyStyles.absolute, { width: w, height: h }]}
            />
            {bloodMoon ? <View pointerEvents="none" style={nightSkyStyles.bloodMoonTint} /> : null}
            {allowRichDecor ? (
              <AuroraVeil
                w={w} h={h} rich={allowFullDecor}
                auroraPrimary={celestial.auroraPrimary}
                auroraSecondary={celestial.auroraSecondary}
              />
            ) : null}

            <View
              pointerEvents="none"
              style={{
                position: "absolute", bottom: -180, left: -60,
                width: w * 0.95, height: w * 0.95, borderRadius: w,
                backgroundColor: "rgba(56,189,248,0.06)",
              }}
            />

            <Svg pointerEvents="none" width={w} height={h} style={nightSkyStyles.absolute}>
              {sky.staticDots.map((dot) => {
                const cx = dot.x * w;
                const cy = dot.y * h;
                const baseOpacity = 0.2 + (dot.id % 5) * 0.11;
                return dot.cross ? (
                  <G key={dot.id} opacity={Math.min(0.85, baseOpacity + 0.18)}>
                    <Path
                      d={`M${cx - dot.r * 3.2} ${cy} L${cx + dot.r * 3.2} ${cy} M${cx} ${cy - dot.r * 3.2} L${cx} ${cy + dot.r * 3.2}`}
                      stroke={dot.color} strokeWidth={0.7} strokeLinecap="round"
                    />
                    <Circle cx={cx} cy={cy} r={dot.r * 0.9} fill="#FFFFFF" />
                  </G>
                ) : (
                  <Circle key={dot.id} cx={cx} cy={cy} r={dot.r} fill={dot.color} opacity={baseOpacity} />
                );
              })}
            </Svg>

            {sky.twinkleDots.map((d) => (
              <Twinkle key={d.id} x={d.x} y={d.y} r={d.r} delay={d.delay} dur={d.dur} color={d.color} />
            ))}
            {sky.activeFireflies.map((f) => (
              <FireflyDot
                key={f.id} x={f.x} y={f.y} size={f.size}
                dx={f.dx} dy={f.dy} delay={f.delay} dur={f.dur} w={w} h={h}
              />
            ))}
            {sky.ripples.map((r) => <SkyTapRipple key={r.id} x={r.x} y={r.y} />)}

            <SkyPanCanvas
              constellationKey={`${activeConstellation.id}-${constellationRun}`}
              done={done}
              disabled={closing || atlasOpen || wishOpen || bloodMoon}
              allowDragTrail={allowDragTrail}
              constellationPoints={sky.constellationPoints}
              pickOrder={pickOrder}
              dragCoords={dragCoords}
              dragActive={dragActive}
              onCollectStar={sky.handleCollectStar}
              onSkyPress={sky.handleSkyPress}
              onSkyLongPress={sky.openWishComposer}
            >
              <Svg pointerEvents="none" width={w} height={h} style={nightSkyStyles.absolute}>
                {!done && sky.pickedTrailPoints.length > 1 ? (
                  <Path
                    d={sky.pickedTrailPoints.map((s, i) => `${i ? "L" : "M"}${s.x * w} ${sky.starY(s.y)}`).join(" ")}
                    stroke="rgba(186,211,255,0.36)" strokeWidth="1.1" strokeDasharray="3 6" fill="none"
                  />
                ) : null}
                {!done
                  ? sky.pickedTrailPoints.map((s, idx) => (
                      <Circle key={`trail-${idx}`} cx={s.x * w} cy={sky.starY(s.y)} r="2.6" fill="#FDE9B2" />
                    ))
                  : null}
              </Svg>
              {activeConstellation.spots.map((s, i) => (
                <CollectStar
                  key={`${activeConstellation.id}-${constellationRun}-${i}`}
                  spotIndex={i} x={s.x} y={sky.starY(s.y) / h} s={s.s} w={w} h={h}
                  collected={picked[i]} onCollect={sky.handleCollectStar}
                />
              ))}
            </SkyPanCanvas>

            {allowDragTrail ? <StarDragTrail coords={dragCoords} active={dragActive} /> : null}
            {Array.from({ length: sky.meteorLaneCount }, (_, i) => (
              <ShootingStar
                key={`meteor-lane-${i}`} w={w} laneIndex={i}
                baseTop={insets.top + 118 + i * 94}
                coursePool={sky.coursePool} onPop={sky.handlePopCourseMeteor}
              />
            ))}
            {sky.wishMeteorVisible ? <WishMeteor token={sky.wishToken} w={w} top={insets.top + 92} /> : null}
            {sky.showerActive && allowRichDecor ? (
              <MeteorShower key={sky.showerToken} w={w} insetTop={insets.top} reduced={!allowRichDecor} />
            ) : null}
            {sky.swarmActive && allowRichDecor ? (
              <FireflySwarm key={sky.swarmToken} w={w} h={h} reduced={!allowRichDecor} />
            ) : null}
            {sky.showWhaleCameo ? (
              <WhaleSkyCameo
                visible={sky.showWhaleCameo} w={w} top={insets.top + (compact ? 94 : 110)}
                motion={motionEnabled} onTap={sky.handleWhaleTap}
              />
            ) : null}

            <Moon
              lit={lit} top={sky.moonTop} right={sky.moonRight} size={sky.moonSize}
              phaseInfo={moonInfo} bloodMoon={bloodMoon} locked={bloodMoon}
              onInspect={handleMoonInspect}
            />

            {sky.moonCard ? (
              <View
                pointerEvents="none"
                style={[
                  nightSkyStyles.moonCard,
                  {
                    top: sky.moonTop + 8,
                    right: sky.moonRight + sky.moonSize + 10,
                    maxWidth: Math.max(140, w - sky.moonRight - sky.moonSize - 34),
                    borderColor: "rgba(233,210,178,0.34)",
                  },
                ]}
              >
                <Text style={[nightSkyStyles.moonCardTitle, { color: "#FDE68A" }]}>
                  {`${sky.moonCard.name} · 月龄 ${sky.moonCard.ageDays} 天 · 光度 ${Math.round(sky.moonCard.illumination * 100)}%`}
                </Text>
                <Text style={nightSkyStyles.moonCardNote}>{`「${sky.moonCard.note}」`}</Text>
              </View>
            ) : null}

            <View style={[nightSkyStyles.headerWrap, { top: insets.top + 24, maxWidth: sky.headerMaxWidth }]}>
              <View style={nightSkyStyles.headerRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={pureMode ? "退出纯净观星模式" : "切换纯净观星模式"}
                  disabled={closing}
                  hitSlop={8}
                  onPress={sky.handleTogglePureMode}
                  style={({ pressed }) => ({ opacity: pressed ? 0.68 : pureMode ? 0.56 : 1 })}
                >
                  <Text style={nightSkyStyles.nocturneText}>NOCTURNE</Text>
                </Pressable>
                {!pureMode ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="打开星愿胶囊，写下或召唤许愿流星"
                      disabled={closing}
                      hitSlop={8}
                      onPress={sky.openWishComposer}
                      style={({ pressed }) => [
                        nightSkyStyles.wishChip,
                        { backgroundColor: pressed ? "rgba(253,230,138,0.2)" : "rgba(253,230,138,0.08)" },
                      ]}
                    >
                      <Text style={nightSkyStyles.wishChipText}>✦ 许愿</Text>
                    </Pressable>
                    {celestial.badge ? (
                      <View pointerEvents="none" style={nightSkyStyles.celestialBadge}>
                        <Text style={nightSkyStyles.celestialBadgeText}>{celestial.badge}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>

              {!pureMode ? (
                <View style={nightSkyStyles.chronicleRow}>
                  <Text style={nightSkyStyles.chronicleText}>
                    {chronicle ? `第 ${chronicle.visits} 次夜航 ·` : "夜航星图加载中…"}
                  </Text>
                  {chronicle ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`打开星图录，已点亮 ${sky.unlockedCount} 个星座`}
                      disabled={closing}
                      hitSlop={8}
                      onPress={sky.handleOpenAtlas}
                      style={({ pressed }) => [
                        nightSkyStyles.atlasChip,
                        { backgroundColor: pressed ? "rgba(125,211,252,0.2)" : "rgba(125,211,252,0.08)" },
                      ]}
                    >
                      <Text style={nightSkyStyles.atlasChipText}>
                        {`星图 ${sky.unlockedCount}/${NIGHT_CONSTELLATIONS.length}`}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {sky.wishText ? <Text style={nightSkyStyles.wishStatusText}>{sky.wishText}</Text> : null}
            </View>

            {sky.skyBanner ? (
              <View pointerEvents="none" style={[nightSkyStyles.skyBannerWrap, { top: sky.skyTop - 16 }]}>
                <View style={nightSkyStyles.skyBannerPill}>
                  <Text numberOfLines={2} style={nightSkyStyles.skyBannerText}>{sky.skyBanner}</Text>
                </View>
              </View>
            ) : null}

            {sky.whaleBubble ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  nightSkyStyles.whaleBubbleWrap,
                  { top: insets.top + (compact ? 186 : 204) },
                  whaleBubbleStyle,
                ]}
              >
                <Svg width={16} height={10} viewBox="0 0 16 10" style={nightSkyStyles.whaleBubblePointer}>
                  <Path d="M1 10 L8 1.5 L15 10 Z" fill="#0D1B3E" stroke="rgba(125,211,252,0.52)" strokeWidth={1} />
                </Svg>
                <View style={[nightSkyStyles.whaleBubbleOuter, { maxWidth: Math.min(316, w - 44) }]}>
                  <LinearGradient
                    colors={["rgba(13,27,62,0.94)", "rgba(8,17,42,0.92)", "rgba(19,26,58,0.94)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={nightSkyStyles.whaleBubbleGradient}
                  >
                    <View style={nightSkyStyles.whaleBubbleInner}>
                      <View style={nightSkyStyles.whaleBubbleBadge}>
                        <Text style={nightSkyStyles.whaleBubbleBadgeText}>✦ 大肥鱼 · 星海漫游</Text>
                      </View>
                      <Text style={nightSkyStyles.whaleBubbleText}>{sky.whaleBubble}</Text>
                    </View>
                  </LinearGradient>
                </View>
              </Animated.View>
            ) : null}

            {done ? (
              <>
                <ConstellationReveal
                  constellation={activeConstellation}
                  points={sky.constellationPoints}
                  width={w}
                  height={h}
                />
                {sky.constellationPoints.map((pt, spotIdx) => (
                  <HarpStarNode
                    key={`harp-${activeConstellation.id}-${constellationRun}-${spotIdx}`}
                    cx={pt.x}
                    cy={pt.y}
                    noteIndex={Math.max(0, pickOrder.indexOf(spotIdx))}
                    onPlay={sky.handlePlayHarpNote}
                  />
                ))}
                <Burst key={`burst-${activeConstellation.id}-${constellationRun}`} cx={sky.moonCx} cy={sky.moonCy} />
              </>
            ) : null}

            <Image
              source={OWL_BRANCH}
              pointerEvents="none"
              resizeMode="stretch"
              fadeDuration={0}
              style={{
                position: "absolute", right: 0,
                top: sky.owlTop + 77 - sky.branchWidth * 0.15,
                width: sky.branchWidth, height: sky.branchWidth / 3, zIndex: 4,
              }}
            />
            {!reduceMotion && (owlStage === "arriving" || owlStage === "leaving") ? (
              <OwlFlight
                stage={owlStage} elapsed={flightClock}
                x={sky.owlLeft + 40} y={sky.owlTop + 43}
                screenWidth={w} insetTop={insets.top}
              />
            ) : null}
            {owlStage === "perched" ? (
              <Owl
                left={sky.owlLeft} top={sky.owlTop}
                hint={sky.owlHint || undefined}
                bounceToken={sky.owlBounceToken}
                sleepy={celestial.sleepyOwl}
                onTap={handleOwlTap}
              />
            ) : null}

            {pureMode ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="展开底部星笺面板"
                disabled={closing}
                hitSlop={10}
                onPress={sky.handleExitPureMode}
                style={({ pressed }) => [
                  nightSkyStyles.pureRestorePill,
                  {
                    bottom: insets.bottom + (compact ? 14 : 22),
                    backgroundColor: pressed ? "rgba(24,38,72,0.88)" : "rgba(12,18,38,0.78)",
                  },
                ]}
              >
                <Text style={nightSkyStyles.pureRestoreText}>展开星笺 ✦</Text>
              </Pressable>
            ) : null}

            <Animated.View
              pointerEvents={pureMode ? "none" : "auto"}
              onLayout={sky.handlePanelLayout}
              style={[
                nightSkyStyles.panelWrap,
                { left: w < 380 ? 14 : 22, right: w < 380 ? 14 : 22, bottom: insets.bottom + (compact ? 12 : 22) },
                panelStyle,
              ]}
            >
              <View
                style={[
                  nightSkyStyles.panelCard,
                  { paddingHorizontal: compact ? 15 : 19, paddingVertical: compact ? 12 : 15 },
                ]}
              >
                <Image
                  pointerEvents="none"
                  source={require("../../assets/images/night-letter-bg.webp")}
                  resizeMode="cover"
                  fadeDuration={0}
                  style={nightSkyStyles.panelBgImage}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={["rgba(7,12,30,0.24)", "rgba(7,12,30,0.4)"]}
                  style={nightSkyStyles.fill}
                />

                <View className="flex-row items-center justify-between">
                  <View style={nightSkyStyles.letterHeaderLeft}>
                    <Text style={nightSkyStyles.letterTitle}>STARRY LETTER</Text>
                    <Text style={nightSkyStyles.letterConstellation}>· {activeConstellation.name}</Text>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <View className="flex-row items-center" style={{ gap: 5 }}>
                      {Array.from({ length: TOTAL_STARS }).map((_, i) => (
                        <AtlasSprite
                          key={i} source={NIGHT_SPRITES} columns={3} rows={2}
                          column={picked[i] ? 0 : 1} row={0} width={14}
                        />
                      ))}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="收起星笺进入纯净观星模式"
                      disabled={closing}
                      hitSlop={8}
                      onPress={sky.handleEnterPureMode}
                      style={({ pressed }) => [
                        nightSkyStyles.pureCollapseBtn,
                        { backgroundColor: pressed ? "rgba(186,211,255,0.22)" : "rgba(186,211,255,0.08)" },
                      ]}
                    >
                      <Text style={nightSkyStyles.pureCollapseIcon}>⌄</Text>
                    </Pressable>
                  </View>
                </View>

                <Suspense fallback={null}>
                  <NightSkyMessage closing={closing} />
                </Suspense>

                <View style={nightSkyStyles.achievementRow}>
                  {done ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="查看夜航星图录"
                        disabled={closing}
                        onPress={sky.handleOpenAtlas}
                        hitSlop={6}
                        style={({ pressed }) => [
                          nightSkyStyles.achievementBadge,
                          { backgroundColor: pressed ? "rgba(252,211,77,0.22)" : "rgba(252,211,77,0.12)" },
                        ]}
                      >
                        <Text numberOfLines={1} style={nightSkyStyles.achievementBadgeText}>
                          {`✦ ${activeConstellation.name} · ${activeConstellation.subtitle} (${sky.unlockedCount}/${NIGHT_CONSTELLATIONS.length})`}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="切换下一组星象重新拾星"
                        disabled={closing}
                        onPress={sky.handleNextConstellation}
                        hitSlop={6}
                        style={({ pressed }) => [
                          nightSkyStyles.redrawBtn,
                          { backgroundColor: pressed ? "rgba(186,211,255,0.2)" : "rgba(186,211,255,0.1)" },
                        ]}
                      >
                        <Text style={nightSkyStyles.redrawText}>再绘星图 ↻</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text numberOfLines={1} style={nightSkyStyles.constellationHint}>
                      {`今夜星象 · ${activeConstellation.name}（${activeConstellation.subtitle}）`}
                    </Text>
                  )}
                </View>

                <View className="flex-row items-center justify-between" style={{ marginTop: 10, gap: 8 }}>
                  <Text numberOfLines={2} style={nightSkyStyles.footerHint}>
                    {done
                      ? owlStage === "perched"
                        ? `${activeConstellation.motto} 轻点星点可弹音阶，戳猫头鹰聊聊`
                        : owlStage === "leaving"
                          ? "跟着猫头鹰，沿着夜色去doordoor农场"
                          : "星光点亮了枝头 · 有个小家伙正在飞来"
                      : lit === 0
                        ? sky.scheduleMoodNote
                          ? `${sky.scheduleMoodNote} · 轻点或划连拾星`
                          : "轻点或滑动连结星光 · 长按夜空可许愿"
                        : `拾起散落的星 · ${lit} / ${TOTAL_STARS}`}
                  </Text>
                  <View style={nightSkyStyles.footerActions}>
                    {done && chronicle?.owlPathUnlocked && onEnterFarm ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="沿夜色小径前往doordoor农场"
                        disabled={closing}
                        onPress={() => {
                          thumpHaptic();
                          playSfx("owl_hoot", { volume: 0.74, ignoreCooldown: true });
                          enterFarm();
                        }}
                        style={({ pressed }) => [
                          nightSkyStyles.goFarmBtn,
                          { backgroundColor: pressed ? "rgba(253,230,138,0.24)" : "rgba(253,230,138,0.14)" },
                        ]}
                      >
                        <Text style={nightSkyStyles.goFarmText}>去doordoor农场 →</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      disabled={closing}
                      onPress={() => {
                        tapHaptic();
                        close();
                      }}
                      style={nightSkyStyles.closeBtn}
                    >
                      <Text style={nightSkyStyles.closeBtnText}>回到现实</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        ) : null}

        {/* 血月降临 1.5s 转场演出层 */}
        {bloodMoonPhase === "entering" ? (
          <View pointerEvents="auto" style={[nightSkyStyles.fill, { zIndex: 25 }]}>
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute", left: sky.moonCx - 48, top: sky.moonCy - 48,
                  width: 96, height: 96, borderRadius: 48, borderWidth: 2.5,
                  borderColor: "rgba(248,113,113,0.92)", backgroundColor: "rgba(185,28,28,0.24)",
                },
                bloodShockStyle,
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute", left: sky.moonCx - w * 0.55, top: sky.moonCy - w * 0.55,
                  width: w * 1.1, height: w * 1.1,
                },
                bloodSweepStyle,
              ]}
            >
              <Svg width="100%" height="100%" viewBox="0 0 100 100">
                <Defs>
                  <RadialGradient id="eclipseSweep" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#050103" stopOpacity={0.96} />
                    <Stop offset="0.58" stopColor="#450A0A" stopOpacity={0.78} />
                    <Stop offset="1" stopColor="#7F1D1D" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx="50" cy="50" r="50" fill="url(#eclipseSweep)" />
              </Svg>
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[nightSkyStyles.fill, { backgroundColor: "#140206" }, bloodVeilStyle]}
            />
          </View>
        ) : null}

        {/* 独立恐怖血月界面（懒加载，未激活时零挂载、零解码血月 WebP 贴图） */}
        {bloodMoonRealmMounted ? (
          <Suspense fallback={null}>
            <BloodMoonRealm
              w={w} h={h} insetTop={insets.top} insetBottom={insets.bottom}
              compact={compact} motion={bloodMoonMotionEnabled}
              allowRichDecor={allowRichDecor} allowFullDecor={allowFullDecor}
              exiting={bloodMoonPhase === "exiting"} moonInfo={moonInfo}
              onExit={handleRequestExitBloodMoon} onExited={handleBloodMoonExited}
            />
          </Suspense>
        ) : null}

        <Animated.View pointerEvents="none" style={[nightSkyStyles.travelVeil, travelStyle]} />

        {atlasOpen ? (
          <Suspense fallback={null}>
            <StarAtlasModal
              visible={atlasOpen}
              chronicle={chronicle ?? DEFAULT_NIGHT_CHRONICLE}
              activeConstellationId={activeConstellation.id}
              wishCount={sky.wishes.length}
              onSelectConstellation={sky.handleSelectConstellation}
              onClose={sky.handleCloseAtlas}
            />
          </Suspense>
        ) : null}

        {wishOpen ? (
          <Suspense fallback={null}>
            <WishComposerModal
              visible={wishOpen}
              wishes={sky.wishes}
              constellationName={activeConstellation.name}
              onSendWish={sky.handleSendWish}
              onQuickMeteor={sky.handleQuickMeteor}
              onClose={sky.handleCloseWish}
            />
          </Suspense>
        ) : null}
      </Animated.View>
    </NightMotion.Provider>
  );
}
