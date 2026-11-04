const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod, withMainApplication } = require("@expo/config-plugins");

const shapes = [
  { name: "Square", label: "正方形", width: 110, height: 110, x: 2, y: 2 },
  { name: "Rectangle", label: "长方形", width: 250, height: 110, x: 4, y: 2 },
  { name: "Large", label: "大卡片", width: 250, height: 250, x: 4, y: 4 },
];

// 主题色与 src/constants/widgetPalette.json 共用同一份数据，保证原生组件和设置页预览一致
const accents = require("../src/constants/widgetPalette.json");
const themes = ["dark", "light"];

const widgetLayout = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
      android:id="@+id/widget_root" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:padding="10dp" android:background="@drawable/course_widget_dark">
      <LinearLayout android:id="@+id/widget_header" android:layout_width="match_parent" android:layout_height="16dp"
        android:orientation="horizontal" android:gravity="center_vertical">
        <TextView android:id="@+id/widget_brand" android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content"
          android:text="DARK STUDY  ↻" android:contentDescription="刷新桌面课表" android:maxLines="1" android:ellipsize="end"
          android:includeFontPadding="false" android:textSize="9sp" android:textStyle="bold" android:textColor="#7DD3FC" />
        <TextView android:id="@+id/widget_meta" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:layout_marginLeft="6dp" android:text="11.4 周三" android:maxLines="1" android:ellipsize="end"
          android:includeFontPadding="false" android:textSize="9sp" android:textColor="#A5B4CF" />
      </LinearLayout>
      <TextView android:id="@+id/widget_title" android:layout_width="match_parent" android:layout_height="20dp"
        android:text="最近课程" android:maxLines="1" android:ellipsize="end" android:includeFontPadding="false"
        android:textSize="12sp" android:textStyle="bold" android:textColor="#F1F5F9" />
      <LinearLayout android:id="@+id/widget_courses" android:layout_width="match_parent" android:layout_height="0dp"
        android:layout_weight="1" android:orientation="vertical" />
      <TextView android:id="@+id/widget_empty" android:layout_width="match_parent" android:layout_height="0dp"
        android:layout_weight="1" android:gravity="center" android:text="打开 Dark Study 同步课表"
        android:textSize="11sp" android:textColor="#A5B4CF" />
    </LinearLayout>`;

const rowLayout = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
      android:id="@+id/widget_course_row" android:layout_width="match_parent" android:layout_height="44dp"
      android:orientation="horizontal" android:gravity="center_vertical">
      <TextView android:id="@+id/widget_course_bar" android:layout_width="2dp" android:layout_height="match_parent"
        android:layout_marginTop="5dp" android:layout_marginBottom="5dp" android:background="#38BDF8" />
      <LinearLayout android:layout_width="0dp" android:layout_weight="1" android:layout_height="match_parent"
        android:orientation="vertical" android:gravity="center_vertical" android:paddingLeft="6dp">
        <TextView android:id="@+id/widget_course_name" android:layout_width="match_parent" android:layout_height="wrap_content"
          android:includeFontPadding="false" android:maxLines="1" android:ellipsize="end" android:textSize="12sp" android:textStyle="bold" />
        <TextView android:id="@+id/widget_course_time" android:layout_width="match_parent" android:layout_height="wrap_content"
          android:layout_marginTop="1dp" android:includeFontPadding="false" android:maxLines="1" android:ellipsize="end" android:textSize="9sp" />
        <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content"
          android:layout_marginTop="1dp" android:orientation="horizontal" android:gravity="center_vertical">
          <TextView android:id="@+id/widget_course_dot" android:layout_width="wrap_content" android:layout_height="wrap_content"
            android:layout_marginRight="3dp" android:text="●" android:includeFontPadding="false" android:textSize="7sp" android:textColor="#38BDF8" />
          <TextView android:id="@+id/widget_course_room" android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content"
            android:includeFontPadding="false" android:maxLines="1" android:ellipsize="end" android:textSize="9sp" />
        </LinearLayout>
      </LinearLayout>
    </LinearLayout>`;

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
      if (!app.receiver.some((r) => r.$["android:name"] === name)) app.receiver.push({
        $: { "android:name": name, "android:exported": "false", "android:label": `@string/course_widget_${shape.name.toLowerCase()}_label` },
        "intent-filter": [{ action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }] }],
        "meta-data": [{ $: { "android:name": "android.appwidget.provider", "android:resource": `@xml/course_widget_${shape.name.toLowerCase()}` } }],
      });
    }
    if (!app.receiver.some((r) => r.$["android:name"] === ".CourseWidgetRefreshReceiver")) app.receiver.push({
      $: { "android:name": ".CourseWidgetRefreshReceiver", "android:exported": "false" },
      "intent-filter": [{ action: ["BOOT_COMPLETED", "TIME_SET", "TIMEZONE_CHANGED", "MY_PACKAGE_REPLACED"].map((action) => ({ $: { "android:name": `android.intent.action.${action}` } })) }],
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
  return withDangerousMod(config, ["android", async (cfg) => {
    const root = path.join(cfg.modRequest.platformProjectRoot, "app/src/main");
    const pkg = cfg.android.package;
    const write = (relative, content) => {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    };
    write(`java/${pkg.replaceAll(".", "/")}/CourseWidget.kt`, fs.readFileSync(path.join(__dirname, "course-widget/CourseWidget.kt"), "utf8").replaceAll("__PACKAGE__", pkg));
    write("res/values/course_widget_strings.xml", `<resources>
      ${shapes.map((s) => `<string name="course_widget_${s.name.toLowerCase()}_label">Dark Study · ${s.label}</string>`).join("\n")}
      <string name="course_widget_description">显示当前课表正在上和接下来的课程，点击打开课表</string>
    </resources>`);
    for (const s of shapes) write(`res/xml/course_widget_${s.name.toLowerCase()}.xml`, `<?xml version="1.0" encoding="utf-8"?>
      <appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
        android:minWidth="${s.width}dp" android:minHeight="${s.height}dp"
        android:targetCellWidth="${s.x}" android:targetCellHeight="${s.y}"
        android:minResizeWidth="110dp" android:minResizeHeight="110dp"
        android:resizeMode="horizontal|vertical" android:updatePeriodMillis="1800000"
        android:initialLayout="@layout/course_widget" android:previewLayout="@layout/course_widget" android:previewImage="@mipmap/ic_launcher"
        android:description="@string/course_widget_description" android:widgetCategory="home_screen" />`);
    // 每种主题色 × 深浅模式各生成一个圆角背景，原生端按 resource name 取用
    for (const accent of accents) {
      for (const theme of themes) {
        const bg = theme === "dark" ? accent.bgDark : accent.bgLight;
        const border = theme === "dark" ? accent.borderDark : accent.borderLight;
        write(`res/drawable/course_widget_bg_${accent.key}_${theme}.xml`, `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="${bg}"/><corners android:radius="22dp"/><stroke android:width="1dp" android:color="${border}"/></shape>`);
      }
    }
    // 兼容旧版已添加的组件与 initialLayout
    const fallback = accents[0];
    write("res/drawable/course_widget_dark.xml", `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="${fallback.bgDark}"/><corners android:radius="22dp"/><stroke android:width="1dp" android:color="${fallback.borderDark}"/></shape>`);
    write("res/drawable/course_widget_light.xml", `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="${fallback.bgLight}"/><corners android:radius="22dp"/><stroke android:width="1dp" android:color="${fallback.borderLight}"/></shape>`);
    write("res/values/course_widget_colors.xml", `<resources>
      ${accents.flatMap((accent) => [
        `<color name="course_widget_brand_${accent.key}_dark">${accent.brandDark}</color>`,
        `<color name="course_widget_brand_${accent.key}_light">${accent.brandLight}</color>`,
      ]).join("\n      ")}
    </resources>`);
    // 主题色资源由 Kotlin 通过 getIdentifier 动态取用，需显式声明防止 release 资源压缩误删
    write("res/raw/course_widget_keep.xml", `<?xml version="1.0" encoding="utf-8"?>
      <resources xmlns:tools="http://schemas.android.com/tools"
        tools:keep="@drawable/course_widget_bg_*,@color/course_widget_brand_*" />`);
    write("res/layout/course_widget.xml", widgetLayout);
    write("res/layout/course_widget_row.xml", rowLayout);
    return cfg;
  }]);
}
module.exports = withCourseWidgets;
