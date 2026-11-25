import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { FarmSlotFrame, FarmText as Text } from "./FarmSkin";
import { CropSprite, FarmUiIcon } from "./CropSprite";
import { CROP_LABELS, type CropKind } from "@/utils/farmEconomy";

export interface FarmReturnItems {
  mature: number[];
  orders: CropKind[];
  reports: number;
}

export function FarmReturnSummary({ items, hidden, manuallyOpen, onClose, onCrops, onOrders, onReports, onVisibleChange }: {
  items: FarmReturnItems; hidden: boolean; manuallyOpen: boolean; onClose: () => void;
  onCrops: (plot: number) => void; onOrders: () => void; onReports: () => void;
  onVisibleChange?: (shown: boolean) => void;
}) {
  const [showOnArrival] = useState(() => Boolean(items.mature.length || items.orders.length || items.reports));
  const [dismissed, setDismissed] = useState(false);
  const empty = !items.mature.length && !items.orders.length && !items.reports;
  const shown = !(hidden || (!manuallyOpen && (dismissed || !showOnArrival || empty)));
  useEffect(() => {
    onVisibleChange?.(shown);
  }, [shown, onVisibleChange]);
  if (!shown) return null;
  const close = () => {
    setDismissed(true);
    onClose();
  };
  const rows = [
    items.mature.length ? {
      key: "mature",
      icon: <CropSprite kind="star" size={18} />,
      text: `${items.mature.length} 格作物已成熟`,
      action: () => onCrops(items.mature[0]),
    } : null,
    items.orders.length ? {
      key: "orders",
      icon: <FarmUiIcon name="wish" size={18} />,
      text: `${items.orders.length} 份订单可交付 · ${items.orders.slice(0, 2).map(kind => CROP_LABELS[kind]).join("、")}`,
      action: onOrders,
    } : null,
    items.reports ? {
      key: "reports",
      icon: <FarmUiIcon name="gazette" size={18} />,
      text: `${items.reports} 份未读委托汇报`,
      action: onReports,
    } : manuallyOpen ? {
      key: "reports-empty",
      icon: <FarmUiIcon name="gazette" size={18} />,
      text: "委托汇报 · 无未读",
      action: onReports,
    } : null,
  ];
  return <View style={{
    position: "absolute", top: 9, right: 10, left: 10, zIndex: 1600, maxWidth: 420,
    backgroundColor: "#FFF6E3", borderColor: "#CFAF7E", borderWidth: 1.5, borderBottomWidth: 3, borderRadius: 16, padding: 12, gap: 4,
    shadowColor: "#3D2A15", shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "#E8D7BC" }}>
      <FarmUiIcon name="memory" size={18} />
      <Text variant="title" style={{ flex: 1, fontSize: 14.5, color: "#5A3F25" }}>归来小结</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="收起归来小结" onPress={close} hitSlop={8}
        style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F2E4CC" }}>
        <Text style={{ color: "#786044", fontSize: 14, fontWeight: "700" }}>×</Text>
      </Pressable>
    </View>
    {rows.map(item => item ? <Pressable key={item.key} accessibilityRole="button" onPress={() => { close(); item.action(); }}
      style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}>
      <FarmSlotFrame size={28} rarity={1}>{item.icon}</FarmSlotFrame>
      <Text style={{ flex: 1, fontSize: 12, color: "#5D4932", fontWeight: "600" }}>{item.text}</Text>
      <Text style={{ color: "#59703E", fontSize: 11.5, fontWeight: "700" }}>查看 ›</Text>
    </Pressable> : null)}
    {manuallyOpen && empty ? <Text style={{ color: "#786044", fontSize: 12, paddingTop: 2 }}>还没有成熟作物或可交付订单。</Text> : null}
  </View>;
}
