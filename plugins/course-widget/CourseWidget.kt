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
import android.view.View
import android.widget.RemoteViews
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
  private data class Lesson(val name: String, val room: String, val start: Long, val end: Long, val time: String)
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
        if (end > now) result.add(Lesson(course.optString("name"), course.optString("classroom"), start, end, "$from–$to"))
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
    val ink = Color.parseColor(if (dark) "#F1F5F9" else "#172554")
    val muted = Color.parseColor(if (dark) "#A5B4CF" else "#536783")
    for ((id, provider) in widgets) {
      val view = RemoteViews(context.packageName, R.layout.course_widget)
      view.setInt(R.id.widget_root, "setBackgroundResource", if (dark) R.drawable.course_widget_dark else R.drawable.course_widget_light)
      view.setTextColor(R.id.widget_title, ink)
      view.setTextColor(R.id.widget_brand, Color.parseColor(if (dark) "#7DD3FC" else "#0369A1"))
      view.setTextViewText(R.id.widget_title, schedule?.optString("name") ?: "桌面课表")
      view.removeAllViews(R.id.widget_courses)
      val height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
      val defaultCapacity = if (provider == LargeCourseWidget::class.java) 5 else 2
      val capacity = if (height > 0) ((height - 54) / 44).coerceIn(1, 5) else defaultCapacity
      for (lesson in upcoming.take(minOf(count, capacity))) {
        val row = RemoteViews(context.packageName, R.layout.course_widget_row)
        row.setTextViewText(R.id.widget_course_name, lesson.name)
        row.setTextViewText(R.id.widget_course_time, "${if (lesson.start <= now) "上课中" else dayLabel(lesson.start, now)} · ${lesson.time}")
        row.setTextViewText(R.id.widget_course_room, lesson.room.ifBlank { "教室待定" })
        row.setTextColor(R.id.widget_course_name, ink)
        row.setTextColor(R.id.widget_course_time, muted)
        row.setTextColor(R.id.widget_course_room, muted)
        view.addView(R.id.widget_courses, row)
      }
      view.setViewVisibility(R.id.widget_empty, if (upcoming.isEmpty()) View.VISIBLE else View.GONE)
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
