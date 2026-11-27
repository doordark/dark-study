import React, { type ComponentType } from "react";

function lazyNamed<TProps extends object>(
  loader: () => Promise<ComponentType<TProps>>,
): React.LazyExoticComponent<ComponentType<TProps>> {
  return React.lazy(async () => ({ default: await loader() }));
}

export const LazyCourseEditorPanel = lazyNamed(() =>
  import("@/components/CourseEditorPanel").then((m) => m.CourseEditorPanel),
);

export const LazyCourseTaskSheet = lazyNamed(() =>
  import("@/components/CourseTaskSheet").then((m) => m.CourseTaskSheet),
);

export const LazyHolidayShiftModal = lazyNamed(() =>
  import("@/components/HolidayShiftModal").then((m) => m.HolidayShiftModal),
);

export const LazyCourseSearchStatsModal = lazyNamed(() =>
  import("@/components/CourseSearchStatsModal").then(
    (m) => m.CourseSearchStatsModal,
  ),
);

export const LazyScheduleExportModal = lazyNamed(() =>
  import("@/components/ScheduleExportModal").then((m) => m.ScheduleExportModal),
);

export const LazyCourseStudyModal = lazyNamed(() =>
  import("@/components/CourseStudyModal").then((m) => m.CourseStudyModal),
);

export const LazyPeerCompareModal = lazyNamed(() =>
  import("@/components/PeerCompareModal").then((m) => m.PeerCompareModal),
);

export const LazyNightSky = lazyNamed(() =>
  import("@/components/NightSky").then((m) => m.NightSky),
);

export const LazyAfterHours = lazyNamed(() =>
  import("@/components/AfterHours").then((m) => m.AfterHours),
);
