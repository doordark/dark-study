import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DAILY_GOALS, farmLevel, upgradeCost, waterCapacity, type FarmActivity, type FarmJournal } from "@/utils/farmProgress";
import { FarmToolSprite } from "./CropSprite";

function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, backgroundColor: disabled ? "#26352B" : "#8FD14F", opacity: disabled ? 0.55 : 1 }}>
    <Text style={{ color: disabled ? "#ADC0AF" : "#183016", fontSize: 12, fontWeight: "700" }}>{label}</Text>
  </Pressable>;
}

export function FarmJournalPanel({ children, visible, onClose, harvested, coins, upgrade, compost, journal, fertilizing, onClaim, onUpgrade, onHarvestAll, onWaterAll, onFertilize }: {
  children?: ReactNode; visible: boolean; onClose: () => void; harvested: number; coins: number; upgrade: number; compost: number; journal: FarmJournal; fertilizing: boolean;
  onClaim: (kind: FarmActivity) => void; onUpgrade: () => void; onHarvestAll: () => void; onWaterAll: () => void; onFertilize: () => void;
}) {
  const insets = useSafeAreaInsets();
  const level = farmLevel(harvested);
  const canUpgrade = upgrade < 3 && coins >= upgradeCost(upgrade) && level >= upgrade + 2;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
      <Pressable accessibilityLabel="关闭农场手账" onPress={onClose} style={{ position: "absolute", width: "100%", height: "100%" }} />
      <View style={{ maxHeight: "90%", borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#14231A", borderWidth: 1, borderColor: "#3B503A", overflow: "hidden" }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 20, gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View><Text style={{ color: "#F6EEDC", fontSize: 20, fontWeight: "800" }}>农场手账 · Lv.{level}</Text><Text style={{ color: "#A8B8A5", marginTop: 5 }}>{coins} 金币 · 累计收获 {harvested} 株</Text></View>
            <Action label="收起" onPress={onClose} />
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: "#2E4030", overflow: "hidden" }}><View style={{ height: 6, width: `${(harvested % 8) / 8 * 100}%`, backgroundColor: "#A3D873" }} /></View>
          <Text style={{ color: "#A8B8A5", fontSize: 12 }}>再收获 {8 - harvested % 8} 株升一级 · 作物离线也会生长，不会枯萎。</Text>
          {children}
          <Text style={{ color: "#F6EEDC", fontSize: 15, fontWeight: "700" }}>今日委托</Text>
          <Text style={{ color: "#A8B8A5", fontSize: 11 }}>按现实日期刷新，睡觉推进农场时间不会重置奖励。</Text>
          {(Object.keys(DAILY_GOALS) as FarmActivity[]).map((kind) => {
            const goal = DAILY_GOALS[kind]; const claimed = journal.claimed.includes(kind); const ready = journal.counts[kind] >= goal.target;
            return <View key={kind} style={{ flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: "#203327" }}>
              <View style={{ flex: 1 }}><Text style={{ color: "#F6EEDC", fontWeight: "600" }}>{goal.label}</Text><Text style={{ color: "#B6C7B3", fontSize: 11, marginTop: 5 }}>{journal.counts[kind]}/{goal.target} · 奖励 {goal.coins} 金币 + 1 份肥料</Text></View>
              <Action label={claimed ? "已领取" : ready ? "领取" : "进行中"} disabled={claimed || !ready} onPress={() => onClaim(kind)} />
            </View>;
          })}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><FarmToolSprite kind="water" size={42} /><View style={{ flex: 1 }}><Text style={{ color: "#F6EEDC", fontWeight: "700" }}>水壶扩容 · {waterCapacity(upgrade)} 格</Text><Text style={{ color: "#A8B8A5", fontSize: 11, marginTop: 4 }}>{upgrade >= 3 ? "水壶已升满" : `下一级 ${waterCapacity(upgrade + 1)} 格 · 需要 Lv.${upgrade + 2} · ${upgradeCost(upgrade)} 金币`}</Text></View><Action label="升级" disabled={!canUpgrade} onPress={onUpgrade} /></View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><FarmToolSprite kind="compost" size={42} /><View style={{ flex: 1 }}><Text style={{ color: "#F6EEDC", fontWeight: "700" }}>有机肥 ×{compost}</Text><Text style={{ color: "#A8B8A5", fontSize: 11, marginTop: 4 }}>每轮限一次：成长 +25%，收获为优质品（市价 +30%）。</Text></View><Action label={fertilizing ? "切回耕作" : "拿起肥料"} onPress={onFertilize} /></View>
          <Text style={{ color: "#A8B8A5", fontSize: 12 }}>抓虫每满 4 只可制成 1 份肥料，单局最多 5 份。浇水保持湿润，干土会慢慢生长。</Text>
          <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Action label="收获全部成熟作物" onPress={onHarvestAll} /></View><View style={{ flex: 1 }}><Action label="批量浇水" onPress={onWaterAll} /></View></View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
