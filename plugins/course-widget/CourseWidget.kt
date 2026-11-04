package __PACKAGE__

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
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

  @ReactMethod
  fun status(promise: Promise) {
    try {
      val manager = AppWidgetManager.getInstance(context)
      val names = listOf(SquareCourseWidget::class.java, RectangleCourseWidget::class.java, LargeCourseWidget::class.java)
      val registered = manager.installedProviders.map { it.provider }.toSet()
      val result = com.facebook.react.bridge.Arguments.createMap()
      result.putInt("registered", names.count { registered.contains(ComponentName(context, it)) })
      result.putInt("installed", names.sumOf { manager.getAppWidgetIds(ComponentName(context, it)).size })
      result.putBoolean("pinSupported", Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported)
      result.putString("manufacturer", Build.MANUFACTURER)
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
      JSONObject(payload) // Reject invalid JSON before replacing the saved schedule.
      if (!context.getSharedPreferences(CourseWidgetEngine.PREFS, Context.MODE_PRIVATE).edit().putString("payload", payload).commit()) {
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
        val extras = Bundle().apply {
          putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW, RemoteViews(context.packageName, R.layout.course_widget))
        }
        promise.resolve(manager.requestPinAppWidget(component, extras, null))
      } else promise.resolve(false)
    } catch (error: Exception) { promise.reject("WIDGET_PIN", error) }
  }
}

open class CourseWidgetProvider : AppWidgetProvider() {
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
  /** 顶部固定占用的高度（dp）：上下内边距 20 + 一行品牌 16 + 标题 20 + 间隔 2 */
  private const val CHROME_HEIGHT = 58
  private const val BASE_ROW_HEIGHT = 44
  /** 动态撑满时单行可以压缩到的下限，保证小尺寸组件也能多放一门课 */
  private const val MIN_ROW_HEIGHT = 38
  private data class Lesson(val name: String, val room: String, val start: Long, val end: Long, val time: String, val color: String)
  private val providers = listOf(SquareCourseWidget::class.java, RectangleCourseWidget::class.java, LargeCourseWidget::class.java)

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
      val from = lookup[course.optInt("startPeriod")]?.optString("startTime") ?: continue
      val to = lookup[course.optInt("endPeriod")]?.optString("endTime") ?: continue
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
        val start = (day.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY, startMinutes / 60); set(Calendar.MINUTE, startMinutes % 60) }.timeInMillis
        val end = (day.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY, endMinutes / 60); set(Calendar.MINUTE, endMinutes % 60) }.timeInMillis
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

  /** 右上角日期：11.4 第8周 周三；小尺寸只显示 11.4 周三 */
  private fun metaText(schedule: JSONObject?, now: Long, wide: Boolean): String {
    val today = Calendar.getInstance().apply { timeInMillis = now }
    val weekday = "周${"日一二三四五六"[today.get(Calendar.DAY_OF_WEEK) - 1]}"
    val dateLabel = "${today.get(Calendar.MONTH) + 1}.${today.get(Calendar.DAY_OF_MONTH)}"
    if (schedule == null || !wide) return "$dateLabel $weekday"
    val monday = parseDate(schedule.optString("startDate")) ?: return "$dateLabel $weekday"
    monday.add(Calendar.DAY_OF_MONTH, -((monday.get(Calendar.DAY_OF_WEEK) + 5) % 7))
    val days = daysBetween(monday, today)
    val week = Math.floor(days.toDouble() / 7.0).toInt() + 1
    val total = schedule.optInt("totalWeeks", 0)
    return if (week in 1..total) "$dateLabel 第${week}周 $weekday" else "$dateLabel $weekday"
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

  @Synchronized
  fun refresh(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val widgets = providers.flatMap { provider -> manager.getAppWidgetIds(ComponentName(context, provider)).map { it to provider } }
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val alarmIntent = PendingIntent.getBroadcast(context, 7401, Intent(context, CourseWidgetRefreshReceiver::class.java).setAction("${context.packageName}.COURSE_WIDGET_REFRESH"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    if (widgets.isEmpty()) { alarm.cancel(alarmIntent); return }
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("payload", "{}") ?: "{}"
    val payload = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
    val schedule = payload.optJSONObject("schedule")
    val now = System.currentTimeMillis()
    val upcoming = lessons(schedule, now)
    val count = payload.optInt("count", 3).coerceIn(1, 5)
    val dark = payload.optString("theme", "dark") != "light"
    val accent = payload.optString("accent", "default").takeIf { Regex("[a-z]+").matches(it) } ?: "default"
    val mode = if (dark) "dark" else "light"
    val ink = Color.parseColor(if (dark) "#F1F5F9" else "#172554")
    val muted = Color.parseColor(if (dark) "#A5B4CF" else "#536783")
    val brand = colorResource(context, "course_widget_brand_${accent}_$mode", Color.parseColor(if (dark) "#7DD3FC" else "#0369A1"))
    val background = drawableResource(context, "course_widget_bg_${accent}_$mode", if (dark) R.drawable.course_widget_dark else R.drawable.course_widget_light)
    val colorPalette = payload.optJSONObject("colorPalette")
    for ((id, provider) in widgets) {
      val options = manager.getAppWidgetOptions(id)
      val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
      val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
      val view = RemoteViews(context.packageName, R.layout.course_widget)
      view.setInt(R.id.widget_root, "setBackgroundResource", background)
      view.setTextColor(R.id.widget_brand, brand)
      view.setTextColor(R.id.widget_meta, muted)
      view.setTextViewText(R.id.widget_title, schedule?.optString("name") ?: "桌面课表")
      view.setTextViewText(R.id.widget_meta, metaText(schedule, now, if (width > 0) width >= 200 else provider != SquareCourseWidget::class.java))
      view.removeAllViews(R.id.widget_courses)
      val defaultCapacity = if (provider == LargeCourseWidget::class.java) 5 else 2
      val available = if (height > 0) height - CHROME_HEIGHT else 0
      val capacity = if (available > 0) (available / MIN_ROW_HEIGHT).coerceIn(1, 5) else defaultCapacity
      val visible = upcoming.take(minOf(count, capacity))
      // 撑满整个组件：按剩余高度均分行高，并等比放大字号，避免底部留白。
      val stretch = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && available > 0 && visible.isNotEmpty()
      val rowHeight = if (stretch) available.toFloat() / visible.size else BASE_ROW_HEIGHT.toFloat()
      val scale = if (stretch) (rowHeight / BASE_ROW_HEIGHT.toFloat()).coerceAtLeast(1f) else 1f
      // 标题与顶部信息适度放大，和撑高后的课程行保持比例，同时不超过固定行高。
      view.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_SP, (12f * scale).coerceIn(12f, 16f))
      view.setTextViewTextSize(R.id.widget_brand, TypedValue.COMPLEX_UNIT_SP, (9f * scale).coerceIn(9f, 11f))
      view.setTextViewTextSize(R.id.widget_meta, TypedValue.COMPLEX_UNIT_SP, (9f * scale).coerceIn(9f, 11f))
      for (lesson in visible) {
        val row = RemoteViews(context.packageName, R.layout.course_widget_row)
        row.setTextViewText(R.id.widget_course_name, lesson.name)
        row.setTextViewText(R.id.widget_course_time, "${if (lesson.start <= now) "上课中" else dayLabel(lesson.start, now)} · ${lesson.time}")
        row.setTextViewText(R.id.widget_course_room, lesson.room.ifBlank { "教室待定" })
        row.setTextColor(R.id.widget_course_name, ink)
        row.setTextColor(R.id.widget_course_time, muted)
        row.setTextColor(R.id.widget_course_room, muted)
        val accentColor = courseColor(colorPalette, lesson.color)
        row.setInt(R.id.widget_course_bar, "setBackgroundColor", accentColor)
        row.setTextColor(R.id.widget_course_dot, accentColor)
        row.setInt(R.id.widget_course_row, "setBackgroundColor",
          Color.argb(if (dark) 0x1C else 0x14, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)))
        if (stretch && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          row.setViewLayoutHeight(R.id.widget_course_row, rowHeight, TypedValue.COMPLEX_UNIT_DIP)
          row.setTextViewTextSize(R.id.widget_course_name, TypedValue.COMPLEX_UNIT_SP, (12f * scale).coerceIn(11f, 20f))
          row.setTextViewTextSize(R.id.widget_course_time, TypedValue.COMPLEX_UNIT_SP, (9f * scale).coerceIn(8f, 13f))
          row.setTextViewTextSize(R.id.widget_course_room, TypedValue.COMPLEX_UNIT_SP, (9f * scale).coerceIn(8f, 13f))
          row.setTextViewTextSize(R.id.widget_course_dot, TypedValue.COMPLEX_UNIT_SP, (7f * scale).coerceIn(6f, 11f))
        }
        view.addView(R.id.widget_courses, row)
      }
      val empty = visible.isEmpty()
      view.setViewVisibility(R.id.widget_courses, if (empty) View.GONE else View.VISIBLE)
      view.setViewVisibility(R.id.widget_empty, if (empty) View.VISIBLE else View.GONE)
      view.setTextColor(R.id.widget_empty, muted)
      view.setTextViewText(R.id.widget_empty, if (schedule == null) "打开 Dark Study 同步课表" else if ((schedule.optJSONArray("courses")?.length() ?: 0) == 0) "还没有课程\n先导入或添加课表吧" else "本学期暂无后续课程\n享受自由时间吧")
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) {
        // A URI also navigates an already-running app back to the timetable.
        launch.action = Intent.ACTION_VIEW
        launch.data = android.net.Uri.parse("dark-study:///")
        view.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 7402, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      val refresh = Intent(context, CourseWidgetRefreshReceiver::class.java).setAction("${context.packageName}.COURSE_WIDGET_REFRESH")
      view.setOnClickPendingIntent(R.id.widget_brand, PendingIntent.getBroadcast(context, 7401, refresh, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      manager.updateAppWidget(id, view)
    }
    // Inexact alarms need no new permission. Periodic provider updates are the fallback.
    // Course boundaries trigger recalculation while JS is stopped; Doze can delay them.
    val next = upcoming.flatMap { listOf(it.start, it.end) }.filter { it > now }.minOrNull()
    if (next != null) alarm.setAndAllowWhileIdle(AlarmManager.RTC, maxOf(now + 1000, next), alarmIntent)
    else alarm.cancel(alarmIntent)
  }
}
