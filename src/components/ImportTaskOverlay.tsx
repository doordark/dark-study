import { Suspense } from "react";

import { useImportTask } from "@/store/useImportTask";
import { lazyNamed } from "@/utils/lazyModule";

const LazyImportTaskOverlayBody = lazyNamed(
  () => import("@/components/import/ImportTaskOverlayBody"),
  "ImportTaskOverlayBody",
);

/**
 * 全局导入任务悬浮层薄门卫：
 * 空闲态（status === "idle"）零解析、零挂载重型预览与手势模块；
 * 仅在导入任务激活时按需懒加载 ImportTaskOverlayBody。
 */
export function ImportTaskOverlay() {
  const status = useImportTask((s) => s.status);

  if (status === "idle") return null;

  return (
    <Suspense fallback={null}>
      <LazyImportTaskOverlayBody />
    </Suspense>
  );
}
