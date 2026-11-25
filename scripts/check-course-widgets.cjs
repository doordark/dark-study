const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const cache = new Map();
const calls = [];
function load(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const target = new Module(filename, module);
  cache.set(filename, target);
  target.require = (request) => {
    if (request === "react-native") {
      return {
        Platform: { OS: "android" },
        NativeModules: {
          CourseWidget: {
            sync: async (payload) => calls.push(JSON.parse(payload)),
            pin: async (shape) => shape === "large",
          },
        },
      };
    }
    if (request.startsWith("@/")) return load(`src/${request.slice(2)}.ts`);
    if (request.endsWith(".json")) {
      return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename), request), "utf8"));
    }
    return require(request);
  };
  target._compile(compiled.outputText, filename);
  return target.exports;
}

async function run() {
  const {
    upcomingWidgetCourses: upcoming,
    todayWidgetCourses,
    widgetDayLabel,
    widgetMeta,
    widgetAccentColors,
  } = load("src/utils/courseWidget.ts");

  const base = {
    id: "term",
    name: "秋季",
    kind: "fall",
    startDate: "2026-11-02",
    endDate: "2026-11-15",
    totalWeeks: 2,
    periods: [
      { index: 1, startTime: "08:00", endTime: "08:45" },
      { index: 2, startTime: "09:00", endTime: "09:45" },
    ],
    courses: [
      {
        id: "math",
        name: "高数",
        teacher: "老师",
        classroom: "A101",
        weekday: 2,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [1, 1, 2],
        color: "sky",
      },
    ],
  };

  const now = new Date("2026-11-03T08:30:00");
  const rows = upcoming(base, now);
  assert.equal(rows.length, 2, "deduplicate weeks, retain current and next-week lessons");
  assert.equal(rows[0].classroom, "A101");
  assert.equal(rows[0].time, "08:00–09:45");
  assert(rows[0].start <= +now && rows[0].end > +now, "ongoing lesson remains visible");
  assert.equal(todayWidgetCourses(rows, now).length, 1, "today filter keeps only today's lessons");
  assert.equal(
    todayWidgetCourses(rows, new Date("2026-11-04T08:00:00")).length,
    0,
    "today filter returns empty when today has no lessons",
  );
  assert.equal(upcoming(base, new Date("2026-11-03T09:45:00")).length, 1, "drop lesson at its end boundary");
  assert.equal(rows[0].color, "sky", "course theme colour reaches the widget");
  assert.equal(widgetDayLabel(rows[0].start, now), "今天");
  assert.equal(widgetDayLabel(rows[0].start, new Date("2026-11-02T23:59:00")), "明天");
  assert.equal(widgetDayLabel(rows[1].start, now), "11/10 周二");
  assert.equal(widgetMeta(base, now), "11.3 第1周 周二");
  assert.equal(widgetMeta(base, now, true), "11.3 周二", "compact meta omits week number");
  assert.equal(widgetMeta({ ...base, totalWeeks: 0 }, now), "11.3 周二", "outside the semester only date and weekday");
  assert.equal(widgetMeta(undefined, now), "11.3 周二");

  // Palette & surface style checks
  const greenDark = widgetAccentColors("green", "dark", true, "tinted");
  const greenLight = widgetAccentColors("green", "light", false, "tinted");
  const greenPorcelain = widgetAccentColors("green", "light", false, "porcelain");
  const greenFrosted = widgetAccentColors("green", "dark", true, "frosted");
  assert.equal(greenDark.background, "#102D2A");
  assert.equal(greenLight.brand, "#059669");
  assert.equal(widgetAccentColors("green", "system", true, "tinted").background, "#102D2A");
  assert.equal(widgetAccentColors("green", "system", false, "tinted").brand, "#059669");
  assert(greenPorcelain.background.startsWith("rgba("), "porcelain style produces translucent tint");
  assert(greenFrosted.background.startsWith("rgba("), "frosted style produces translucent glass tint");
  assert.deepEqual(widgetAccentColors("unknown", "dark"), widgetAccentColors("default", "dark"));

  // Native Kotlin & Config Plugin HyperOS / Android 12+ compatibility checks
  const kt = fs.readFileSync(path.resolve(__dirname, "..", "plugins/course-widget/CourseWidget.kt"), "utf8");
  assert(kt.includes('nonBlank(course, "startTime")') && kt.includes('nonBlank(course, "endTime")'), "native widget reads exact course startTime/endTime");
  assert(kt.includes("setTextColor(R.id.widget_title, ink)"), "native widget sets title color for light/dark contrast");
  assert(kt.includes('nonBlank(schedule, "name")'), "native widget falls back on empty schedule name");
  assert(kt.includes("UI_MODE_NIGHT_MASK"), "native widget supports system theme");
  assert(kt.includes("nextMidnight"), "native widget schedules midnight refresh");
  assert(kt.includes('miui.appwidget.action.APPWIDGET_UPDATE'), "native provider handles Xiaomi exposure refresh broadcast");
  assert(kt.includes("buildPreview(context, provider)"), "in-app pin renders real populated preview");
  assert(kt.includes("isHyperOs"), "native status reports HyperOS detection");
  assert(kt.includes("今天没有课啦") && kt.includes("(〃'▽'〃)"), "native widget supports cute free-day empty state");
  assert(kt.includes("WIDE_MIN_ROW_HEIGHT = 48"), "wide cards enforce >= 48dp slot height to avoid CJK clipping");
  assert(kt.includes("COMPACT_MIN_ROW_HEIGHT = 46"), "compact cards enforce >= 46dp slot height to avoid CJK clipping");
  assert(kt.includes(".coerceIn(44f, 74f)") && kt.includes(".coerceIn(42f, 64f)"), "row card height floors prevent vertical clipping");

  const settingsSrc = fs.readFileSync(path.resolve(__dirname, "..", "src/components/CourseWidgetSettings.tsx"), "utf8");
  assert(settingsSrc.includes("mountedRef") && settingsSrc.includes("pollTimerRef"), "CourseWidgetSettings guards polling loop against unmount");

  const pluginSrc = fs.readFileSync(path.resolve(__dirname, "..", "plugins/withCourseWidgets.js"), "utf8");
  assert(pluginSrc.includes('"android:exported": "true"'), "widget receivers must be exported=true for HyperOS & Android 12+ widget pickers");
  assert(pluginSrc.includes('"android:enabled": "true"'), "widget receivers must be explicitly enabled");
  assert(pluginSrc.includes("upsertReceiver"), "config plugin must upsert receivers so prebuild updates stale manifest entries");
  assert(pluginSrc.includes('android:previewLayout="@layout/course_widget_preview_${slug}"'), "each widget size declares dedicated previewLayout");
  assert(pluginSrc.includes('android:previewImage="@drawable/course_widget_preview_img_${slug}"'), "each widget size declares dedicated previewImage");
  assert(pluginSrc.includes('android:id="@android:id/background"'), "root widget view uses @android:id/background for Android 12+ corner clipping");
  assert(!pluginSrc.includes('name="miuiWidget"'), "sideloaded APK must not declare miuiWidget=true which hides it from Android widgets picker");
  assert(!pluginSrc.includes("hide_from_picker"), "widgetFeatures must not hide widgets from picker");
  assert(!/<View\b/.test(pluginSrc), "RemoteViews layouts must not use bare <View> elements");

  // Full config-plugin dry-run: verify manifest upsert and every generated XML / Kotlin R.* reference
  const os = require("node:os");
  const withCourseWidgets = require(path.resolve(__dirname, "..", "plugins/withCourseWidgets.js"));
  const configured = withCourseWidgets({ android: { package: "com.darkstudy.app" }, mods: {} });
  const manifestCfg = await configured.mods.android.manifest({
    ...configured,
    modResults: {
      manifest: {
        "uses-permission": [],
        application: [
          {
            receiver: [
              { $: { "android:name": ".SquareCourseWidget", "android:exported": "false", "android:label": "old" } },
              { $: { "android:name": ".RectangleCourseWidget", "android:exported": "false", "android:label": "old" } },
              { $: { "android:name": ".LargeCourseWidget", "android:exported": "false", "android:label": "old" } },
              { $: { "android:name": ".CourseWidgetRefreshReceiver", "android:exported": "false" } },
            ],
          },
        ],
      },
    },
  });
  const receivers = manifestCfg.modResults.manifest.application[0].receiver;
  assert.equal(receivers.length, 4, "manifest upsert must not duplicate receivers");
  for (const name of [".SquareCourseWidget", ".RectangleCourseWidget", ".LargeCourseWidget"]) {
    const r = receivers.find((x) => x.$["android:name"] === name);
    assert(r, `missing receiver ${name}`);
    assert.equal(r.$["android:exported"], "true", `${name} must be exported=true`);
    assert.equal(r.$["android:enabled"], "true", `${name} must be enabled=true`);
    assert.equal(r.$["android:icon"], "@mipmap/ic_launcher", `${name} must declare launcher icon`);
    const actions = r["intent-filter"][0].action.map((a) => a.$["android:name"]);
    assert(actions.includes("android.appwidget.action.APPWIDGET_UPDATE"));
    assert(actions.includes("miui.appwidget.action.APPWIDGET_UPDATE"));
    const metaNames = r["meta-data"].map((m) => m.$["android:name"]);
    assert(metaNames.includes("android.appwidget.provider"));
    assert(!metaNames.includes("miuiWidget"), "must not inject miuiWidget=true for sideloaded APK");
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dark-study-widget-dryrun-"));
  try {
    await configured.mods.android.dangerous({
      ...configured,
      modRequest: { platformProjectRoot: tmpRoot },
    });
    const resRoot = path.join(tmpRoot, "app/src/main/res");
    const generatedKt = fs.readFileSync(path.join(tmpRoot, "app/src/main/java/com/darkstudy/app/CourseWidget.kt"), "utf8");
    assert(!generatedKt.includes("__PACKAGE__"), "generated Kotlin replaces package placeholder");
    assert(generatedKt.startsWith("package com.darkstudy.app"), "generated Kotlin has valid package header");

    const allXmlFiles = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else allXmlFiles.push(full);
      }
    };
    walk(resRoot);

    const drawables = new Set(fs.readdirSync(path.join(resRoot, "drawable")).map((f) => f.replace(/\.xml$/, "")));
    const layouts = new Set(fs.readdirSync(path.join(resRoot, "layout")).map((f) => f.replace(/\.xml$/, "")));
    const xmlProviders = new Set(fs.readdirSync(path.join(resRoot, "xml")).map((f) => f.replace(/\.xml$/, "")));
    const strings = new Set(
      [...fs.readFileSync(path.join(resRoot, "values/course_widget_strings.xml"), "utf8").matchAll(/name="([^"]+)"/g)].map((m) => m[1]),
    );
    const colors = new Set(
      [...fs.readFileSync(path.join(resRoot, "values/course_widget_colors.xml"), "utf8").matchAll(/name="([^"]+)"/g)].map((m) => m[1]),
    );
    const ids = new Set();

    for (const file of allXmlFiles) {
      const content = fs.readFileSync(file, "utf8");
      assert(content.trim().startsWith("<?xml"), `${path.basename(file)} starts with XML declaration`);
      if (path.basename(file) === "course_widget_keep.xml") {
        assert(content.includes("@drawable/course_widget_*"), "keep.xml preserves dynamic widget drawables");
        continue;
      }
      for (const m of content.matchAll(/@\+id\/([a-zA-Z0-9_]+)/g)) ids.add(m[1]);
      for (const m of content.matchAll(/@drawable\/([a-zA-Z0-9_]+)/g)) {
        assert(drawables.has(m[1]), `Missing @drawable/${m[1]} in ${path.basename(file)}`);
      }
      for (const m of content.matchAll(/@layout\/([a-zA-Z0-9_]+)/g)) {
        assert(layouts.has(m[1]), `Missing @layout/${m[1]} in ${path.basename(file)}`);
      }
      for (const m of content.matchAll(/@string\/([a-zA-Z0-9_]+)/g)) {
        assert(strings.has(m[1]), `Missing @string/${m[1]} in ${path.basename(file)}`);
      }
      for (const m of content.matchAll(/@color\/([a-zA-Z0-9_]+)/g)) {
        assert(colors.has(m[1]), `Missing @color/${m[1]} in ${path.basename(file)}`);
      }
      if (file.includes(`${path.sep}layout${path.sep}`)) {
        assert(!/<View\b/.test(content), `Bare <View> not allowed in RemoteViews layout ${path.basename(file)}`);
      }
    }

    for (const m of generatedKt.matchAll(/(?<!android\.)\bR\.id\.([a-zA-Z0-9_]+)/g)) {
      assert(ids.has(m[1]), `Kotlin references missing R.id.${m[1]}`);
    }
    for (const m of generatedKt.matchAll(/\bR\.layout\.([a-zA-Z0-9_]+)/g)) {
      assert(layouts.has(m[1]), `Kotlin references missing R.layout.${m[1]}`);
    }
    for (const m of generatedKt.matchAll(/\bR\.drawable\.([a-zA-Z0-9_]+)/g)) {
      assert(drawables.has(m[1]), `Kotlin references missing R.drawable.${m[1]}`);
    }
    for (const slug of ["square", "rectangle", "large"]) {
      assert(xmlProviders.has(`course_widget_${slug}`), `missing provider xml for ${slug}`);
      assert(layouts.has(`course_widget_preview_${slug}`), `missing preview layout for ${slug}`);
      assert(drawables.has(`course_widget_preview_img_${slug}`), `missing preview vector for ${slug}`);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  // Recurrence edge cases
  assert.equal(upcoming(base, new Date("2026-11-16T00:00:00")).length, 0, "semester ended");
  assert.deepEqual(upcoming(undefined, now), []);
  assert.deepEqual(upcoming({ ...base, courses: [] }, now), []);
  assert.equal(upcoming({ ...base, endDate: "2026-11-09" }, now).length, 1, "respect last teaching date");
  assert.equal(upcoming({ ...base, startDate: "2026-11-04" }, now).length, 1, "anchor weeks to Monday but exclude dates before start");
  for (const patch of [{ weekday: 0 }, { weekday: 8 }, { startPeriod: 99 }, { endPeriod: 99 }, { weeks: [0, -1, 3, 1.5] }]) {
    assert.equal(upcoming({ ...base, courses: [{ ...base.courses[0], ...patch }] }, now).length, 0);
  }
  const invalidTime = { ...base, periods: [{ index: 1, startTime: "25:00", endTime: "09:00" }] };
  assert.equal(upcoming(invalidTime, now).length, 0);
  const multi = {
    ...base,
    courses: [
      { ...base.courses[0], id: "tomorrow", weekday: 3 },
      base.courses[0],
      { ...base.courses[0], id: "sunday", weekday: 7, weeks: [1] },
    ],
  };
  assert.deepEqual(
    upcoming(multi, now)
      .slice(0, 3)
      .map((r) => r.id),
    ["math-2026-11-03", "tomorrow-2026-11-04", "sunday-2026-11-08"],
  );

  // Native bridge sync checks (including 4-arg backwards compatibility + cached extras)
  const native = load("src/services/courseWidget.ts");
  native.setWidgetSyncExtras({ style: "porcelain", mode: "today" });
  await native.syncCourseWidgets(base, 4, "light", "green");
  await native.syncCourseWidgets(undefined, 2, "dark", "default", { style: "frosted", mode: "upcoming" });
  assert.equal(calls[0].schedule.id, "term");
  assert.equal(calls[0].count, 4);
  assert.equal(calls[0].accent, "green", "accent theme reaches native storage");
  assert.equal(calls[0].style, "porcelain", "cached surface style reaches native storage on 4-arg sync");
  assert.equal(calls[0].mode, "today", "cached display mode reaches native storage on 4-arg sync");
  assert.equal(calls[0].colorPalette.sky, "#38BDF8", "course palette reaches native storage");
  assert.equal(calls[1].schedule, null, "empty state replaces previous schedule");
  assert.equal(calls[1].style, "frosted");
  assert.equal(calls[1].mode, "upcoming");
  assert.equal(await native.pinCourseWidget("large"), true);
  assert.equal(await native.pinCourseWidget("square"), false, "unsupported pinning permits manual-add fallback");

  console.log(
    "Course widgets: recurrence, today filter, HyperOS manifest/plugin checks, palette/styles, and native sync passed.",
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
