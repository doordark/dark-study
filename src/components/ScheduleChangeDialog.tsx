import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { commitSchedulePreview, undoSchedulePreview, type ScheduleActionPreview } from "@/services/assistantSchedule";

export function ScheduleChangeDialog({ preview, onClose, onApplied }: {
  preview: ScheduleActionPreview;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [applied, setApplied] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center bg-black/50 px-5">
        <View className="max-h-[82%] gap-4 rounded-3xl bg-white p-5 dark:bg-slate-900">
          <Text accessibilityRole="header" className="text-lg font-bold text-slate-900 dark:text-white">
            {applied ? "课表变更结果" : "预览课表变更"}
          </Text>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }}>
            {preview.changes.map(({ result, details }, index) => (
              <View key={index} className="mb-3 gap-1.5">
                <Text className="font-semibold text-slate-900 dark:text-white">{index + 1}. {result}</Text>
                {details.map((detail, i) => <Text key={i} className={detail.startsWith("时间冲突") ? "text-amber-700 dark:text-amber-300" : "text-slate-600 dark:text-slate-300"}>{detail}</Text>)}
              </View>
            ))}
          </ScrollView>
          {message ? <Text accessibilityLiveRegion="polite" className="text-amber-700 dark:text-amber-300">{message}</Text> : null}
          <View className="flex-row justify-end gap-3">
            <Pressable accessibilityRole="button" className="rounded-xl px-3 py-2" onPress={onClose}>
              <Text className="text-slate-700 dark:text-slate-200">{applied || !preview.hasChanges ? "关闭" : "取消"}</Text>
            </Pressable>
            {preview.hasChanges ? <Pressable accessibilityRole="button" className="rounded-xl bg-sky-600 px-3 py-2" onPress={() => {
              if (applied) {
                if (undoSchedulePreview(preview)) onClose();
                else setMessage("课表之后又有变更，无法安全撤销这次操作。");
              } else if (commitSchedulePreview(preview)) {
                setApplied(true);
                setMessage("");
                onApplied();
              } else setMessage("课表已更新，请关闭后重新预览。");
            }}>
              <Text className="font-semibold text-white">{applied ? "撤销本次变更" : "应用可执行项"}</Text>
            </Pressable> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
