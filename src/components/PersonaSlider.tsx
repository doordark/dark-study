import { useState } from "react";
import { Platform, Pressable, Text, View, type ViewProps } from "react-native";

/** 纯 RN 滑条：无需新原生模块，44px 触控区域与读屏增减操作。 */
export function PersonaSlider({ label, low, high, hint, value, onChange }: {
  label: string; low: string; high: string; hint: string; value: number; onChange: (value: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const fraction = (value - 1) / 99;
  const update = (x: number) => onChange(Math.max(1, Math.min(100, Math.round(1 + ((x - 12) / Math.max(1, width - 24)) * 99))));
  const webKeyboard: Pick<ViewProps, "onKeyDown"> = Platform.OS === "web" ? {
    onKeyDown: (event) => {
      const key = event.nativeEvent.key;
      const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[key];
      if (delta === undefined && key !== "Home" && key !== "End") return;
      event.preventDefault();
      onChange(key === "Home" ? 1 : key === "End" ? 100 : Math.max(1, Math.min(100, value + (delta ?? 0))));
    },
  } : {};
  return (
    <View className="mt-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-[14px] font-bold text-slate-800 dark:text-slate-100">{label}</Text>
        <Text className="text-[13px] font-bold text-sky-600 dark:text-sky-300">{value} <Text className="text-[10px] text-slate-400">/ 100</Text></Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable accessibilityLabel={`降低${label}`} accessibilityRole="button" disabled={value === 1} onPress={() => onChange(Math.max(1, value - 1))} className="h-11 w-8 items-center justify-center">
          <Text className="text-xl text-slate-500 dark:text-slate-300">−</Text>
        </Pressable>
        <View
          className="h-11 flex-1 justify-center"
          style={{ touchAction: "none" }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(e) => update(e.nativeEvent.locationX)}
          onResponderMove={(e) => update(e.nativeEvent.locationX)}
          onResponderTerminationRequest={() => false}
          accessible focusable tabIndex={0} accessibilityRole="adjustable" accessibilityLabel={label}
          aria-valuemin={1} aria-valuemax={100} aria-valuenow={value} aria-valuetext={`${value} / 100`}
          {...webKeyboard}
          accessibilityHint={hint}
          accessibilityValue={{ min: 1, max: 100, now: value }}
          accessibilityActions={[{ name: "increment", label: "增加" }, { name: "decrement", label: "减少" }]}
          onAccessibilityAction={(e) => onChange(Math.max(1, Math.min(100, value + (e.nativeEvent.actionName === "increment" ? 1 : -1))))}
        >
          <View pointerEvents="none" className="mx-3 h-1.5 rounded-full bg-slate-300/60 dark:bg-white/15">
            <View className="h-1.5 rounded-full bg-sky-400" style={{ width: `${fraction * 100}%` }} />
          </View>
          <View pointerEvents="none" style={{ position: "absolute", left: fraction * Math.max(0, width - 24), width: 24, height: 24, borderRadius: 12, backgroundColor: "#F0F9FF", borderWidth: 3, borderColor: "#38BDF8" }} />
        </View>
        <Pressable accessibilityLabel={`提高${label}`} accessibilityRole="button" disabled={value === 100} onPress={() => onChange(Math.min(100, value + 1))} className="h-11 w-8 items-center justify-center">
          <Text className="text-xl text-slate-500 dark:text-slate-300">+</Text>
        </Pressable>
      </View>
      <View className="flex-row justify-between px-10">
        <Text className="text-[10px] text-slate-500 dark:text-slate-400">{low}</Text>
        <Text className="text-[10px] text-slate-500 dark:text-slate-400">{high}</Text>
      </View>
    </View>
  );
}
