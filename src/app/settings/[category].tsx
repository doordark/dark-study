import { useLocalSearchParams } from "expo-router";

import { SettingsCategoryScreen } from "@/screens/SettingsScreen";

export default function SettingsCategory() {
  const { category } = useLocalSearchParams<{ category: string }>();
  return <SettingsCategoryScreen category={category} />;
}
