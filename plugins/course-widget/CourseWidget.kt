package __PACKAGE__

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class CourseWidgetPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(CourseWidgetModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class CourseWidgetModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "CourseWidget"

  private fun readSystemProp(key: String): String {
    return try {
      val cls = Class.forName("android.os.SystemProperties")
      val get = cls.getMethod("get", String::class.java, String::class.java)
      (get.invoke(null, key, "") as? String)?.trim().orEmpty()
    } catch (_: Exception) {
      ""
    }
  }

  @ReactMethod
  fun status(promise: Promise) {
    try {
      val manager = AppWidgetManager.getInstance(context)
      val names = listOf(SquareCourseWidget::class.java, RectangleCourseWidget::class.java, LargeCourseWidget::class.java)
      val registered = manager.installedProviders.map { it.provider }.toSet()
      val hyperVersion = readSystemProp("ro.mi.os.version.name")
      val miuiVersion = readSystemProp("ro.miui.ui.version.name")
      val isXiaomiFamily = Build.MANUFACTURER.equals("Xiaomi", ignoreCase = true) ||
        Build.BRAND.equals("Redmi", ignoreCase = true) ||
        Build.BRAND.equals("POCO", ignoreCase = true) ||
        hyperVersion.isNotEmpty() || miuiVersion.isNotEmpty()
      val result = com.facebook.react.bridge.Arguments.createMap()
      result.putInt("registered", names.count { registered.contains(ComponentName(context, it)) })
      result.putInt("installed", names.sumOf { manager.getAppWidgetIds(ComponentName(context, it)).size })
      result.putBoolean("pinSupported", Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported)
      result.putString("manufacturer", Build.MANUFACTURER)
      result.putString("brand", Build.BRAND)
      result.putInt("sdkInt", Build.VERSION.SDK_INT)
      result.putBoolean("isHyperOs", isXiaomiFamily)
      result.putString("hyperOsVersion", hyperVersion.ifEmpty { miuiVersion })
      promise.resolve(result)
    } catch (error: Exception) { promise.reject("WIDGET_STATUS", error) }
  }

  @ReactMethod
  fun openPermissions(promise: Promise) {
    try {
      val intent = Intent("miui.intent.action.APP_PERM_EDITOR")
        .setPackage("com.miui.securitycenter").putExtra("extra_pkgname", context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try { context.startActivity(intent) } catch (_: Exception) {
        context.startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          android.net.Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("WIDGET_SETTINGS", error) }
  }

  @ReactMethod
  fun sync(payload: String, promise: Promise) {
    try {
      val incoming = JSONObject(payload) // Reject invalid JSON before replacing the saved schedule.
      val prefs = context.getSharedPreferences(CourseWidgetEngine.PREFS, Context.MODE_PRIVATE)
      // Preserve previously selected style/mode when an older 4-arg caller omits them.
      val prevRaw = prefs.getString("payload", null)
      if (prevRaw != null) {
        val prev = try { JSONObject(prevRaw) } catch (_: Exception) { null }
        if (prev != null) {
          if (!incoming.has("style") && prev.has("style")) incoming.put("style", prev.optString("style"))
          if (!incoming.has("mode") && prev.has("mode")) incoming.put("mode", prev.optString("mode"))
        }
      }
      if (!prefs.edit().putString("payload", incoming.toString()).commit()) {
        throw IllegalStateException("Could not save widget data")
      }
      CourseWidgetEngine.refresh(context)
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("WIDGET_SYNC", error) }
  }

  @ReactMethod
  fun pin(shape: String, promise: Promise) {
    try {
      val manager = AppWidgetManager.getInstance(context)
      val provider = when (shape) {
        "square" -> SquareCourseWidget::class.java
        "rectangle" -> RectangleCourseWidget::class.java
        "large" -> LargeCourseWidget::class.java
        else -> throw IllegalArgumentException("Unknown widget shape")
      }
      if (Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported) {
        val component = ComponentName(context, provider)
        if (manager.installedProviders.none { it.provider == component }) {
          throw IllegalStateException("系统未注册此小组件，请安装完整新版 APK 后重新打开应用")
        }
        val preview = CourseWidgetEngine.buildPreview(context, provider)
        val extras = Bundle().apply {
          putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW, preview)
        }
        promise.resolve(manager.requestPinAppWidget(component, extras, null))
      } else promise.resolve(false)
    } catch (error: Exception) { promise.reject("WIDGET_PIN", error) }
  }
}

open class CourseWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == "miui.appwidget.action.APPWIDGET_UPDATE") {
      CourseWidgetEngine.refresh(context)
    }
  }
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = CourseWidgetEngine.refresh(context)
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) = CourseWidgetEngine.refresh(context)
  override fun onDeleted(context: Context, ids: IntArray) = CourseWidgetEngine.refresh(context)
  override fun onDisabled(context: Context) = CourseWidgetEngine.refresh(context)
}
class SquareCourseWidget : CourseWidgetProvider()
class RectangleCourseWidget : CourseWidgetProvider()
class LargeCourseWidget : CourseWidgetProvider()

class CourseWidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) { CourseWidgetEngine.refresh(context) }
}

/** No JS process is required: recompute the full recurrence in the current timezone. */
object CourseWidgetEngine {
  const val PREFS = "dark-study-course-widget"
  /** 顶部单行标题栏 + 上下留白占用的高度（dp） */
  private const val CHROME_HEIGHT = 40
  private const val WIDE_BASE_ROW_HEIGHT = 50
  private const val WIDE_MIN_ROW_HEIGHT = 48
  private const val COMPACT_BASE_ROW_HEIGHT = 47
  private const val COMPACT_MIN_ROW_HEIGHT = 46
  private data class Lesson(val name: String, val room: String, val start: Long, val end: Long, val time: String, val color: String)
  private val providers = listOf(SquareCourseWidget::class.java, RectangleCourseWidget::class.java, LargeCourseWidget::class.java)
  private val validCourseColors = setOf("sky", "violet", "emerald", "amber", "rose", "cyan")

  private fun badgeTextColor(colorKey: String, dark: Boolean, fallback: Int): Int {
    if (dark) return fallback
    return when (colorKey) {
      "sky" -> Color.parseColor("#0284C7")
      "violet" -> Color.parseColor("#7C3AED")
      "emerald" -> Color.parseColor("#059669")
      "amber" -> Color.parseColor("#B45309")
      "rose" -> Color.parseColor("#E11D48")
      "cyan" -> Color.parseColor("#0891B2")
      else -> fallback
    }
  }

  private fun parseDate(value: String): Calendar? {
    if (!Regex("\\d{4}-\\d{2}-\\d{2}").matches(value)) return null
    val format = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }
    val date = try { format.parse(value) } catch (_: Exception) { null } ?: return null
    return Calendar.getInstance().apply { time = date }
  }

  private fun minutes(value: String): Int? {
    val match = Regex("^(\\d{1,2}):(\\d{2})$").matchEntire(value) ?: return null
    val hour = match.groupValues[1].toInt()
    val minute = match.groupValues[2].toInt()
    return if (hour in 0..23 && minute in 0..59) hour * 60 + minute else null
  }

  private fun nonBlank(obj: JSONObject?, key: String): String? {
    if (obj == null || obj.isNull(key)) return null
    return obj.optString(key, "").trim().takeIf { it.isNotEmpty() }
  }

  private fun sameDay(aMs: Long, bMs: Long): Boolean {
    val a = Calendar.getInstance().apply { timeInMillis = aMs }
    val b = Calendar.getInstance().apply { timeInMillis = bMs }
    return a.get(Calendar.YEAR) == b.get(Calendar.YEAR) &&
      a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)
  }

  private fun lessons(schedule: JSONObject?, now: Long): List<Lesson> {
    if (schedule == null) return emptyList()
    val startDate = schedule.optString("startDate")
    val endDate = schedule.optString("endDate")
    val monday = parseDate(startDate) ?: return emptyList()
    monday.add(Calendar.DAY_OF_MONTH, -((monday.get(Calendar.DAY_OF_WEEK) + 5) % 7))
    val periods = schedule.optJSONArray("periods") ?: return emptyList()
    val courses = schedule.optJSONArray("courses") ?: return emptyList()
    val lookup = mutableMapOf<Int, JSONObject>()
    for (i in 0 until periods.length()) {
      val period = periods.optJSONObject(i) ?: continue
      lookup[period.optInt("index")] = period
    }
    val result = mutableListOf<Lesson>()
    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    for (i in 0 until courses.length()) {
      val course = courses.optJSONObject(i) ?: continue
      val weekday = course.optInt("weekday")
      if (weekday !in 1..7) continue
      val from = nonBlank(course, "startTime") ?: nonBlank(lookup[course.optInt("startPeriod")], "startTime") ?: continue
      val to = nonBlank(course, "endTime") ?: nonBlank(lookup[course.optInt("endPeriod")], "endTime") ?: continue
      val startMinutes = minutes(from) ?: continue
      val endMinutes = minutes(to) ?: continue
      if (endMinutes <= startMinutes) continue
      val weeks = course.optJSONArray("weeks") ?: continue
      val seen = mutableSetOf<Int>()
      for (j in 0 until weeks.length()) {
        val rawWeek = weeks.optDouble(j, Double.NaN)
        val week = rawWeek.toInt()
        if (rawWeek != week.toDouble() || week !in 1..schedule.optInt("totalWeeks") || !seen.add(week)) continue
        val day = (monday.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, (week - 1) * 7 + weekday - 1) }
        val iso = dateFormat.format(day.time)
        if (iso < startDate || iso > endDate) continue
        val start = (day.clone() as Calendar).apply {
          set(Calendar.HOUR_OF_DAY, startMinutes / 60); set(Calendar.MINUTE, startMinutes % 60)
          set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val end = (day.clone() as Calendar).apply {
          set(Calendar.HOUR_OF_DAY, endMinutes / 60); set(Calendar.MINUTE, endMinutes % 60)
          set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        if (end > now) result.add(Lesson(course.optString("name"), course.optString("classroom"), start, end, "$from–$to", course.optString("color", "sky")))
      }
    }
    return result.sortedWith(compareBy<Lesson> { it.start }.thenBy { it.name })
  }

  private fun dayLabel(start: Long, now: Long): String {
    val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val date = Calendar.getInstance().apply { timeInMillis = start }
    val today = Calendar.getInstance().apply { timeInMillis = now }
    if (format.format(date.time) == format.format(today.time)) return "今天"
    today.add(Calendar.DAY_OF_MONTH, 1)
    if (format.format(date.time) == format.format(today.time)) return "明天"
    return "${date.get(Calendar.MONTH) + 1}/${date.get(Calendar.DAY_OF_MONTH)} 周${"日一二三四五六"[date.get(Calendar.DAY_OF_WEEK) - 1]}"
  }

  /** 右上角日期与周次：宽卡显示 11.25 第11周，窄卡显示 11.25（星期独立高亮显示） */
  private fun dateAndWeekText(schedule: JSONObject?, now: Long, wide: Boolean): Pair<String, String> {
    val today = Calendar.getInstance().apply { timeInMillis = now }
    val weekday = "周${"日一二三四五六"[today.get(Calendar.DAY_OF_WEEK) - 1]}"
    val dateLabel = "${today.get(Calendar.MONTH) + 1}.${today.get(Calendar.DAY_OF_MONTH)}"
    if (schedule == null || !wide) return dateLabel to weekday
    val monday = parseDate(schedule.optString("startDate")) ?: return dateLabel to weekday
    monday.add(Calendar.DAY_OF_MONTH, -((monday.get(Calendar.DAY_OF_WEEK) + 5) % 7))
    val days = daysBetween(monday, today)
    val week = Math.floor(days.toDouble() / 7.0).toInt() + 1
    val total = schedule.optInt("totalWeeks", 0)
    val left = if (week in 1..total) "$dateLabel 第${week}周" else dateLabel
    return left to weekday
  }

  /** 用 UTC 午夜计算天数差，避免夏令时导致 23/25 小时的日子算错周次 */
  private fun daysBetween(from: Calendar, to: Calendar): Long {
    val a = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
      clear(); set(from.get(Calendar.YEAR), from.get(Calendar.MONTH), from.get(Calendar.DAY_OF_MONTH))
    }
    val b = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
      clear(); set(to.get(Calendar.YEAR), to.get(Calendar.MONTH), to.get(Calendar.DAY_OF_MONTH))
    }
    return (b.timeInMillis - a.timeInMillis) / 86400000L
  }

  private fun colorResource(context: Context, name: String, fallback: Int): Int {
    val id = context.resources.getIdentifier(name, "color", context.packageName)
    return if (id != 0) ContextCompat.getColor(context, id) else fallback
  }

  private fun drawableResource(context: Context, name: String, fallback: Int): Int {
    val id = context.resources.getIdentifier(name, "drawable", context.packageName)
    return if (id != 0) id else fallback
  }

  private fun courseColor(colorPalette: JSONObject?, name: String): Int {
    val hex = colorPalette?.optString(name)?.takeIf { Regex("#[0-9a-fA-F]{6}").matches(it) } ?: "#38BDF8"
    return try { Color.parseColor(hex) } catch (_: Exception) { Color.parseColor("#38BDF8") }
  }

  private fun safeColorKey(raw: String): String = if (raw in validCourseColors) raw else "sky"

  private fun readPayload(context: Context): JSONObject {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("payload", "{}") ?: "{}"
    return try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
  }

  fun buildPreview(context: Context, provider: Class<out CourseWidgetProvider>): RemoteViews {
    val payload = readPayload(context)
    val now = System.currentTimeMillis()
    val width = if (provider == SquareCourseWidget::class.java) 140 else 280
    val height = if (provider == LargeCourseWidget::class.java) 280 else 140
    return renderWidget(context, payload, provider, width, height, now)
  }

  private fun renderWidget(
    context: Context,
    payload: JSONObject,
    provider: Class<out CourseWidgetProvider>,
    width: Int,
    height: Int,
    now: Long,
  ): RemoteViews {
    val schedule = payload.optJSONObject("schedule")
    val upcoming = lessons(schedule, now)
    val count = payload.optInt("count", 3).coerceIn(1, 5)
    val themePref = payload.optString("theme", "system")
    val dark = when (themePref) {
      "light" -> false
      "dark" -> true
      else -> (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }
    val accent = payload.optString("accent", "default").takeIf { Regex("[a-z]+").matches(it) } ?: "default"
    val surfaceStyle = payload.optString("style", "frosted").takeIf { it in setOf("frosted", "porcelain", "tinted") } ?: "frosted"
    val displayMode = payload.optString("mode", "upcoming").takeIf { it in setOf("upcoming", "today") } ?: "upcoming"
    val mode = if (dark) "dark" else "light"
    val ink = Color.parseColor(if (dark) "#F8FAFC" else "#172033")
    val muted = Color.parseColor(if (dark) "#9EB0C9" else "#64748B")
    val kaomojiColor = Color.parseColor(if (dark) "#94A3B8" else "#7B879B")
    val brand = colorResource(context, "course_widget_brand_${accent}_$mode", Color.parseColor(if (dark) "#7DD3FC" else "#0284C7"))
    val background = drawableResource(
      context,
      "course_widget_bg_${accent}_${surfaceStyle}_$mode",
      drawableResource(context, "course_widget_bg_${accent}_$mode", if (dark) R.drawable.course_widget_dark else R.drawable.course_widget_light),
    )
    val colorPalette = payload.optJSONObject("colorPalette")
    val compact = if (width > 0) width < 190 else provider == SquareCourseWidget::class.java
    val (metaDate, metaWeekday) = dateAndWeekText(schedule, now, !compact)

    val view = RemoteViews(context.packageName, R.layout.course_widget)
    view.setInt(android.R.id.background, "setBackgroundResource", background)
    view.setTextColor(R.id.widget_title, ink)
    view.setTextColor(R.id.widget_meta, muted)
    view.setTextColor(R.id.widget_weekday, brand)
    view.setTextColor(R.id.widget_brand, brand)
    view.setTextViewText(R.id.widget_title, nonBlank(schedule, "name") ?: "桌面课表")
    view.setTextViewText(R.id.widget_meta, metaDate)
    view.setTextViewText(R.id.widget_weekday, metaWeekday)
    view.setViewVisibility(R.id.widget_meta, if (compact && width in 1..125) View.GONE else View.VISIBLE)
    view.removeAllViews(R.id.widget_courses)

    val todayOnly = upcoming.filter { sameDay(it.start, now) }
    val sourceList = if (displayMode == "today") todayOnly else upcoming
    val defaultCapacity = if (provider == LargeCourseWidget::class.java) 5 else 2
    val available = if (height > 0) height - CHROME_HEIGHT else 0
    val baseRowHeight = if (compact) COMPACT_BASE_ROW_HEIGHT else WIDE_BASE_ROW_HEIGHT
    val minRowHeight = if (compact) COMPACT_MIN_ROW_HEIGHT else WIDE_MIN_ROW_HEIGHT
    val rowMin = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) minRowHeight else baseRowHeight
    val capacity = if (available > 0) (available / rowMin).coerceIn(1, 5) else defaultCapacity
    val visible = sourceList.take(minOf(count, capacity))

    val stretch = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && available > 0 && visible.isNotEmpty()
    val rawSlotHeight = if (stretch) available.toFloat() / visible.size else baseRowHeight.toFloat()
    val rowCardHeight = if (compact) {
      (rawSlotHeight - 4f).coerceIn(42f, 64f)
    } else {
      (rawSlotHeight - 4f).coerceIn(44f, 74f)
    }
    val textScale = (rowCardHeight / 46f).coerceIn(0.96f, 1.15f)

    view.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_SP, if (compact) 12f else 13.5f)
    view.setTextViewTextSize(R.id.widget_meta, TypedValue.COMPLEX_UNIT_SP, if (compact) 10f else 11f)
    view.setTextViewTextSize(R.id.widget_weekday, TypedValue.COMPLEX_UNIT_SP, if (compact) 10.5f else 11f)

    for ((index, lesson) in visible.withIndex()) {
      val colorKey = safeColorKey(lesson.color)
      val accentColor = courseColor(colorPalette, colorKey)
      val readableAccent = badgeTextColor(colorKey, dark, accentColor)
      val ongoing = lesson.start <= now
      val isNextHighlight = index == 0 && (ongoing || sameDay(lesson.start, now))
      val itemDrawable = drawableResource(
        context,
        "course_widget_item_${colorKey}_${if (isNextHighlight) "active_" else ""}$mode",
        if (dark) R.drawable.course_widget_item_sky_dark else R.drawable.course_widget_item_sky_light,
      )
      val barDrawable = drawableResource(context, "course_widget_bar_$colorKey", R.drawable.course_widget_bar_sky)

      if (compact) {
        val row = RemoteViews(context.packageName, R.layout.course_widget_row_compact)
        row.setInt(R.id.widget_course_row, "setBackgroundResource", itemDrawable)
        row.setInt(R.id.widget_course_bar, "setBackgroundResource", barDrawable)
        row.setTextViewText(R.id.widget_course_name, lesson.name)
        val startClock = lesson.time.substringBefore("–")
        val roomLabel = lesson.room.ifBlank { "教室待定" }
        val compactSub = if (ongoing) {
          "上课中 · $roomLabel"
        } else if (sameDay(lesson.start, now)) {
          "$startClock · $roomLabel"
        } else {
          "${dayLabel(lesson.start, now)} $startClock"
        }
        row.setTextViewText(R.id.widget_course_time, compactSub)
        row.setTextColor(R.id.widget_course_name, ink)
        row.setTextColor(R.id.widget_course_time, if (ongoing) readableAccent else muted)
        if (stretch && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          row.setViewLayoutHeight(R.id.widget_course_row, rowCardHeight, TypedValue.COMPLEX_UNIT_DIP)
          row.setTextViewTextSize(R.id.widget_course_name, TypedValue.COMPLEX_UNIT_SP, (11.5f * textScale).coerceIn(11f, 13.5f))
          row.setTextViewTextSize(R.id.widget_course_time, TypedValue.COMPLEX_UNIT_SP, (9.5f * textScale).coerceIn(9f, 11f))
        }
        view.addView(R.id.widget_courses, row)
      } else {
        val row = RemoteViews(context.packageName, R.layout.course_widget_row)
        row.setInt(R.id.widget_course_row, "setBackgroundResource", itemDrawable)
        row.setInt(R.id.widget_course_bar, "setBackgroundResource", barDrawable)
        row.setTextViewText(R.id.widget_course_name, lesson.name)
        row.setTextViewText(R.id.widget_course_time, lesson.time)
        row.setTextViewText(R.id.widget_course_room, lesson.room.ifBlank { "教室待定" })
        row.setTextColor(R.id.widget_course_name, ink)
        row.setTextColor(R.id.widget_course_time, muted)
        row.setTextColor(R.id.widget_course_room, muted)
        row.setTextColor(R.id.widget_course_dot, accentColor)

        val badgeText = when {
          ongoing -> "上课中"
          index == 0 && sameDay(lesson.start, now) -> "下节课"
          else -> dayLabel(lesson.start, now)
        }
        row.setTextViewText(R.id.widget_course_badge, badgeText)
        if (ongoing) {
          row.setInt(R.id.widget_course_badge, "setBackgroundResource", barDrawable)
          row.setTextColor(R.id.widget_course_badge, Color.WHITE)
        } else {
          val badgeDrawable = drawableResource(
            context,
            "course_widget_badge_${colorKey}_$mode",
            if (dark) R.drawable.course_widget_badge_sky_dark else R.drawable.course_widget_badge_sky_light,
          )
          row.setInt(R.id.widget_course_badge, "setBackgroundResource", badgeDrawable)
          row.setTextColor(R.id.widget_course_badge, readableAccent)
        }

        if (stretch && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          row.setViewLayoutHeight(R.id.widget_course_row, rowCardHeight, TypedValue.COMPLEX_UNIT_DIP)
          row.setTextViewTextSize(R.id.widget_course_name, TypedValue.COMPLEX_UNIT_SP, (12.5f * textScale).coerceIn(12f, 15.5f))
          row.setTextViewTextSize(R.id.widget_course_time, TypedValue.COMPLEX_UNIT_SP, (10f * textScale).coerceIn(9.5f, 12f))
          row.setTextViewTextSize(R.id.widget_course_room, TypedValue.COMPLEX_UNIT_SP, (10f * textScale).coerceIn(9.5f, 12f))
          row.setTextViewTextSize(R.id.widget_course_badge, TypedValue.COMPLEX_UNIT_SP, (9f * textScale).coerceIn(8.5f, 10.5f))
        }
        view.addView(R.id.widget_courses, row)
      }
    }

    val empty = visible.isEmpty()
    view.setViewVisibility(R.id.widget_courses, if (empty) View.GONE else View.VISIBLE)
    view.setViewVisibility(R.id.widget_empty_box, if (empty) View.VISIBLE else View.GONE)
    if (empty) {
      val (kaomoji, emptyTitle, hint) = when {
        schedule == null -> Triple("(｡•ᴗ•｡)", "打开 Dark Study 同步课表", null)
        (schedule.optJSONArray("courses")?.length() ?: 0) == 0 -> Triple("(っ˘ω˘ς)", "还没有课程 · 先导入课表吧", null)
        displayMode == "today" && upcoming.isNotEmpty() -> {
          val next = upcoming.first()
          val startClock = next.time.substringBefore("–")
          Triple("(〃'▽'〃)", "今天没有课啦", "下节 · ${dayLabel(next.start, now)} $startClock ${next.name}")
        }
        else -> Triple("(〃'▽'〃)", "今天没有课啦", "本学期暂无后续课程 · 享受自由时间")
      }
      view.setTextViewText(R.id.widget_empty_kaomoji, kaomoji)
      view.setTextColor(R.id.widget_empty_kaomoji, kaomojiColor)
      view.setTextViewText(R.id.widget_empty, emptyTitle)
      view.setTextColor(R.id.widget_empty, muted)
      if (hint != null && !compact) {
        view.setViewVisibility(R.id.widget_empty_hint, View.VISIBLE)
        view.setTextViewText(R.id.widget_empty_hint, hint)
        view.setTextColor(R.id.widget_empty_hint, muted)
        view.setInt(
          R.id.widget_empty_hint,
          "setBackgroundResource",
          if (dark) R.drawable.course_widget_hint_pill_dark else R.drawable.course_widget_hint_pill_light,
        )
      } else {
        view.setViewVisibility(R.id.widget_empty_hint, View.GONE)
      }
    }

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launch != null) {
      // A URI also navigates an already-running app back to the timetable.
      launch.action = Intent.ACTION_VIEW
      launch.data = android.net.Uri.parse("dark-study:///")
      view.setOnClickPendingIntent(
        android.R.id.background,
        PendingIntent.getActivity(context, 7402, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE),
      )
    }
    val refresh = Intent(context, CourseWidgetRefreshReceiver::class.java).setAction("${context.packageName}.COURSE_WIDGET_REFRESH")
    view.setOnClickPendingIntent(
      R.id.widget_brand,
      PendingIntent.getBroadcast(context, 7401, refresh, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE),
    )
    return view
  }

  @Synchronized
  fun refresh(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val widgets = providers.flatMap { provider -> manager.getAppWidgetIds(ComponentName(context, provider)).map { it to provider } }
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val alarmIntent = PendingIntent.getBroadcast(
      context,
      7401,
      Intent(context, CourseWidgetRefreshReceiver::class.java).setAction("${context.packageName}.COURSE_WIDGET_REFRESH"),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    if (widgets.isEmpty()) {
      alarm.cancel(alarmIntent)
      return
    }
    val payload = readPayload(context)
    val schedule = payload.optJSONObject("schedule")
    val now = System.currentTimeMillis()
    val upcoming = lessons(schedule, now)

    for ((id, provider) in widgets) {
      val options = manager.getAppWidgetOptions(id)
      val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
      val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
      val view = renderWidget(context, payload, provider, width, height, now)
      manager.updateAppWidget(id, view)
    }

    // Inexact alarms need no new permission. Periodic provider updates + MIUI exposure broadcasts are fallbacks.
    // Course boundaries and midnight trigger recalculation while JS is stopped; Doze can delay them.
    val nextMidnight = Calendar.getInstance().apply {
      timeInMillis = now
      add(Calendar.DAY_OF_MONTH, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 5)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val nextCourse = upcoming.flatMap { listOf(it.start, it.end) }.filter { it > now }.minOrNull()
    val next = listOfNotNull(nextCourse, nextMidnight).minOrNull()
    if (next != null) alarm.setAndAllowWhileIdle(AlarmManager.RTC, maxOf(now + 1000, next), alarmIntent)
    else alarm.cancel(alarmIntent)
  }
}
