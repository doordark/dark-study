import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * 统一触感反馈：模拟器 / 无马达设备 / Web 上的失败一律吞掉，
 * 振动只是锦上添花，任何异常都不能影响正常交互。
 */
const run = (fn: () => Promise<void>) => {
  if (Platform.OS === "web") return;
  fn().catch(() => {});
};

/** 轻点：普通按钮、星星、头像点按 */
export const tapHaptic = () =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** 中等：确认操作、拿起桌宠、切换状态 */
export const bumpHaptic = () =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** 重击：召唤大肥鱼、解锁彩蛋、长按触发 */
export const thumpHaptic = () =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

/** 选择滚轮感：连续点击累积时 */
export const selectHaptic = () => run(() => Haptics.selectionAsync());

/** 成功：改课表成功、彩蛋达成 */
export const successHaptic = () =>
  run(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );

/** 警告：操作失败、被拒绝 */
export const warnHaptic = () =>
  run(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  );
