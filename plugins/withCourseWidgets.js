const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod, withMainApplication } = require("@expo/config-plugins");

const shapes = [
  { name: "Square", label: "正方形", width: 110, height: 110, x: 2, y: 2 },
  { name: "Rectangle", label: "长方形", width: 250, height: 110, x: 4, y: 2 },
  { name: "Large", label: "大卡片", width: 250, height: 250, x: 4, y: 4 },
];

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
        android:initialLayout="@layout/course_widget" android:previewLayout="@layout/course_widget"
        android:description="@string/course_widget_description" android:widgetCategory="home_screen" />`);
    for (const [theme, bg, border] of [["dark", "#111D32", "#2C405C"], ["light", "#EDF5FF", "#CCDDEE"]]) {
      write(`res/drawable/course_widget_${theme}.xml`, `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="${bg}"/><corners android:radius="22dp"/><stroke android:width="1dp" android:color="${border}"/></shape>`);
    }
    write("res/layout/course_widget.xml", `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
      android:id="@+id/widget_root" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:padding="10dp" android:background="@drawable/course_widget_dark">
      <TextView android:id="@+id/widget_brand" android:layout_width="match_parent" android:layout_height="14dp"
        android:text="DARK STUDY  ↻" android:contentDescription="刷新桌面课表" android:textSize="9sp" android:textStyle="bold" android:textColor="#7DD3FC" />
      <TextView android:id="@+id/widget_title" android:layout_width="match_parent" android:layout_height="20dp"
        android:text="最近课程" android:maxLines="1" android:ellipsize="end" android:textSize="12sp" android:textStyle="bold" android:textColor="#F1F5F9" />
      <LinearLayout android:id="@+id/widget_courses" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" />
      <TextView android:id="@+id/widget_empty" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:layout_marginTop="10dp" android:text="打开 Dark Study 同步课表" android:textSize="11sp" android:textColor="#A5B4CF" />
    </LinearLayout>`);
    write("res/layout/course_widget_row.xml", `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
      android:layout_width="match_parent" android:layout_height="44dp" android:orientation="horizontal">
      <TextView android:layout_width="2dp" android:layout_height="34dp" android:layout_marginTop="3dp" android:background="#38BDF8" />
      <LinearLayout android:layout_width="0dp" android:layout_weight="1" android:layout_height="match_parent" android:orientation="vertical" android:paddingLeft="6dp">
        <TextView android:id="@+id/widget_course_name" android:layout_width="match_parent" android:layout_height="16dp" android:includeFontPadding="false" android:maxLines="1" android:ellipsize="end" android:textSize="12sp" android:textStyle="bold" />
        <TextView android:id="@+id/widget_course_time" android:layout_width="match_parent" android:layout_height="13dp" android:includeFontPadding="false" android:maxLines="1" android:ellipsize="end" android:textSize="9sp" />
        <TextView android:id="@+id/widget_course_room" android:layout_width="match_parent" android:layout_height="13dp" android:includeFontPadding="false" android:maxLines="1" android:ellipsize="end" android:textSize="9sp" />
      </LinearLayout>
    </LinearLayout>`);
    return cfg;
  }]);
}
module.exports = withCourseWidgets;
