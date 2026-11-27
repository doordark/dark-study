import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { playSfx, playStarScaleNote, risingRate } from "@/services/soundEffects";
import { useSoundEffects } from "@/store/useSoundEffects";
import {
  advanceShakeCount,
  appendNoteHistory,
  appendTapeNote,
  CHIME_NOTES,
  CHIME_PRESETS,
  computeBreathPhase,
  computeJarWarmth,
  createInitialFireflies,
  FORTUNE_SEALS,
  matchChimeDiscovery,
  MAX_FIREFLIES,
  nextSealIndex,
  pickCampusFortune,
  pickIdleKeepsake,
  resolveJourneyWhisper,
  SHAKE_TARGET,
  spawnFirefly,
  stepCursor,
  type CampusFortune,
  type FireflyOrb,
  type MelodyDiscovery,
} from "@/utils/ambientCraft";
import {
  bumpHaptic,
  selectHaptic,
  successHaptic,
  tapHaptic,
  thumpHaptic,
} from "@/utils/haptics";

export type AmbientCraftKind = "musicbox" | "lantern" | "fortune";

export interface AmbientCraftContext {
  earnedCredits?: number;
  termCount?: number;
  version?: string;
}

export interface AmbientCraftModalProps {
  visible: boolean;
  kind: AmbientCraftKind;
  context?: AmbientCraftContext;
  onClose: () => void;
}

function CraftButton({
  label,
  onPress,
  accent = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        accent && s.buttonAccent,
        disabled && s.buttonDisabled,
      ]}
    >
      <Text style={[s.buttonText, accent && s.buttonAccentText]}>{label}</Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  1. Midnight Chime Music Box                                               */
/* -------------------------------------------------------------------------- */

function MusicBoxCraft({ version }: { version?: string }) {
  const reducedMotion = useReducedMotion();
  const sfxOn = useSoundEffects((state) => state.on);
  const svgUid = useId().replace(/[^\w-]/g, "");

  const [activeNote, setActiveNote] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [tape, setTape] = useState<number[]>([]);
  const [playingMode, setPlayingMode] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<MelodyDiscovery | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorRef = useRef(0);

  const spin = useSharedValue(0);

  const stopPlayback = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPlayingMode(null);
    setActiveNote(null);
  }, []);

  useEffect(() => {
    if (playingMode && !reducedMotion) {
      spin.set(
        withRepeat(
          withTiming(360, { duration: 4800, easing: Easing.linear }),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(spin);
      spin.set(withTiming(0, { duration: 240 }));
    }
    return () => {
      cancelAnimation(spin);
    };
  }, [playingMode, reducedMotion, spin]);

  useEffect(
    () => () => {
      if (timerRef.current != null) clearInterval(timerRef.current);
      if (flashTimerRef.current != null) clearTimeout(flashTimerRef.current);
      cancelAnimation(spin);
    },
    [spin],
  );

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.get()}deg` }],
  }));

  const flashNote = useCallback((noteIdx: number) => {
    setActiveNote(noteIdx);
    if (flashTimerRef.current != null) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      flashTimerRef.current = null;
      setActiveNote(null);
    }, 300);
  }, []);

  const handleKeyPress = (noteIdx: number) => {
    if (playingMode) stopPlayback();
    tapHaptic();
    playStarScaleNote(noteIdx, { volume: 0.72 });
    flashNote(noteIdx);
    const nextHistory = appendNoteHistory(history, noteIdx);
    setHistory(nextHistory);
    setTape((prev) => appendTapeNote(prev, noteIdx, 8));

    const found = matchChimeDiscovery(nextHistory);
    if (found && found.id !== discovery?.id) {
      setDiscovery(found);
      successHaptic();
      playSfx("star_constellation", { volume: 0.72, ignoreCooldown: true });
    }
  };

  const startSequence = (
    modeId: string,
    steps: readonly (number | null)[],
    tempoMs: number,
  ) => {
    if (playingMode === modeId) {
      stopPlayback();
      tapHaptic();
      return;
    }
    stopPlayback();
    if (!steps.length) return;
    tapHaptic();
    setPlayingMode(modeId);
    cursorRef.current = 0;

    const playAt = (idx: number) => {
      const note = steps[idx];
      if (note !== null && note !== undefined) {
        playStarScaleNote(note, { volume: 0.66 });
        flashNote(note);
      } else {
        setActiveNote(null);
      }
    };

    playAt(0);
    timerRef.current = setInterval(() => {
      cursorRef.current = stepCursor(cursorRef.current, steps.length);
      playAt(cursorRef.current);
    }, tempoMs);
  };

  const activeMeta =
    activeNote !== null ? CHIME_NOTES[activeNote] ?? null : null;

  return (
    <>
      <Text style={s.eyebrow}>
        MIDNIGHT CHIME · {version ? `v${version}` : "MUSIC BOX"}
      </Text>
      <Text style={s.title}>午夜八音盒</Text>
      <Text style={s.body}>
        拨响一排微光琴键，或上紧发条听一段校园旧旋律。{"\n"}
        据说弹对了熟悉的乐句，纸带会自己吐出一张小笺。
      </Text>

      {/* Visual brass star-wheel cylinder */}
      <View style={s.stageBox}>
        <Animated.View style={wheelStyle}>
          <Svg width={132} height={132} viewBox="0 0 132 132">
            <Defs>
              <RadialGradient id={`mb-glow-${svgUid}`} cx="50%" cy="50%" r="50%">
                <Stop
                  offset="0%"
                  stopColor={activeMeta ? activeMeta.color : "#F7D48D"}
                  stopOpacity={activeMeta ? 0.52 : 0.24}
                />
                <Stop offset="100%" stopColor="#101F35" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={66} cy={66} r={60} fill={`url(#mb-glow-${svgUid})`} />
            <Circle
              cx={66}
              cy={66}
              r={46}
              fill="#152943"
              stroke="#C9A86B"
              strokeWidth={1.6}
              strokeDasharray="4 4"
            />
            <Circle
              cx={66}
              cy={66}
              r={32}
              fill="none"
              stroke="rgba(247,212,141,0.45)"
              strokeWidth={1.2}
            />
            {CHIME_NOTES.map((n, idx) => {
              const angle = (idx / CHIME_NOTES.length) * Math.PI * 2 - Math.PI / 2;
              const cx = 66 + Math.cos(angle) * 39;
              const cy = 66 + Math.sin(angle) * 39;
              const lit = activeNote === n.index;
              return (
                <Circle
                  key={n.index}
                  cx={cx}
                  cy={cy}
                  r={lit ? 5.6 : 3.2}
                  fill={lit ? n.color : "#E9CFA0"}
                  opacity={lit ? 1 : 0.72}
                />
              );
            })}
            <Circle cx={66} cy={66} r={10} fill="#E9CFA0" />
            <Circle cx={66} cy={66} r={4.5} fill="#162944" />
          </Svg>
        </Animated.View>
        <Text style={s.stageCaption}>
          {activeMeta
            ? `✦ ${activeMeta.solfege} · ${activeMeta.pitch} 调星芒`
            : playingMode
              ? "发条转动中，轻点可暂停"
              : "轻敲下方任意一枚晶石琴键"}
        </Text>
      </View>

      {/* 7-key crystal chime row */}
      <View style={s.keysRow}>
        {CHIME_NOTES.map((n) => {
          const lit = activeNote === n.index;
          return (
            <Pressable
              key={n.index}
              accessibilityRole="button"
              accessibilityLabel={`音阶 ${n.solfege}`}
              onPress={() => handleKeyPress(n.index)}
              style={[
                s.chimeKey,
                {
                  borderColor: lit ? n.color : "rgba(186,230,253,0.22)",
                  backgroundColor: lit ? n.glow : "rgba(22,40,66,0.9)",
                },
              ]}
            >
              <View style={[s.keyGem, { backgroundColor: n.color }]} />
              <Text style={[s.keyNum, lit && { color: "#FFFFFF" }]}>
                {n.numeral}
              </Text>
              <Text style={s.keySolfege}>{n.solfege}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Preset wind-up melodies */}
      <View style={s.chipRow}>
        {CHIME_PRESETS.map((preset) => {
          const active = playingMode === preset.id;
          return (
            <Pressable
              key={preset.id}
              accessibilityRole="button"
              onPress={() => startSequence(preset.id, preset.steps, preset.tempoMs)}
              style={[s.chip, active && s.chipActive]}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>
                {active ? "■ " : "♪ "}
                {preset.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* User's 8-slot punched paper tape */}
      <View style={s.tapeBox}>
        <View style={s.tapeHeader}>
          <Text style={s.tapeLabel}>我的纸带（最近 8 音）</Text>
          {tape.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                if (playingMode === "tape") stopPlayback();
                setTape([]);
                setHistory([]);
                tapHaptic();
              }}
            >
              <Text style={s.tapeClear}>清空</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={s.tapeSlots}>
          {Array.from({ length: 8 }).map((_, idx) => {
            const note = tape[idx];
            const meta = note !== undefined ? CHIME_NOTES[note] : null;
            return (
              <View
                key={idx}
                style={[
                  s.tapeDot,
                  meta
                    ? { backgroundColor: meta.color, borderColor: meta.color }
                    : undefined,
                ]}
              >
                <Text
                  style={[
                    s.tapeDotText,
                    !meta && s.tapeDotEmptyText,
                  ]}
                >
                  {meta ? meta.numeral : "·"}
                </Text>
              </View>
            );
          })}
        </View>
        {tape.length >= 2 ? (
          <CraftButton
            accent={playingMode === "tape"}
            label={playingMode === "tape" ? "停止循环纸带" : "上紧发条 · 播放我的纸带"}
            onPress={() => startSequence("tape", [...tape, null], 360)}
          />
        ) : null}
      </View>

      {discovery ? (
        <View style={s.paperCard}>
          <Text style={s.paperEyebrow}>纸带暗语解锁 · {discovery.title}</Text>
          <Text style={s.paperBody}>{discovery.keepsake}</Text>
        </View>
      ) : null}

      {!sfxOn ? (
        <Text style={s.muteNote}>
          当前彩蛋音效为静音状态，仍可感受星轮光点与触感律动。
        </Text>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  2. Idle-Hour Firefly Jar & Guided Breath Sanctuary                        */
/* -------------------------------------------------------------------------- */

function LanternCraft() {
  const reducedMotion = useReducedMotion();
  const svgUid = useId().replace(/[^\w-]/g, "");

  const [fireflies, setFireflies] = useState<FireflyOrb[]>(() =>
    createInitialFireflies(3),
  );
  const [breathing, setBreathing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [keepsakeIdx, setKeepsakeIdx] = useState(0);
  const [unlockedSlip, setUnlockedSlip] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const breathStartRef = useRef(0);
  const lastStageRef = useRef<string | null>(null);
  const lastCycleRef = useRef(0);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const haloScale = useSharedValue(1);
  const liftY = useSharedValue(0);
  const jarOpacity = useSharedValue(1);

  const breath = useMemo(() => computeBreathPhase(elapsedMs), [elapsedMs]);
  const warmth = computeJarWarmth(fireflies.length);

  useEffect(() => {
    if (!breathing) {
      lastStageRef.current = null;
      haloScale.set(withTiming(1, { duration: 280 }));
      return;
    }
    const id = setInterval(() => {
      const nextMs = Date.now() - breathStartRef.current;
      setElapsedMs(nextMs);
      const snap = computeBreathPhase(nextMs);
      if (!reducedMotion) {
        haloScale.set(withTiming(snap.haloScale, { duration: 140 }));
      }
      if (lastStageRef.current !== snap.stage) {
        lastStageRef.current = snap.stage;
        selectHaptic();
      }
      if (snap.completedCycles > lastCycleRef.current) {
        lastCycleRef.current = snap.completedCycles;
        setUnlockedSlip(true);
        setKeepsakeIdx((k) => k + 1);
        successHaptic();
        playSfx("farm_event", { volume: 0.64 });
      }
    }, 100);
    return () => clearInterval(id);
  }, [breathing, reducedMotion, haloScale]);

  useEffect(
    () => () => {
      if (releaseTimerRef.current != null) clearTimeout(releaseTimerRef.current);
      cancelAnimation(haloScale);
      cancelAnimation(liftY);
      cancelAnimation(jarOpacity);
    },
    [haloScale, liftY, jarOpacity],
  );

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.get() }],
  }));

  const orbsLiftStyle = useAnimatedStyle(() => ({
    opacity: jarOpacity.get(),
    transform: [{ translateY: liftY.get() }],
  }));

  const handleJarTap = (e: GestureResponderEvent) => {
    if (releasing) return;
    const lx = e.nativeEvent?.locationX;
    const ly = e.nativeEvent?.locationY;
    const tapNorm =
      Number.isFinite(lx) && Number.isFinite(ly) && (lx > 0 || ly > 0)
        ? { x: lx / 200, y: ly / 210 }
        : undefined;

    if (fireflies.length >= MAX_FIREFLIES) {
      setKeepsakeIdx((k) => k + 1);
      setUnlockedSlip(true);
      selectHaptic();
      playSfx("whale_ui_ripple", { volume: 0.56 });
      return;
    }
    const next = spawnFirefly(fireflies, tapNorm);
    setFireflies(next);
    selectHaptic();
    playSfx("after_star_flip", {
      rate: risingRate(next.length - 1, 0.04, 0.9),
      volume: 0.62,
    });
    if (next.length === MAX_FIREFLIES) {
      setUnlockedSlip(true);
      successHaptic();
      playSfx("farm_event", { volume: 0.65 });
    }
  };

  const toggleBreath = () => {
    tapHaptic();
    if (breathing) {
      setBreathing(false);
    } else {
      breathStartRef.current = Date.now();
      setElapsedMs(0);
      lastCycleRef.current = 0;
      setBreathing(true);
      playSfx("farm_water", { volume: 0.5 });
    }
  };

  const handleRelease = () => {
    if (releasing || fireflies.length === 0) return;
    setReleasing(true);
    setBreathing(false);
    successHaptic();
    playSfx("star_constellation", { volume: 0.66 });

    if (!reducedMotion) {
      liftY.set(withTiming(-42, { duration: 640, easing: Easing.out(Easing.cubic) }));
      jarOpacity.set(withTiming(0, { duration: 640 }));
    }
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null;
      setFireflies(createInitialFireflies(2));
      setUnlockedSlip(true);
      setKeepsakeIdx((k) => k + 1);
      liftY.set(0);
      jarOpacity.set(1);
      setReleasing(false);
    }, reducedMotion ? 160 : 680);
  };

  return (
    <>
      <Text style={s.eyebrow}>EMPTY HOUR SANCTUARY · FIREFLY JAR</Text>
      <Text style={s.title}>空堂萤火罐</Text>
      <Text style={s.body}>
        没课的缝隙里，装进几颗慢慢发光的微尘。{"\n"}
        轻点玻璃瓶收集萤火，或跟着暖光做一次 4-2-6 呼吸。
      </Text>

      {/* Interactive glowing jar */}
      <View style={s.jarWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            s.jarHalo,
            {
              opacity: 0.16 + warmth * 0.34,
            },
            haloStyle,
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`萤火罐，当前 ${fireflies.length} 颗萤火，轻点可收集新的微光`}
          onPress={handleJarTap}
          style={s.jarTouch}
        >
          <Svg width={200} height={210} viewBox="0 0 200 210">
            <Defs>
              <RadialGradient id={`jar-warm-${svgUid}`} cx="50%" cy="56%" r="48%">
                <Stop
                  offset="0%"
                  stopColor="#FDE68A"
                  stopOpacity={0.14 + warmth * 0.36}
                />
                <Stop offset="100%" stopColor="#12233B" stopOpacity={0} />
              </RadialGradient>
              <SvgLinearGradient id={`jar-glass-${svgUid}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#E0F2FE" stopOpacity={0.22} />
                <Stop offset="50%" stopColor="#94A3B8" stopOpacity={0.06} />
                <Stop offset="100%" stopColor="#FDE68A" stopOpacity={0.14} />
              </SvgLinearGradient>
            </Defs>

            {/* Warm ambient pool */}
            <Ellipse cx={100} cy={122} rx={68} ry={66} fill={`url(#jar-warm-${svgUid})`} />

            {/* Cork stopper */}
            <Rect
              x={74}
              y={18}
              width={52}
              height={16}
              rx={5}
              fill={releasing ? "#9E7856" : "#B58D67"}
              opacity={releasing ? 0.45 : 0.95}
            />
            {/* Rim */}
            <Rect
              x={64}
              y={32}
              width={72}
              height={11}
              rx={5.5}
              fill="rgba(226,232,240,0.22)"
              stroke="rgba(226,232,240,0.52)"
              strokeWidth={1.3}
            />
            {/* Jar silhouette */}
            <Path
              d="M 68 43 Q 66 56 48 70 Q 38 80 38 102 L 38 164 Q 38 190 66 190 L 134 190 Q 162 190 162 164 L 162 102 Q 162 80 152 70 Q 134 56 132 43 Z"
              fill={`url(#jar-glass-${svgUid})`}
              stroke="rgba(203,213,225,0.45)"
              strokeWidth={1.6}
            />
            {/* Specular highlight */}
            <Path
              d="M 52 88 L 52 160"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <Path
              d="M 148 96 L 148 136"
              stroke="rgba(253,230,138,0.22)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>

          {/* Firefly dots overlay (animates gently on release) */}
          <Animated.View pointerEvents="none" style={[s.jarOrbsLayer, orbsLiftStyle]}>
            <Svg width={200} height={210} viewBox="0 0 200 210">
              {fireflies.map((orb) => (
                <G key={orb.id}>
                  <Circle
                    cx={orb.x * 200}
                    cy={orb.y * 210}
                    r={orb.radius * 2.8}
                    fill={orb.tint}
                    opacity={0.22}
                  />
                  <Circle
                    cx={orb.x * 200}
                    cy={orb.y * 210}
                    r={orb.radius}
                    fill={orb.tint}
                    opacity={0.96}
                  />
                </G>
              ))}
            </Svg>
          </Animated.View>
        </Pressable>

        <Text accessibilityLiveRegion="polite" style={s.stageCaption}>
          {breathing
            ? `${breath.label} · ${breath.hint}`
            : `已收集 ${fireflies.length} / ${MAX_FIREFLIES} 颗微光 · 轻点瓶身继续装光`}
        </Text>
      </View>

      <View style={s.actionRow}>
        <View style={s.actionHalf}>
          <CraftButton
            accent={breathing}
            label={breathing ? "暂停呼吸节奏" : "跟着光呼吸 4-2-6"}
            onPress={toggleBreath}
          />
        </View>
        <View style={s.actionHalf}>
          <CraftButton
            disabled={releasing || fireflies.length === 0}
            label="开盖放飞萤火"
            onPress={handleRelease}
          />
        </View>
      </View>

      {unlockedSlip ? (
        <View style={s.paperCard}>
          <Text style={s.paperEyebrow}>空堂拾光便签</Text>
          <Text style={s.paperBody}>{pickIdleKeepsake(keepsakeIdx)}</Text>
        </View>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  3. Midnight Astrolabe & Campus Fortune Cylinder                           */
/* -------------------------------------------------------------------------- */

function FortuneCraft({
  earnedCredits,
  termCount,
}: {
  earnedCredits?: number;
  termCount?: number;
}) {
  const reducedMotion = useReducedMotion();
  const svgUid = useId().replace(/[^\w-]/g, "");

  const [shakes, setShakes] = useState(0);
  const [drawSeed, setDrawSeed] = useState(() => Math.floor(Date.now() / 1000));
  const [fortune, setFortune] = useState<CampusFortune | null>(null);
  const [lastFortuneId, setLastFortuneId] = useState<string | undefined>(undefined);
  const [sealIdx, setSealIdx] = useState<number | null>(null);

  const tilt = useSharedValue(0);
  const sealScale = useSharedValue(1);

  const whisper = useMemo(
    () => resolveJourneyWhisper({ earnedCredits, termCount }),
    [earnedCredits, termCount],
  );

  useEffect(
    () => () => {
      cancelAnimation(tilt);
      cancelAnimation(sealScale);
    },
    [tilt, sealScale],
  );

  const tubeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt.get()}deg` }],
  }));

  const sealStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: "-10deg" }, { scale: sealScale.get() }],
  }));

  const handleShake = () => {
    const res = advanceShakeCount(shakes, SHAKE_TARGET);
    setShakes(res.count);

    if (!reducedMotion) {
      tilt.set(
        withSequence(
          withTiming(-9, { duration: 75 }),
          withTiming(9, { duration: 90 }),
          withTiming(-5, { duration: 80 }),
          withSpring(0, { damping: 12, stiffness: 200 }),
        ),
      );
    }

    if (res.revealed) {
      const nextSeed = drawSeed + 17 + res.count;
      setDrawSeed(nextSeed);
      const picked = pickCampusFortune(nextSeed, lastFortuneId);
      setFortune(picked);
      setLastFortuneId(picked.id);
      setSealIdx(null);
      successHaptic();
      playSfx("farm_level_up", { volume: 0.66 });
    } else {
      bumpHaptic();
      playSfx("after_coffee_stir", {
        rate: risingRate(res.count - 1, 0.1, 0.94),
        volume: 0.68,
      });
    }
  };

  const handleStamp = () => {
    const next = nextSealIndex(sealIdx);
    setSealIdx(next);
    thumpHaptic();
    playSfx("after_stamp", { volume: 0.78, ignoreCooldown: true });
    if (!reducedMotion) {
      sealScale.set(1.26);
      sealScale.set(withSpring(1, { damping: 11, stiffness: 220 }));
    }
  };

  const handleRedraw = () => {
    tapHaptic();
    setFortune(null);
    setShakes(0);
    setSealIdx(null);
  };

  const slipLift = shakes * 10;

  return (
    <>
      <Text style={s.eyebrow}>MIDNIGHT ASTROLABE · CAMPUS FORTUNE</Text>
      <Text style={s.title}>深夜好运签筒</Text>
      <Text style={s.body}>
        绩点只是一串数字，不代表你的全部光芒。{"\n"}
        轻摇三下竹筒，领一枚今夜限定的校园好运签。
      </Text>

      {fortune ? (
        <View style={s.fortunePaper}>
          <View style={s.fortuneTopRow}>
            <Text style={s.fortuneMeta}>{fortune.numberLabel}</Text>
            <View style={s.tierPill}>
              <Text style={s.tierText}>{fortune.tier}</Text>
            </View>
          </View>
          <Text style={s.fortuneTitle}>{fortune.title}</Text>
          <View style={s.fortuneRule} />
          <Text style={s.fortunePoem}>
            {fortune.poem[0]}
            {"\n"}
            {fortune.poem[1]}
          </Text>
          <View style={s.fortuneAdvice}>
            <Text style={s.adviceLine}>
              <Text style={s.adviceTagGood}>宜　</Text>
              {fortune.suitable}
            </Text>
            <Text style={s.adviceLine}>
              <Text style={s.adviceTagWarn}>忌　</Text>
              {fortune.avoid}
            </Text>
            <Text style={s.adviceLine}>
              <Text style={s.adviceTagToken}>微物　</Text>
              {fortune.luckyToken}
            </Text>
          </View>
          <View style={s.fortuneRule} />
          <View style={s.fortuneFooterRow}>
            <Text style={s.whisperText}>{whisper}</Text>
            {sealIdx !== null ? (
              <Animated.View style={[s.waxSeal, sealStyle]}>
                <Text style={s.waxSealText}>{FORTUNE_SEALS[sealIdx]}</Text>
              </Animated.View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={s.stageBox}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`轻摇好运签筒，当前第 ${shakes} 次，共 ${SHAKE_TARGET} 次`}
            onPress={handleShake}
            style={s.tubeTouch}
          >
            <Animated.View style={tubeStyle}>
              <Svg width={196} height={176} viewBox="0 0 196 176">
                <Defs>
                  <RadialGradient id={`ast-glow-${svgUid}`} cx="50%" cy="46%" r="48%">
                    <Stop offset="0%" stopColor="#F7D48D" stopOpacity={0.28} />
                    <Stop offset="100%" stopColor="#101F35" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                {/* Astrolabe halo behind bamboo cylinder */}
                <Circle cx={98} cy={84} r={74} fill={`url(#ast-glow-${svgUid})`} />
                <Circle
                  cx={98}
                  cy={84}
                  r={66}
                  fill="none"
                  stroke="rgba(247,212,141,0.3)"
                  strokeWidth={1.2}
                  strokeDasharray="3 5"
                />
                <Circle
                  cx={98}
                  cy={84}
                  r={50}
                  fill="none"
                  stroke="rgba(125,211,252,0.22)"
                  strokeWidth={1}
                />

                {/* Bamboo fortune slips sticking out */}
                <Rect
                  x={78}
                  y={36 - slipLift * 0.4}
                  width={8}
                  height={56}
                  rx={3}
                  fill="#DEC395"
                  transform="rotate(-11 82 64)"
                />
                <Rect
                  x={110}
                  y={38 - slipLift * 0.5}
                  width={8}
                  height={56}
                  rx={3}
                  fill="#D4B582"
                  transform="rotate(10 114 66)"
                />
                {/* Highlighted golden rising slip */}
                <Rect
                  x={93}
                  y={30 - slipLift}
                  width={10}
                  height={66}
                  rx={4}
                  fill="#FDE68A"
                  stroke="#B45309"
                  strokeWidth={1}
                />

                {/* Bamboo cylinder body */}
                <Path
                  d="M 64 76 L 70 154 Q 71 162 98 162 Q 125 162 126 154 L 132 76 Z"
                  fill="#7C563B"
                  stroke="#C9A86B"
                  strokeWidth={1.5}
                />
                <Ellipse
                  cx={98}
                  cy={76}
                  rx={34}
                  ry={9}
                  fill="#5A3D29"
                  stroke="#E5C98E"
                  strokeWidth={1.4}
                />
                <Line
                  x1={68}
                  y1={114}
                  x2={128}
                  y2={114}
                  stroke="rgba(247,212,141,0.42)"
                  strokeWidth={1.3}
                />
                {/* Center diamond crest */}
                <Path
                  d="M 98 122 L 107 132 L 98 142 L 89 132 Z"
                  fill="#F3E7C9"
                  opacity={0.9}
                />
              </Svg>
            </Animated.View>
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={s.stageCaption}>
            轻点签筒摇一摇 · {"● ".repeat(shakes)}
            {"○ ".repeat(Math.max(0, SHAKE_TARGET - shakes))}
          </Text>
        </View>
      )}

      {fortune ? (
        <View style={s.actionRow}>
          <View style={s.actionHalf}>
            <CraftButton
              accent
              label={sealIdx === null ? "盖一枚私章" : "换一枚私章"}
              onPress={handleStamp}
            />
          </View>
          <View style={s.actionHalf}>
            <CraftButton label="再摇一签" onPress={handleRedraw} />
          </View>
        </View>
      ) : (
        <CraftButton
          accent
          label={shakes === 0 ? "轻摇签筒" : `再摇一下（${shakes}/${SHAKE_TARGET}）`}
          onPress={handleShake}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Unified Sanctuary Modal Shell                                             */
/* -------------------------------------------------------------------------- */

export function AmbientCraftModal({
  visible,
  kind,
  context,
  onClose,
}: AmbientCraftModalProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";

  if (!visible) return null;

  const handleClose = () => {
    tapHaptic();
    playSfx("whale_popover_close", { volume: 0.45 });
    onClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View
        style={[
          s.backdrop,
          {
            backgroundColor: isDark
              ? "rgba(3,10,24,0.88)"
              : "rgba(15,23,42,0.74)",
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <View
          style={[
            s.panel,
            {
              borderColor: isDark ? "#34516B" : "#4A6A88",
            },
          ]}
        >
          <LinearGradient
            colors={
              isDark
                ? ["#12243E", "#0E1C31", "#0C182B"]
                : ["#193152", "#142742", "#101F35"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.closeBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭并返回"
              onPress={handleClose}
              style={s.closeBtn}
            >
              <Text style={s.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
          >
            {kind === "musicbox" ? (
              <MusicBoxCraft version={context?.version} />
            ) : kind === "lantern" ? (
              <LanternCraft />
            ) : (
              <FortuneCraft
                earnedCredits={context?.earnedCredits}
                termCount={context?.termCount}
              />
            )}
            <CraftButton label="收好这份心意，返回" onPress={handleClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "100%",
    alignSelf: "center",
    borderRadius: 30,
    backgroundColor: "#101F35",
    borderWidth: 1,
    overflow: "hidden",
  },
  closeBar: {
    alignItems: "flex-end",
    paddingRight: 8,
    paddingTop: 4,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "#B9CDDD",
    fontSize: 28,
  },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 24,
    gap: 15,
  },
  eyebrow: {
    color: "#90BBCC",
    fontSize: 10,
    letterSpacing: 1.5,
    textAlign: "center",
  },
  title: {
    color: "#F8EDCE",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: "#B9CDDD",
    fontSize: 12.5,
    lineHeight: 21,
    textAlign: "center",
  },
  stageBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
  },
  stageCaption: {
    color: "#D9E7F2",
    fontSize: 11.5,
    textAlign: "center",
  },
  keysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  chimeKey: {
    flex: 1,
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  keyGem: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  keyNum: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "800",
  },
  keySolfege: {
    color: "#94A3B8",
    fontSize: 9.5,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.3)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: {
    borderColor: "#F7D48D",
    backgroundColor: "rgba(247,212,141,0.18)",
  },
  chipText: {
    color: "#CBD5E1",
    fontSize: 11.5,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FDE68A",
  },
  tapeBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(186,230,253,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 10,
  },
  tapeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tapeLabel: {
    color: "#9BB4C9",
    fontSize: 11,
    fontWeight: "600",
  },
  tapeClear: {
    color: "#7DD3FC",
    fontSize: 11,
    fontWeight: "600",
  },
  tapeSlots: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  tapeDot: {
    flex: 1,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  tapeDotText: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "800",
  },
  tapeDotEmptyText: {
    color: "#64748B",
    fontWeight: "600",
  },
  muteNote: {
    color: "#8FA8BF",
    fontSize: 10.5,
    textAlign: "center",
  },
  jarWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
  },
  jarHalo: {
    position: "absolute",
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: "#FDE68A",
  },
  jarTouch: {
    width: 200,
    height: 210,
    alignItems: "center",
    justifyContent: "center",
  },
  jarOrbsLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 200,
    height: 210,
  },
  tubeTouch: {
    width: 196,
    height: 176,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionHalf: {
    flex: 1,
  },
  button: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#243B53",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#43607A",
  },
  buttonAccent: {
    backgroundColor: "#35536F",
    borderColor: "#E5C687",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: "#E0EDEE",
    fontSize: 12.5,
    fontWeight: "600",
    textAlign: "center",
  },
  buttonAccentText: {
    color: "#FDECC8",
    fontWeight: "700",
  },
  paperCard: {
    backgroundColor: "#F3E7C9",
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  paperEyebrow: {
    color: "#8C6F47",
    fontSize: 11,
    fontWeight: "700",
  },
  paperBody: {
    color: "#3F4942",
    fontSize: 13,
    lineHeight: 22,
  },
  fortunePaper: {
    backgroundColor: "#F5EAD0",
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  fortuneTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fortuneMeta: {
    color: "#7B6649",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  tierPill: {
    borderRadius: 999,
    backgroundColor: "rgba(180,83,9,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tierText: {
    color: "#9A3412",
    fontSize: 11,
    fontWeight: "800",
  },
  fortuneTitle: {
    color: "#22384F",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 2,
    textAlign: "center",
  },
  fortuneRule: {
    borderTopWidth: 1,
    borderColor: "#C7B797",
    borderStyle: "dashed",
  },
  fortunePoem: {
    color: "#3A443D",
    fontSize: 14,
    lineHeight: 25,
    textAlign: "center",
    fontWeight: "600",
  },
  fortuneAdvice: {
    gap: 5,
    paddingTop: 2,
  },
  adviceLine: {
    color: "#52564D",
    fontSize: 12,
    lineHeight: 19,
  },
  adviceTagGood: {
    color: "#15803D",
    fontWeight: "800",
  },
  adviceTagWarn: {
    color: "#B45309",
    fontWeight: "800",
  },
  adviceTagToken: {
    color: "#0369A1",
    fontWeight: "800",
  },
  fortuneFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  whisperText: {
    flex: 1,
    color: "#6C5F49",
    fontSize: 11.5,
    lineHeight: 18,
  },
  waxSeal: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: "#B4453C",
    backgroundColor: "rgba(180,69,60,0.12)",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  waxSealText: {
    color: "#A83B32",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    textAlign: "center",
  },
});
