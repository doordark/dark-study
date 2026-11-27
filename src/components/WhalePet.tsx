import { Suspense, lazy } from "react";

import { useDesktopPetSync } from "@/hooks/useDesktopPetSync";
import { useDesktopPet } from "@/store/useDesktopPet";
import { useWhalePet } from "@/store/useWhalePet";

const LazyWhalePetStage = lazy(() => import("./whale/WhalePetStage"));

/**
 * 大肥鱼桌宠零开销门卫：
 * - 始终保持 `useDesktopPetSync()` 活跃，确保 Android 原生桌面悬浮窗在应用内桌宠隐藏时仍正常同步；
 * - 未召唤应用内桌宠或原生桌面悬浮窗当前可见时直接返回 `null`，避免首屏加载立绘、物理与对话模块；
 * - 仅在应用内桌宠真正可见时按需懒加载 `WhalePetStage`。
 */
export function WhalePet() {
  useDesktopPetSync();
  // 只有原生桌面悬浮窗真正处于可见状态时才隐藏应用内桌宠；前台 Standby 隐身待命期间保留应用内桌宠
  const onDesktopVisible = useDesktopPet((s) => s.running && s.visible);
  const visible = useWhalePet((s) => s.visible);

  if (!visible || onDesktopVisible) return null;

  return (
    <Suspense fallback={null}>
      <LazyWhalePetStage />
    </Suspense>
  );
}
