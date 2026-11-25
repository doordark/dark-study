const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod, withMainApplication } = require("@expo/config-plugins");

const shapes = [
  {
    name: "Square",
    label: "课表 2×2",
    description: "紧凑 2×2 桌面课表卡片，显示当前正在上与下一门课程，点击直达课表",
    width: 110,
    height: 110,
    minResizeWidth: 110,
    minResizeHeight: 110,
    maxResizeWidth: 360,
    maxResizeHeight: 360,
    x: 2,
    y: 2,
  },
  {
    name: "Rectangle",
    label: "课表 4×2",
    description: "宽屏 4×2 桌面课表卡片，适配桌面与负一屏，显示今日与接下来课程",
    width: 250,
    height: 110,
    minResizeWidth: 180,
    minResizeHeight: 110,
    maxResizeWidth: 530,
    maxResizeHeight: 360,
    x: 4,
    y: 2,
  },
  {
    name: "Large",
    label: "课表 4×4",
    description: "全景 4×4 桌面课表大卡片，一屏纵览多门课程与上课教室",
    width: 250,
    height: 250,
    minResizeWidth: 180,
    minResizeHeight: 180,
    maxResizeWidth: 530,
    maxResizeHeight: 530,
    x: 4,
    y: 4,
  },
];

// 主题色与 src/constants/widgetPalette.json 共用同一份数据，保证原生组件和设置页预览一致
const accents = require("../src/constants/widgetPalette.json");
const themes = ["dark", "light"];
const styles = ["frosted", "porcelain", "tinted"];

// 课程色板与 src/constants/palette.ts 保持一致，纯 XML shape 无位图开销
const courseColors = [
  { key: "sky", solid: "#38BDF8" },
  { key: "violet", solid: "#A78BFA" },
  { key: "emerald", solid: "#34D399" },
  { key: "amber", solid: "#FBBF24" },
  { key: "rose", solid: "#FB7185" },
  { key: "cyan", solid: "#22D3EE" },
];

/** 将 6 位 #RRGGBB 转为 Android XML 8 位 #AARRGGBB */
function androidColor(hex6, alphaHex = "FF") {
  const clean = String(hex6).replace("#", "").toUpperCase();
  if (clean.length !== 6) return hex6;
  return alphaHex === "FF" ? `#${clean}` : `#${alphaHex}${clean}`;
}

function cardShapeXml(startColor, endColor, strokeColor, radiusDp = 24) {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient android:angle="270" android:startColor="${startColor}" android:endColor="${endColor}" android:type="linear" />
  <corners android:radius="${radiusDp}dp" />
  <stroke android:width="1dp" android:color="${strokeColor}" />
</shape>`;
}

function solidShapeXml(fillColor, radiusDp, strokeColor = null) {
  const stroke = strokeColor ? `\n  <stroke android:width="1dp" android:color="${strokeColor}" />` : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="${fillColor}" />
  <corners android:radius="${radiusDp}dp" />${stroke}
</shape>`;
}

/**
 * 根容器采用 @android:id/background，配合 Android 12+ 系统自动圆角裁剪与启动过渡动画。
 * 布局只使用 RemoteViews 原生白名单组件（LinearLayout / TextView），杜绝自定义 View 与 View 占位标签。
 */
const widgetLayout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@android:id/background"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:paddingLeft="14dp"
    android:paddingRight="14dp"
    android:paddingTop="10dp"
    android:paddingBottom="6dp"
    android:background="@drawable/course_widget_bg_default_frosted_light">

  <LinearLayout
      android:id="@+id/widget_header"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:orientation="horizontal"
      android:gravity="center_vertical"
      android:layout_marginBottom="6dp">

    <TextView
        android:id="@+id/widget_title"
        android:layout_width="0dp"
        android:layout_weight="1"
        android:layout_height="wrap_content"
        android:text="桌面课表"
        android:maxLines="1"
        android:ellipsize="end"
        android:includeFontPadding="false"
        android:textSize="13sp"
        android:textStyle="bold"
        android:textColor="#172033" />

    <TextView
        android:id="@+id/widget_meta"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginLeft="8dp"
        android:text="11.25 第11周"
        android:maxLines="1"
        android:ellipsize="end"
        android:includeFontPadding="false"
        android:textSize="11sp"
        android:textColor="#64748B" />

    <TextView
        android:id="@+id/widget_weekday"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginLeft="4dp"
        android:text="周三"
        android:maxLines="1"
        android:includeFontPadding="false"
        android:textSize="11sp"
        android:textStyle="bold"
        android:textColor="#0284C7" />

    <TextView
        android:id="@+id/widget_brand"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginLeft="6dp"
        android:paddingLeft="4dp"
        android:paddingRight="2dp"
        android:paddingTop="2dp"
        android:paddingBottom="2dp"
        android:text="↻"
        android:contentDescription="刷新桌面课表"
        android:maxLines="1"
        android:includeFontPadding="false"
        android:textSize="12sp"
        android:textStyle="bold"
        android:textColor="#0284C7" />
  </LinearLayout>

  <LinearLayout
      android:id="@+id/widget_courses"
      android:layout_width="match_parent"
      android:layout_height="0dp"
      android:layout_weight="1"
      android:orientation="vertical" />

  <LinearLayout
      android:id="@+id/widget_empty_box"
      android:layout_width="match_parent"
      android:layout_height="0dp"
      android:layout_weight="1"
      android:orientation="vertical"
      android:gravity="center"
      android:visibility="gone">

    <TextView
        android:id="@+id/widget_empty_kaomoji"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="(〃'▽'〃)"
        android:includeFontPadding="false"
        android:textSize="16sp"
        android:textColor="#7B879B" />

    <TextView
        android:id="@+id/widget_empty"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="6dp"
        android:gravity="center"
        android:text="今天没有课啦"
        android:includeFontPadding="false"
        android:textSize="12sp"
        android:textColor="#64748B" />

    <TextView
        android:id="@+id/widget_empty_hint"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="6dp"
        android:paddingLeft="8dp"
        android:paddingRight="8dp"
        android:paddingTop="2dp"
        android:paddingBottom="2dp"
        android:maxLines="1"
        android:ellipsize="end"
        android:includeFontPadding="false"
        android:textSize="10sp"
        android:textColor="#64748B"
        android:visibility="gone" />
  </LinearLayout>
</LinearLayout>`;

/** 标准/宽卡课程项：圆角柔和底卡 + 左侧圆润彩条 + 右上状态胶囊 + 时间教室一行呈现（2 行紧凑不裁切） */
const rowLayout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_course_row_wrap"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:paddingBottom="4dp">

  <LinearLayout
      android:id="@+id/widget_course_row"
      android:layout_width="match_parent"
      android:layout_height="45dp"
      android:orientation="horizontal"
      android:gravity="center_vertical"
      android:paddingLeft="9dp"
      android:paddingRight="10dp"
      android:paddingTop="4dp"
      android:paddingBottom="4dp"
      android:background="@drawable/course_widget_item_sky_light">

    <TextView
        android:id="@+id/widget_course_bar"
        android:layout_width="3.5dp"
        android:layout_height="match_parent"
        android:layout_marginTop="2dp"
        android:layout_marginBottom="2dp"
        android:background="@drawable/course_widget_bar_sky" />

    <LinearLayout
        android:layout_width="0dp"
        android:layout_weight="1"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:gravity="center_vertical"
        android:paddingLeft="8dp">

      <LinearLayout
          android:layout_width="match_parent"
          android:layout_height="wrap_content"
          android:orientation="horizontal"
          android:gravity="center_vertical">

        <TextView
            android:id="@+id/widget_course_name"
            android:layout_width="0dp"
            android:layout_weight="1"
            android:layout_height="wrap_content"
            android:includeFontPadding="false"
            android:maxLines="1"
            android:ellipsize="end"
            android:textSize="12.5sp"
            android:textStyle="bold"
            android:textColor="#172033" />

        <TextView
            android:id="@+id/widget_course_badge"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginLeft="6dp"
            android:paddingLeft="6dp"
            android:paddingRight="6dp"
            android:paddingTop="1.5dp"
            android:paddingBottom="1.5dp"
            android:includeFontPadding="false"
            android:maxLines="1"
            android:textSize="9sp"
            android:textStyle="bold"
            android:textColor="#0284C7"
            android:background="@drawable/course_widget_badge_sky_light" />
      </LinearLayout>

      <LinearLayout
          android:layout_width="match_parent"
          android:layout_height="wrap_content"
          android:layout_marginTop="2.5dp"
          android:orientation="horizontal"
          android:gravity="center_vertical">

        <TextView
            android:id="@+id/widget_course_time"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:includeFontPadding="false"
            android:maxLines="1"
            android:textSize="10sp"
            android:textColor="#64748B" />

        <TextView
            android:id="@+id/widget_course_dot"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginLeft="5dp"
            android:layout_marginRight="5dp"
            android:text="·"
            android:includeFontPadding="false"
            android:textSize="10sp"
            android:textStyle="bold"
            android:textColor="#38BDF8" />

        <TextView
            android:id="@+id/widget_course_room"
            android:layout_width="0dp"
            android:layout_weight="1"
            android:layout_height="wrap_content"
            android:includeFontPadding="false"
            android:maxLines="1"
            android:ellipsize="end"
            android:textSize="10sp"
            android:textColor="#64748B" />
      </LinearLayout>
    </LinearLayout>
  </LinearLayout>
</LinearLayout>`;

/** 紧凑 2×2 课程项：双行清爽排版（课程名 + 状态时间·教室），在 110~140dp 高度 MiSans 字体下零纵向裁切 */
const rowCompactLayout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_course_row_wrap"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:paddingBottom="4dp">

  <LinearLayout
      android:id="@+id/widget_course_row"
      android:layout_width="match_parent"
      android:layout_height="43dp"
      android:orientation="horizontal"
      android:gravity="center_vertical"
      android:paddingLeft="7dp"
      android:paddingRight="7dp"
      android:paddingTop="4dp"
      android:paddingBottom="4dp"
      android:background="@drawable/course_widget_item_sky_light">

    <TextView
        android:id="@+id/widget_course_bar"
        android:layout_width="3dp"
        android:layout_height="match_parent"
        android:layout_marginTop="2dp"
        android:layout_marginBottom="2dp"
        android:background="@drawable/course_widget_bar_sky" />

    <LinearLayout
        android:layout_width="0dp"
        android:layout_weight="1"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:gravity="center_vertical"
        android:paddingLeft="6dp">

      <TextView
          android:id="@+id/widget_course_name"
          android:layout_width="match_parent"
          android:layout_height="wrap_content"
          android:includeFontPadding="false"
          android:maxLines="1"
          android:ellipsize="end"
          android:textSize="11.5sp"
          android:textStyle="bold"
          android:textColor="#172033" />

      <TextView
          android:id="@+id/widget_course_time"
          android:layout_width="match_parent"
          android:layout_height="wrap_content"
          android:layout_marginTop="2dp"
          android:includeFontPadding="false"
          android:maxLines="1"
          android:ellipsize="end"
          android:textSize="9.5sp"
          android:textColor="#64748B" />
    </LinearLayout>
  </LinearLayout>
</LinearLayout>`;

/** 桌面小组件选择器专用静态预览布局（Android 12+ / 澎湃 OS 强依赖 previewLayout 渲染精致卡片预览） */
function previewRowBlock({ name, badge, time, room, color, compact = false, active = false }) {
  const itemBg = `@drawable/course_widget_item_${color}_${active ? "active_" : ""}light`;
  const barBg = `@drawable/course_widget_bar_${color}`;
  const badgeBg = `@drawable/course_widget_badge_${color}_light`;
  const badgeColor = active ? "#FFFFFF" : "#0284C7";
  const badgeBgFinal = active ? barBg : badgeBg;
  if (compact) {
    return `
  <LinearLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"
      android:orientation="horizontal" android:gravity="center_vertical" android:layout_marginBottom="4dp"
      android:paddingLeft="7dp" android:paddingRight="7dp" android:paddingTop="3dp" android:paddingBottom="3dp"
      android:background="${itemBg}">
    <TextView android:layout_width="3dp" android:layout_height="match_parent" android:layout_marginTop="2dp" android:layout_marginBottom="2dp" android:background="${barBg}" />
    <LinearLayout android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content" android:orientation="vertical" android:paddingLeft="6dp">
      <TextView android:layout_width="match_parent" android:layout_height="wrap_content" android:text="${name}" android:maxLines="1" android:ellipsize="end" android:includeFontPadding="false" android:textSize="11sp" android:textStyle="bold" android:textColor="#172033" />
      <TextView android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="2dp" android:text="${time} · ${room}" android:maxLines="1" android:ellipsize="end" android:includeFontPadding="false" android:textSize="9sp" android:textColor="#64748B" />
    </LinearLayout>
  </LinearLayout>`;
  }
  return `
  <LinearLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"
      android:orientation="horizontal" android:gravity="center_vertical" android:layout_marginBottom="5dp"
      android:paddingLeft="10dp" android:paddingRight="10dp" android:paddingTop="4dp" android:paddingBottom="4dp"
      android:background="${itemBg}">
    <TextView android:layout_width="3.5dp" android:layout_height="match_parent" android:layout_marginTop="2dp" android:layout_marginBottom="2dp" android:background="${barBg}" />
    <LinearLayout android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content" android:orientation="vertical" android:paddingLeft="9dp">
      <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
        <TextView android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content" android:text="${name}" android:maxLines="1" android:ellipsize="end" android:includeFontPadding="false" android:textSize="12sp" android:textStyle="bold" android:textColor="#172033" />
        <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginLeft="6dp" android:paddingLeft="6dp" android:paddingRight="6dp" android:paddingTop="1.5dp" android:paddingBottom="1.5dp" android:text="${badge}" android:includeFontPadding="false" android:textSize="9sp" android:textStyle="bold" android:textColor="${badgeColor}" android:background="${badgeBgFinal}" />
      </LinearLayout>
      <TextView android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="2.5dp" android:text="${time} · ${room}" android:maxLines="1" android:ellipsize="end" android:includeFontPadding="false" android:textSize="9.5sp" android:textColor="#64748B" />
    </LinearLayout>
  </LinearLayout>`;
}

const previewSquareLayout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@android:id/background"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:paddingLeft="10dp"
    android:paddingRight="10dp"
    android:paddingTop="8dp"
    android:paddingBottom="4dp"
    android:background="@drawable/course_widget_bg_default_porcelain_light">
  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical" android:layout_marginBottom="5dp">
    <TextView android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content" android:text="我的课表" android:maxLines="1" android:ellipsize="end" android:includeFontPadding="false" android:textSize="11.5sp" android:textStyle="bold" android:textColor="#172033" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="周三" android:includeFontPadding="false" android:textSize="10sp" android:textStyle="bold" android:textColor="#0284C7" />
  </LinearLayout>${previewRowBlock({ name: "高等数学", time: "08:00", room: "教三-201", color: "sky", compact: true, active: true })}${previewRowBlock({ name: "数据结构", time: "10:05", room: "信息B305", color: "violet", compact: true })}
</LinearLayout>`;

const previewRectangleLayout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@android:id/background"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:paddingLeft="15dp"
    android:paddingRight="15dp"
    android:paddingTop="12dp"
    android:paddingBottom="7dp"
    android:background="@drawable/course_widget_bg_default_porcelain_light">
  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical" android:layout_marginBottom="8dp">
    <TextView android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content" android:text="Dark Study 课表" android:maxLines="1" android:ellipsize="end" android:includeFontPadding="false" android:textSize="13sp" android:textStyle="bold" android:textColor="#172033" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="11.25 第11周" android:includeFontPadding="false" android:textSize="11sp" android:textColor="#64748B" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginLeft="4dp" android:text="周三" android:includeFontPadding="false" android:textSize="11sp" android:textStyle="bold" android:textColor="#0284C7" />
  </LinearLayout>${previewRowBlock({ name: "高等数学 (上)", badge: "上课中", time: "08:00–09:45", room: "教三-201", color: "sky", active: true })}${previewRowBlock({ name: "数据结构与算法", badge: "下节课", time: "10:05–11:50", room: "信息楼 B305", color: "violet" })}
</LinearLayout>`;

const previewLargeLayout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@android:id/background"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:paddingLeft="15dp"
    android:paddingRight="15dp"
    android:paddingTop="13dp"
    android:paddingBottom="8dp"
    android:background="@drawable/course_widget_bg_default_porcelain_light">
  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical" android:layout_marginBottom="9dp">
    <TextView android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content" android:text="Dark Study 课表" android:maxLines="1" android:ellipsize="end" android:includeFontPadding="false" android:textSize="13.5sp" android:textStyle="bold" android:textColor="#172033" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="11.25 第11周" android:includeFontPadding="false" android:textSize="11sp" android:textColor="#64748B" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginLeft="4dp" android:text="周三" android:includeFontPadding="false" android:textSize="11sp" android:textStyle="bold" android:textColor="#0284C7" />
  </LinearLayout>${previewRowBlock({ name: "高等数学 (上)", badge: "上课中", time: "08:00–09:45", room: "教三-201", color: "sky", active: true })}${previewRowBlock({ name: "数据结构与算法", badge: "下节课", time: "10:05–11:50", room: "信息楼 B305", color: "violet" })}${previewRowBlock({ name: "大学物理实验", badge: "今天", time: "14:00–15:45", room: "实验楼 A402", color: "emerald" })}${previewRowBlock({ name: "计算机组成原理", badge: "明天", time: "08:00–09:45", room: "教一-108", color: "amber" })}
</LinearLayout>`;

/** 矢量 previewImage 兜底（部分桌面选择器在 API < 31 或缩略图列表时使用） */
function previewVectorXml(widthDp, heightDp, rows) {
  const vw = widthDp;
  const vh = heightDp;
  const pad = 12;
  const headerY = 14;
  const rowGap = 7;
  const topY = 32;
  const availH = vh - topY - pad - rowGap * (rows.length - 1);
  const rowH = Math.max(28, Math.floor(availH / rows.length));
  const rowPaths = rows
    .map((color, index) => {
      const y = topY + index * (rowH + rowGap);
      const x = pad;
      const w = vw - pad * 2;
      const r = 10;
      return `
  <path android:fillColor="${androidColor(color, "1F")}"
      android:pathData="M${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + rowH - r} Q${x + w},${y + rowH} ${x + w - r},${y + rowH} L${x + r},${y + rowH} Q${x},${y + rowH} ${x},${y + rowH - r} L${x},${y + r} Q${x},${y} ${x + r},${y} Z" />
  <path android:fillColor="${color}"
      android:pathData="M${x + 8},${y + 7} L${x + 11.5},${y + 7} L${x + 11.5},${y + rowH - 7} L${x + 8},${y + rowH - 7} Z" />
  <path android:fillColor="#1E293B"
      android:pathData="M${x + 18},${y + 9} L${x + Math.min(w - 18, Math.round(w * 0.58))},${y + 9} L${x + Math.min(w - 18, Math.round(w * 0.58))},${y + 15} L${x + 18},${y + 15} Z" />
  <path android:fillColor="#94A3B8"
      android:pathData="M${x + 18},${y + 20} L${x + Math.min(w - 18, Math.round(w * 0.42))},${y + 20} L${x + Math.min(w - 18, Math.round(w * 0.42))},${y + 24.5} L${x + 18},${y + 24.5} Z" />`;
    })
    .join("");
  const cr = 20;
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${widthDp}dp"
    android:height="${heightDp}dp"
    android:viewportWidth="${vw}"
    android:viewportHeight="${vh}">
  <path android:fillColor="#F2F6FC" android:strokeColor="#CBD5E1" android:strokeWidth="1.2"
      android:pathData="M${cr},1 L${vw - cr},1 Q${vw - 1},1 ${vw - 1},${cr} L${vw - 1},${vh - cr} Q${vw - 1},${vh - 1} ${vw - cr},${vh - 1} L${cr},${vh - 1} Q1,${vh - 1} 1,${vh - cr} L1,${cr} Q1,1 ${cr},1 Z" />
  <path android:fillColor="#172033"
      android:pathData="M${pad},${headerY} L${pad + 54},${headerY} L${pad + 54},${headerY + 7} L${pad},${headerY + 7} Z" />
  <path android:fillColor="#0284C7"
      android:pathData="M${vw - pad - 28},${headerY + 1} L${vw - pad},${headerY + 1} L${vw - pad},${headerY + 6.5} L${vw - pad - 28},${headerY + 6.5} Z" />${rowPaths}
</vector>`;
}

function upsertReceiver(list, entry) {
  const name = entry.$["android:name"];
  const idx = list.findIndex((r) => r.$ && r.$["android:name"] === name);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
}

function withCourseWidgets(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest["uses-permission"] ??= [];
    if (!manifest["uses-permission"].some((p) => p.$["android:name"] === "android.permission.RECEIVE_BOOT_COMPLETED")) {
      manifest["uses-permission"].push({ $: { "android:name": "android.permission.RECEIVE_BOOT_COMPLETED" } });
    }
    const app = manifest.application[0];
    app.receiver ??= [];
    for (const shape of shapes) {
      const name = `.${shape.name}CourseWidget`;
      const slug = shape.name.toLowerCase();
      // 关键修复：
      // 1. android:exported="true" + android:enabled="true"：Android 12+ 与小米澎湃 OS (com.miui.home / 负一屏)
      //    需要跨进程发现并绑定 AppWidgetProvider；此前 exported="false" 导致桌面长按小组件选择器与负一屏完全不可见。
      // 2. 同时监听标准 APPWIDGET_UPDATE 与小米 miui.appwidget.action.APPWIDGET_UPDATE 曝光刷新广播。
      // 3. 刻意不添加 miuiWidget="true"：经小米开放平台规范与实测，未上架小米应用商店并过审 widget.xiaomi.com
      //    的侧载安装包若声明 miuiWidget="true"，会被从系统「安卓小部件」池排除且无云端卡片配置，反而导致两边都找不到。
      upsertReceiver(app.receiver, {
        $: {
          "android:name": name,
          "android:enabled": "true",
          "android:exported": "true",
          "android:icon": "@mipmap/ic_launcher",
          "android:label": `@string/course_widget_${slug}_label`,
        },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } },
              { $: { "android:name": "miui.appwidget.action.APPWIDGET_UPDATE" } },
            ],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.appwidget.provider",
              "android:resource": `@xml/course_widget_${slug}`,
            },
          },
        ],
      });
    }
    upsertReceiver(app.receiver, {
      $: {
        "android:name": ".CourseWidgetRefreshReceiver",
        "android:enabled": "true",
        "android:exported": "false",
      },
      "intent-filter": [
        {
          action: ["BOOT_COMPLETED", "TIME_SET", "TIMEZONE_CHANGED", "MY_PACKAGE_REPLACED"].map((action) => ({
            $: { "android:name": `android.intent.action.${action}` },
          })),
        },
      ],
    });
    return cfg;
  });

  config = withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== "kt") throw new Error("Course widgets require a Kotlin MainApplication");
    if (!cfg.modResults.contents.includes("add(CourseWidgetPackage())")) {
      const marker = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!marker.test(cfg.modResults.contents)) throw new Error("Could not register CourseWidgetPackage");
      cfg.modResults.contents = cfg.modResults.contents.replace(marker, "$&\n          add(CourseWidgetPackage())");
    }
    return cfg;
  });

  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const root = path.join(cfg.modRequest.platformProjectRoot, "app/src/main");
      const pkg = cfg.android.package;
      const write = (relative, content) => {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
      };

      write(
        `java/${pkg.replaceAll(".", "/")}/CourseWidget.kt`,
        fs.readFileSync(path.join(__dirname, "course-widget/CourseWidget.kt"), "utf8").replaceAll("__PACKAGE__", pkg),
      );

      write(
        "res/values/course_widget_strings.xml",
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
${shapes.map((s) => `  <string name="course_widget_${s.name.toLowerCase()}_label">Dark Study · ${s.label}</string>`).join("\n")}
${shapes.map((s) => `  <string name="course_widget_description_${s.name.toLowerCase()}">${s.description}</string>`).join("\n")}
  <string name="course_widget_description">显示当前课表正在上和接下来的课程，点击打开课表</string>
</resources>`,
      );

      for (const s of shapes) {
        const slug = s.name.toLowerCase();
        write(
          `res/xml/course_widget_${slug}.xml`,
          `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="${s.width}dp"
    android:minHeight="${s.height}dp"
    android:targetCellWidth="${s.x}"
    android:targetCellHeight="${s.y}"
    android:minResizeWidth="${s.minResizeWidth}dp"
    android:minResizeHeight="${s.minResizeHeight}dp"
    android:maxResizeWidth="${s.maxResizeWidth}dp"
    android:maxResizeHeight="${s.maxResizeHeight}dp"
    android:resizeMode="horizontal|vertical"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/course_widget"
    android:previewLayout="@layout/course_widget_preview_${slug}"
    android:previewImage="@drawable/course_widget_preview_img_${slug}"
    android:description="@string/course_widget_description_${slug}"
    android:widgetCategory="home_screen" />`,
        );
      }

      // 每种主题色 × 表面质感（清透玻璃 / 澎湃瓷卡 / 主题彩卡）× 深浅模式生成圆角渐变卡片
      for (const accent of accents) {
        for (const theme of themes) {
          const isDark = theme === "dark";
          for (const style of styles) {
            let startHex;
            let endHex;
            let strokeHex;
            if (style === "porcelain") {
              startHex = androidColor(isDark ? accent.porcelainDark : accent.porcelainLight, "F5");
              endHex = androidColor(isDark ? accent.porcelainDarkEnd : accent.porcelainLightEnd, "F5");
              strokeHex = androidColor(isDark ? accent.borderDark : accent.borderLight, isDark ? "5C" : "8C");
            } else if (style === "frosted") {
              startHex = androidColor(isDark ? accent.bgDark : accent.porcelainLight, isDark ? "D6" : "DB");
              endHex = androidColor(isDark ? accent.bgDarkEnd : accent.bgLight, isDark ? "E0" : "E0");
              strokeHex = androidColor(isDark ? accent.borderDark : accent.borderLight, isDark ? "9E" : "B8");
            } else {
              startHex = androidColor(isDark ? accent.bgDark : accent.bgLight, "FA");
              endHex = androidColor(isDark ? accent.bgDarkEnd : accent.bgLightEnd, "FA");
              strokeHex = androidColor(isDark ? accent.borderDark : accent.borderLight, "E6");
            }
            write(
              `res/drawable/course_widget_bg_${accent.key}_${style}_${theme}.xml`,
              cardShapeXml(startHex, endHex, strokeHex, 24),
            );
          }
          // 兼容旧资源命名 course_widget_bg_<accent>_<theme>
          write(
            `res/drawable/course_widget_bg_${accent.key}_${theme}.xml`,
            cardShapeXml(
              androidColor(isDark ? accent.bgDark : accent.bgLight, "FA"),
              androidColor(isDark ? accent.bgDarkEnd : accent.bgLightEnd, "FA"),
              androidColor(isDark ? accent.borderDark : accent.borderLight, "E6"),
              24,
            ),
          );
        }
      }

      // 课程圆角底卡、进行中高亮底卡、左侧圆角彩条、状态胶囊底色（纯 XML shape，零位图内存）
      for (const c of courseColors) {
        write(`res/drawable/course_widget_bar_${c.key}.xml`, solidShapeXml(c.solid, 4));
        write(
          `res/drawable/course_widget_item_${c.key}_light.xml`,
          solidShapeXml(androidColor(c.solid, "1A"), 14, androidColor(c.solid, "30")),
        );
        write(
          `res/drawable/course_widget_item_${c.key}_dark.xml`,
          solidShapeXml(androidColor(c.solid, "22"), 14, androidColor(c.solid, "38")),
        );
        write(
          `res/drawable/course_widget_item_${c.key}_active_light.xml`,
          solidShapeXml(androidColor(c.solid, "2B"), 14, androidColor(c.solid, "73")),
        );
        write(
          `res/drawable/course_widget_item_${c.key}_active_dark.xml`,
          solidShapeXml(androidColor(c.solid, "36"), 14, androidColor(c.solid, "88")),
        );
        write(
          `res/drawable/course_widget_badge_${c.key}_light.xml`,
          solidShapeXml(androidColor(c.solid, "24"), 8),
        );
        write(
          `res/drawable/course_widget_badge_${c.key}_dark.xml`,
          solidShapeXml(androidColor(c.solid, "30"), 8),
        );
      }

      // 兜底旧背景资源
      const fallback = accents[0];
      write(
        "res/drawable/course_widget_dark.xml",
        cardShapeXml(androidColor(fallback.bgDark, "D6"), androidColor(fallback.bgDarkEnd, "E0"), androidColor(fallback.borderDark, "9E"), 24),
      );
      write(
        "res/drawable/course_widget_light.xml",
        cardShapeXml(androidColor(fallback.porcelainLight, "DB"), androidColor(fallback.bgLight, "E0"), androidColor(fallback.borderLight, "B8"), 24),
      );
      write("res/drawable/course_widget_hint_pill_light.xml", solidShapeXml("#140F172A", 10));
      write("res/drawable/course_widget_hint_pill_dark.xml", solidShapeXml("#1FFFFFFF", 10));

      // 矢量预览图（兜底）
      write("res/drawable/course_widget_preview_img_square.xml", previewVectorXml(140, 140, ["#38BDF8", "#A78BFA"]));
      write("res/drawable/course_widget_preview_img_rectangle.xml", previewVectorXml(260, 132, ["#38BDF8", "#A78BFA"]));
      write("res/drawable/course_widget_preview_img_large.xml", previewVectorXml(260, 250, ["#38BDF8", "#A78BFA", "#34D399", "#FBBF24"]));

      write(
        "res/values/course_widget_colors.xml",
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
${accents
  .flatMap((accent) => [
    `  <color name="course_widget_brand_${accent.key}_dark">${accent.brandDark}</color>`,
    `  <color name="course_widget_brand_${accent.key}_light">${accent.brandLight}</color>`,
  ])
  .join("\n")}
</resources>`,
      );

      // 动态资源由 Kotlin 通过 getIdentifier 按名称取用，必须显式保留防止 release shrinkResources 误删
      write(
        "res/raw/course_widget_keep.xml",
        `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools"
    tools:keep="@drawable/course_widget_*,@color/course_widget_*,@layout/course_widget_*" />`,
      );

      write("res/layout/course_widget.xml", widgetLayout);
      write("res/layout/course_widget_row.xml", rowLayout);
      write("res/layout/course_widget_row_compact.xml", rowCompactLayout);
      write("res/layout/course_widget_preview_square.xml", previewSquareLayout);
      write("res/layout/course_widget_preview_rectangle.xml", previewRectangleLayout);
      write("res/layout/course_widget_preview_large.xml", previewLargeLayout);

      return cfg;
    },
  ]);
}

module.exports = withCourseWidgets;
