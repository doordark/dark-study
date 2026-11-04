import { Switch, Text, View } from "react-native";
import { GlassContainer } from "@/components/GlassContainer";
import { stopWhaleVoice } from "@/services/whaleVoice";
import { useWhaleVoice } from "@/store/useWhaleVoice";

export function WhaleVoiceSettings() {
  const on = useWhaleVoice((s) => s.on);
  const loaded = useWhaleVoice((s) => s.loaded);
  const toggle = useWhaleVoice((s) => s.toggle);
  return <GlassContainer radius={24}><View className="flex-row items-center justify-between p-4">
    <View><Text className="text-[17px] font-bold text-slate-800 dark:text-white">鱼语</Text><Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">主聊天和桌宠共用</Text></View>
    <Switch accessibilityLabel="开启鱼语" disabled={!loaded} value={on} onValueChange={() => { toggle(); if (on) stopWhaleVoice(); }} />
  </View></GlassContainer>;
}
