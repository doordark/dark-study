import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import {
  NIGHT_CONSTELLATIONS,
  SECRET_BADGES,
  type ConstellationDef,
  type NightSkyChronicle,
  type NightSkyWish,
  type SecretBadgeId,
} from "@/utils/nightSkyData";

/* -------------------------------------------------------------------------- */
/*  模块级预计算微缩星图几何：零位图、零重复字符串拼接                         */
/* -------------------------------------------------------------------------- */

interface MiniStarPoint {
  cx: number;
  cy: number;
  r: number;
}

interface MiniConstellationGeometry {
  edgesPath: string;
  points: readonly MiniStarPoint[];
}

function buildMiniGeometry(c: ConstellationDef): MiniConstellationGeometry {
  const points = c.spots.map((s) => ({
    cx: Math.round((10 + s.x * 80) * 10) / 10,
    cy: Math.round((8 + s.y * 56) * 10) / 10,
    r: s.s >= 27 ? 2.4 : s.s >= 25 ? 2 : 1.7,
  }));
  const segments: string[] = [];
  for (const [from, to] of c.edges) {
    const a = points[from];
    const b = points[to];
    if (a && b) {
      segments.push(`M${a.cx} ${a.cy}L${b.cx} ${b.cy}`);
    }
  }
  return {
    edgesPath: segments.join(" "),
    points,
  };
}

const MINI_GEOMETRY_MAP: ReadonlyMap<string, MiniConstellationGeometry> = new Map(
  NIGHT_CONSTELLATIONS.map((c) => [c.id, buildMiniGeometry(c)]),
);

/* -------------------------------------------------------------------------- */
/*  StarAtlasModal：夜航星图录（不可见时直接返回 null 零挂载）                 */
/* -------------------------------------------------------------------------- */

interface StarAtlasModalProps {
  visible: boolean;
  chronicle: NightSkyChronicle;
  activeConstellationId: string;
  wishCount: number;
  onSelectConstellation: (index: number) => void;
  onClose: () => void;
}

const ConstellationCard = memo(function ConstellationCard({
  constellation,
  index,
  lit,
  active,
  onPick,
}: {
  constellation: ConstellationDef;
  index: number;
  lit: boolean;
  active: boolean;
  onPick: (index: number) => void;
}) {
  const geometry = MINI_GEOMETRY_MAP.get(constellation.id);
  const edgeStroke = lit
    ? "rgba(253,230,138,0.68)"
    : active
      ? "rgba(125,211,252,0.5)"
      : "rgba(148,163,184,0.28)";
  const starFill = lit
    ? "#FEF08A"
    : active
      ? "#BAE6FD"
      : "rgba(186,211,255,0.46)";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`切换星象至${constellation.name}，${lit ? "已点亮" : "未点亮"}`}
      onPress={() => onPick(index)}
      style={({ pressed }) => [
        styles.constellationCard,
        lit ? styles.constellationCardLit : null,
        active ? styles.constellationCardActive : null,
        pressed ? styles.constellationCardPressed : null,
      ]}
    >
      <View style={styles.cardBadgeRow}>
        <View
          style={[
            styles.litBadge,
            lit ? styles.litBadgeUnlocked : styles.litBadgeLocked,
          ]}
        >
          <Text
            style={[
              styles.litBadgeText,
              lit ? styles.litBadgeTextUnlocked : styles.litBadgeTextLocked,
            ]}
          >
            {lit ? "✦ 已点亮" : "未点亮"}
          </Text>
        </View>
        {active ? (
          <View style={styles.activePill}>
            <Text style={styles.activePillText}>当前</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.svgBox} pointerEvents="none">
        {geometry ? (
          <Svg width="100%" height={72} viewBox="0 0 100 72">
            <Path
              d={geometry.edgesPath}
              stroke={edgeStroke}
              strokeWidth={lit ? 1.25 : 0.95}
              strokeDasharray={lit ? undefined : "2.5 3"}
              strokeLinecap="round"
              fill="none"
            />
            {geometry.points.map((pt, idx) => (
              <Circle
                key={idx}
                cx={pt.cx}
                cy={pt.cy}
                r={lit ? pt.r * 2.1 : pt.r * 1.45}
                fill={lit ? "rgba(253,230,138,0.18)" : "rgba(125,211,252,0.1)"}
              />
            ))}
            {geometry.points.map((pt, idx) => (
              <Circle
                key={`core-${idx}`}
                cx={pt.cx}
                cy={pt.cy}
                r={pt.r}
                fill={starFill}
              />
            ))}
          </Svg>
        ) : null}
      </View>

      <Text
        numberOfLines={1}
        style={[
          styles.constellationName,
          lit || active ? styles.constellationNameBright : null,
        ]}
      >
        {constellation.name}
      </Text>
      <Text numberOfLines={1} style={styles.constellationSubtitle}>
        {constellation.subtitle}
      </Text>
    </Pressable>
  );
});

const StarAtlasModalBody = memo(function StarAtlasModalBody({
  chronicle,
  activeConstellationId,
  wishCount,
  onSelectConstellation,
  onClose,
}: Omit<StarAtlasModalProps, "visible">) {
  const unlockedConstellations = useMemo(
    () => new Set(chronicle.unlockedConstellations ?? []),
    [chronicle.unlockedConstellations],
  );
  const unlockedBadges = useMemo(
    () => new Set(chronicle.secretBadges ?? []),
    [chronicle.secretBadges],
  );
  const badgeEntries = useMemo(
    () =>
      Object.entries(SECRET_BADGES) as [
        SecretBadgeId,
        { label: string; hint: string },
      ][],
    [],
  );

  const handlePick = useCallback(
    (index: number) => {
      onSelectConstellation(index);
      onClose();
    },
    [onClose, onSelectConstellation],
  );

  const unlockedCount = unlockedConstellations.size;

  return (
    <Modal
      transparent
      animationType="fade"
      statusBarTranslucent
      visible
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable
          accessibilityLabel="关闭夜航星图录"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.atlasCard}>
          <View style={styles.modalHeader}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.eyebrow}>STAR ATLAS</Text>
              <Text style={styles.modalTitle}>
                {`夜航星图录 · ${unlockedCount}/${NIGHT_CONSTELLATIONS.length}`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭星图录"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : null,
              ]}
            >
              <Ionicons name="close" size={16} color="#CBD5E1" />
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{chronicle.visits}</Text>
              <Text style={styles.statLabel}>夜航次数</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{chronicle.totalStarsCollected}</Text>
              <Text style={styles.statLabel}>总拾星</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{wishCount}</Text>
              <Text style={styles.statLabel}>已藏星愿</Text>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.atlasScrollContent}
          >
            <View style={styles.grid}>
              {NIGHT_CONSTELLATIONS.map((constellation, index) => (
                <ConstellationCard
                  key={constellation.id}
                  constellation={constellation}
                  index={index}
                  lit={unlockedConstellations.has(constellation.id)}
                  active={constellation.id === activeConstellationId}
                  onPick={handlePick}
                />
              ))}
            </View>

            <View style={styles.badgesSection}>
              <View style={styles.badgesHeader}>
                <Text style={styles.sectionLabel}>隐秘星徽</Text>
                <Text style={styles.sectionCount}>
                  {`${unlockedBadges.size}/${badgeEntries.length}`}
                </Text>
              </View>
              <View style={styles.badgesWrap}>
                {badgeEntries.map(([badgeId, meta]) => {
                  const unlocked = unlockedBadges.has(badgeId);
                  return (
                    <View
                      key={badgeId}
                      style={[
                        styles.badgeChip,
                        unlocked ? styles.badgeChipUnlocked : styles.badgeChipLocked,
                      ]}
                    >
                      <View style={styles.badgeTopRow}>
                        <Ionicons
                          name={unlocked ? "sparkles" : "lock-closed-outline"}
                          size={11}
                          color={unlocked ? "#FDE68A" : "rgba(148,163,184,0.65)"}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.badgeTitle,
                            unlocked
                              ? styles.badgeTitleUnlocked
                              : styles.badgeTitleLocked,
                          ]}
                        >
                          {unlocked ? meta.label : "未知星徽"}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={styles.badgeHint}>
                        {meta.hint}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

export const StarAtlasModal = memo(function StarAtlasModal(
  props: StarAtlasModalProps,
) {
  if (!props.visible) return null;
  return (
    <StarAtlasModalBody
      chronicle={props.chronicle}
      activeConstellationId={props.activeConstellationId}
      wishCount={props.wishCount}
      onSelectConstellation={props.onSelectConstellation}
      onClose={props.onClose}
    />
  );
});

/* -------------------------------------------------------------------------- */
/*  WishComposerModal：星愿胶囊（不可见时直接返回 null 零挂载）                */
/* -------------------------------------------------------------------------- */

interface WishComposerModalProps {
  visible: boolean;
  wishes: readonly NightSkyWish[];
  constellationName: string;
  onSendWish: (text: string) => void;
  onQuickMeteor: () => void;
  onClose: () => void;
}

const WishComposerModalBody = memo(function WishComposerModalBody({
  wishes,
  constellationName,
  onSendWish,
  onQuickMeteor,
  onClose,
}: Omit<WishComposerModalProps, "visible">) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();

  const recentWishes = useMemo(
    () =>
      [...wishes]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6),
    [wishes],
  );

  const handleSend = useCallback(() => {
    if (!trimmed) return;
    onSendWish(trimmed);
    setDraft("");
  }, [onSendWish, trimmed]);

  return (
    <Modal
      transparent
      animationType="fade"
      statusBarTranslucent
      visible
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalBackdrop}
      >
        <Pressable
          accessibilityLabel="关闭星愿胶囊"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.wishCard}>
          <View style={styles.modalHeader}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.eyebrow}>
                {`WISH CAPSULE · ${constellationName}`}
              </Text>
              <Text style={styles.modalTitle}>把心愿封进星光</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭星愿弹窗"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : null,
              ]}
            >
              <Ionicons name="close" size={16} color="#CBD5E1" />
            </Pressable>
          </View>

          <Text style={styles.wishSubcopy}>
            写下一句短愿寄给今夜星河，未来的某次夜航它会化作回响飘过。
          </Text>

          <View style={styles.inputWrap}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              maxLength={36}
              placeholder="写下今晚的小小心愿（最多 36 字）…"
              placeholderTextColor="rgba(148,163,184,0.52)"
              selectionColor="#FDE68A"
              returnKeyType="send"
              onSubmitEditing={handleSend}
              style={styles.textInput}
            />
            <Text style={styles.charCount}>{`${draft.length}/36`}</Text>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="放飞星愿"
              accessibilityState={{ disabled: !trimmed }}
              disabled={!trimmed}
              onPress={handleSend}
              style={({ pressed }) => [
                styles.primaryButton,
                !trimmed ? styles.primaryButtonDisabled : null,
                pressed && trimmed ? styles.primaryButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  !trimmed ? styles.primaryButtonTextDisabled : null,
                ]}
              >
                放飞星愿 ✦
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="不写字直接召唤一颗许愿流星"
              onPress={onQuickMeteor}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.secondaryButtonPressed : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>直接召唤一颗流星</Text>
            </Pressable>
          </View>

          <View style={styles.recentSection}>
            <View style={styles.badgesHeader}>
              <Text style={styles.sectionLabel}>近期星愿</Text>
              <Text style={styles.sectionCount}>
                {wishes.length > 0 ? `共 ${wishes.length} 枚` : "星匣暂空"}
              </Text>
            </View>
            {recentWishes.length > 0 ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.recentScroll}
                contentContainerStyle={styles.recentList}
              >
                {recentWishes.map((wish) => (
                  <View key={wish.id} style={styles.wishItem}>
                    <Text numberOfLines={1} style={styles.wishItemText}>
                      {`✦ ${wish.text}`}
                    </Text>
                    <Text numberOfLines={1} style={styles.wishItemMeta}>
                      {wish.echoedAt
                        ? `${wish.constellationName} · 已回响`
                        : wish.constellationName}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.emptyWishHint}>
                还没有藏下星愿，放飞第一颗属于今晚的流星吧。
              </Text>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

export const WishComposerModal = memo(function WishComposerModal(
  props: WishComposerModalProps,
) {
  if (!props.visible) return null;
  return (
    <WishComposerModalBody
      wishes={props.wishes}
      constellationName={props.constellationName}
      onSendWish={props.onSendWish}
      onQuickMeteor={props.onQuickMeteor}
      onClose={props.onClose}
    />
  );
});

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(3,7,20,0.8)",
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  atlasCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "86%",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(186,211,255,0.22)",
    backgroundColor: "rgba(10,16,35,0.96)",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  wishCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(253,230,138,0.26)",
    backgroundColor: "rgba(10,16,35,0.97)",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerTextWrap: {
    flex: 1,
  },
  eyebrow: {
    color: "rgba(125,211,252,0.84)",
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 3,
  },
  modalTitle: {
    color: "#F1F5F9",
    fontSize: 16.5,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 0.4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(186,211,255,0.2)",
    backgroundColor: "rgba(186,211,255,0.08)",
  },
  closeButtonPressed: {
    backgroundColor: "rgba(186,211,255,0.2)",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  statPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(186,211,255,0.14)",
    backgroundColor: "rgba(148,163,184,0.07)",
  },
  statValue: {
    color: "#FDE68A",
    fontSize: 15,
    fontWeight: "700",
  },
  statLabel: {
    color: "rgba(203,213,225,0.68)",
    fontSize: 10,
    marginTop: 2,
  },
  atlasScrollContent: {
    paddingBottom: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  constellationCard: {
    width: "48.4%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(186,211,255,0.15)",
    backgroundColor: "rgba(15,23,48,0.72)",
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 10,
  },
  constellationCardLit: {
    borderColor: "rgba(253,230,138,0.28)",
    backgroundColor: "rgba(22,31,58,0.82)",
  },
  constellationCardActive: {
    borderColor: "rgba(125,211,252,0.56)",
    backgroundColor: "rgba(21,36,68,0.9)",
  },
  constellationCardPressed: {
    opacity: 0.85,
  },
  cardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  litBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  litBadgeUnlocked: {
    borderColor: "rgba(253,230,138,0.38)",
    backgroundColor: "rgba(253,230,138,0.12)",
  },
  litBadgeLocked: {
    borderColor: "rgba(148,163,184,0.22)",
    backgroundColor: "rgba(148,163,184,0.08)",
  },
  litBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  litBadgeTextUnlocked: {
    color: "#FDE68A",
  },
  litBadgeTextLocked: {
    color: "rgba(148,163,184,0.78)",
  },
  activePill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(125,211,252,0.16)",
  },
  activePillText: {
    color: "#BAE6FD",
    fontSize: 9,
    fontWeight: "700",
  },
  svgBox: {
    marginTop: 4,
    marginBottom: 2,
    height: 72,
    justifyContent: "center",
  },
  constellationName: {
    color: "rgba(226,232,240,0.76)",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  constellationNameBright: {
    color: "#F8FAFC",
  },
  constellationSubtitle: {
    color: "rgba(148,163,184,0.76)",
    fontSize: 10.5,
    marginTop: 2,
  },
  badgesSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(186,211,255,0.12)",
  },
  badgesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionLabel: {
    color: "rgba(186,211,255,0.82)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  sectionCount: {
    color: "rgba(148,163,184,0.72)",
    fontSize: 10.5,
  },
  badgesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  badgeChip: {
    width: "48.4%",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  badgeChipUnlocked: {
    borderColor: "rgba(253,230,138,0.34)",
    backgroundColor: "rgba(253,230,138,0.1)",
  },
  badgeChipLocked: {
    borderColor: "rgba(148,163,184,0.16)",
    backgroundColor: "rgba(15,23,42,0.56)",
  },
  badgeTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  badgeTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  badgeTitleUnlocked: {
    color: "#FEF08A",
  },
  badgeTitleLocked: {
    color: "rgba(148,163,184,0.75)",
  },
  badgeHint: {
    color: "rgba(148,163,184,0.68)",
    fontSize: 9.5,
    marginTop: 3,
  },
  wishSubcopy: {
    color: "rgba(203,213,225,0.74)",
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 8,
  },
  inputWrap: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(186,211,255,0.22)",
    backgroundColor: "rgba(15,23,48,0.86)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textInput: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 14,
    paddingVertical: 0,
  },
  charCount: {
    color: "rgba(148,163,184,0.68)",
    fontSize: 10.5,
  },
  actionRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(253,230,138,0.44)",
    backgroundColor: "rgba(253,230,138,0.18)",
  },
  primaryButtonPressed: {
    backgroundColor: "rgba(253,230,138,0.28)",
  },
  primaryButtonDisabled: {
    borderColor: "rgba(148,163,184,0.2)",
    backgroundColor: "rgba(148,163,184,0.08)",
  },
  primaryButtonText: {
    color: "#FEF08A",
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  primaryButtonTextDisabled: {
    color: "rgba(148,163,184,0.58)",
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(125,211,252,0.26)",
    backgroundColor: "rgba(125,211,252,0.09)",
  },
  secondaryButtonPressed: {
    backgroundColor: "rgba(125,211,252,0.18)",
  },
  secondaryButtonText: {
    color: "#BAE6FD",
    fontSize: 11.5,
    fontWeight: "600",
  },
  recentSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(186,211,255,0.12)",
  },
  recentScroll: {
    maxHeight: 164,
  },
  recentList: {
    gap: 6,
  },
  wishItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(186,211,255,0.12)",
    backgroundColor: "rgba(15,23,48,0.62)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  wishItemText: {
    flex: 1,
    color: "#E2E8F0",
    fontSize: 11.5,
  },
  wishItemMeta: {
    color: "rgba(253,230,138,0.7)",
    fontSize: 10,
  },
  emptyWishHint: {
    color: "rgba(148,163,184,0.68)",
    fontSize: 11,
    lineHeight: 17,
  },
});
