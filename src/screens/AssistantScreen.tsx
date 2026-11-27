import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  Keyboard,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AssistantEmptyState } from "@/components/AssistantEmptyState";
import { AssistantMessage } from "@/components/AssistantMessage";
import { Backdrop } from "@/components/Backdrop";
import { ChatInputBar } from "@/components/ChatInputBar";
import { WhaleDeco } from "@/components/WhaleDeco";
import {
  NoticeBanner,
  SelectModeBar,
  WhaleChatBubble,
  WhaleEmptyCard,
  WhaleQuickPill,
  WhaleTypingBubble,
} from "@/components/assistant/AssistantChatWidgets";
import { AssistantHeader } from "@/components/assistant/AssistantHeader";
import {
  AssistantCompanionPopover,
  AssistantOverlays,
} from "@/components/assistant/AssistantOverlays";
import {
  AVATAR_TAPS,
  POPOVER_SPRING,
  WHALE_QUICK_ITEMS,
  assistantStyles as styles,
  messageKey,
} from "@/components/assistant/assistantStyles";
import { useAssistantChat } from "@/components/assistant/useAssistantChat";
import { resolveGlassOpticalProfile } from "@/constants/glassThemes";
import { useAnimationActive } from "@/hooks/useAnimationActive";
import { buildDesktopPetPayload } from "@/hooks/useDesktopPetSync";
import {
  desktopPetAvailable,
  getDesktopPetStatus,
  requestDesktopPetPermission,
  startDesktopPet,
} from "@/services/desktopPet";
import { playSfx } from "@/services/soundEffects";
import { useDesktopPet } from "@/store/useDesktopPet";
import { useSettings } from "@/store/useSettings";
import { useWhaleMemory } from "@/store/useWhaleMemory";
import { useWhalePersona } from "@/store/useWhalePersona";
import { useWhalePet } from "@/store/useWhalePet";
import type { ChatMessage } from "@/types";
import { successHaptic, tapHaptic } from "@/utils/haptics";
import { pickPersonaLine } from "@/utils/whaleBehavior";
import { describeWhaleEmotion, resolveBondStage } from "@/utils/whaleEmotion";
import { getWhaleAgentConfig, renderPersonaText } from "@/utils/whalePersona";

/* -------------------------------------------------------------------------- */
/*  主页面：AssistantScreen                                                    */
/* -------------------------------------------------------------------------- */

export function AssistantScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== "light";
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const animationActive = useAnimationActive();

  const backgroundTint = useSettings((s) => s.backgroundTint);
  const hasWallpaper = useSettings((s) => !!s.backgroundImage);

  const emotion = useWhaleMemory((s) => s.emotion);
  const bond = useWhaleMemory((s) => s.bond);
  const factsCount = useWhaleMemory((s) => s.facts.length);
  const applyMood = useWhaleMemory((s) => s.applyMood);
  const bumpBond = useWhaleMemory((s) => s.bumpBond);
  const persona = useWhalePersona((s) => s.persona);
  const updateWhaleAgent = useWhalePersona((s) => s.updateAgent);
  const whaleAgent = useMemo(() => getWhaleAgentConfig(persona), [persona]);
  const personaName = persona.name;

  const petVisible = useWhalePet((s) => s.visible);
  const petCare = useWhalePet((s) => s.care);
  const showPet = useWhalePet((s) => s.show);
  const hidePet = useWhalePet((s) => s.hide);
  const feedPet = useWhalePet((s) => s.feed);
  const patPet = useWhalePet((s) => s.pat);

  const autoFollow = useDesktopPet((s) => s.autoFollowBackground);
  const desktopPermission = useDesktopPet((s) => s.permission);
  const setAutoFollow = useDesktopPet((s) => s.setAutoFollowBackground);
  const setOverlayMode = useDesktopPet((s) => s.setOverlayMode);
  const refreshDesktop = useDesktopPet((s) => s.refresh);

  const emotionDesc = useMemo(() => describeWhaleEmotion(emotion), [emotion]);
  const bondStage = useMemo(
    () => resolveBondStage(bond, petCare.bond, factsCount),
    [bond, petCare.bond, factsCount],
  );
  const glassProfile = useMemo(
    () => resolveGlassOpticalProfile(backgroundTint, isDark, hasWallpaper),
    [backgroundTint, isDark, hasWallpaper],
  );

  /* ---- 右上角大肥鱼互动浮层状态与弹簧动画 ---- */
  const mountedRef = useRef(true);
  const [popoverMounted, setPopoverMounted] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverReaction, setPopoverReaction] = useState<string | null>(null);
  const taps = useRef({ count: 0, at: 0 });
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const popoverProgress = useSharedValue(0);
  const popoverAvatarBounce = useSharedValue(1);
  // 首帧进场与径向扩散波纹期间保持极轻骨架，等扩散波纹完全落幕后再无感点亮次要装饰与呼吸光环
  const [mountSettled, setMountSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (cancelled) return;
      timer = setTimeout(() => {
        if (!cancelled) {
          startTransition(() => setMountSettled(true));
        }
      }, 460);
    });
    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 离开页面时自动收起浮层并清理定时器
  useFocusEffect(
    useCallback(
      () => () => {
        if (popoverCloseTimer.current) {
          clearTimeout(popoverCloseTimer.current);
          popoverCloseTimer.current = null;
        }
        cancelAnimation(popoverProgress);
        popoverProgress.set(0);
        setPopoverOpen(false);
        setPopoverMounted(false);
      },
      [popoverProgress],
    ),
  );

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
      if (popoverCloseTimer.current) clearTimeout(popoverCloseTimer.current);
      cancelAnimation(popoverProgress);
      cancelAnimation(popoverAvatarBounce);
    },
    [popoverProgress, popoverAvatarBounce],
  );

  const finishClosePopover = useCallback(() => {
    if (!mountedRef.current) return;
    setPopoverMounted(false);
  }, []);

  const openCompanionPopover = useCallback(() => {
    if (popoverCloseTimer.current) {
      clearTimeout(popoverCloseTimer.current);
      popoverCloseTimer.current = null;
    }
    Keyboard.dismiss();
    tapHaptic();
    setPopoverMounted(true);
    setPopoverOpen(true);
    cancelAnimation(popoverProgress);
    if (reducedMotion) {
      popoverProgress.set(1);
    } else {
      popoverProgress.set(withSpring(1, POPOVER_SPRING));
    }
  }, [popoverProgress, reducedMotion]);

  const closeCompanionPopover = useCallback(() => {
    if (popoverCloseTimer.current) {
      clearTimeout(popoverCloseTimer.current);
      popoverCloseTimer.current = null;
    }
    if (!popoverOpen && !popoverMounted) return;
    setPopoverOpen(false);
    cancelAnimation(popoverProgress);
    if (reducedMotion) {
      popoverProgress.set(0);
      setPopoverMounted(false);
    } else {
      popoverProgress.set(
        withTiming(
          0,
          { duration: 160, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(finishClosePopover)();
          },
        ),
      );
    }
  }, [popoverOpen, popoverMounted, popoverProgress, reducedMotion, finishClosePopover]);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const followLatest = useRef(true);

  const chat = useAssistantChat({
    onBeforeSend: () => {
      if (popoverOpen) closeCompanionPopover();
    },
    onBeforeLeave: closeCompanionPopover,
    onAfterLeave: () => {
      setPopoverReaction(null);
      taps.current.count = 0;
    },
    onFollowLatest: () => {
      followLatest.current = true;
    },
    onScrollToLatest: () => {
      if (followLatest.current) {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    },
  });

  /** 浮层内短反应气泡文字 */
  const flashPopoverReaction = useCallback((text: string, duration = 3600) => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setPopoverReaction(text);
    reactionTimer.current = setTimeout(() => {
      if (mountedRef.current) setPopoverReaction(null);
      reactionTimer.current = null;
    }, duration);
  }, []);

  const triggerPortraitBounce = useCallback(() => {
    if (reducedMotion) return;
    popoverAvatarBounce.set(
      withSequence(
        withTiming(0.88, { duration: 75, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 10, stiffness: 260, mass: 0.65 }),
      ),
    );
  }, [popoverAvatarBounce, reducedMotion]);

  /** 点击右上角大肥鱼头像：立即优雅展开 / 收起玻璃态伴侣互动卡片 */
  const onTopRightAvatarPress = useCallback(() => {
    if (!chat.whale) return;
    if (popoverOpen) {
      closeCompanionPopover();
    } else {
      openCompanionPopover();
    }
  }, [chat.whale, popoverOpen, closeCompanionPopover, openCompanionPopover]);

  /** 在浮层内戳一戳大肥鱼头像：保留俏皮递进台词反馈 */
  const onPokeInPopover = useCallback(() => {
    const now = Date.now();
    if (now - taps.current.at > 4500) taps.current.count = 0;
    taps.current.count += 1;
    taps.current.at = now;
    const idx = Math.min(taps.current.count - 1, AVATAR_TAPS.length - 1);
    tapHaptic();
    triggerPortraitBounce();
    if (idx >= 2) {
      playSfx("whale_cute_tsun", {
        volume: 0.64,
        rate: 1 + idx * 0.03,
      });
    }
    flashPopoverReaction(
      renderPersonaText(AVATAR_TAPS[idx], useWhalePersona.getState().persona),
    );
    if (idx === AVATAR_TAPS.length - 1) {
      taps.current.count = 0;
    }
  }, [flashPopoverReaction, triggerPortraitBounce]);

  /** 浮层内：一键召唤或收回桌宠（平滑状态反馈，彻底消除割裂弹窗） */
  const handleTogglePetFromPopover = useCallback(() => {
    triggerPortraitBounce();
    if (petVisible) {
      tapHaptic();
      playSfx("whale_pet_dismiss", { volume: 0.64 });
      hidePet();
      flashPopoverReaction(
        renderPersonaText(
          "（轻轻摆尾游回水里）那我先在聊天窗里等你，{{user}}想我就再叫我出来～",
          useWhalePersona.getState().persona,
        ),
        2800,
      );
      return;
    }
    successHaptic();
    // 桌宠登场音效统一由 WhalePetStage 挂载单点触发，避免双倍重叠发声
    showPet();
    applyMood({ pleasure: 8, arousal: 8, reason: "被叫到屏幕边陪着啦" });
    bumpBond("interaction");
    flashPopoverReaction(
      renderPersonaText(
        "来啦来啦！我这就游到屏幕边陪{{user}}，拖我或戳我都行哦～",
        useWhalePersona.getState().persona,
      ),
      2600,
    );
    if (popoverCloseTimer.current) clearTimeout(popoverCloseTimer.current);
    popoverCloseTimer.current = setTimeout(() => {
      popoverCloseTimer.current = null;
      if (mountedRef.current) closeCompanionPopover();
    }, 560);
  }, [
    petVisible,
    hidePet,
    showPet,
    applyMood,
    bumpBond,
    flashPopoverReaction,
    triggerPortraitBounce,
    closeCompanionPopover,
  ]);

  /** 浮层内：摸摸头快捷互动 */
  const handlePatFromPopover = useCallback(() => {
    tapHaptic();
    triggerPortraitBounce();
    patPet();
    applyMood({ pleasure: 10, arousal: 3, reason: "被温柔摸了摸头" });
    bumpBond("interaction");
    const line = pickPersonaLine(
      "headpat",
      useWhalePersona.getState().persona,
      useWhaleMemory.getState().emotion,
    );
    flashPopoverReaction(renderPersonaText(line, useWhalePersona.getState().persona));
  }, [patPet, applyMood, bumpBond, flashPopoverReaction, triggerPortraitBounce]);

  /** 浮层内：喂白饭快捷互动 */
  const handleFeedFromPopover = useCallback(() => {
    successHaptic();
    triggerPortraitBounce();
    playSfx("whale_cute_happy", {
      volume: 0.74,
      rate: 1.05,
    });
    feedPet();
    applyMood({ pleasure: 10, arousal: 5, reason: "吃到了香香的白米饭" });
    bumpBond("interaction");
    flashPopoverReaction(
      renderPersonaText(
        "白饭团子！嗷呜——香喷喷的，谢谢{{user}}投喂～",
        useWhalePersona.getState().persona,
      ),
    );
  }, [feedPet, applyMood, bumpBond, flashPopoverReaction, triggerPortraitBounce]);

  /** 浮层内：Android 一键切换切后台自动驻留手机桌面 */
  const handleDesktopFollowFromPopover = useCallback(async () => {
    if (!desktopPetAvailable) return;
    tapHaptic();
    const status = await getDesktopPetStatus().catch(() => null);
    if (!status?.permission) {
      await requestDesktopPetPermission().catch(() => {});
      flashPopoverReaction("请先开启「显示在其他应用上层」，回来就能自动跟去手机桌面啦～");
      return;
    }
    const next = !autoFollow;
    setAutoFollow(next);
    if (next) {
      setOverlayMode("auto");
      await startDesktopPet(buildDesktopPetPayload(reducedMotion, true)).catch(() => {});
      await refreshDesktop().catch(() => {});
      flashPopoverReaction("好耶！切回手机桌面时我也会悄悄跟出来陪你啦～");
    } else {
      flashPopoverReaction("已关闭后台自动驻留桌面，只在应用内陪着你。");
    }
  }, [autoFollow, setAutoFollow, setOverlayMode, reducedMotion, refreshDesktop, flashPopoverReaction]);

  const popoverWidth = Math.min(width - 28, 330);
  const defaultPopoverLine = useMemo(() => {
    if (emotion.reason) {
      return renderPersonaText(
        `刚刚${emotion.reason}，现在感觉${emotionDesc.label}～`,
        persona,
      );
    }
    if (petVisible) {
      return renderPersonaText(
        "我正挂在屏幕边陪着{{user}}呢，随时可以戳我或收回水里哦～",
        persona,
      );
    }
    return renderPersonaText(
      "{{user}}点开我看啦～想摸摸头、投喂白饭，还是叫我出来当桌宠呀？",
      persona,
    );
  }, [emotion.reason, emotionDesc.label, petVisible, persona]);

  const hasFullscreenOverlay =
    chat.summonFx || chat.leaveFx || Boolean(chat.scheduleChange) || Boolean(chat.preview);

  return (
    <View className="flex-1">
      <Backdrop>
        {/* 仅在页面稳定后的人格切换时执行交叉淡入淡出，避免首次进场叠加整页 saveLayerAlpha 与扩散动画抢帧 */}
        <Animated.View
          key={chat.whale ? "whale" : "normal"}
          entering={mountSettled && !reducedMotion ? FadeIn.duration(260) : undefined}
          exiting={mountSettled && !reducedMotion ? FadeOut.duration(220) : undefined}
          className="flex-1"
          style={{ paddingBottom: chat.kbHeight }}
        >
          {/* 悬浮液态玻璃顶栏 */}
          <AssistantHeader
            isDark={isDark}
            whale={chat.whale}
            personaName={personaName}
            userName={persona.userName}
            emotionLabel={emotionDesc.label}
            emotionColor={emotionDesc.color}
            bondLevel={bondStage.level}
            bondTitle={bondStage.title}
            voiceOn={chat.voiceOn}
            petVisible={petVisible}
            popoverOpen={popoverOpen}
            voiceScreenFocused={chat.voiceScreenFocused}
            animationActive={animationActive}
            mountSettled={mountSettled}
            reducedMotion={Boolean(reducedMotion)}
            onToggleVoice={chat.toggleVoice}
            onOpenSettings={() => {
              if (popoverOpen) closeCompanionPopover();
              router.push("/whale-settings");
            }}
            onAvatarPress={onTopRightAvatarPress}
          />

          {/* 消息区：鲸鱼模式下在扩散动画落幕后再挂载柔光漂浮贴图，保证进场 120fps 零卡顿 */}
          <View className="flex-1">
            {chat.whale && mountSettled ? <WhaleDeco active /> : null}

            {chat.selectMode ? (
              <SelectModeBar
                selectedCount={chat.selectedIds.length}
                isDark={isDark}
                onDelete={chat.deleteSelected}
                onCancel={chat.exitSelect}
              />
            ) : null}

            {chat.displayMessages.length === 0 ? (
              <ScrollView
                className="flex-1"
                style={styles.listContainer}
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: chat.kbHeight > 0 ? "flex-start" : "center",
                  paddingTop: 10,
                  paddingBottom: 18,
                }}
                overScrollMode="never"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {!chat.whale ? (
                  <AssistantEmptyState
                    isDark={isDark}
                    compact={chat.kbHeight > 0}
                    reducedMotion={Boolean(reducedMotion)}
                    onPick={(text) => void chat.send(text)}
                  />
                ) : (
                  <WhaleEmptyCard
                    isDark={isDark}
                    reducedMotion={Boolean(reducedMotion)}
                    persona={persona}
                    emotionLabel={emotionDesc.label}
                    emotionColor={emotionDesc.color}
                    bondLevel={bondStage.level}
                    bondTitle={bondStage.title}
                    onPickPrompt={(prompt) => void chat.send(prompt)}
                  />
                )}

                {chat.busy ? (
                  <View style={{ marginTop: 12 }}>
                    <WhaleTypingBubble
                      whale={chat.whale}
                      personaName={personaName}
                      isDark={isDark}
                      statusText={chat.busyStatus}
                    />
                  </View>
                ) : null}
                {chat.notice ? (
                  <NoticeBanner
                    notice={chat.notice}
                    isDark={isDark}
                    style={{ marginTop: 10 }}
                  />
                ) : null}
              </ScrollView>
            ) : (
              <FlatList
                ref={listRef}
                data={chat.displayMessages}
                inverted
                keyExtractor={messageKey}
                className="flex-1"
                style={styles.listContainer}
                contentContainerStyle={styles.listContent}
                initialNumToRender={5}
                maxToRenderPerBatch={4}
                windowSize={5}
                removeClippedSubviews={false}
                overScrollMode="never"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                onScroll={(event) => {
                  followLatest.current = event.nativeEvent.contentOffset.y < 100;
                }}
                scrollEventThrottle={100}
                onContentSizeChange={() => {
                  if (followLatest.current) {
                    listRef.current?.scrollToOffset({ offset: 0, animated: false });
                  }
                }}
                renderItem={({ item }) => (
                  <View style={styles.messageGap}>
                    {chat.whale ? (
                      <WhaleChatBubble
                        message={item}
                        isDark={isDark}
                        selectMode={chat.selectMode}
                        checked={chat.selectedIds.includes(item.id)}
                        onSelect={chat.onSelectMessage}
                        onPreview={chat.setPreview}
                        onApply={chat.applyActions}
                      />
                    ) : (
                      <AssistantMessage
                        message={item}
                        whale={false}
                        selectMode={chat.selectMode}
                        checked={chat.selectedIds.includes(item.id)}
                        onSelect={chat.onSelectMessage}
                        onPreview={chat.setPreview}
                        onApply={chat.applyActions}
                      />
                    )}
                  </View>
                )}
                ListHeaderComponent={
                  <View>
                    {chat.busy ? (
                      <WhaleTypingBubble
                        whale={chat.whale}
                        personaName={personaName}
                        isDark={isDark}
                        statusText={chat.busyStatus}
                      />
                    ) : null}
                    {chat.notice ? (
                      <NoticeBanner
                        notice={chat.notice}
                        isDark={isDark}
                        style={{ marginTop: 8, marginBottom: 4 }}
                      />
                    ) : null}
                  </View>
                }
              />
            )}
          </View>

          {/* 用户专属：大肥鱼图标化液态玻璃快捷胶囊条 */}
          {chat.whale ? (
            <View style={styles.quickStripWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickStripContent}
              >
                {WHALE_QUICK_ITEMS.map((item) => (
                  <WhaleQuickPill
                    key={item.label}
                    item={item}
                    isDark={isDark}
                    disabled={chat.busy}
                    onPress={() => void chat.send(item.prompt)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* 液态玻璃浮动输入胶囊 */}
          <ChatInputBar
            value={chat.input}
            onChangeText={chat.setInput}
            onSend={() => void chat.send(chat.input)}
            busy={chat.busy}
            onStop={chat.stopRequest}
            whaleTheme={chat.whale}
            placeholder={
              chat.whale
                ? renderPersonaText("跟{{char}}说点什么吧，{{user}}…", persona)
                : undefined
            }
            bottomInset={chat.kbHeight > 0 ? 10 : undefined}
          />
        </Animated.View>

        {/* 右上角大肥鱼灵动玻璃态互动浮层（仅在展开时挂载，位于 Backdrop 内享原生液态玻璃折射） */}
        {chat.whale && popoverMounted ? (
          <AssistantCompanionPopover
            isDark={isDark}
            popoverWidth={popoverWidth}
            popoverProgress={popoverProgress}
            popoverAvatarBounce={popoverAvatarBounce}
            glassProfile={glassProfile}
            personaName={personaName}
            emotionLabel={emotionDesc.label}
            emotionColor={emotionDesc.color}
            bondLevel={bondStage.level}
            bondTitle={bondStage.title}
            daysActive={bond.daysActive}
            popoverLine={popoverReaction ?? defaultPopoverLine}
            popoverLineKey={popoverReaction ?? "default-line"}
            petCare={petCare}
            petVisible={petVisible}
            autoFollow={autoFollow}
            desktopPermission={desktopPermission}
            whaleAgent={whaleAgent}
            onUpdateWhaleAgent={updateWhaleAgent}
            onClose={closeCompanionPopover}
            onPoke={onPokeInPopover}
            onTogglePet={handleTogglePetFromPopover}
            onToggleDesktopFollow={() => void handleDesktopFollowFromPopover()}
            onPat={handlePatFromPopover}
            onFeed={handleFeedFromPopover}
          />
        ) : null}
      </Backdrop>

      {/* 全屏动效、课表变更确认弹窗与图片预览（仅在有任一弹层打开时挂载） */}
      {hasFullscreenOverlay ? (
        <AssistantOverlays
          summonFx={chat.summonFx}
          onSummonDone={() => chat.setSummonFx(false)}
          leaveFx={chat.leaveFx}
          onLeaveDone={chat.finishLeaveWhale}
          scheduleChange={chat.scheduleChange}
          onCloseScheduleChange={chat.closeScheduleChange}
          onAppliedScheduleChange={chat.markScheduleChangeApplied}
          preview={chat.preview}
          onClosePreview={() => chat.setPreview(null)}
        />
      ) : null}
    </View>
  );
}
