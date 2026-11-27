import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Rect } from "react-native-svg";

import { GlassContainer } from "@/components/GlassContainer";
import { coursePalette, WEEKDAY_LABELS } from "@/constants/palette";
import { usePeerSchedules } from "@/store/usePeerSchedules";
import type { Schedule } from "@/types";
import {
  selectHaptic,
  successHaptic,
  tapHaptic,
  warnHaptic,
} from "@/utils/haptics";
import { generateQrMatrix, type QrMatrix } from "@/utils/qrMatrix";
import {
  buildCompactQrSummary,
  computeCommonFreeSlots,
  encodeScheduleShareCode,
  slotCellKey,
  type CommonFreeSlotCell,
  type SharedPeerSchedule,
} from "@/utils/scheduleShare";

export interface PeerCompareModalProps {
  visible: boolean;
  onClose: () => void;
  schedule: Schedule;
  currentWeek: number;
  isDark: boolean;
}

type ModalTab = "radar" | "share";

interface QrRunRect {
  key: string;
  x: number;
  y: number;
  w: number;
}

const QR_QUIET_ZONE = 4;
const QR_DISPLAY_SIZE = 204;

function buildQrRunRects(matrix: QrMatrix): QrRunRect[] {
  const rects: QrRunRect[] = [];
  for (let r = 0; r < matrix.size; r++) {
    const row = matrix.modules[r];
    let c = 0;
    while (c < matrix.size) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < matrix.size && row[c]) c++;
      rects.push({
        key: `${r}-${start}`,
        x: QR_QUIET_ZONE + start,
        y: QR_QUIET_ZONE + r,
        w: c - start,
      });
    }
  }
  return rects;
}

function QrCodeSvg({ matrix }: { matrix: QrMatrix }) {
  const viewSize = matrix.size + QR_QUIET_ZONE * 2;
  const rects = useMemo(() => buildQrRunRects(matrix), [matrix]);

  return (
    <View
      style={{
        padding: 12,
        borderRadius: 20,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        width={QR_DISPLAY_SIZE}
        height={QR_DISPLAY_SIZE}
        viewBox={`0 0 ${viewSize} ${viewSize}`}
      >
        <Rect x={0} y={0} width={viewSize} height={viewSize} fill="#FFFFFF" />
        {rects.map((item) => (
          <Rect
            key={item.key}
            x={item.x}
            y={item.y}
            width={item.w + 0.03}
            height={1.04}
            fill="#0F172A"
          />
        ))}
      </Svg>
    </View>
  );
}

export function PeerCompareModal({
  visible,
  onClose,
  schedule,
  currentWeek,
  isDark,
}: PeerCompareModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {visible ? (
        <PeerCompareModalContent
          onClose={onClose}
          schedule={schedule}
          currentWeek={currentWeek}
          isDark={isDark}
        />
      ) : null}
    </Modal>
  );
}

function PeerCompareModalContent({
  onClose,
  schedule,
  currentWeek,
  isDark,
}: Omit<PeerCompareModalProps, "visible">) {
  const totalWeeks = Math.max(1, schedule.totalWeeks || 18);
  const peers = usePeerSchedules((s) => s.peers);
  const importPeerFromCode = usePeerSchedules((s) => s.importPeerFromCode);
  const removePeer = usePeerSchedules((s) => s.removePeer);
  const togglePeerActive = usePeerSchedules((s) => s.togglePeerActive);
  const renamePeer = usePeerSchedules((s) => s.renamePeer);

  const [tab, setTab] = useState<ModalTab>("radar");
  const [selectedWeek, setSelectedWeek] = useState(() =>
    Math.min(totalWeeks, Math.max(1, currentWeek || 1)),
  );
  const [includeWeekend, setIncludeWeekend] = useState(false);
  const [showImportForm, setShowImportForm] = useState(() => peers.length === 0);
  const [codeInput, setCodeInput] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [editingPeerId, setEditingPeerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [myShareNickname, setMyShareNickname] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");

  const radar = useMemo(
    () =>
      computeCommonFreeSlots(schedule, peers, selectedWeek, {
        includeWeekend,
      }),
    [schedule, peers, selectedWeek, includeWeekend],
  );

  const selectedCell: CommonFreeSlotCell | null = useMemo(() => {
    if (selectedCellKey && radar.cellMap[selectedCellKey]) {
      return radar.cellMap[selectedCellKey];
    }
    return null;
  }, [selectedCellKey, radar.cellMap]);

  const fullShareCode = useMemo(
    () => encodeScheduleShareCode(schedule, myShareNickname.trim() || undefined),
    [schedule, myShareNickname],
  );

  const qrPayload = useMemo(
    () =>
      buildCompactQrSummary(
        schedule,
        selectedWeek,
        myShareNickname.trim() || undefined,
      ),
    [schedule, selectedWeek, myShareNickname],
  );

  const qrMatrix = useMemo(() => generateQrMatrix(qrPayload), [qrPayload]);
  const qrIsFullSemester = qrPayload === fullShareCode;

  const activePeers = useMemo(() => peers.filter((p) => p.active), [peers]);
  const hasStartDateMismatch = useMemo(
    () =>
      activePeers.some(
        (p) => p.startDate && schedule.startDate && p.startDate !== schedule.startDate,
      ),
    [activePeers, schedule.startDate],
  );

  // Theme tokens explicitly honoring `isDark`
  const colors = useMemo(
    () =>
      isDark
        ? {
            sheetBg: "rgba(15,23,42,0.96)",
            cardBg: "rgba(30,41,59,0.72)",
            cardBorder: "rgba(255,255,255,0.10)",
            subtleBg: "rgba(15,23,42,0.72)",
            inputBg: "rgba(15,23,42,0.85)",
            textPrimary: "#F8FAFC",
            textSecondary: "#94A3B8",
            textMuted: "#64748B",
            pillBg: "rgba(51,65,85,0.78)",
            emeraldBg: "rgba(16,185,129,0.22)",
            emeraldBorder: "rgba(52,211,153,0.45)",
            emeraldText: "#6EE7B7",
            amberBg: "rgba(245,158,11,0.20)",
            amberBorder: "rgba(251,191,36,0.42)",
            amberText: "#FCD34D",
            roseBg: "rgba(244,63,94,0.20)",
            roseBorder: "rgba(251,113,133,0.38)",
            roseText: "#FDA4AF",
            skyBg: "rgba(56,189,248,0.18)",
            skyText: "#7DD3FC",
          }
        : {
            sheetBg: "rgba(255,255,255,0.98)",
            cardBg: "rgba(248,250,252,0.95)",
            cardBorder: "rgba(148,163,184,0.28)",
            subtleBg: "rgba(241,245,249,0.95)",
            inputBg: "#FFFFFF",
            textPrimary: "#0F172A",
            textSecondary: "#475569",
            textMuted: "#94A3B8",
            pillBg: "#E2E8F0",
            emeraldBg: "rgba(16,185,129,0.14)",
            emeraldBorder: "rgba(16,185,129,0.38)",
            emeraldText: "#047857",
            amberBg: "rgba(245,158,11,0.15)",
            amberBorder: "rgba(217,119,6,0.35)",
            amberText: "#B45309",
            roseBg: "rgba(244,63,94,0.13)",
            roseBorder: "rgba(225,29,72,0.30)",
            roseText: "#BE123C",
            skyBg: "rgba(14,165,233,0.12)",
            skyText: "#0369A1",
          },
    [isDark],
  );

  const handleImport = () => {
    setImportError("");
    setImportSuccess("");
    try {
      const added = importPeerFromCode(codeInput, nicknameInput);
      successHaptic();
      setCodeInput("");
      setNicknameInput("");
      setShowImportForm(false);
      setImportSuccess(
        `已导入「${added.nickname}」的课表（${added.courses.length} 条排课）`,
      );
    } catch (error) {
      warnHaptic();
      setImportError(
        error instanceof Error ? error.message : "口令解析失败，请检查后重试",
      );
    }
  };

  const handleStartRename = (peer: SharedPeerSchedule) => {
    tapHaptic();
    setEditingPeerId(peer.id);
    setEditingName(peer.nickname);
  };

  const handleCommitRename = () => {
    if (editingPeerId && editingName.trim()) {
      selectHaptic();
      renamePeer(editingPeerId, editingName);
    }
    setEditingPeerId(null);
    setEditingName("");
  };

  const handleShareCode = async () => {
    tapHaptic();
    setShareFeedback("");
    const nickLabel = myShareNickname.trim()
      ? `${myShareNickname.trim()}的`
      : "我的";
    const message = `这是${nickLabel} Dark Study 课表（${schedule.name}），复制整段到 Dark Study「空课对比」粘贴即可对比共同空课：\n${fullShareCode}`;
    try {
      await Share.share({
        title: `${schedule.name} 课表口令`,
        message,
      });
      setShareFeedback("已调起系统分享面板，可发送给微信 / QQ 好友");
    } catch {
      warnHaptic();
      setShareFeedback("未能打开系统分享，长按上方口令即可手动复制");
    }
  };

  const stepWeek = (delta: number) => {
    const next = Math.min(totalWeeks, Math.max(1, selectedWeek + delta));
    if (next !== selectedWeek) {
      selectHaptic();
      setSelectedWeek(next);
      setSelectedCellKey(null);
    }
  };

  const renderCellTone = (cell: CommonFreeSlotCell) => {
    const busyPeople = cell.totalPeople - cell.freeCount;
    if (cell.allFree) {
      return {
        bg: colors.emeraldBg,
        border: colors.emeraldBorder,
        text: colors.emeraldText,
        shortLabel: "空",
      };
    }
    if (cell.totalPeople > 1 && busyPeople === 1) {
      return {
        bg: colors.amberBg,
        border: colors.amberBorder,
        text: colors.amberText,
        shortLabel: "1忙",
      };
    }
    return {
      bg: colors.roseBg,
      border: colors.roseBorder,
      text: colors.roseText,
      shortLabel: busyPeople >= cell.totalPeople ? "全忙" : `${busyPeople}忙`,
    };
  };

  return (
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.62)",
        }}
      >
        <GlassContainer
          variant="sheet"
          tint={isDark ? "dark" : "light"}
          radius={28}
          style={{
            maxHeight: "92%",
            minHeight: "74%",
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            backgroundColor: colors.sheetBg,
          }}
        >
          <View style={{ flex: 1, paddingTop: 16, paddingBottom: 18 }}>
            {/* 顶栏 */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingBottom: 12,
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "700",
                    color: colors.textPrimary,
                  }}
                >
                  好友课表 · 空课雷达
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontSize: 11.5,
                    color: colors.textSecondary,
                  }}
                >
                  {schedule.name} ·{" "}
                  {activePeers.length > 0
                    ? `共 ${radar.totalPeople} 人参与第 ${selectedWeek} 周比对`
                    : "导入好友 DS1 口令，一键找出共同空课"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭好友空课雷达"
                onPress={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.pillBg,
                }}
              >
                <Ionicons
                  name="close"
                  size={17}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>

            {/* 分段 Tab */}
            <View
              style={{
                marginHorizontal: 20,
                marginBottom: 12,
                flexDirection: "row",
                borderRadius: 16,
                padding: 4,
                backgroundColor: colors.subtleBg,
                borderWidth: 1,
                borderColor: colors.cardBorder,
              }}
            >
              {(
                [
                  ["radar", "多人空课雷达", "people-outline"],
                  ["share", "分享我的课表", "qr-code-outline"],
                ] as const
              ).map(([key, label, icon]) => {
                const active = tab === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    onPress={() => {
                      selectHaptic();
                      setTab(key);
                    }}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: active
                        ? isDark
                          ? "rgba(56,189,248,0.20)"
                          : "#FFFFFF"
                        : "transparent",
                    }}
                  >
                    <Ionicons
                      name={icon}
                      size={15}
                      color={active ? "#0284C7" : colors.textSecondary}
                    />
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: "700",
                        color: active ? colors.skyText : colors.textSecondary,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {tab === "radar" ? (
              <ScrollView
                style={{ flex: 1, paddingHorizontal: 20 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
              >
                {/* 参与比对的成员列表 + 导入入口 */}
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    backgroundColor: colors.cardBg,
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: "700",
                        color: colors.textPrimary,
                      }}
                    >
                      比对成员（点击切换参与）
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        tapHaptic();
                        setShowImportForm((v) => !v);
                        setImportError("");
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        backgroundColor: colors.skyBg,
                      }}
                    >
                      <Ionicons
                        name={showImportForm ? "chevron-up" : "add"}
                        size={13}
                        color={colors.skyText}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: colors.skyText,
                        }}
                      >
                        {showImportForm ? "收起导入" : "导入好友口令"}
                      </Text>
                    </Pressable>
                  </View>

                  {/* 成员 Chips */}
                  <View
                    style={{
                      marginTop: 10,
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    {/* 我（固定启用） */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        borderRadius: 999,
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        backgroundColor: colors.skyBg,
                        borderWidth: 1,
                        borderColor: "rgba(56,189,248,0.45)",
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: "#38BDF8",
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: "700",
                          color: colors.skyText,
                        }}
                      >
                        我（本人）
                      </Text>
                    </View>

                    {peers.map((peer) => {
                      const palette =
                        coursePalette[peer.color] ?? coursePalette.violet;
                      return (
                        <View
                          key={peer.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            borderRadius: 999,
                            paddingLeft: 10,
                            paddingRight: 6,
                            paddingVertical: 5,
                            backgroundColor: peer.active
                              ? isDark
                                ? "rgba(255,255,255,0.10)"
                                : "#FFFFFF"
                              : colors.subtleBg,
                            borderWidth: 1,
                            borderColor: peer.active
                              ? palette.solid
                              : colors.cardBorder,
                            opacity: peer.active ? 1 : 0.55,
                          }}
                        >
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              selectHaptic();
                              togglePeerActive(peer.id);
                            }}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: palette.solid,
                              }}
                            />
                            <Text
                              style={{
                                fontSize: 11.5,
                                fontWeight: "700",
                                color: colors.textPrimary,
                              }}
                            >
                              {peer.nickname}
                            </Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`重命名 ${peer.nickname}`}
                            onPress={() => handleStartRename(peer)}
                            style={{ paddingHorizontal: 5, paddingVertical: 2 }}
                          >
                            <Ionicons
                              name="pencil-outline"
                              size={11}
                              color={colors.textSecondary}
                            />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`删除 ${peer.nickname}`}
                            onPress={() => {
                              tapHaptic();
                              if (editingPeerId === peer.id) {
                                setEditingPeerId(null);
                              }
                              removePeer(peer.id);
                            }}
                            style={{ paddingHorizontal: 3, paddingVertical: 2 }}
                          >
                            <Ionicons
                              name="close-circle"
                              size={14}
                              color={colors.textMuted}
                            />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>

                  {/* 行内重命名输入 */}
                  {editingPeerId ? (
                    <View
                      style={{
                        marginTop: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <TextInput
                        value={editingName}
                        onChangeText={setEditingName}
                        placeholder="输入新昵称…"
                        placeholderTextColor={colors.textMuted}
                        maxLength={24}
                        returnKeyType="done"
                        onSubmitEditing={handleCommitRename}
                        style={{
                          flex: 1,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.cardBorder,
                          backgroundColor: colors.inputBg,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          fontSize: 12,
                          color: colors.textPrimary,
                        }}
                      />
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleCommitRename}
                        style={{
                          borderRadius: 10,
                          backgroundColor: "#0284C7",
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: "700",
                            color: "#FFFFFF",
                          }}
                        >
                          保存
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setEditingPeerId(null)}
                        style={{
                          borderRadius: 10,
                          backgroundColor: colors.pillBg,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: "600",
                            color: colors.textSecondary,
                          }}
                        >
                          取消
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {/* 导入表单 */}
                  {showImportForm ? (
                    <View style={{ marginTop: 12, gap: 8 }}>
                      <TextInput
                        value={nicknameInput}
                        onChangeText={setNicknameInput}
                        placeholder="好友昵称（可选，如：对象 / 室友A）"
                        placeholderTextColor={colors.textMuted}
                        maxLength={24}
                        style={{
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.cardBorder,
                          backgroundColor: colors.inputBg,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          fontSize: 12.5,
                          color: colors.textPrimary,
                        }}
                      />
                      <TextInput
                        value={codeInput}
                        onChangeText={(v) => {
                          setCodeInput(v);
                          if (importError) setImportError("");
                        }}
                        placeholder="粘贴好友发来的 DS1:... 课表口令（可直接粘贴整段微信/QQ消息）"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                        style={{
                          minHeight: 68,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.cardBorder,
                          backgroundColor: colors.inputBg,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          fontSize: 12,
                          color: colors.textPrimary,
                        }}
                      />
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleImport}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          borderRadius: 12,
                          backgroundColor: "#0284C7",
                          paddingVertical: 10,
                        }}
                      >
                        <Ionicons
                          name="sparkles-outline"
                          size={15}
                          color="#FFFFFF"
                        />
                        <Text
                          style={{
                            fontSize: 12.5,
                            fontWeight: "700",
                            color: "#FFFFFF",
                          }}
                        >
                          解析口令并加入空课比对
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {importError ? (
                    <Text
                      style={{
                        marginTop: 8,
                        fontSize: 11.5,
                        fontWeight: "600",
                        color: "#F43F5E",
                      }}
                    >
                      {importError}
                    </Text>
                  ) : null}
                  {importSuccess ? (
                    <Text
                      style={{
                        marginTop: 8,
                        fontSize: 11.5,
                        fontWeight: "600",
                        color: colors.emeraldText,
                      }}
                    >
                      {importSuccess}
                    </Text>
                  ) : null}
                  {hasStartDateMismatch ? (
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 10.5,
                        color: colors.amberText,
                      }}
                    >
                      提示：部分好友课表的开学日期与你的课表不同，当前按同一教学周序号（第{" "}
                      {selectedWeek} 周）对齐。
                    </Text>
                  ) : null}
                </View>

                {/* 周次切换条 + 周末开关 */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.cardBorder,
                      backgroundColor: colors.cardBg,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="上一周"
                      disabled={selectedWeek <= 1}
                      onPress={() => stepWeek(-1)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.subtleBg,
                        opacity: selectedWeek <= 1 ? 0.35 : 1,
                      }}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={15}
                        color={colors.textSecondary}
                      />
                    </Pressable>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: colors.textPrimary,
                        }}
                      >
                        第 {selectedWeek} 周
                      </Text>
                      {selectedWeek !== currentWeek ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            selectHaptic();
                            setSelectedWeek(
                              Math.min(totalWeeks, Math.max(1, currentWeek || 1)),
                            );
                            setSelectedCellKey(null);
                          }}
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                            backgroundColor: colors.skyBg,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "700",
                              color: colors.skyText,
                            }}
                          >
                            回本周
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="下一周"
                      disabled={selectedWeek >= totalWeeks}
                      onPress={() => stepWeek(1)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.subtleBg,
                        opacity: selectedWeek >= totalWeeks ? 0.35 : 1,
                      }}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color={colors.textSecondary}
                      />
                    </Pressable>
                  </View>

                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: includeWeekend }}
                    onPress={() => {
                      selectHaptic();
                      setIncludeWeekend((v) => !v);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: includeWeekend
                        ? "rgba(56,189,248,0.45)"
                        : colors.cardBorder,
                      backgroundColor: includeWeekend
                        ? colors.skyBg
                        : colors.cardBg,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <Ionicons
                      name={includeWeekend ? "calendar" : "calendar-outline"}
                      size={14}
                      color={
                        includeWeekend ? colors.skyText : colors.textSecondary
                      }
                    />
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: "700",
                        color: includeWeekend
                          ? colors.skyText
                          : colors.textSecondary,
                      }}
                    >
                      {includeWeekend ? "含周末" : "周一至五"}
                    </Text>
                  </Pressable>
                </View>

                {/* 顶部亮点：本周全体共同空课推荐时段 */}
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.emeraldBorder,
                    backgroundColor: colors.emeraldBg,
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name="flash-outline"
                        size={15}
                        color={colors.emeraldText}
                      />
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: "800",
                          color: colors.emeraldText,
                        }}
                      >
                        本周全体共同空课推荐时段
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: "700",
                        color: colors.emeraldText,
                      }}
                    >
                      {radar.allFreeSlotCount}/{radar.totalSlotCount} 节全空
                    </Text>
                  </View>

                  {radar.recommendedBlocks.length === 0 ? (
                    <Text
                      style={{
                        marginTop: 8,
                        fontSize: 11.5,
                        color: colors.textSecondary,
                      }}
                    >
                      第 {selectedWeek} 周暂无全员同时空课的时段，可切换周次或取消勾选部分好友查看。
                    </Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginTop: 10 }}
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {radar.recommendedBlocks.slice(0, 6).map((block) => {
                        const targetKey = slotCellKey(
                          block.weekday,
                          block.startPeriod,
                        );
                        return (
                          <Pressable
                            key={`${block.weekday}-${block.startPeriod}-${block.endPeriod}`}
                            accessibilityRole="button"
                            onPress={() => {
                              selectHaptic();
                              setSelectedCellKey(targetKey);
                            }}
                            style={{
                              borderRadius: 13,
                              borderWidth: 1,
                              borderColor: colors.emeraldBorder,
                              backgroundColor: isDark
                                ? "rgba(15,23,42,0.78)"
                                : "rgba(255,255,255,0.92)",
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              minWidth: 146,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12.5,
                                fontWeight: "800",
                                color: colors.textPrimary,
                              }}
                            >
                              {block.dayLabel} {block.startTime}–{block.endTime}
                            </Text>
                            <Text
                              style={{
                                marginTop: 3,
                                fontSize: 10.5,
                                fontWeight: "600",
                                color: colors.emeraldText,
                              }}
                            >
                              第{block.startPeriod}
                              {block.endPeriod !== block.startPeriod
                                ? `–${block.endPeriod}`
                                : ""}
                              节 · 连空 {block.periodCount} 节 · 全员有空
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>

                {/* 交互热力图网格 */}
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    backgroundColor: colors.cardBg,
                    padding: 12,
                  }}
                >
                  {/* 图例 */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: "700",
                        color: colors.textPrimary,
                      }}
                    >
                      空课热力矩阵
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      {[
                        { label: "全员空", bg: colors.emeraldBg, border: colors.emeraldBorder },
                        { label: "部分忙", bg: colors.amberBg, border: colors.amberBorder },
                        { label: "多人忙", bg: colors.roseBg, border: colors.roseBorder },
                      ].map((item) => (
                        <View
                          key={item.label}
                          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                        >
                          <View
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 3,
                              backgroundColor: item.bg,
                              borderWidth: 1,
                              borderColor: item.border,
                            }}
                          />
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.textSecondary,
                            }}
                          >
                            {item.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {radar.periods.length === 0 ? (
                    <Text
                      style={{
                        paddingVertical: 16,
                        textAlign: "center",
                        fontSize: 12,
                        color: colors.textSecondary,
                      }}
                    >
                      当前课表尚未配置作息节次
                    </Text>
                  ) : (
                    <View style={{ gap: 4 }}>
                      {/* 表头：节次 + 周一..周五/日 */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 42, alignItems: "center" }}>
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "600",
                              color: colors.textMuted,
                            }}
                          >
                            节次
                          </Text>
                        </View>
                        {radar.weekdays.map((day) => (
                          <View
                            key={day}
                            style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color: colors.textSecondary,
                              }}
                            >
                              {(WEEKDAY_LABELS[day - 1] ?? `周${day}`).replace("周", "")}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* 每一节 */}
                      {radar.periods.map((period) => (
                        <View
                          key={period.index}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <View style={{ width: 42, alignItems: "center" }}>
                            <Text
                              style={{
                                fontSize: 10.5,
                                fontWeight: "700",
                                color: colors.textPrimary,
                              }}
                            >
                              {period.index}
                            </Text>
                            <Text
                              style={{
                                fontSize: 8.5,
                                color: colors.textMuted,
                              }}
                            >
                              {period.startTime}
                            </Text>
                          </View>

                          {radar.weekdays.map((day) => {
                            const key = slotCellKey(day, period.index);
                            const cell = radar.cellMap[key];
                            if (!cell) return <View key={key} style={{ flex: 1 }} />;
                            const tone = renderCellTone(cell);
                            const isSelected = selectedCellKey === key;

                            return (
                              <Pressable
                                key={key}
                                accessibilityRole="button"
                                accessibilityLabel={`${WEEKDAY_LABELS[day - 1]}第${period.index}节 ${tone.shortLabel}`}
                                onPress={() => {
                                  selectHaptic();
                                  setSelectedCellKey(key);
                                }}
                                style={{
                                  flex: 1,
                                  height: 32,
                                  borderRadius: 8,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: tone.bg,
                                  borderWidth: isSelected ? 2 : 1,
                                  borderColor: isSelected ? "#38BDF8" : tone.border,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "700",
                                    color: tone.text,
                                  }}
                                >
                                  {tone.shortLabel}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* 选中格子明细面板 */}
                  <View
                    style={{
                      marginTop: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.cardBorder,
                      backgroundColor: colors.subtleBg,
                      padding: 12,
                    }}
                  >
                    {!selectedCell ? (
                      <Text
                        style={{
                          fontSize: 11.5,
                          textAlign: "center",
                          color: colors.textSecondary,
                        }}
                      >
                        轻点上方任意时段格子，查看该节「谁有课 / 谁有空」详情
                      </Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12.5,
                              fontWeight: "700",
                              color: colors.textPrimary,
                            }}
                          >
                            {WEEKDAY_LABELS[selectedCell.weekday - 1]} · 第
                            {selectedCell.periodIndex}节（{selectedCell.startTime}–
                            {selectedCell.endTime}）
                          </Text>
                          <View
                            style={{
                              borderRadius: 999,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              backgroundColor: selectedCell.allFree
                                ? colors.emeraldBg
                                : colors.amberBg,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10.5,
                                fontWeight: "700",
                                color: selectedCell.allFree
                                  ? colors.emeraldText
                                  : colors.amberText,
                              }}
                            >
                              {selectedCell.allFree
                                ? "全员有空"
                                : `${selectedCell.freeCount}/${selectedCell.totalPeople} 人有空`}
                            </Text>
                          </View>
                        </View>

                        {/* 有空的人 */}
                        {selectedCell.freePeople.length > 0 ? (
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color: colors.emeraldText,
                              }}
                            >
                              有空：
                            </Text>
                            {selectedCell.freePeople.map((name) => (
                              <View
                                key={name}
                                style={{
                                  borderRadius: 999,
                                  paddingHorizontal: 8,
                                  paddingVertical: 2,
                                  backgroundColor: colors.emeraldBg,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: "600",
                                    color: colors.emeraldText,
                                  }}
                                >
                                  {name}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        {/* 有课的人 */}
                        {selectedCell.busy.length > 0 ? (
                          <View style={{ gap: 6 }}>
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color: colors.roseText,
                              }}
                            >
                              有课：
                            </Text>
                            {selectedCell.busy.map((entry, idx) => {
                              const p =
                                coursePalette[entry.color] ?? coursePalette.sky;
                              return (
                                <View
                                  key={`${entry.personName}-${entry.courseName}-${idx}`}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 8,
                                    borderRadius: 10,
                                    backgroundColor: colors.cardBg,
                                    paddingHorizontal: 10,
                                    paddingVertical: 7,
                                  }}
                                >
                                  <View
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: 4,
                                      backgroundColor: p.solid,
                                    }}
                                  />
                                  <Text
                                    style={{
                                      fontSize: 11.5,
                                      fontWeight: "700",
                                      color: colors.textPrimary,
                                    }}
                                  >
                                    {entry.personName}
                                  </Text>
                                  <Text
                                    numberOfLines={1}
                                    style={{
                                      flex: 1,
                                      fontSize: 11.5,
                                      color: colors.textSecondary,
                                    }}
                                  >
                                    {entry.courseName}
                                    {entry.classroom ? ` · ${entry.classroom}` : ""}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    )}
                  </View>
                </View>
              </ScrollView>
            ) : (
              /* Tab 2 — 分享我的课表 */
              <ScrollView
                style={{ flex: 1, paddingHorizontal: 20 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
              >
                {/* 昵称标注 */}
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    backgroundColor: colors.cardBg,
                    padding: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: colors.textPrimary,
                    }}
                  >
                    分享昵称（可选）
                  </Text>
                  <TextInput
                    value={myShareNickname}
                    onChangeText={setMyShareNickname}
                    placeholder="如：小明（好友导入时自动显示此称呼）"
                    placeholderTextColor={colors.textMuted}
                    maxLength={24}
                    style={{
                      marginTop: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.cardBorder,
                      backgroundColor: colors.inputBg,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      fontSize: 12.5,
                      color: colors.textPrimary,
                    }}
                  />
                </View>

                {/* 二维码卡片 */}
                <View
                  style={{
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    backgroundColor: colors.cardBg,
                    padding: 16,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      backgroundColor: qrIsFullSemester
                        ? colors.emeraldBg
                        : colors.skyBg,
                      marginBottom: 12,
                    }}
                  >
                    <Ionicons
                      name="qr-code-outline"
                      size={13}
                      color={
                        qrIsFullSemester ? colors.emeraldText : colors.skyText
                      }
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: qrIsFullSemester
                          ? colors.emeraldText
                          : colors.skyText,
                      }}
                    >
                      {qrIsFullSemester
                        ? "整学期完整课表二维码"
                        : `第 ${selectedWeek} 周精简课表二维码`}
                    </Text>
                  </View>

                  {qrMatrix ? (
                    <QrCodeSvg matrix={qrMatrix} />
                  ) : (
                    <View
                      style={{
                        width: QR_DISPLAY_SIZE,
                        height: QR_DISPLAY_SIZE,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.subtleBg,
                        padding: 16,
                      }}
                    >
                      <Ionicons
                        name="alert-circle-outline"
                        size={28}
                        color={colors.textMuted}
                      />
                      <Text
                        style={{
                          marginTop: 8,
                          textAlign: "center",
                          fontSize: 11.5,
                          color: colors.textSecondary,
                        }}
                      >
                        当前课表内容超出二维码容量，请直接使用下方课表口令分享
                      </Text>
                    </View>
                  )}

                  <Text
                    style={{
                      marginTop: 10,
                      textAlign: "center",
                      fontSize: 11,
                      color: colors.textSecondary,
                      lineHeight: 16,
                    }}
                  >
                    {qrIsFullSemester
                      ? `QR Version ${qrMatrix?.version ?? "-"} · 扫码可获得完整整学期 DS1 口令`
                      : `整学期排课较多，二维码已自动压缩为第 ${selectedWeek} 周版本（QR V${qrMatrix?.version ?? "-"}）；分享整学期请使用下方口令`}
                  </Text>
                </View>

                {/* 完整口令卡片 + 系统分享 */}
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    backgroundColor: colors.cardBg,
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: "700",
                        color: colors.textPrimary,
                      }}
                    >
                      整学期课表口令（长按可选中复制）
                    </Text>
                    <Text
                      style={{
                        fontSize: 10.5,
                        color: colors.textMuted,
                      }}
                    >
                      {schedule.courses.length} 条排课 · {fullShareCode.length} 字
                    </Text>
                  </View>

                  <View
                    style={{
                      marginTop: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.cardBorder,
                      backgroundColor: colors.inputBg,
                      padding: 10,
                      maxHeight: 112,
                    }}
                  >
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                      <Text
                        selectable
                        style={{
                          fontSize: 11,
                          lineHeight: 16,
                          color: colors.textSecondary,
                        }}
                      >
                        {fullShareCode}
                      </Text>
                    </ScrollView>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleShareCode}
                    style={{
                      marginTop: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      borderRadius: 13,
                      backgroundColor: "#0284C7",
                      paddingVertical: 11,
                    }}
                  >
                    <Ionicons
                      name="share-social-outline"
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "#FFFFFF",
                      }}
                    >
                      发送课表口令给微信 / QQ 好友
                    </Text>
                  </Pressable>

                  {shareFeedback ? (
                    <Text
                      style={{
                        marginTop: 8,
                        textAlign: "center",
                        fontSize: 11,
                        color: colors.skyText,
                      }}
                    >
                      {shareFeedback}
                    </Text>
                  ) : null}
                </View>
              </ScrollView>
            )}
          </View>
        </GlassContainer>
      </View>
  );
}
