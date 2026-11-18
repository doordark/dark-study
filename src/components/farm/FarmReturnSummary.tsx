import { useState } from "react";
import { Pressable, View } from "react-native";
import { FarmText as Text } from "./FarmSkin";
import { CROP_LABELS, type CropKind } from "@/utils/farmEconomy";

export interface FarmReturnItems {
  mature: number[];
  orders: CropKind[];
  reports: number;
}

export function FarmReturnSummary({ items, hidden, manuallyOpen, onClose, onCrops, onOrders, onReports }: {
  items: FarmReturnItems; hidden: boolean; manuallyOpen: boolean; onClose: () => void;
  onCrops: (plot: number) => void; onOrders: () => void; onReports: () => void;
}) {
  const [showOnArrival] = useState(() => Boolean(items.mature.length || items.orders.length || items.reports));
  const [dismissed, setDismissed] = useState(false);
  const empty = !items.mature.length && !items.orders.length && !items.reports;
  if (hidden || (!manuallyOpen && (dismissed || !showOnArrival || empty))) return null;
  const close = () => {
    setDismissed(true);
    onClose();
  };
  return <View style={{
    position: "absolute", top: 9, right: 10, left: 10, zIndex: 1600, maxWidth: 420,
    backgroundColor: "#FFF5DF", borderColor: "#D5B88D", borderWidth: 1, borderRadius: 14, padding: 11, gap: 2,
  }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text variant="label" style={{ flex: 1, fontSize: 15, color: "#65482C" }}>归来小结</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="收起归来小结" onPress={close} hitSlop={8}>
        <Text style={{ color: "#786044", fontSize: 16 }}>×</Text>
      </Pressable>
    </View>
    {([
      items.mature.length && { text: `${items.mature.length} 格作物已成熟`, action: () => onCrops(items.mature[0]) },
      items.orders.length && { text: `${items.orders.length} 份订单可交付 · ${items.orders.slice(0, 2).map(kind => CROP_LABELS[kind]).join("、")}`, action: onOrders },
      items.reports ? { text: `${items.reports} 份未读委托汇报`, action: onReports }
        : manuallyOpen && { text: "委托汇报 · 无未读", action: onReports },
    ]).map(item => item ? <Pressable key={item.text} accessibilityRole="button" onPress={() => { close(); item.action(); }}
      style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ flex: 1, fontSize: 12, color: "#5D4932" }}>{item.text}</Text>
      <Text style={{ color: "#607143", fontSize: 12 }}>查看 ›</Text>
    </Pressable> : null)}
    {manuallyOpen && empty ? <Text style={{ color: "#786044", fontSize: 12 }}>还没有成熟作物或可交付订单。</Text> : null}
  </View>;
}
