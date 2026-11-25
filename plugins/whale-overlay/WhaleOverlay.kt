package __PACKAGE__

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.text.TextUtils
import android.util.TypedValue
import android.view.*
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.util.Calendar
import java.util.concurrent.Executors
import kotlin.math.*
import kotlin.random.Random

private const val PREFS = "whale_desktop_pet"
private const val EVENT = "WhaleOverlayChanged"
private const val ACTION_STOP = "whale.overlay.STOP"
private const val ACTION_TOGGLE_GHOST = "whale.overlay.TOGGLE_GHOST"
private const val ACTION_TOGGLE_REST = "whale.overlay.TOGGLE_REST"
private const val CHANNEL = "whale_desktop_pet"
private const val NOTIF_ID = 7630

@Suppress("DEPRECATION")
private fun overlayWindowType() =
  if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
  else WindowManager.LayoutParams.TYPE_PHONE

class WhaleOverlayPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(WhaleOverlayModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}

class WhaleOverlayModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "WhaleOverlay"

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(c: Context?, intent: Intent?) {
      if (context.hasActiveReactInstance()) {
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT, null)
      }
    }
  }

  override fun initialize() {
    super.initialize()
    val filter = IntentFilter("${context.packageName}.$EVENT")
    if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    else context.registerReceiver(receiver, filter)
  }

  override fun invalidate() {
    runCatching { context.unregisterReceiver(receiver) }
    super.invalidate() // The explicitly started foreground pet survives React teardown.
  }

  @ReactMethod fun addListener(name: String) {}
  @ReactMethod fun removeListeners(count: Double) {}

  // @ReactMethod bodies must return void (TurboModule interop in RN 0.88).
  @ReactMethod fun getStatus(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val svc = WhaleOverlayService.instance
      val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
      val batteryIgnored = if (Build.VERSION.SDK_INT >= 23) {
        pm?.isIgnoringBatteryOptimizations(context.packageName) == true
      } else true
      promise.resolve(Arguments.createMap().apply {
        putBoolean("permission", Settings.canDrawOverlays(context))
        putBoolean("running", svc?.attached() == true)
        putBoolean("visible", svc?.isPetVisible() == true)
        putBoolean("ghostMode", svc?.isGhostMode() == true)
        putBoolean("edgeRest", svc?.isEdgeRest() == true)
        putBoolean("panelOpen", svc?.isPanelOpen() == true)
        putDouble("lastImpactAt", prefs.getLong("impactAt", 0).toDouble())
        putString("lastImpactText", prefs.getString("impactText", "") ?: "")
        putInt("pendingFeeds", prefs.getInt("pendingFeeds", 0))
        putInt("pendingPats", prefs.getInt("pendingPats", 0))
        putInt("pendingPokes", prefs.getInt("pendingPokes", 0))
        putBoolean("batteryIgnored", batteryIgnored)
        putString("manufacturer", Build.MANUFACTURER ?: "")
      })
    }
  }

  @ReactMethod fun acknowledgeImpact(at: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (prefs.getLong("impactAt", 0) == at.toLong()) {
        prefs.edit().remove("impactAt").remove("impactText").apply()
      }
      promise.resolve(null)
    }
  }

  @ReactMethod fun acknowledgeCounters(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putInt("pendingFeeds", 0).putInt("pendingPats", 0).putInt("pendingPokes", 0).apply()
      promise.resolve(null)
    }
  }

  @ReactMethod fun openPermission(promise: Promise) {
    try {
      context.startActivity(
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("OVERLAY_PERMISSION", "无法打开悬浮窗权限设置，请在系统设置中手动允许", error)
    }
  }

  @ReactMethod fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= 23) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      promise.resolve(null)
    } catch (_: Exception) {
      openAppSettings(promise)
    }
  }

  @ReactMethod fun openAppSettings(promise: Promise) {
    try {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("APP_SETTINGS", "无法打开系统应用设置", error)
    }
  }

  @ReactMethod fun start(payload: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        if (!Settings.canDrawOverlays(context)) throw SecurityException("请先允许显示在其他应用上层")
        JSONObject(payload)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          .edit().putBoolean("userDismissed", false).putString("lastOptions", payload).apply()
        val existing = WhaleOverlayService.instance
        if (existing != null && existing.attached()) {
          existing.applyOptions(JSONObject(payload))
          promise.resolve(null)
          return@runOnUiThread
        }
        if (WhaleOverlayService.launchResult != null) throw IllegalStateException("桌宠正在出来，请稍等")
        WhaleOverlayService.launchResult = { error ->
          if (error == null) promise.resolve(null) else promise.reject("OVERLAY_START", error.message, error)
        }
        val intent = Intent(context, WhaleOverlayService::class.java).putExtra("options", payload)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      } catch (error: Exception) {
        WhaleOverlayService.launchResult = null
        promise.reject("OVERLAY_START", error.message, error)
      }
    }
  }

  @ReactMethod fun update(payload: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val json = JSONObject(payload)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          .edit().putString("lastOptions", payload).apply()
        WhaleOverlayService.instance?.applyOptions(json)
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("OVERLAY_UPDATE", error.message, error)
      }
    }
  }

  @ReactMethod fun setVisible(visible: Boolean, payload: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val svc = WhaleOverlayService.instance
        if (svc != null && svc.attached()) {
          val opts = if (payload.isNotBlank()) JSONObject(payload) else null
          svc.setPetVisible(visible, opts)
          promise.resolve(null)
          return@runOnUiThread
        }
        if (visible && Settings.canDrawOverlays(context)) {
          val optsStr = if (payload.isNotBlank()) payload else "{}"
          context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean("userDismissed", false).putString("lastOptions", optsStr).apply()
          val intent = Intent(context, WhaleOverlayService::class.java).putExtra("options", optsStr)
          if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
        }
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("OVERLAY_VISIBLE", error.message, error)
      }
    }
  }

  @ReactMethod fun setGhostMode(enabled: Boolean, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      WhaleOverlayService.instance?.setGhostMode(enabled)
      promise.resolve(null)
    }
  }

  @ReactMethod fun setEdgeRest(enabled: Boolean, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      WhaleOverlayService.instance?.setEdgeRest(enabled)
      promise.resolve(null)
    }
  }

  @ReactMethod fun openPanel(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      WhaleOverlayService.instance?.openInteractionPanel()
      promise.resolve(null)
    }
  }

  @ReactMethod fun stop(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putBoolean("userDismissed", true).apply()
      WhaleOverlayService.instance?.dismiss(explicit = true)
      context.stopService(Intent(context, WhaleOverlayService::class.java))
      promise.resolve(null)
    }
  }
}

/**
 * 液态玻璃主题色板（支持跟随系统 / 深海玻璃 / 冰晶浅色），与大肥鱼水蓝梦幻视觉统一。
 */
private data class OverlayPalette(
  val isDark: Boolean,
  val cardStart: Int,
  val cardEnd: Int,
  val bubbleStart: Int,
  val bubbleEnd: Int,
  val rimStart: Int,
  val rimEnd: Int,
  val sheenStart: Int,
  val sheenEnd: Int,
  val shadowColor: Int,
  val titleInk: Int,
  val bodyInk: Int,
  val mutedInk: Int,
  val tileBg: Int,
  val tileStroke: Int,
  val chipBg: Int,
  val chipStroke: Int,
  val chipInk: Int,
  val whisperBg: Int,
  val whisperStroke: Int,
  val courseBg: Int,
  val courseStroke: Int,
  val courseInk: Int,
  val trackBg: Int,
  val dangerBg: Int,
  val dangerStroke: Int,
  val dangerInk: Int,
  val closeBg: Int,
  val closeInk: Int,
) {
  companion object {
    val DARK = OverlayPalette(
      isDark = true,
      cardStart = 0xF00B1930.toInt(),
      cardEnd = 0xEC13274A.toInt(),
      bubbleStart = 0xF20D1E3B.toInt(),
      bubbleEnd = 0xEC152C52.toInt(),
      rimStart = 0xA67DD3FC.toInt(),
      rimEnd = 0x3D38BDF8.toInt(),
      sheenStart = 0x28FFFFFF.toInt(),
      sheenEnd = 0x00FFFFFF.toInt(),
      shadowColor = 0x52020814.toInt(),
      titleInk = 0xFFF8FAFC.toInt(),
      bodyInk = 0xFFE2E8F0.toInt(),
      mutedInk = 0xFF94A3B8.toInt(),
      tileBg = 0x16FFFFFF.toInt(),
      tileStroke = 0x267DD3FC.toInt(),
      chipBg = 0x2438BDF8.toInt(),
      chipStroke = 0x4A7DD3FC.toInt(),
      chipInk = 0xFFBAE6FD.toInt(),
      whisperBg = 0x14FFFFFF.toInt(),
      whisperStroke = 0x1F93C5FD.toInt(),
      courseBg = 0x2638BDF8.toInt(),
      courseStroke = 0x557DD3FC.toInt(),
      courseInk = 0xFFE0F2FE.toInt(),
      trackBg = 0x24FFFFFF.toInt(),
      dangerBg = 0x24FB7185.toInt(),
      dangerStroke = 0x52FDA4AF.toInt(),
      dangerInk = 0xFFFDA4AF.toInt(),
      closeBg = 0x1EFFFFFF.toInt(),
      closeInk = 0xFFCBD5E1.toInt(),
    )

    val LIGHT = OverlayPalette(
      isDark = false,
      cardStart = 0xF7F8FCFF.toInt(),
      cardEnd = 0xF2E5F2FF.toInt(),
      bubbleStart = 0xFAF9FCFF.toInt(),
      bubbleEnd = 0xF4E8F4FF.toInt(),
      rimStart = 0x9938BDF8.toInt(),
      rimEnd = 0x4093C5FD.toInt(),
      sheenStart = 0x96FFFFFF.toInt(),
      sheenEnd = 0x00FFFFFF.toInt(),
      shadowColor = 0x260F172A.toInt(),
      titleInk = 0xFF0F172A.toInt(),
      bodyInk = 0xFF1E293B.toInt(),
      mutedInk = 0xFF64748B.toInt(),
      tileBg = 0xCCFFFFFF.toInt(),
      tileStroke = 0x3338BDF8.toInt(),
      chipBg = 0x1C0284C7.toInt(),
      chipStroke = 0x3D38BDF8.toInt(),
      chipInk = 0xFF0369A1.toInt(),
      whisperBg = 0xD8FFFFFF.toInt(),
      whisperStroke = 0x2B38BDF8.toInt(),
      courseBg = 0x1E0EA5E9.toInt(),
      courseStroke = 0x5038BDF8.toInt(),
      courseInk = 0xFF0C4A6E.toInt(),
      trackBg = 0x1A0F172A.toInt(),
      dangerBg = 0x18E11D48.toInt(),
      dangerStroke = 0x44FB7185.toInt(),
      dangerInk = 0xFFBE123C.toInt(),
      closeBg = 0x140F172A.toInt(),
      closeInk = 0xFF475569.toInt(),
    )

    fun resolve(context: Context, mode: String): OverlayPalette {
      val dark = when (mode) {
        "dark" -> true
        "light" -> false
        else -> (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
          Configuration.UI_MODE_NIGHT_YES
      }
      return if (dark) DARK else LIGHT
    }
  }
}

/**
 * 低内存按需图集缓存（最多仅驻留 2 张 Bitmap：idle + 当前动作图集，闲置 15s 自动回收动作图集，
 * 低内存设备/低密度屏自动 1/2 采样，OOM 降级兜底，Standby 与退出时确保零 Bitmap 残留）。
 */
private class SheetBank(
  private val context: Context,
  private val handler: Handler,
  private val onLoaded: (String) -> Unit,
) {
  companion object {
    private val FILES = mapOf(
      "idle" to "pet-idle-v2.png",
      "actions" to "pet-actions-v2.png",
      "lively" to "pet-lively-v1.png",
      "dance" to "pet-dance-v2.png",
      "spin" to "pet-spin-v2.png",
      "hurt" to "pet-hurt-v1.png",
    )
  }

  private val loader = Executors.newSingleThreadExecutor()
  private val bitmaps = HashMap<String, Bitmap>(3)
  private val pending = HashSet<String>(3)
  private var activeSecondaryKey: String? = null
  @Volatile private var released = false

  private val baseSampleSize: Int = run {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val lowRam = am?.isLowRamDevice == true
    if (lowRam || context.resources.displayMetrics.density < 2.15f) 2 else 1
  }

  fun peek(key: String): Bitmap? {
    val bmp = bitmaps[key]
    return if (bmp != null && !bmp.isRecycled) bmp else null
  }

  fun get(key: String): Bitmap? {
    val bmp = bitmaps[key]
    if (bmp != null && !bmp.isRecycled) return bmp
    request(key)
    return null
  }

  private fun decodeAsset(file: String, sample: Int): Bitmap? =
    context.assets.open("whale-overlay/$file").use { stream ->
      val opts = BitmapFactory.Options().apply {
        inScaled = false
        inMutable = false
        inSampleSize = sample
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }
      BitmapFactory.decodeStream(stream, null, opts)
    }

  fun request(key: String) {
    if (released || !FILES.containsKey(key)) return
    val existing = bitmaps[key]
    if (existing != null && !existing.isRecycled) return
    if (!pending.add(key)) return
    val file = FILES[key] ?: return
    runCatching {
      loader.execute {
        if (released) return@execute
        val decoded = try {
          decodeAsset(file, baseSampleSize)
        } catch (_: OutOfMemoryError) {
          runCatching { decodeAsset(file, 2) }.getOrNull()
        } catch (_: Exception) {
          null
        }
        if (released) {
          if (decoded != null && !decoded.isRecycled) decoded.recycle()
          return@execute
        }
        val posted = handler.post {
          pending.remove(key)
          if (released) {
            if (decoded != null && !decoded.isRecycled) decoded.recycle()
            return@post
          }
          if (decoded != null && !decoded.isRecycled) {
            if (key != "idle") {
              val prevKey = activeSecondaryKey
              if (prevKey != null && prevKey != key) {
                bitmaps.remove(prevKey)?.let { if (!it.isRecycled) it.recycle() }
              }
              activeSecondaryKey = key
            }
            bitmaps[key] = decoded
            onLoaded(key)
          }
        }
        if (!posted && decoded != null && !decoded.isRecycled) {
          decoded.recycle()
        }
      }
    }.onFailure {
      pending.remove(key)
    }
  }

  fun evictSecondary() {
    val key = activeSecondaryKey ?: return
    activeSecondaryKey = null
    bitmaps.remove(key)?.let { if (!it.isRecycled) it.recycle() }
  }

  fun evictAll() {
    activeSecondaryKey = null
    pending.clear()
    bitmaps.values.forEach { if (!it.isRecycled) it.recycle() }
    bitmaps.clear()
  }

  fun release() {
    released = true
    loader.shutdownNow()
    evictAll()
  }
}

private fun buildUnifiedGlassPath(
  out: Path,
  box: RectF,
  radius: Float,
  caretCenterX: Float,
  caretW: Float,
  caretH: Float,
  caretOnTop: Boolean,
) {
  out.reset()
  val r = min(radius, min(box.width(), box.height()) * 0.5f)
  val halfW = caretW * 0.5f
  val minCx = box.left + r + halfW + 4f
  val maxCx = box.right - r - halfW - 4f
  val cx = if (minCx <= maxCx) caretCenterX.coerceIn(minCx, maxCx) else box.centerX()

  out.moveTo(box.left + r, box.top)
  if (caretOnTop && caretH > 1f) {
    out.lineTo(cx - halfW, box.top)
    out.quadTo(cx - halfW * 0.35f, box.top, cx, box.top - caretH)
    out.quadTo(cx + halfW * 0.35f, box.top, cx + halfW, box.top)
  }
  out.lineTo(box.right - r, box.top)
  out.quadTo(box.right, box.top, box.right, box.top + r)
  out.lineTo(box.right, box.bottom - r)
  out.quadTo(box.right, box.bottom, box.right - r, box.bottom)
  if (!caretOnTop && caretH > 1f) {
    out.lineTo(cx + halfW, box.bottom)
    out.quadTo(cx + halfW * 0.35f, box.bottom, cx, box.bottom + caretH)
    out.quadTo(cx - halfW * 0.35f, box.bottom, cx - halfW, box.bottom)
  }
  out.lineTo(box.left + r, box.bottom)
  out.quadTo(box.left, box.bottom, box.left, box.bottom - r)
  out.lineTo(box.left, box.top + r)
  out.quadTo(box.left, box.top, box.left + r, box.top)
  out.close()
}

private fun applyPressScale(view: View) {
  view.setOnTouchListener { v, event ->
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        v.animate().cancel()
        v.animate().scaleX(0.94f).scaleY(0.94f).setDuration(90L)
          .setInterpolator(DecelerateInterpolator()).start()
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        v.animate().cancel()
        v.animate().scaleX(1f).scaleY(1f).setDuration(190L)
          .setInterpolator(OvershootInterpolator(1.6f)).start()
      }
    }
    false
  }
}

/**
 * 独立贴边自适应液态玻璃气泡（非阻断触控），带平滑曲线尾巴、情绪色点与弹簧缩放淡入淡出。
 */
private class PetBubbleWindow(
  private val service: WhaleOverlayService,
  private val handler: Handler,
) {
  private val density = service.resources.displayMetrics.density
  private fun dp(v: Float) = v * density

  private val view = BubbleCanvasView(service)
  private val params = WindowManager.LayoutParams(
    WindowManager.LayoutParams.WRAP_CONTENT,
    WindowManager.LayoutParams.WRAP_CONTENT,
    overlayWindowType(),
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
    PixelFormat.TRANSLUCENT,
  ).apply { gravity = Gravity.TOP or Gravity.LEFT }

  private var attached = false
  private var showing = false
  private var reducedMotion = false
  private var palette = OverlayPalette.DARK
  private var animator: ValueAnimator? = null
  private val autoHideRunnable = Runnable { dismissAnimated() }

  private var anchorLeft = 0f
  private var anchorTop = 0f
  private var anchorRight = 0f
  private var anchorBottom = 0f
  private val safeBounds = RectF()
  private var placedBelow = false

  fun setTheme(newPalette: OverlayPalette, reduced: Boolean) {
    palette = newPalette
    reducedMotion = reduced
    view.updatePalette(newPalette)
  }

  fun updateAnchor(left: Float, top: Float, right: Float, bottom: Float, safe: RectF) {
    anchorLeft = left
    anchorTop = top
    anchorRight = right
    anchorBottom = bottom
    safeBounds.set(safe)
    if (attached && showing) {
      reposition()
    }
  }

  fun show(
    text: String,
    accentColor: Int,
    durationMs: Long,
    left: Float,
    top: Float,
    right: Float,
    bottom: Float,
    safe: RectF,
  ) {
    if (text.isBlank() || !Settings.canDrawOverlays(service)) return
    anchorLeft = left
    anchorTop = top
    anchorRight = right
    anchorBottom = bottom
    safeBounds.set(safe)

    handler.removeCallbacks(autoHideRunnable)
    cancelAnimator()

    val maxWinW = min(dp(248f), max(dp(170f), safe.width() - dp(24f)))
    view.configureContent(text, accentColor, palette, maxWinW)
    params.width = view.measuredWinW
    params.height = view.measuredWinH

    computePosition()

    if (!attached) {
      if (!service.safeAddView(view, params)) return
      attached = true
    } else {
      service.safeUpdateView(view, params)
    }

    showing = true
    view.visibility = View.VISIBLE
    if (reducedMotion) {
      view.animScale = 1f
      view.animAlpha = 1f
      view.animSlideY = 0f
      view.invalidate()
    } else {
      val fromSlide = if (placedBelow) -dp(7f) else dp(7f)
      val spring = OvershootInterpolator(1.0f)
      val decel = DecelerateInterpolator()
      animator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 260L
        addUpdateListener { a ->
          val t = a.animatedValue as Float
          view.animScale = 0.74f + 0.26f * spring.getInterpolation(t)
          view.animAlpha = decel.getInterpolation(min(1f, t * 1.45f))
          view.animSlideY = fromSlide * (1f - decel.getInterpolation(t))
          view.invalidate()
        }
        start()
      }
    }

    handler.postDelayed(autoHideRunnable, durationMs.coerceIn(1200L, 6500L))
  }

  private fun computePosition() {
    val w = params.width.toFloat()
    val h = params.height.toFloat()
    val margin = dp(10f)
    val gap = dp(2f)
    val headX = (anchorLeft + anchorRight) * 0.5f

    val aboveY = anchorTop - h + dp(12f) - gap
    val belowY = anchorBottom - dp(12f) + gap
    val canAbove = aboveY >= safeBounds.top + dp(4f)
    placedBelow = !canAbove && (belowY + h <= safeBounds.bottom - dp(4f))

    val rawY = if (placedBelow) belowY else aboveY
    val minX = safeBounds.left + margin
    val maxX = max(minX, safeBounds.right - margin - w)
    val clampedX = (headX - w * 0.5f).coerceIn(minX, maxX)
    val clampedY = rawY.coerceIn(safeBounds.top + dp(2f), max(safeBounds.top + dp(2f), safeBounds.bottom - h - dp(2f)))

    params.x = clampedX.roundToInt()
    params.y = clampedY.roundToInt()
    view.setCaret(headX - clampedX, placedBelow)
  }

  private fun reposition() {
    computePosition()
    service.safeUpdateView(view, params)
    view.invalidate()
  }

  fun dismissAnimated() {
    handler.removeCallbacks(autoHideRunnable)
    if (!attached || !showing) return
    showing = false
    cancelAnimator()
    if (reducedMotion) {
      hideOrDetach(detach = false)
      return
    }
    val startAlpha = view.animAlpha
    val startScale = view.animScale
    val accel = AccelerateInterpolator()
    animator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 170L
      addUpdateListener { a ->
        val t = accel.getInterpolation(a.animatedValue as Float)
        view.animAlpha = startAlpha * (1f - t)
        view.animScale = startScale - 0.14f * t
        view.invalidate()
      }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          if (!showing) hideOrDetach(detach = false)
        }
      })
      start()
    }
  }

  fun hideImmediate(detach: Boolean = true) {
    handler.removeCallbacks(autoHideRunnable)
    showing = false
    cancelAnimator()
    hideOrDetach(detach)
  }

  private fun hideOrDetach(detach: Boolean) {
    view.visibility = View.GONE
    if (detach && attached) {
      service.safeRemoveView(view)
      attached = false
    }
  }

  private fun cancelAnimator() {
    animator?.apply {
      removeAllUpdateListeners()
      removeAllListeners()
      cancel()
    }
    animator = null
  }

  fun destroyImmediate() {
    hideImmediate(detach = true)
  }

  private class BubbleCanvasView(context: Context) : View(context) {
    private val density = resources.displayMetrics.density
    private fun dp(v: Float) = v * density

    private val padShadow = dp(8f)
    private val caretH = dp(7.5f)
    private val caretW = dp(15f)
    private val cornerR = dp(15f)
    private val padH = dp(13f)
    private val padV = dp(9f)
    private val dotRadius = dp(3.2f)
    private val dotGap = dp(7f)

    private var palette = OverlayPalette.DARK
    private var accentColor = Color.parseColor("#38BDF8")
    private val lines = ArrayList<String>(3)
    private var caretOffsetX = 0f
    private var caretOnTop = false

    var measuredWinW = dp(120f).roundToInt()
    var measuredWinH = dp(48f).roundToInt()
    var animScale = 1f
    var animAlpha = 1f
    var animSlideY = 0f

    private val path = Path()
    private val boxRect = RectF()
    private val sheenRect = RectF()
    private val shadowRect = RectF()

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val sheenPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = dp(1.1f)
    }
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = dp(11.8f)
      typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
    }

    private var shaderW = 0f
    private var shaderH = 0f
    private var shaderDark = true

    fun updatePalette(p: OverlayPalette) {
      palette = p
      textPaint.color = p.bodyInk
      shaderW = -1f
      invalidate()
    }

    fun setCaret(offsetX: Float, onTop: Boolean) {
      caretOffsetX = offsetX
      caretOnTop = onTop
    }

    fun configureContent(text: String, accent: Int, p: OverlayPalette, maxWinW: Float) {
      palette = p
      accentColor = accent
      textPaint.color = p.bodyInk
      lines.clear()

      val maxCardW = max(dp(110f), maxWinW - padShadow * 2f)
      val firstLineIndent = dotRadius * 2f + dotGap
      val maxTextW = max(dp(64f), maxCardW - padH * 2f)

      var start = 0
      while (start < text.length && lines.size < 3) {
        val avail = if (lines.isEmpty()) max(dp(44f), maxTextW - firstLineIndent) else maxTextW
        val count = textPaint.breakText(text, start, text.length, true, avail, null).coerceAtLeast(1)
        val end = start + count
        if (lines.size == 2 && end < text.length) {
          lines.add(text.substring(start, max(start + 1, end - 1)) + "…")
          break
        }
        lines.add(text.substring(start, end))
        start = end
      }

      var widest = 0f
      for (i in lines.indices) {
        val w = textPaint.measureText(lines[i]) + if (i == 0) firstLineIndent else 0f
        if (w > widest) widest = w
      }
      val fm = textPaint.fontMetrics
      val lineH = (fm.descent - fm.ascent) + dp(3.5f)
      val cardW = (widest + padH * 2f).coerceIn(dp(78f), maxCardW)
      val cardH = (lines.size * lineH + padV * 2f - dp(2.5f)).coerceAtLeast(dp(34f))

      measuredWinW = (cardW + padShadow * 2f).roundToInt()
      measuredWinH = (cardH + padShadow * 2f + caretH).roundToInt()
      shaderW = -1f
    }

    private fun ensureShaders(w: Float, h: Float) {
      if (shaderW == w && shaderH == h && shaderDark == palette.isDark) return
      shaderW = w
      shaderH = h
      shaderDark = palette.isDark
      fillPaint.shader = LinearGradient(0f, 0f, w * 0.45f, h, palette.bubbleStart, palette.bubbleEnd, Shader.TileMode.CLAMP)
      sheenPaint.shader = LinearGradient(0f, 0f, 0f, h * 0.55f, palette.sheenStart, palette.sheenEnd, Shader.TileMode.CLAMP)
      strokePaint.shader = LinearGradient(0f, 0f, w, h, palette.rimStart, palette.rimEnd, Shader.TileMode.CLAMP)
    }

    override fun onDraw(canvas: Canvas) {
      if (lines.isEmpty() || animAlpha <= 0.01f) return
      val w = width.toFloat()
      val h = height.toFloat()
      if (w <= 0f || h <= 0f) return
      ensureShaders(w, h)

      val topY = padShadow + if (caretOnTop) caretH else 0f
      val bottomY = h - padShadow - if (caretOnTop) 0f else caretH
      boxRect.set(padShadow, topY, w - padShadow, bottomY)
      buildUnifiedGlassPath(path, boxRect, cornerR, caretOffsetX, caretW, caretH, caretOnTop)

      val pivotX = caretOffsetX.coerceIn(boxRect.left + cornerR, boxRect.right - cornerR)
      val pivotY = if (caretOnTop) boxRect.top - caretH else boxRect.bottom + caretH

      canvas.save()
      canvas.translate(0f, animSlideY)
      canvas.scale(animScale, animScale, pivotX, pivotY)

      val alphaInt = (255 * animAlpha).roundToInt().coerceIn(0, 255)
      // 柔和分层阴影（硬件加速友好，无需关闭硬件层）
      val baseShadowAlpha = Color.alpha(palette.shadowColor)
      val sr = Color.red(palette.shadowColor)
      val sg = Color.green(palette.shadowColor)
      val sb = Color.blue(palette.shadowColor)
      for (layer in 0..2) {
        val spread = dp(1.5f + layer * 2.1f)
        val dy = dp(2.2f + layer * 1.4f)
        shadowPaint.color = Color.argb(
          ((baseShadowAlpha * (0.45f - layer * 0.12f)) * animAlpha).roundToInt().coerceIn(0, 255),
          sr,
          sg,
          sb,
        )
        shadowRect.set(boxRect.left - spread * 0.4f, boxRect.top + dy - spread * 0.2f, boxRect.right + spread * 0.4f, boxRect.bottom + dy + spread * 0.4f)
        canvas.drawRoundRect(shadowRect, cornerR + spread * 0.35f, cornerR + spread * 0.35f, shadowPaint)
      }

      fillPaint.alpha = alphaInt
      canvas.drawPath(path, fillPaint)

      // 顶部液态玻璃光泽层
      canvas.save()
      canvas.clipPath(path)
      sheenRect.set(boxRect.left, boxRect.top, boxRect.right, boxRect.top + boxRect.height() * 0.56f)
      sheenPaint.alpha = alphaInt
      canvas.drawRect(sheenRect, sheenPaint)
      canvas.restore()

      strokePaint.alpha = alphaInt
      canvas.drawPath(path, strokePaint)

      // 绘制情绪小圆点与多行高对比文字
      val fm = textPaint.fontMetrics
      val lineH = (fm.descent - fm.ascent) + dp(3.5f)
      val contentH = lines.size * lineH - dp(3.5f)
      val baseY = boxRect.centerY() - contentH * 0.5f - fm.ascent

      dotPaint.color = accentColor
      dotPaint.alpha = alphaInt
      val dotCx = boxRect.left + padH + dotRadius
      val dotCy = baseY + (fm.ascent + fm.descent) * 0.5f
      canvas.drawCircle(dotCx, dotCy, dotRadius, dotPaint)

      textPaint.alpha = alphaInt
      val firstLineX = dotCx + dotRadius + dotGap
      val normalLineX = boxRect.left + padH
      for (i in lines.indices) {
        val lx = if (i == 0) firstLineX else normalLineX
        canvas.drawText(lines[i], lx, baseY + i * lineH, textPaint)
      }

      canvas.restore()
    }
  }
}

/**
 * 复用已缓存 idle 图集的圆形大肥鱼头像徽章（零额外 Bitmap 内存开销）。
 */
private class WhalePortraitView(
  context: Context,
  private val bank: SheetBank,
) : View(context) {
  private val density = resources.displayMetrics.density
  private fun dp(v: Float) = v * density

  private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = dp(1.5f)
  }
  private val bmpPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val fallbackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    textSize = dp(18f)
  }
  private val clipPath = Path()
  private val src = Rect()
  private val dst = RectF()
  private var isDark = true

  fun setTheme(dark: Boolean) {
    isDark = dark
    if (width > 0 && height > 0) rebuildShaders(width, height)
    invalidate()
  }

  private fun rebuildShaders(w: Int, h: Int) {
    val cx = w * 0.5f
    val cy = h * 0.5f
    val r = min(w, h) * 0.5f - dp(1f)
    clipPath.reset()
    clipPath.addCircle(cx, cy, max(1f, r - dp(1f)), Path.Direction.CW)
    bgPaint.shader = LinearGradient(
      0f,
      0f,
      w.toFloat(),
      h.toFloat(),
      if (isDark) 0xFF1D4ED8.toInt() else 0xFFBAE6FD.toInt(),
      if (isDark) 0xFF0E7490.toInt() else 0xFFE0F2FE.toInt(),
      Shader.TileMode.CLAMP,
    )
    rimPaint.shader = LinearGradient(
      0f,
      0f,
      w.toFloat(),
      h.toFloat(),
      0xCC7DD3FC.toInt(),
      0x6638BDF8.toInt(),
      Shader.TileMode.CLAMP,
    )
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    rebuildShaders(w, h)
  }

  override fun onDraw(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    if (w <= 0f || h <= 0f) return
    val cx = w * 0.5f
    val cy = h * 0.5f
    val r = min(w, h) * 0.5f - dp(1f)

    canvas.drawCircle(cx, cy, r, bgPaint)

    val idle = bank.peek("idle")
    if (idle != null && !idle.isRecycled) {
      val cw = idle.width / 4
      val ch = idle.height / 3
      // 精准裁取大肥鱼脸部与蓝发蝴蝶结特写区域
      src.set(
        (cw * 0.08f).roundToInt(),
        (ch * 0.03f).roundToInt(),
        (cw * 0.86f).roundToInt(),
        (ch * 0.58f).roundToInt(),
      )
      dst.set(dp(2f), dp(2f), w - dp(2f), h - dp(2f))
      canvas.save()
      canvas.clipPath(clipPath)
      canvas.drawBitmap(idle, src, dst, bmpPaint)
      canvas.restore()
    } else {
      fallbackPaint.color = if (isDark) 0xFFE0F2FE.toInt() else 0xFF0284C7.toInt()
      canvas.drawText("🐋", cx, cy + dp(6.5f), fallbackPaint)
    }

    canvas.drawCircle(cx, cy, r - dp(0.5f), rimPaint)
  }
}

private data class PanelSnapshot(
  val petName: String,
  val emotionLabel: String,
  val fullness: Int,
  val mood: Int,
  val bond: Int,
  val edgeRest: Boolean,
  val ghostMode: Boolean,
  val nextActionLabel: String,
  val nextCourseSummary: String?,
  val whisperText: String,
)

private interface PanelCallbacks {
  fun onFeed(): PanelSnapshot
  fun onPat(): PanelSnapshot
  fun onCycleAction(): PanelSnapshot
  fun onOpenSchedule()
  fun onOpenChat()
  fun onToggleEdgeRest()
  fun onQuickChat(kind: String): PanelSnapshot
  fun onToggleGhost()
  fun onDismissPet()
}

/**
 * 灵动液态玻璃互动面板（Dynamic Island / Material 3 悬浮胶囊卡片）：
 * - 独立 WindowManager 浮层，贴边智能计算展开方向（上方/下方）与水平对齐，绝不出屏截断；
 * - 带平滑指针尾巴精准指向大肥鱼本体，并以该锚点为轴心弹簧缩放展开/收起；
 * - 内置实时状态条（饱食/心情/好感）、下节课跳转胶囊、2×3 玻璃操作格、快速聊两句与底部快捷工具条。
 */
private data class ActionTileViews(
  val container: LinearLayout,
  val icon: TextView,
  val title: TextView,
  val sub: TextView,
)

private class PetInteractionPanel(
  private val service: WhaleOverlayService,
  private val bank: SheetBank,
  private val handler: Handler,
  private val callbacks: PanelCallbacks,
) {
  private val density = service.resources.displayMetrics.density
  private fun dp(v: Float) = v * density
  private fun dpInt(v: Float) = (v * density).roundToInt()

  private var root: GlassPanelFrame? = null
  private var attached = false
  private var openState = false
  private var closing = false
  private var closedAtUptime = 0L
  private var reducedMotion = false
  private var palette = OverlayPalette.DARK
  private var animator: ValueAnimator? = null
  private var placedBelow = false

  // 可实时刷新视图引用
  private var portraitView: WhalePortraitView? = null
  private var nameView: TextView? = null
  private var emotionPill: TextView? = null
  private var fullnessFill: View? = null
  private var moodFill: View? = null
  private var bondFill: View? = null
  private var fullnessNum: TextView? = null
  private var moodNum: TextView? = null
  private var bondNum: TextView? = null
  private var whisperView: TextView? = null
  private var courseBanner: LinearLayout? = null
  private var courseText: TextView? = null
  private var actionSubText: TextView? = null
  private var restIconView: TextView? = null
  private var restTitleView: TextView? = null
  private var restSubView: TextView? = null

  private val params = WindowManager.LayoutParams(
    dpInt(288f),
    WindowManager.LayoutParams.WRAP_CONTENT,
    overlayWindowType(),
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
      WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
    PixelFormat.TRANSLUCENT,
  ).apply { gravity = Gravity.TOP or Gravity.LEFT }

  private val autoCloseRunnable = Runnable { closeAnimated() }

  fun isOpen() = openState && attached

  fun wasRecentlyClosed(windowMs: Long = 360L): Boolean =
    closedAtUptime > 0L && (SystemClock.uptimeMillis() - closedAtUptime) in 0L..windowMs

  fun setTheme(newPalette: OverlayPalette, reduced: Boolean): Boolean {
    val changed = palette.isDark != newPalette.isDark
    palette = newPalette
    reducedMotion = reduced
    return changed
  }

  private fun resetIdleTimer() {
    handler.removeCallbacks(autoCloseRunnable)
    handler.postDelayed(autoCloseRunnable, 22_000L)
  }

  fun open(
    snapshot: PanelSnapshot,
    petLeft: Float,
    petTop: Float,
    petRight: Float,
    petBottom: Float,
    safeBounds: RectF,
    newPalette: OverlayPalette,
    reduced: Boolean,
  ) {
    if (!Settings.canDrawOverlays(service)) return
    palette = newPalette
    reducedMotion = reduced
    if (attached) {
      destroyImmediate()
    }

    val panelFrame = buildPanelTree(snapshot)
    root = panelFrame

    val targetW = min(dpInt(292f), max(dpInt(248f), (safeBounds.width() - dp(16f)).roundToInt()))
    params.width = targetW
    params.height = WindowManager.LayoutParams.WRAP_CONTENT

    // 先以非侵入方式精确测算真实高度，确保上方/下方展开决策零截断（横屏/分屏自动限高可滚）
    val maxAvailH = (safeBounds.height() - dp(16f)).roundToInt().coerceAtLeast(dpInt(180f))
    val widthSpec = View.MeasureSpec.makeMeasureSpec(targetW, View.MeasureSpec.EXACTLY)
    val heightSpec = View.MeasureSpec.makeMeasureSpec(maxAvailH, View.MeasureSpec.AT_MOST)
    panelFrame.measure(widthSpec, heightSpec)
    val measuredH = panelFrame.measuredHeight.coerceIn(dpInt(180f), maxAvailH)
    params.height = if (panelFrame.measuredHeight >= maxAvailH) maxAvailH else WindowManager.LayoutParams.WRAP_CONTENT

    positionPanel(panelFrame, targetW.toFloat(), measuredH.toFloat(), petLeft, petTop, petRight, petBottom, safeBounds)

    if (!service.safeAddView(panelFrame, params)) {
      root = null
      return
    }
    attached = true
    openState = true
    closing = false
    closedAtUptime = 0L
    resetIdleTimer()

    cancelAnimator()
    if (reducedMotion) {
      panelFrame.alpha = 1f
      panelFrame.scaleX = 1f
      panelFrame.scaleY = 1f
      panelFrame.translationY = 0f
    } else {
      val pivotX = panelFrame.caretOffsetX.coerceIn(dp(28f), targetW - dp(28f))
      val pivotY = if (placedBelow) dp(10f) else measuredH - dp(10f)
      panelFrame.pivotX = pivotX
      panelFrame.pivotY = pivotY
      val fromSlide = if (placedBelow) -dp(10f) else dp(10f)
      panelFrame.alpha = 0f
      panelFrame.scaleX = 0.80f
      panelFrame.scaleY = 0.80f
      panelFrame.translationY = fromSlide

      val spring = OvershootInterpolator(0.85f)
      val decel = DecelerateInterpolator()
      animator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 290L
        addUpdateListener { a ->
          val t = a.animatedValue as Float
          val s = 0.80f + 0.20f * spring.getInterpolation(t)
          panelFrame.scaleX = s
          panelFrame.scaleY = s
          panelFrame.alpha = decel.getInterpolation(min(1f, t * 1.55f))
          panelFrame.translationY = fromSlide * (1f - decel.getInterpolation(t))
        }
        start()
      }
    }
    service.changed()
  }

  fun reposition(petLeft: Float, petTop: Float, petRight: Float, petBottom: Float, safeBounds: RectF) {
    val frame = root ?: return
    if (!attached || !openState) return
    val w = params.width.toFloat()
    val h = (if (frame.height > 0) frame.height else frame.measuredHeight).toFloat().coerceAtLeast(dp(220f))
    positionPanel(frame, w, h, petLeft, petTop, petRight, petBottom, safeBounds)
    service.safeUpdateView(frame, params)
  }

  private fun positionPanel(
    frame: GlassPanelFrame,
    panelW: Float,
    panelH: Float,
    petLeft: Float,
    petTop: Float,
    petRight: Float,
    petBottom: Float,
    safe: RectF,
  ) {
    val margin = dp(8f)
    val petCenterX = (petLeft + petRight) * 0.5f
    val spaceAbove = petTop - safe.top
    val spaceBelow = safe.bottom - petBottom
    placedBelow = spaceAbove < panelH - dp(6f) && spaceBelow >= spaceAbove

    val rawY = if (placedBelow) petBottom - dp(10f) else petTop - panelH + dp(12f)
    val minX = safe.left + margin
    val maxX = max(minX, safe.right - margin - panelW)
    val clampedX = (petCenterX - panelW * 0.5f).coerceIn(minX, maxX)
    val minY = safe.top + dp(4f)
    val maxY = max(minY, safe.bottom - panelH - dp(4f))
    val clampedY = rawY.coerceIn(minY, maxY)

    params.x = clampedX.roundToInt()
    params.y = clampedY.roundToInt()
    frame.setCaret(petCenterX - clampedX, placedBelow)
  }

  fun refresh(snapshot: PanelSnapshot) {
    nameView?.text = snapshot.petName
    emotionPill?.text = "● ${snapshot.emotionLabel}"
    updateMeter(fullnessFill, fullnessNum, snapshot.fullness)
    updateMeter(moodFill, moodNum, snapshot.mood)
    updateMeter(bondFill, bondNum, snapshot.bond)
    whisperView?.let { tv ->
      if (tv.text.toString() != snapshot.whisperText) {
        tv.text = snapshot.whisperText
        if (!reducedMotion) {
          tv.alpha = 0.35f
          tv.animate().cancel()
          tv.animate().alpha(1f).setDuration(200L).start()
        }
      }
    }
    if (snapshot.nextCourseSummary != null) {
      courseBanner?.visibility = View.VISIBLE
      courseText?.text = snapshot.nextCourseSummary
    } else {
      courseBanner?.visibility = View.GONE
    }
    actionSubText?.text = snapshot.nextActionLabel
    restIconView?.text = if (snapshot.edgeRest) "☀" else "🌙"
    restTitleView?.text = if (snapshot.edgeRest) "唤醒她" else "贴边休"
    restSubView?.text = if (snapshot.edgeRest) "恢复玩耍" else "安静靠边"
    portraitView?.invalidate()
  }

  private fun updateMeter(bar: View?, label: TextView?, value: Int) {
    val pct = value.coerceIn(0, 100)
    label?.text = "$pct"
    bar?.let { v ->
      val lp = v.layoutParams as? LinearLayout.LayoutParams ?: return
      lp.weight = max(4f, pct.toFloat())
      v.layoutParams = lp
    }
  }

  fun closeAnimated() {
    handler.removeCallbacks(autoCloseRunnable)
    val frame = root ?: return
    if (!attached || closing) return
    closing = true
    openState = false
    closedAtUptime = SystemClock.uptimeMillis()
    cancelAnimator()

    if (reducedMotion) {
      detachNow()
      return
    }
    val startAlpha = frame.alpha
    val startScale = frame.scaleX
    val accel = AccelerateInterpolator()
    animator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 170L
      addUpdateListener { a ->
        val t = accel.getInterpolation(a.animatedValue as Float)
        frame.alpha = startAlpha * (1f - t)
        val s = startScale - 0.14f * t
        frame.scaleX = s
        frame.scaleY = s
      }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          detachNow()
        }
      })
      start()
    }
  }

  private fun detachNow() {
    val frame = root
    val wasAttached = attached
    root = null
    openState = false
    closing = false
    if (wasAttached) closedAtUptime = SystemClock.uptimeMillis()
    clearViewRefs()
    if (frame != null && wasAttached) {
      service.safeRemoveView(frame)
    }
    attached = false
    service.changed()
  }

  private fun clearViewRefs() {
    portraitView = null
    nameView = null
    emotionPill = null
    fullnessFill = null
    moodFill = null
    bondFill = null
    fullnessNum = null
    moodNum = null
    bondNum = null
    whisperView = null
    courseBanner = null
    courseText = null
    actionSubText = null
    restIconView = null
    restTitleView = null
    restSubView = null
  }

  private fun cancelAnimator() {
    animator?.apply {
      removeAllUpdateListeners()
      removeAllListeners()
      cancel()
    }
    animator = null
  }

  fun destroyImmediate() {
    handler.removeCallbacks(autoCloseRunnable)
    cancelAnimator()
    detachNow()
  }

  private fun pillDrawable(fill: Int, stroke: Int, radiusDp: Float): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      setColor(fill)
      cornerRadius = dp(radiusDp)
      if (stroke != Color.TRANSPARENT) {
        setStroke(dpInt(1f).coerceAtLeast(1), stroke)
      }
    }

  private fun buildMeterRow(label: String, value: Int, color: Int): Triple<LinearLayout, View, TextView> {
    val col = LinearLayout(service).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }
    val top = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val lbl = TextView(service).apply {
      text = label
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 9.5f)
      setTextColor(palette.mutedInk)
      includeFontPadding = false
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }
    val num = TextView(service).apply {
      text = "${value.coerceIn(0, 100)}"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 9.5f)
      setTextColor(color)
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
    }
    top.addView(lbl)
    top.addView(num)

    val track = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      weightSum = 100f
      background = pillDrawable(palette.trackBg, Color.TRANSPARENT, 4f)
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dpInt(4f)).apply {
        topMargin = dpInt(3f)
      }
    }
    val fill = View(service).apply {
      background = pillDrawable(color, Color.TRANSPARENT, 4f)
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, max(4f, value.coerceIn(0, 100).toFloat()))
    }
    track.addView(fill)
    col.addView(top)
    col.addView(track)
    return Triple(col, fill, num)
  }

  private fun buildActionTile(
    icon: String,
    title: String,
    subtitle: String,
    badgeBg: Int,
    onClick: () -> Unit,
  ): ActionTileViews {
    val tile = LinearLayout(service).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      background = pillDrawable(palette.tileBg, palette.tileStroke, 15f)
      setPadding(dpInt(6f), dpInt(8f), dpInt(6f), dpInt(8f))
      isClickable = true
      isFocusable = true
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }
    val iconView = TextView(service).apply {
      text = icon
      gravity = Gravity.CENTER
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      includeFontPadding = false
      background = pillDrawable(badgeBg, Color.TRANSPARENT, 13f)
      layoutParams = LinearLayout.LayoutParams(dpInt(30f), dpInt(30f))
    }
    val titleView = TextView(service).apply {
      text = title
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
      setTextColor(palette.titleInk)
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
      maxLines = 1
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dpInt(5f)
      }
    }
    val subView = TextView(service).apply {
      text = subtitle
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 9.2f)
      setTextColor(palette.mutedInk)
      includeFontPadding = false
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dpInt(2f)
      }
    }
    tile.addView(iconView)
    tile.addView(titleView)
    tile.addView(subView)
    applyPressScale(tile)
    tile.setOnClickListener {
      resetIdleTimer()
      onClick()
    }
    return ActionTileViews(tile, iconView, titleView, subView)
  }

  private fun buildPanelTree(snapshot: PanelSnapshot): GlassPanelFrame {
    val frame = GlassPanelFrame(service, palette) { closeAnimated() }
    val body = LinearLayout(service).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dpInt(14f), dpInt(13f), dpInt(14f), dpInt(12f))
    }

    // 1. 头部：圆形大肥鱼头像 + 昵称/情绪胶囊 + 关闭按钮
    val header = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val portrait = WhalePortraitView(service, bank).apply {
      setTheme(palette.isDark)
      layoutParams = LinearLayout.LayoutParams(dpInt(42f), dpInt(42f)).apply {
        marginEnd = dpInt(10f)
      }
    }
    portraitView = portrait

    val metaCol = LinearLayout(service).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }
    val titleRow = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val nameTv = TextView(service).apply {
      text = snapshot.petName
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f)
      setTextColor(palette.titleInk)
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
    }
    nameView = nameTv

    val moodPill = TextView(service).apply {
      text = "● ${snapshot.emotionLabel}"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 9.8f)
      setTextColor(palette.chipInk)
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
      background = pillDrawable(palette.chipBg, palette.chipStroke, 10f)
      setPadding(dpInt(7f), dpInt(3f), dpInt(7f), dpInt(3f))
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        marginStart = dpInt(7f)
      }
    }
    emotionPill = moodPill
    titleRow.addView(nameTv)
    titleRow.addView(moodPill)

    // 3 项养护微进度条（饱食 / 心情 / 好感）
    val metersRow = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dpInt(6f)
      }
    }
    val (fCol, fFill, fNum) = buildMeterRow("饱食", snapshot.fullness, 0xFFF59E0B.toInt())
    val (mCol, mFill, mNum) = buildMeterRow("心情", snapshot.mood, 0xFFF472B6.toInt())
    val (bCol, bFill, bNum) = buildMeterRow("好感", snapshot.bond, 0xFF38BDF8.toInt())
    (fCol.layoutParams as LinearLayout.LayoutParams).marginEnd = dpInt(6f)
    (mCol.layoutParams as LinearLayout.LayoutParams).marginEnd = dpInt(6f)
    fullnessFill = fFill; fullnessNum = fNum
    moodFill = mFill; moodNum = mNum
    bondFill = bFill; bondNum = bNum
    metersRow.addView(fCol)
    metersRow.addView(mCol)
    metersRow.addView(bCol)

    metaCol.addView(titleRow)
    metaCol.addView(metersRow)

    val closeBtn = TextView(service).apply {
      text = "✕"
      gravity = Gravity.CENTER
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      setTextColor(palette.closeInk)
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
      background = pillDrawable(palette.closeBg, Color.TRANSPARENT, 14f)
      contentDescription = "关闭互动面板"
      layoutParams = LinearLayout.LayoutParams(dpInt(28f), dpInt(28f)).apply {
        marginStart = dpInt(8f)
        gravity = Gravity.TOP
      }
    }
    applyPressScale(closeBtn)
    closeBtn.setOnClickListener { closeAnimated() }

    header.addView(portrait)
    header.addView(metaCol)
    header.addView(closeBtn)
    body.addView(header)

    // 2. 面板内轻声回应条（互动时即时反馈，不与浮层重叠）
    val whisper = TextView(service).apply {
      text = snapshot.whisperText
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.2f)
      setTextColor(palette.bodyInk)
      includeFontPadding = false
      maxLines = 2
      ellipsize = TextUtils.TruncateAt.END
      setLineSpacing(dp(2f), 1f)
      background = pillDrawable(palette.whisperBg, palette.whisperStroke, 12f)
      setPadding(dpInt(10f), dpInt(7f), dpInt(10f), dpInt(7f))
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dpInt(9f)
      }
    }
    whisperView = whisper
    body.addView(whisper)

    // 3. 下节课动态提醒胶囊（有即将开始的课程时显示，点按直达课表）
    val courseBox = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = pillDrawable(palette.courseBg, palette.courseStroke, 12f)
      setPadding(dpInt(10f), dpInt(7f), dpInt(10f), dpInt(7f))
      visibility = if (snapshot.nextCourseSummary != null) View.VISIBLE else View.GONE
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dpInt(8f)
      }
    }
    val courseTv = TextView(service).apply {
      text = snapshot.nextCourseSummary ?: ""
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setTextColor(palette.courseInk)
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }
    val courseArrow = TextView(service).apply {
      text = "课表 ›"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
      setTextColor(palette.chipInk)
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        marginStart = dpInt(6f)
      }
    }
    courseBox.addView(courseTv)
    courseBox.addView(courseArrow)
    applyPressScale(courseBox)
    courseBox.setOnClickListener {
      closeAnimated()
      callbacks.onOpenSchedule()
    }
    courseBanner = courseBox
    courseText = courseTv
    body.addView(courseBox)

    // 4. 核心 2×3 液态玻璃互动格（喂饭/摸头/换动作 · 查课表/主聊天/贴边休）
    val row1 = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dpInt(10f)
      }
    }
    val feedTile = buildActionTile("🍙", "喂团子", "饱食+24", 0x2DF59E0B.toInt()) {
      refresh(callbacks.onFeed())
    }
    val patTile = buildActionTile("💗", "摸摸头", "心情+8", 0x2DF472B6.toInt()) {
      refresh(callbacks.onPat())
    }
    val actTile = buildActionTile("✨", "换动作", snapshot.nextActionLabel, 0x2DA78BFA.toInt()) {
      refresh(callbacks.onCycleAction())
    }
    actionSubText = actTile.sub
    (feedTile.container.layoutParams as LinearLayout.LayoutParams).marginEnd = dpInt(7f)
    (patTile.container.layoutParams as LinearLayout.LayoutParams).marginEnd = dpInt(7f)
    row1.addView(feedTile.container)
    row1.addView(patTile.container)
    row1.addView(actTile.container)
    body.addView(row1)

    val row2 = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dpInt(7f)
      }
    }
    val schedTile = buildActionTile("📅", "查课表", "今日课程", 0x2D38BDF8.toInt()) {
      closeAnimated()
      callbacks.onOpenSchedule()
    }
    val chatTile = buildActionTile("💬", "去聊天", "回主应用", 0x2D2DD4BF.toInt()) {
      closeAnimated()
      callbacks.onOpenChat()
    }
    val restTile = buildActionTile(
      if (snapshot.edgeRest) "☀" else "🌙",
      if (snapshot.edgeRest) "唤醒她" else "贴边休",
      if (snapshot.edgeRest) "恢复玩耍" else "安静靠边",
      0x2D818CF8.toInt(),
    ) {
      closeAnimated()
      callbacks.onToggleEdgeRest()
    }
    restIconView = restTile.icon
    restTitleView = restTile.title
    restSubView = restTile.sub
    (schedTile.container.layoutParams as LinearLayout.LayoutParams).marginEnd = dpInt(7f)
    (chatTile.container.layoutParams as LinearLayout.LayoutParams).marginEnd = dpInt(7f)
    row2.addView(schedTile.container)
    row2.addView(chatTile.container)
    row2.addView(restTile.container)
    body.addView(row2)

    // 5. 快速聊两句胶囊条（本地零延迟人设回应）
    val quickRow = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dpInt(9f)
      }
    }
    val quickItems = arrayOf(
      "夸夸我" to "praise",
      "下节课?" to "course",
      "陪我学" to "study",
    )
    for (i in quickItems.indices) {
      val (label, key) = quickItems[i]
      val chip = TextView(service).apply {
        text = "「$label」"
        gravity = Gravity.CENTER
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.8f)
        setTextColor(palette.chipInk)
        typeface = Typeface.DEFAULT_BOLD
        includeFontPadding = false
        background = pillDrawable(palette.chipBg, palette.chipStroke, 12f)
        setPadding(dpInt(6f), dpInt(7f), dpInt(6f), dpInt(7f))
        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
          if (i < quickItems.lastIndex) marginEnd = dpInt(6f)
        }
      }
      applyPressScale(chip)
      chip.setOnClickListener {
        resetIdleTimer()
        refresh(callbacks.onQuickChat(key))
      }
      quickRow.addView(chip)
    }
    body.addView(quickRow)

    // 6. 底部紧凑工具栏（防误触穿透 / 收回桌宠）
    val footer = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dpInt(9f)
      }
    }
    val ghostBtn = TextView(service).apply {
      text = if (snapshot.ghostMode) "✨ 恢复触控" else "👻 防误触穿透"
      gravity = Gravity.CENTER
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setTextColor(palette.bodyInk)
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
      background = pillDrawable(palette.tileBg, palette.tileStroke, 12f)
      setPadding(dpInt(8f), dpInt(8f), dpInt(8f), dpInt(8f))
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.15f).apply {
        marginEnd = dpInt(7f)
      }
    }
    applyPressScale(ghostBtn)
    ghostBtn.setOnClickListener {
      closeAnimated()
      callbacks.onToggleGhost()
    }

    val stopBtn = TextView(service).apply {
      text = "✕ 收回桌宠"
      gravity = Gravity.CENTER
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setTextColor(palette.dangerInk)
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
      background = pillDrawable(palette.dangerBg, palette.dangerStroke, 12f)
      setPadding(dpInt(8f), dpInt(8f), dpInt(8f), dpInt(8f))
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }
    applyPressScale(stopBtn)
    stopBtn.setOnClickListener {
      closeAnimated()
      callbacks.onDismissPet()
    }

    footer.addView(ghostBtn)
    footer.addView(stopBtn)
    body.addView(footer)

    val scroller = ScrollView(service).apply {
      isVerticalScrollBarEnabled = false
      overScrollMode = View.OVER_SCROLL_NEVER
      addView(
        body,
        FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT),
      )
    }

    frame.addView(
      scroller,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT),
    )
    return frame
  }

  private class GlassPanelFrame(
    context: Context,
    private var palette: OverlayPalette,
    private val onOutsideTap: () -> Unit,
  ) : FrameLayout(context) {
    private val density = resources.displayMetrics.density
    private fun dp(v: Float) = v * density
    private fun dpInt(v: Float) = (v * density).roundToInt()

    private val shadowPad = dp(10f)
    private val caretH = dp(9f)
    private val caretW = dp(18f)
    private val cornerR = dp(22f)

    var caretOffsetX = dp(140f)
    private var caretOnTop = false

    private val path = Path()
    private val cardRect = RectF()
    private val sheenRect = RectF()
    private val shadowRect = RectF()
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val sheenPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = dp(1.25f)
    }
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var shaderW = -1f
    private var shaderH = -1f
    private var shaderDark = palette.isDark

    init {
      setWillNotDraw(false)
      applyCaretPadding()
    }

    fun updatePalette(p: OverlayPalette) {
      palette = p
      shaderW = -1f
      invalidate()
    }

    fun setCaret(offsetX: Float, onTop: Boolean) {
      caretOffsetX = offsetX
      if (caretOnTop != onTop) {
        caretOnTop = onTop
        applyCaretPadding()
      }
      invalidate()
    }

    private fun applyCaretPadding() {
      val s = dpInt(10f)
      val c = dpInt(9f)
      setPadding(s, s + if (caretOnTop) c else 0, s, s + if (caretOnTop) 0 else c)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
      if (event.actionMasked == MotionEvent.ACTION_OUTSIDE) {
        onOutsideTap()
        return true
      }
      return super.onTouchEvent(event)
    }

    private fun ensureShaders(w: Float, h: Float) {
      if (shaderW == w && shaderH == h && shaderDark == palette.isDark) return
      shaderW = w
      shaderH = h
      shaderDark = palette.isDark
      fillPaint.shader = LinearGradient(0f, 0f, w * 0.65f, h, palette.cardStart, palette.cardEnd, Shader.TileMode.CLAMP)
      sheenPaint.shader = LinearGradient(0f, 0f, 0f, h * 0.45f, palette.sheenStart, palette.sheenEnd, Shader.TileMode.CLAMP)
      strokePaint.shader = LinearGradient(0f, 0f, w, h, palette.rimStart, palette.rimEnd, Shader.TileMode.CLAMP)
    }

    override fun onDraw(canvas: Canvas) {
      val w = width.toFloat()
      val h = height.toFloat()
      if (w <= 0f || h <= 0f) return
      ensureShaders(w, h)

      val topY = shadowPad + if (caretOnTop) caretH else 0f
      val bottomY = h - shadowPad - if (caretOnTop) 0f else caretH
      cardRect.set(shadowPad, topY, w - shadowPad, bottomY)
      buildUnifiedGlassPath(path, cardRect, cornerR, caretOffsetX, caretW, caretH, caretOnTop)

      // 分层柔和阴影
      val baseA = Color.alpha(palette.shadowColor)
      val r = Color.red(palette.shadowColor)
      val g = Color.green(palette.shadowColor)
      val b = Color.blue(palette.shadowColor)
      for (i in 0..2) {
        val spread = dp(1.5f + i * 2.4f)
        val dy = dp(3f + i * 1.8f)
        shadowPaint.color = Color.argb((baseA * (0.42f - i * 0.11f)).roundToInt().coerceIn(0, 255), r, g, b)
        shadowRect.set(
          cardRect.left - spread * 0.45f,
          cardRect.top + dy - spread * 0.2f,
          cardRect.right + spread * 0.45f,
          cardRect.bottom + dy + spread * 0.5f,
        )
        canvas.drawRoundRect(shadowRect, cornerR + spread * 0.35f, cornerR + spread * 0.35f, shadowPaint)
      }

      canvas.drawPath(path, fillPaint)

      canvas.save()
      canvas.clipPath(path)
      sheenRect.set(cardRect.left, cardRect.top, cardRect.right, cardRect.top + cardRect.height() * 0.42f)
      canvas.drawRect(sheenRect, sheenPaint)
      canvas.restore()

      canvas.drawPath(path, strokePaint)
      super.onDraw(canvas)
    }
  }
}

class WhaleOverlayService : Service() {
  companion object {
    @Volatile var instance: WhaleOverlayService? = null
    var launchResult: ((Throwable?) -> Unit)? = null
  }

  private var pet: DesktopPetView? = null
  private var bubbleWindow: PetBubbleWindow? = null
  private var interactionPanel: PetInteractionPanel? = null
  private lateinit var window: WindowManager
  private lateinit var sheetBank: SheetBank
  private val handler = Handler(Looper.getMainLooper())
  private var explicitDismiss = false
  private var ghostMode = false
  private var edgeRest = false
  private var options = JSONObject()

  private val systemReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        Intent.ACTION_SCREEN_OFF -> {
          interactionPanel?.destroyImmediate()
          bubbleWindow?.hideImmediate(detach = true)
          pet?.setScreenAwake(false)
          sheetBank.evictSecondary()
        }
        Intent.ACTION_SCREEN_ON -> pet?.setScreenAwake(true)
        Intent.ACTION_POWER_CONNECTED -> pet?.onChargerConnected()
        Intent.ACTION_BATTERY_CHANGED -> {
          val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
          val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
          val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
          val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
          if (level >= 0 && scale > 0) pet?.onBatterySample((level * 100) / scale, charging)
        }
      }
    }
  }

  override fun onBind(intent: Intent?) = null

  private fun resolveWindowManager(): WindowManager {
    if (Build.VERSION.SDK_INT >= 30) {
      val dm = getSystemService(DISPLAY_SERVICE) as? DisplayManager
      val display = dm?.getDisplay(Display.DEFAULT_DISPLAY)
      val ctx = runCatching {
        if (display != null) {
          createDisplayContext(display).createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
        } else {
          createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
        }
      }.getOrElse { this }
      return ctx.getSystemService(WINDOW_SERVICE) as WindowManager
    }
    return getSystemService(WINDOW_SERVICE) as WindowManager
  }

  internal fun safeAddView(view: View, params: WindowManager.LayoutParams): Boolean {
    if (!Settings.canDrawOverlays(this)) return false
    if (view.isAttachedToWindow || view.parent != null) {
      return safeUpdateView(view, params)
    }
    return runCatching {
      window.addView(view, params)
      true
    }.getOrDefault(false)
  }

  internal fun safeUpdateView(view: View, params: WindowManager.LayoutParams): Boolean {
    if (!view.isAttachedToWindow) return false
    return runCatching {
      window.updateViewLayout(view, params)
      true
    }.getOrDefault(false)
  }

  internal fun safeRemoveView(view: View) {
    if (!view.isAttachedToWindow && view.parent == null) return
    runCatching { window.removeViewImmediate(view) }
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "桌面大肥鱼", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) },
      )
    }
    val launch = buildDeepLinkIntent("dark-study://assistant")
    val open = PendingIntent.getActivity(this, NOTIF_ID, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val stop = PendingIntent.getService(this, NOTIF_ID + 1, Intent(this, WhaleOverlayService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val toggleGhost = PendingIntent.getService(this, NOTIF_ID + 2, Intent(this, WhaleOverlayService::class.java).setAction(ACTION_TOGGLE_GHOST), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val toggleRest = PendingIntent.getService(this, NOTIF_ID + 3, Intent(this, WhaleOverlayService::class.java).setAction(ACTION_TOGGLE_REST), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    val petName = options.optString("petName", "大肥鱼").ifBlank { "大肥鱼" }
    val subtitle = when {
      pet?.isStandbyHidden() == true -> "后台随行待命中 · 切出软件自动现身桌面"
      ghostMode -> "幽灵防误触穿透中 · 点通知按钮恢复触控"
      edgeRest -> "正贴在屏幕边安静休息 · 轻点即可唤醒"
      else -> "点头部摸头 · 双击或长按呼出液态玻璃互动面板"
    }

    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    return builder
      .setSmallIcon(android.R.drawable.ic_menu_info_details)
      .setContentTitle("${petName}在陪着你")
      .setContentText(subtitle)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(open)
      .addAction(android.R.drawable.ic_menu_view, if (ghostMode) "恢复触控" else "防误触", toggleGhost)
      .addAction(android.R.drawable.ic_menu_recent_history, if (edgeRest) "唤醒她" else "贴边休", toggleRest)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "收回", stop)
      .build()
  }

  private fun refreshNotification() {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    runCatching { manager.notify(NOTIF_ID, buildNotification()) }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    window = resolveWindowManager()
    sheetBank = SheetBank(this, handler) { pet?.onSheetLoaded() }
    bubbleWindow = PetBubbleWindow(this, handler)

    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(NOTIF_ID, notification)

    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_POWER_CONNECTED)
      addAction(Intent.ACTION_BATTERY_CHANGED)
    }
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(systemReceiver, filter, RECEIVER_NOT_EXPORTED)
    else registerReceiver(systemReceiver, filter)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("userDismissed", true).apply()
        dismiss(explicit = true)
        return START_NOT_STICKY
      }
      ACTION_TOGGLE_GHOST -> {
        setGhostMode(!ghostMode)
        return START_STICKY
      }
      ACTION_TOGGLE_REST -> {
        setEdgeRest(!edgeRest)
        return START_STICKY
      }
    }
    try {
      if (!Settings.canDrawOverlays(this)) throw SecurityException("悬浮窗权限已关闭")
      val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (intent == null && prefs.getBoolean("userDismissed", false)) {
        dismiss(explicit = true)
        return START_NOT_STICKY
      }
      val rawOptions = intent?.getStringExtra("options") ?: prefs.getString("lastOptions", "{}") ?: "{}"
      options = JSONObject(rawOptions)
      prefs.edit().putString("lastOptions", rawOptions).apply()

      if (pet != null) {
        applyOptions(options)
        resolveStart(null)
        return START_STICKY
      }

      val bubble = bubbleWindow ?: PetBubbleWindow(this, handler).also { bubbleWindow = it }
      val view = DesktopPetView(
        service = this,
        window = window,
        bank = sheetBank,
        bubble = bubble,
        onOpenSchedule = ::openScheduleScreen,
        onOpenChat = ::openChatScreen,
        onClose = { dismiss(explicit = true) },
        onToggleGhost = { setGhostMode(!ghostMode) },
        onEdgeRestChanged = { resting ->
          edgeRest = resting
          refreshNotification()
          changed()
        },
      )
      pet = view
      interactionPanel = PetInteractionPanel(this, sheetBank, handler, view.panelCallbacks)
      view.attachPanel(interactionPanel!!)

      val startHidden = options.optBoolean("startHidden", false)
      view.configure(options, applyPosition = true)
      view.setStandbyHidden(startHidden)
      if (!safeAddView(view, view.params)) {
        throw IllegalStateException("悬浮窗添加失败，请确认系统已允许悬浮窗权限")
      }
      view.setScreenAwake((getSystemService(POWER_SERVICE) as PowerManager).isInteractive)
      if (!startHidden) {
        sheetBank.request("idle")
        view.onFirstSpawn()
      }
      ghostMode = options.optBoolean("ghostMode", false)
      edgeRest = options.optBoolean("edgeRest", false)
      view.setGhostMode(ghostMode)
      if (edgeRest) view.setEdgeRest(true, announce = false)
      refreshNotification()
      changed()
      resolveStart(null)
    } catch (error: Exception) {
      resolveStart(error)
      dismiss(explicit = true)
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  fun applyOptions(json: JSONObject) {
    options = json
    pet?.configure(json, applyPosition = false)
    if (json.has("ghostMode")) {
      ghostMode = json.optBoolean("ghostMode", ghostMode)
      pet?.setGhostMode(ghostMode)
    }
    if (json.has("edgeRest")) {
      edgeRest = json.optBoolean("edgeRest", edgeRest)
      pet?.setEdgeRest(edgeRest, announce = false)
    }
    if (json.has("startHidden")) {
      val hidden = json.optBoolean("startHidden", false)
      if (hidden) {
        interactionPanel?.destroyImmediate()
        bubbleWindow?.hideImmediate(detach = true)
      }
      pet?.setStandbyHidden(hidden)
    }
    refreshNotification()
    changed()
  }

  fun setPetVisible(visible: Boolean, json: JSONObject?) {
    if (json != null) {
      options = json
      pet?.configure(json, applyPosition = visible && !edgeRest)
    }
    if (!visible) {
      interactionPanel?.destroyImmediate()
      bubbleWindow?.hideImmediate(detach = true)
    }
    pet?.setStandbyHidden(!visible)
    if (visible) {
      sheetBank.request("idle")
      pet?.onRevealedToDesktop()
    }
    refreshNotification()
    changed()
  }

  fun setGhostMode(enabled: Boolean) {
    ghostMode = enabled
    if (enabled) interactionPanel?.closeAnimated()
    pet?.setGhostMode(enabled)
    refreshNotification()
    changed()
  }

  fun setEdgeRest(enabled: Boolean) {
    edgeRest = enabled
    if (ghostMode && !enabled) setGhostMode(false)
    pet?.setEdgeRest(enabled, announce = true)
    refreshNotification()
    changed()
  }

  fun openInteractionPanel() {
    if (ghostMode) setGhostMode(false)
    pet?.openInteractionPanel()
  }

  fun isGhostMode() = ghostMode
  fun isEdgeRest() = edgeRest
  fun isPanelOpen() = interactionPanel?.isOpen() == true
  fun isPetVisible() = pet?.let { it.isAttachedToWindow && !it.isStandbyHidden() } == true
  fun attached() = pet?.isAttachedToWindow == true
  fun isExplicitlyDismissed() = explicitDismiss

  private fun buildDeepLinkIntent(uri: String): Intent =
    (packageManager.getLaunchIntentForPackage(packageName) ?: Intent(Intent.ACTION_VIEW).setPackage(packageName)).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse(uri)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }

  private fun openDeepLink(uri: String) {
    runCatching {
      startActivity(buildDeepLinkIntent(uri))
    }
  }

  private fun openChatScreen() = openDeepLink("dark-study://assistant")
  private fun openScheduleScreen() = openDeepLink("dark-study:///")

  private fun resolveStart(error: Throwable?) {
    val callback = launchResult
    launchResult = null
    callback?.invoke(error)
  }

  fun changed() {
    sendBroadcast(Intent("$packageName.$EVENT").setPackage(packageName))
  }

  fun dismiss(explicit: Boolean = true) {
    explicitDismiss = explicit
    interactionPanel?.destroyImmediate()
    bubbleWindow?.destroyImmediate()
    pet?.let { safeRemoveView(it); it.release() }
    pet = null
    changed()
    stopSelf()
  }

  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE || pet?.isStandbyHidden() == true) {
      sheetBank.evictSecondary()
    }
    if (pet?.isStandbyHidden() == true && level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) {
      sheetBank.evictAll()
    }
  }

  override fun onConfigurationChanged(config: Configuration) {
    super.onConfigurationChanged(config)
    pet?.onSystemConfigChanged()
  }

  override fun onDestroy() {
    interactionPanel?.destroyImmediate()
    interactionPanel = null
    bubbleWindow?.destroyImmediate()
    bubbleWindow = null
    pet?.let { safeRemoveView(it); it.release() }
    pet = null
    sheetBank.release()
    handler.removeCallbacksAndMessages(null)
    runCatching { unregisterReceiver(systemReceiver) }
    instance = null
    resolveStart(IllegalStateException("桌宠已收回"))
    changed()
    if (Build.VERSION.SDK_INT >= 24) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    super.onDestroy()
  }
}

private data class ClipSpec(
  val sheet: String,
  val cols: Int,
  val rows: Int,
  val startFrame: Int,
  val holds: IntArray,
  val loop: Boolean = true,
  val loopFrom: Int = 0,
)

private class ParticleSlot {
  var active = false
  var glyph = "♥"
  var color = Color.parseColor("#F472B6")
  var x = 0f
  var y = 0f
  var vx = 0f
  var vy = 0f
  var born = 0L
  var life = 1000L
}

/**
 * 零堆分配渲染、程序化二次运动、轻量 16 槽粒子池、贴边安静休息模式，
 * 并与独立液态玻璃气泡（PetBubbleWindow）与悬浮互动卡片（PetInteractionPanel）无缝协同。
 */
private class DesktopPetView(
  private val service: WhaleOverlayService,
  private val window: WindowManager,
  private val bank: SheetBank,
  private val bubble: PetBubbleWindow,
  private val onOpenSchedule: () -> Unit,
  private val onOpenChat: () -> Unit,
  private val onClose: () -> Unit,
  private val onToggleGhost: () -> Unit,
  private val onEdgeRestChanged: (Boolean) -> Unit,
) : View(service), Choreographer.FrameCallback {

  companion object {
    private val CLIPS = mapOf(
      "idle" to ClipSpec("idle", 4, 3, 0, intArrayOf(520, 220, 220, 240, 65, 65, 85, 65, 80, 220, 220, 260), true, 0),
      "happy" to ClipSpec("actions", 8, 5, 0, IntArray(8) { 68 }, false),
      "wave" to ClipSpec("actions", 8, 5, 8, IntArray(8) { 68 }, false),
      "eat" to ClipSpec("actions", 8, 5, 16, IntArray(8) { 74 }, false),
      "study" to ClipSpec("actions", 8, 5, 24, intArrayOf(680, 110, 110, 110, 110, 110, 110, 420), true),
      "sleep" to ClipSpec("actions", 8, 5, 32, intArrayOf(380, 110, 110, 160, 440, 440, 440, 440), true, 4),
      "dance" to ClipSpec("dance", 4, 4, 0, IntArray(16) { 62 }, true),
      "spin" to ClipSpec("spin", 4, 4, 0, IntArray(16) { 60 }, false),
      "hurt" to ClipSpec("hurt", 4, 2, 0, IntArray(8) { 72 }, false),
      "walk" to ClipSpec("lively", 8, 4, 0, IntArray(8) { 82 }, true),
      "peek" to ClipSpec("lively", 8, 4, 8, intArrayOf(360, 160, 180, 220, 110, 260, 180, 320), true),
      "dangle" to ClipSpec("lively", 8, 4, 16, IntArray(8) { 85 }, true),
      "cuddle" to ClipSpec("lively", 8, 4, 24, intArrayOf(110, 100, 180, 220, 180, 180, 120, 140), false),
    )

    private val ACTION_CYCLE = arrayOf(
      Triple("dance", "跳支舞", 3600L),
      Triple("spin", "转圈圈", 1250L),
      Triple("study", "陪学习", 5000L),
      Triple("peek", "探个头", 5200L),
      Triple("sleep", "眯会儿", 6000L),
    )
  }

  private val density = resources.displayMetrics.density
  private fun dp(value: Float) = value * density

  private var panel: PetInteractionPanel? = null

  private var scaleFactor = 1f
  private var userOpacity = 1f
  private var panelThemeMode = "auto"
  private var tapAction = "interact" // "interact" | "panel"
  private var showBubbles = true
  private var palette = OverlayPalette.resolve(service, panelThemeMode)

  private var viewW = dp(126f).roundToInt()
  private var viewH = dp(156f).roundToInt()

  val params = WindowManager.LayoutParams(
    viewW,
    viewH,
    overlayWindowType(),
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
    PixelFormat.TRANSLUCENT,
  ).apply { gravity = Gravity.TOP or Gravity.LEFT }

  // 预分配绘制对象（onDraw 零 GC）
  private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val uiPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val ripplePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = dp(2f)
  }
  private val restBadgePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val restBadgeStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = dp(1f)
  }
  private val restGlyphPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    textSize = dp(10f)
    typeface = Typeface.DEFAULT_BOLD
  }
  private val particlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    isFakeBoldText = true
  }
  private val src = Rect()
  private val dst = RectF()
  private val limits = RectF()
  private val safeScreen = RectF()
  private val restBadgeRect = RectF()
  private val particles = Array(16) { ParticleSlot() }

  private val handler = Handler(Looper.getMainLooper())
  private val redrawRunnable = Runnable { invalidate(); schedule() }
  private val autoBrainRunnable = Runnable { runAutonomousStep() }
  private val clipEndRunnable = Runnable { returnToIdle() }
  private val evictSecondaryRunnable = Runnable { bank.evictSecondary() }
  private val evictStandbyRunnable = Runnable { if (standbyHidden) bank.evictAll() }
  private val firstSpawnRunnable = Runnable {
    if (!released && !standbyHidden && awake && panel?.isOpen() != true) {
      sayBubble("我出来陪你啦～双击我可以打开互动卡片哦", 2700L, 0xFF38BDF8.toInt(), force = false)
    }
  }
  private val longPressRunnable = Runnable {
    if (dragging && !moved) {
      longPressTriggered = true
      dragging = false
      openInteractionPanel()
    }
  }

  private var awake = true
  private var standbyHidden = false
  private var ghostMode = false
  private var edgeRest = false
  private var released = false
  private var reduced = false
  private var dragging = false
  private var flying = false
  private var walking = false
  private var longPressTriggered = false
  private var suppressTapUntilUp = false

  // 物理 & 程序化次级运动状态
  private var x = 0f
  private var y = 0f
  private var vx = 0f
  private var vy = 0f
  private var walkTargetX = 0f
  private var walkEndToPeek = false
  private var walkEndToRest = false
  private var face = 1f
  private var tiltDeg = 0f
  private var squashX = 1f
  private var squashY = 1f
  private var squashVelX = 0f
  private var squashVelY = 0f
  private var rippleBorn = 0L
  private var rippleColor = 0xFF38BDF8.toInt()
  private var lastNanos = 0L
  private var born = SystemClock.uptimeMillis()

  // 动作 & 情绪/人设状态
  private var clip = "wave"
  private var clipAt = born
  private var actionCycleIdx = 0
  private var lastWhisper = "点我摸头、喂团子或查课表都可以哦～"
  private var impactAt = 0L
  private var lowBatteryNotifiedAt = 0L
  private var lastInteractionAt = born
  private var lastTapAt = 0L
  private var pokeStreak = 0
  private var lastPokeAt = 0L

  // 拎起晃动检测
  private var shakeDir = 0
  private var shakeFlips = 0
  private var shakeFlipAt = 0L

  // 同步自 JS 的人设与课程状态
  private var owner = "你"
  private var petName = "大肥鱼"
  private var emotionLabel = "元气陪伴"
  private var fullness = 82
  private var mood = 88
  private var bond = 50
  private var tsundere = 65
  private var affection = 70
  private var warmth = 80
  private var playfulness = 70
  private var nextCourseName = ""
  private var nextCoursePlace = ""
  private var nextCourseAtMs = 0L
  private var remindedCourseAtMs = 0L

  // 触摸追踪
  private var downX = 0f
  private var downY = 0f
  private var originX = 0f
  private var originY = 0f
  private var moved = false
  private var tracker: VelocityTracker? = null

  val panelCallbacks: PanelCallbacks = object : PanelCallbacks {
    override fun onFeed(): PanelSnapshot {
      val line = doFeed(fromPanel = true)
      return buildSnapshot(line)
    }

    override fun onPat(): PanelSnapshot {
      val line = doPat(fromPanel = true)
      return buildSnapshot(line)
    }

    override fun onCycleAction(): PanelSnapshot {
      val line = doCycleAction(fromPanel = true)
      return buildSnapshot(line)
    }

    override fun onOpenSchedule() {
      onOpenSchedule.invoke()
    }

    override fun onOpenChat() {
      onOpenChat.invoke()
    }

    override fun onToggleEdgeRest() {
      setEdgeRest(!edgeRest, announce = true)
    }

    override fun onQuickChat(kind: String): PanelSnapshot {
      val line = handleQuickChat(kind)
      return buildSnapshot(line)
    }

    override fun onToggleGhost() {
      onToggleGhost.invoke()
    }

    override fun onDismissPet() {
      onClose.invoke()
    }
  }

  init {
    contentDescription = "桌面大肥鱼，点头部摸头，双击或长按打开液态玻璃互动面板，拖动可抛掷"
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    bubble.setTheme(palette, reduced)
    updateBounds()
    x = (limits.right - dp(6f)).coerceIn(limits.left, limits.right)
    y = limits.top + (limits.bottom - limits.top) * 0.55f
    params.x = x.roundToInt()
    params.y = y.roundToInt()
    armAutonomousBrain(5500)
  }

  fun attachPanel(p: PetInteractionPanel) {
    panel = p
    p.setTheme(palette, reduced)
  }

  fun isStandbyHidden() = standbyHidden

  fun onSheetLoaded() {
    if (!released && !standbyHidden) {
      invalidate()
      schedule()
    }
  }

  fun onSystemConfigChanged() {
    updateBounds()
    refreshPalette()
    if (panel?.isOpen() == true) {
      panel?.reposition(x, y, x + viewW, y + viewH, safeScreen)
    }
    bubble.updateAnchor(x, y, x + viewW, y + viewH, safeScreen)
  }

  private fun refreshPalette() {
    palette = OverlayPalette.resolve(service, panelThemeMode)
    bubble.setTheme(palette, reduced)
    val themeChanged = panel?.setTheme(palette, reduced) == true
    if (themeChanged && panel?.isOpen() == true) {
      panel?.open(buildSnapshot(lastWhisper), x, y, x + viewW, y + viewH, safeScreen, palette, reduced)
    }
  }

  fun onFirstSpawn() {
    handler.removeCallbacks(firstSpawnRunnable)
    handler.postDelayed(firstSpawnRunnable, 240L)
  }

  private fun applyEffectiveAlpha() {
    alpha = when {
      ghostMode -> 0.45f
      edgeRest -> (userOpacity * 0.78f).coerceIn(0.45f, 0.86f)
      else -> userOpacity
    }
  }

  fun configure(options: JSONObject, applyPosition: Boolean = false) {
    owner = options.optString("userName", owner).ifBlank { "你" }.take(16)
    petName = options.optString("petName", petName).ifBlank { "大肥鱼" }.take(16)
    emotionLabel = options.optString("emotionLabel", emotionLabel).ifBlank { "元气陪伴" }.take(12)
    reduced = options.optBoolean("reducedMotion", reduced) ||
      Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    fullness = options.optInt("fullness", fullness).coerceIn(0, 100)
    mood = options.optInt("mood", mood).coerceIn(0, 100)
    bond = options.optInt("bond", bond).coerceIn(0, 100)
    tsundere = options.optInt("tsundere", tsundere)
    affection = options.optInt("affection", affection)
    warmth = options.optInt("warmth", warmth)
    playfulness = options.optInt("playfulness", playfulness)

    if (options.has("nextCourseName")) nextCourseName = options.optString("nextCourseName", "").take(24)
    if (options.has("nextCoursePlace")) nextCoursePlace = options.optString("nextCoursePlace", "").take(20)
    if (options.has("nextCourseAtMs")) nextCourseAtMs = options.optLong("nextCourseAtMs", 0L)

    if (options.has("opacity")) {
      userOpacity = options.optDouble("opacity", userOpacity.toDouble()).toFloat().coerceIn(0.55f, 1f)
      applyEffectiveAlpha()
    }
    if (options.has("panelTheme")) {
      panelThemeMode = options.optString("panelTheme", panelThemeMode)
    }
    if (options.has("tapAction")) {
      tapAction = options.optString("tapAction", tapAction)
    }
    if (options.has("showBubbles")) {
      showBubbles = options.optBoolean("showBubbles", showBubbles)
      if (!showBubbles) bubble.dismissAnimated()
    }
    refreshPalette()

    val newScale = options.optDouble("scale", scaleFactor.toDouble()).toFloat().coerceIn(0.8f, 1.3f)
    if (abs(newScale - scaleFactor) > 0.02f) {
      val wasOnLeft = (x + viewW * 0.5f) < safeScreen.centerX()
      scaleFactor = newScale
      viewW = dp(126f * scaleFactor).roundToInt()
      viewH = dp(156f * scaleFactor).roundToInt()
      params.width = viewW
      params.height = viewH
      updateBounds()
      if (edgeRest) {
        x = if (wasOnLeft) limits.left else limits.right
        updatePosition()
      }
    }

    if (applyPosition && options.has("normX") && options.has("normY")) {
      val nx = options.optDouble("normX", 0.78).toFloat().coerceIn(0f, 1f)
      val ny = options.optDouble("normY", 0.56).toFloat().coerceIn(0f, 1f)
      x = limits.left + (limits.right - limits.left) * nx
      y = limits.top + (limits.bottom - limits.top) * ny
      face = if (options.optDouble("face", 1.0) < 0) -1f else 1f
      updatePosition()
    }
    if (panel?.isOpen() == true) {
      panel?.refresh(buildSnapshot(lastWhisper))
    }
    schedule()
  }

  fun setStandbyHidden(hidden: Boolean) {
    if (standbyHidden == hidden) return
    standbyHidden = hidden
    visibility = if (hidden) GONE else VISIBLE
    handler.removeCallbacks(evictStandbyRunnable)
    handler.removeCallbacks(firstSpawnRunnable)
    if (hidden) {
      panel?.destroyImmediate()
      bubble.hideImmediate(detach = true)
      flying = false
      walking = false
      handler.removeCallbacks(redrawRunnable)
      handler.removeCallbacks(autoBrainRunnable)
      Choreographer.getInstance().removeFrameCallback(this)
      bank.evictSecondary()
      handler.postDelayed(evictStandbyRunnable, 12_000)
    } else {
      born = SystemClock.uptimeMillis()
      lastInteractionAt = born
      bank.request("idle")
      invalidate()
      schedule()
      armAutonomousBrain(5500)
    }
  }

  fun onRevealedToDesktop() {
    if (standbyHidden || released) return
    triggerRipple(0xFF38BDF8.toInt())
    sayBubble("${owner}，我在桌面继续陪你～", 2400L, 0xFF38BDF8.toInt(), force = false)
    playClip("wave", 1200)
    spawnParticles("○", Color.parseColor("#7DD3FC"), 3)
  }

  fun setGhostMode(enabled: Boolean) {
    ghostMode = enabled
    if (enabled) {
      panel?.closeAnimated()
      params.flags = params.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
      sayBubble("进入防误触模式啦，点通知栏就能恢复触控～", 2400L, 0xFF818CF8.toInt(), force = true)
    } else {
      params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
      triggerRipple(0xFF38BDF8.toInt())
    }
    applyEffectiveAlpha()
    service.safeUpdateView(this, params)
    invalidate()
  }

  fun setEdgeRest(enabled: Boolean, announce: Boolean) {
    if (edgeRest == enabled) return
    edgeRest = enabled
    onEdgeRestChanged(enabled)
    applyEffectiveAlpha()
    if (enabled) {
      panel?.closeAnimated()
      flying = false
      val toLeft = (x + viewW * 0.5f) < safeScreen.centerX()
      walkTargetX = if (toLeft) limits.left else limits.right
      face = if (toLeft) 1f else -1f
      if (abs(walkTargetX - x) > dp(12f) && !reduced) {
        walking = true
        walkEndToRest = true
        walkEndToPeek = false
        lastNanos = 0L
        playClip("walk")
      } else {
        x = walkTargetX
        updatePosition()
        playClip("peek")
      }
      if (announce) {
        sayBubble("好呀，我贴边歇会儿不挡你～点我就醒来", 2600L, 0xFF818CF8.toInt(), force = true)
      }
    } else {
      walkEndToRest = false
      walking = false
      lastInteractionAt = SystemClock.uptimeMillis()
      triggerSquash(0.84f)
      triggerRipple(0xFF38BDF8.toInt())
      playClip("happy", 1100)
      spawnParticles("✧", Color.parseColor("#67E8F9"), 4)
      if (announce) {
        sayBubble("元气醒来啦！${owner}找我玩吗？", 2300L, 0xFF38BDF8.toInt(), force = true)
      }
      armAutonomousBrain(7000)
    }
    invalidate()
    schedule()
  }

  fun updateBounds() {
    if (Build.VERSION.SDK_INT >= 30) {
      val metrics = window.currentWindowMetrics
      val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
      )
      safeScreen.set(
        insets.left.toFloat(),
        insets.top.toFloat(),
        max(insets.left + 1, metrics.bounds.width() - insets.right).toFloat(),
        max(insets.top + 1, metrics.bounds.height() - insets.bottom).toFloat(),
      )
    } else {
      @Suppress("DEPRECATION")
      val display = android.util.DisplayMetrics().also { window.defaultDisplay.getRealMetrics(it) }
      val topId = resources.getIdentifier("status_bar_height", "dimen", "android")
      val bottomId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
      val top = if (topId > 0) resources.getDimensionPixelSize(topId) else 0
      val bottom = if (bottomId > 0) resources.getDimensionPixelSize(bottomId) else 0
      safeScreen.set(
        0f,
        top.toFloat(),
        max(1, display.widthPixels).toFloat(),
        max(top + 1, display.heightPixels - bottom).toFloat(),
      )
    }
    limits.set(
      safeScreen.left,
      safeScreen.top,
      max(safeScreen.left, safeScreen.right - params.width),
      max(safeScreen.top, safeScreen.bottom - params.height),
    )
    x = x.coerceIn(limits.left, limits.right)
    y = y.coerceIn(limits.top, limits.bottom)
    updatePosition()
  }

  private fun updatePosition() {
    params.x = x.roundToInt()
    params.y = y.roundToInt()
    service.safeUpdateView(this, params)
    bubble.updateAnchor(x, y, x + viewW, y + viewH, safeScreen)
  }

  fun setScreenAwake(value: Boolean) {
    awake = value
    handler.removeCallbacks(redrawRunnable)
    handler.removeCallbacks(autoBrainRunnable)
    Choreographer.getInstance().removeFrameCallback(this)
    flying = false
    walking = false
    vx = 0f
    vy = 0f
    lastNanos = 0
    if (!value) {
      panel?.destroyImmediate()
      bubble.hideImmediate(detach = true)
      clip = if (edgeRest) "peek" else "idle"
      clipAt = SystemClock.uptimeMillis()
      bank.evictSecondary()
    } else if (!standbyHidden) {
      invalidate()
      schedule()
      armAutonomousBrain(7000)
    }
  }

  fun onChargerConnected() {
    if (!awake || standbyHidden || released) return
    lastInteractionAt = SystemClock.uptimeMillis()
    playClip("cuddle", 1900)
    triggerSquash(0.86f)
    spawnParticles("♥", Color.parseColor("#F472B6"), 4)
    sayBubble("插上充电器啦！满血复活中～", 2600L, 0xFF34D399.toInt(), force = false)
  }

  fun onBatterySample(percent: Int, charging: Boolean) {
    if (charging || percent > 15 || !awake || standbyHidden || released) return
    val now = SystemClock.uptimeMillis()
    if (now - lowBatteryNotifiedAt < 20 * 60_000L) return
    lowBatteryNotifiedAt = now
    playClip("wave", 1500)
    spawnParticles("✦", Color.parseColor("#FBBF24"), 3)
    sayBubble("手机只剩 ${percent}% 电啦，${owner}快充会儿电吧！", 3400L, 0xFFF59E0B.toInt(), force = true)
  }

  private fun hasActiveParticles(now: Long): Boolean {
    for (p in particles) if (p.active && now - p.born < p.life) return true
    return false
  }

  private fun hasActiveRipple(now: Long) = !reduced && rippleBorn > 0L && (now - rippleBorn) < 420L

  private fun triggerRipple(color: Int) {
    if (reduced) return
    rippleBorn = SystemClock.uptimeMillis()
    rippleColor = color
    schedule()
  }

  private fun spawnParticles(glyph: String, color: Int, count: Int) {
    if (reduced || standbyHidden || !awake) return
    val now = SystemClock.uptimeMillis()
    var spawned = 0
    for (p in particles) {
      if (spawned >= count) break
      if (!p.active || now - p.born >= p.life) {
        p.active = true
        p.glyph = glyph
        p.color = color
        p.x = width * (0.26f + Random.nextFloat() * 0.48f)
        p.y = height * (0.22f + Random.nextFloat() * 0.26f)
        p.vx = (Random.nextFloat() - 0.5f) * dp(44f)
        p.vy = -dp(36f + Random.nextFloat() * 34f)
        p.born = now + spawned * 75L
        p.life = if (glyph == "Z") 1400L else 950L
        spawned++
      }
    }
    schedule()
  }

  private fun triggerSquash(depth: Float) {
    if (reduced) return
    squashY = depth
    squashX = 1f + (1f - depth) * 0.56f
    squashVelY = 0f
    squashVelX = 0f
    schedule()
  }

  private fun sayBubble(
    text: String,
    durationMs: Long = 2800L,
    accentColor: Int = 0xFF38BDF8.toInt(),
    force: Boolean = false,
  ) {
    lastWhisper = text
    if (panel?.isOpen() == true) {
      panel?.refresh(buildSnapshot(text))
      return
    }
    if (!force && !showBubbles) return
    if (standbyHidden || released || !awake) return
    bubble.show(text, accentColor, durationMs, x, y, x + viewW, y + viewH, safeScreen)
  }

  private fun formatUpcomingCourseSummary(): String? {
    if (nextCourseName.isBlank()) return null
    val wallNow = System.currentTimeMillis()
    if (nextCourseAtMs <= wallNow) return null
    val diffMin = ((nextCourseAtMs - wallNow) / 60_000L).toInt()
    if (diffMin !in 1..240) return null
    val timeText = if (diffMin >= 60) "${diffMin / 60}小时${diffMin % 60}分后" else "${diffMin}分钟后"
    val place = if (nextCoursePlace.isNotBlank()) " · $nextCoursePlace" else ""
    return "📚 $nextCourseName · $timeText$place"
  }

  private fun buildSnapshot(whisper: String): PanelSnapshot {
    val nextAction = ACTION_CYCLE[actionCycleIdx % ACTION_CYCLE.size].second
    val moodTag = when {
      edgeRest -> "贴边休息中"
      fullness < 28 -> "肚子饿啦"
      mood >= 85 -> emotionLabel
      mood < 40 -> "求抱抱"
      else -> emotionLabel
    }
    return PanelSnapshot(
      petName = petName,
      emotionLabel = moodTag,
      fullness = fullness,
      mood = mood,
      bond = bond,
      edgeRest = edgeRest,
      ghostMode = ghostMode,
      nextActionLabel = nextAction,
      nextCourseSummary = formatUpcomingCourseSummary(),
      whisperText = whisper,
    )
  }

  fun openInteractionPanel() {
    if (standbyHidden || released || !awake) return
    if (panel?.isOpen() == true) {
      panel?.closeAnimated()
      return
    }
    walking = false
    flying = false
    if (clip == "dangle" || clip == "walk") clip = if (edgeRest) "peek" else "idle"
    bubble.hideImmediate(detach = false)
    triggerRipple(0xFF38BDF8.toInt())
    if (!reduced) performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    val greeting = when {
      edgeRest -> "我在边上眯着呢，要唤醒我陪你玩吗？"
      fullness < 30 -> "肚子有点空空的…要不要喂我一颗白饭团子？"
      else -> "${owner}，想喂团子、摸摸头还是看看课表呀？"
    }
    lastWhisper = greeting
    panel?.open(buildSnapshot(greeting), x, y, x + viewW, y + viewH, safeScreen, palette, reduced)
    invalidate()
    schedule()
  }

  private fun playClip(name: String, autoReturnMs: Long = 0L) {
    val spec = CLIPS[name] ?: return
    handler.removeCallbacks(clipEndRunnable)
    handler.removeCallbacks(evictSecondaryRunnable)
    clip = name
    clipAt = SystemClock.uptimeMillis()
    bank.request(spec.sheet)
    if (autoReturnMs > 0) {
      handler.postDelayed(clipEndRunnable, autoReturnMs)
    } else if (!spec.loop) {
      handler.postDelayed(clipEndRunnable, spec.holds.sum().toLong() + 120L)
    }
    invalidate()
    schedule()
  }

  private fun returnToIdle() {
    if (dragging || flying || walking) return
    clip = if (edgeRest) "peek" else "idle"
    clipAt = SystemClock.uptimeMillis()
    tiltDeg = 0f
    invalidate()
    schedule()
    if (!edgeRest) {
      handler.removeCallbacks(evictSecondaryRunnable)
      handler.postDelayed(evictSecondaryRunnable, 15_000)
    }
  }

  private fun armAutonomousBrain(delayMs: Long = -1L) {
    handler.removeCallbacks(autoBrainRunnable)
    if (released || standbyHidden || !awake) return
    val base = if (delayMs > 0) delayMs else (9_000L + Random.nextLong(6_500L))
    handler.postDelayed(autoBrainRunnable, base)
  }

  private fun runAutonomousStep() {
    if (released || standbyHidden || !awake) return
    if (dragging || flying || walking || panel?.isOpen() == true) {
      armAutonomousBrain(6_500)
      return
    }
    val now = SystemClock.uptimeMillis()
    // 1. 课前 15 分钟主动冒泡提醒（即使贴边休息也温柔提醒）
    val wallNow = System.currentTimeMillis()
    if (nextCourseName.isNotEmpty() && nextCourseAtMs > wallNow && nextCourseAtMs != remindedCourseAtMs) {
      val diffMin = ((nextCourseAtMs - wallNow) / 60_000L).toInt()
      if (diffMin in 1..15) {
        remindedCourseAtMs = nextCourseAtMs
        val place = if (nextCoursePlace.isNotEmpty()) "（$nextCoursePlace）" else ""
        playClip("wave", 1600)
        spawnParticles("✧", Color.parseColor("#38BDF8"), 4)
        sayBubble("还有 ${diffMin} 分钟要上「$nextCourseName」$place 哦～", 4400L, 0xFF38BDF8.toInt(), force = true)
        armAutonomousBrain(12_000)
        return
      }
    }

    // 贴边安静休息时：不乱跑、不打扰，仅偶尔轻轻飘一个 Z 或小泡泡
    if (edgeRest) {
      if (Random.nextFloat() < 0.45f) {
        spawnParticles(if (clip == "sleep") "Z" else "○", Color.parseColor("#A5B4FC"), 1)
      }
      armAutonomousBrain(12_000)
      return
    }

    // 2. 超过 2.5 分钟无互动 → 乖巧打盹并飘 Zzz
    if (now - lastInteractionAt > 150_000L) {
      if (clip != "sleep") {
        playClip("sleep")
        sayBubble("有点困了，我先眯一小会儿…", 2500L, 0xFF818CF8.toInt(), force = false)
      }
      spawnParticles("Z", Color.parseColor("#A5B4FC"), 2)
      armAutonomousBrain(10_000)
      return
    }

    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val roll = Random.nextFloat()
    val nearEdge = x <= limits.left + dp(28f) || x >= limits.right - dp(28f)

    when {
      (hour >= 23 || hour < 5) && roll < 0.30f -> {
        playClip("sleep")
        spawnParticles("Z", Color.parseColor("#A5B4FC"), 2)
        sayBubble(
          if (warmth >= 70) "夜深啦，${owner}早点休息吧，明天我再陪你。" else "熬夜会变笨鱼哦，快去睡啦！",
          3200L,
          0xFF818CF8.toInt(),
          force = false,
        )
      }
      fullness < 28 && roll < 0.35f -> {
        playClip("wave", 1300)
        sayBubble(
          if (tsundere >= 68) "才没有饿呢…只是刚好想吃白米饭。" else "肚子空空的…双击喂我一口团子嘛～",
          3000L,
          0xFFF59E0B.toInt(),
          force = false,
        )
      }
      nearEdge && roll < 0.42f -> {
        face = if (x < (limits.left + limits.right) / 2f) 1f else -1f
        playClip("peek", 6800)
        spawnParticles("○", Color.parseColor("#7DD3FC"), 2)
        sayBubble("（贴在屏幕边探头）偷偷看${owner}在干嘛～", 2800L, 0xFF38BDF8.toInt(), force = false)
      }
      roll < 0.34f + (playfulness / 300f) -> {
        val dir = if (Random.nextBoolean()) 1f else -1f
        val dist = dp(75f + Random.nextFloat() * 145f)
        walkTargetX = (x + dir * dist).coerceIn(limits.left, limits.right)
        if (abs(walkTargetX - x) > dp(24f)) {
          face = if (walkTargetX > x) 1f else -1f
          walking = true
          walkEndToRest = false
          walkEndToPeek = walkTargetX <= limits.left + dp(20f) || walkTargetX >= limits.right - dp(20f)
          lastNanos = 0L
          playClip("walk")
        }
      }
      roll < 0.72f -> {
        when (Random.nextInt(5)) {
          0 -> {
            playClip("dance", 3200)
            spawnParticles("♪", Color.parseColor("#38BDF8"), 4)
            sayBubble("♪ 扭一扭～今天也要加油呀！", 2500L, 0xFF38BDF8.toInt(), force = false)
          }
          1 -> {
            playClip("spin", 1150)
            spawnParticles("✧", Color.parseColor("#67E8F9"), 4)
            sayBubble("转个圈圈——嘿咻！", 2000L, 0xFF22D3EE.toInt(), force = false)
          }
          2 -> {
            playClip("study", 4500)
            sayBubble("掏出小书桌，陪${owner}一起学习～", 2600L, 0xFF60A5FA.toInt(), force = false)
          }
          3 -> {
            playClip("happy", 1000)
            triggerSquash(0.84f)
            spawnParticles("✦", Color.parseColor("#FBBF24"), 3)
          }
          else -> {
            playClip("peek", 5200)
            sayBubble("晃晃小脚，不挡你屏幕哦～", 2500L, 0xFF38BDF8.toInt(), force = false)
          }
        }
      }
      else -> {
        val line = when {
          tsundere >= 70 -> arrayOf("哼，看屏幕久了记得眨眼睛啊。", "我才不是特意陪着你，顺路而已！").random()
          affection >= 70 -> arrayOf("${owner}在的地方我就想待着～", "要不要点我脑袋摸摸头呀？").random()
          else -> arrayOf("累了就活动一下肩膀吧～", "双击我可以喂饭或找我聊天哦。").random()
        }
        sayBubble(line, 2800L, 0xFF38BDF8.toInt(), force = false)
      }
    }
    armAutonomousBrain()
  }

  private fun bumpCounter(key: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit().putInt(key, prefs.getInt(key, 0) + 1).apply()
    service.changed()
  }

  private fun doFeed(fromPanel: Boolean = false): String {
    if (edgeRest) setEdgeRest(false, announce = false)
    lastInteractionAt = SystemClock.uptimeMillis()
    fullness = min(100, fullness + 24)
    mood = min(100, mood + 5)
    bond = min(100, bond + 2)
    playClip("eat", 2600)
    triggerSquash(0.85f)
    triggerRipple(0xFFF59E0B.toInt())
    spawnParticles("♪", Color.parseColor("#FBBF24"), 4)
    val line = if (tsundere >= 72) "哼，勉强收下你的白饭团子…真香！" else "嗷呜——白饭团子最好吃啦，谢谢${owner}！"
    if (!fromPanel) sayBubble(line, 2600L, 0xFFF59E0B.toInt(), force = true) else lastWhisper = line
    bumpCounter("pendingFeeds")
    return line
  }

  private fun doPat(fromPanel: Boolean = false): String {
    if (edgeRest) setEdgeRest(false, announce = false)
    lastInteractionAt = SystemClock.uptimeMillis()
    mood = min(100, mood + 8)
    bond = min(100, bond + 2)
    playClip("cuddle", 1800)
    triggerSquash(0.86f)
    triggerRipple(0xFFF472B6.toInt())
    spawnParticles("♥", Color.parseColor("#F472B6"), 5)
    val line = if (tsundere >= 70) "唔…才不是喜欢被摸头呢，头发都要揉乱啦。" else "嘿嘿…${owner}的手好暖，再摸一小会儿～"
    if (!fromPanel) sayBubble(line, 2500L, 0xFFF472B6.toInt(), force = true) else lastWhisper = line
    bumpCounter("pendingPats")
    return line
  }

  private fun doCycleAction(fromPanel: Boolean = false): String {
    if (edgeRest) setEdgeRest(false, announce = false)
    lastInteractionAt = SystemClock.uptimeMillis()
    val (clipName, _, durationMs) = ACTION_CYCLE[actionCycleIdx % ACTION_CYCLE.size]
    actionCycleIdx = (actionCycleIdx + 1) % ACTION_CYCLE.size
    playClip(clipName, durationMs)
    triggerSquash(0.86f)
    val (glyph, color, line) = when (clipName) {
      "dance" -> Triple("♪", Color.parseColor("#38BDF8"), "♪ 扭一扭～${owner}快看我跳舞！")
      "spin" -> Triple("✧", Color.parseColor("#22D3EE"), "转个大圈圈——嘿咻，炫不炫！")
      "study" -> Triple("✦", Color.parseColor("#60A5FA"), "搬出小书桌啦，安安静静陪${owner}专注～")
      "peek" -> Triple("○", Color.parseColor("#7DD3FC"), "晃晃小脚探个头，乖乖不挡视野～")
      else -> Triple("Z", Color.parseColor("#A5B4FC"), "打个小盹充充电，叫我随时醒来哦…")
    }
    spawnParticles(glyph, color, 4)
    if (!fromPanel) sayBubble(line, 2500L, color, force = true) else lastWhisper = line
    return line
  }

  private fun handleQuickChat(kind: String): String {
    if (edgeRest) setEdgeRest(false, announce = false)
    lastInteractionAt = SystemClock.uptimeMillis()
    return when (kind) {
      "praise" -> {
        mood = min(100, mood + 4)
        playClip("happy", 1300)
        triggerSquash(0.85f)
        spawnParticles("♥", Color.parseColor("#F472B6"), 5)
        val line = when {
          tsundere >= 70 -> "咳…${owner}今天其实挺厉害的啦，别骄傲太久哦！"
          warmth >= 70 -> "${owner}已经很棒很努力啦！不管多小的进步我都看在眼里～"
          else -> "给你颁一朵大蓝花！${owner}今天超给力～"
        }
        lastWhisper = line
        line
      }
      "course" -> {
        playClip("wave", 1300)
        spawnParticles("✧", Color.parseColor("#38BDF8"), 3)
        val upcoming = formatUpcomingCourseSummary()
        val line = if (upcoming != null) {
          "下一节：$upcoming，记得提前带好东西哦～"
        } else {
          "接下来暂时没有紧赶的课啦，${owner}可以松一口气～"
        }
        lastWhisper = line
        line
      }
      else -> {
        playClip("study", 5200)
        spawnParticles("✦", Color.parseColor("#60A5FA"), 4)
        val line = "好！小书桌摆好啦，我就在旁边安静陪${owner}冲刺～"
        lastWhisper = line
        line
      }
    }
  }

  private fun needsSmoothChoreographer(now: Long): Boolean {
    if (reduced) return false
    return flying ||
      walking ||
      dragging ||
      hasActiveParticles(now) ||
      hasActiveRipple(now) ||
      abs(squashX - 1f) > 0.004f ||
      abs(squashY - 1f) > 0.004f ||
      now - born < 320L ||
      clip == "dance" ||
      clip == "spin" ||
      clip == "happy" ||
      clip == "hurt" ||
      clip == "cuddle"
  }

  private fun schedule() {
    handler.removeCallbacks(redrawRunnable)
    if (!awake || released || standbyHidden) return
    val now = SystemClock.uptimeMillis()
    if (needsSmoothChoreographer(now)) {
      Choreographer.getInstance().removeFrameCallback(this)
      Choreographer.getInstance().postFrameCallback(this)
    } else if (!reduced) {
      val interval = when {
        edgeRest || clip == "sleep" -> 85L
        else -> 50L
      }
      handler.postDelayed(redrawRunnable, interval)
    } else if (clip != "idle") {
      handler.postDelayed(redrawRunnable, 120L)
    }
  }

  private fun impact(speed: Float, edge: String) {
    val now = SystemClock.uptimeMillis()
    if (speed < dp(550f) || now - impactAt < 1400L) return
    impactAt = now
    val strong = speed > dp(1200f)
    val msg = if (strong) "呜……撞疼了，${owner}轻一点嘛" else "哎哟，撞到${edge}啦！"
    triggerSquash(if (strong) 0.76f else 0.84f)
    spawnParticles("✦", Color.parseColor("#FBBF24"), 4)
    playClip("hurt", 950)
    sayBubble(msg, 2400L, 0xFFF59E0B.toInt(), force = true)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong("impactAt", System.currentTimeMillis())
      .putString("impactText", "（刚才在桌面撞到了屏幕$edge）$msg")
      .apply()
    service.changed()
    if (!reduced) performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
  }

  override fun doFrame(nanos: Long) {
    if (!awake || released || standbyHidden) return
    val dt = if (lastNanos == 0L) 0.016f else ((nanos - lastNanos) / 1_000_000_000f).coerceIn(0.001f, 0.035f)
    lastNanos = nanos

    val k = 180f
    val c = 14f
    squashVelX += ((1f - squashX) * k - squashVelX * c) * dt
    squashVelY += ((1f - squashY) * k - squashVelY * c) * dt
    squashX += squashVelX * dt
    squashY += squashVelY * dt

    val now = SystemClock.uptimeMillis()
    for (p in particles) {
      if (!p.active || now < p.born) continue
      if (now - p.born >= p.life) {
        p.active = false
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy *= (1f - 0.8f * dt)
    }

    if (walking) {
      val speed = dp(if (walkEndToRest) 160f else 82f)
      val dx = walkTargetX - x
      if (abs(dx) <= speed * dt + 1f) {
        x = walkTargetX
        walking = false
        tiltDeg = 0f
        if (walkEndToRest) {
          walkEndToRest = false
          face = if (x < safeScreen.centerX()) 1f else -1f
          playClip("peek")
        } else if (walkEndToPeek) {
          face = if (x < (limits.left + limits.right) / 2f) 1f else -1f
          playClip("peek", 5800)
        } else {
          returnToIdle()
        }
      } else {
        x += sign(dx) * speed * dt
        tiltDeg = sin(now * 0.014f) * 3.5f
      }
      updatePosition()
    } else if (flying) {
      val steps = ceil(hypot(vx, vy) * dt / dp(8f)).toInt().coerceIn(1, 16)
      val step = dt / steps
      repeat(steps) {
        vy += dp(1400f) * step
        x += vx * step
        y += vy * step
        if (x < limits.left) {
          impact(abs(vx), "左边框")
          x = limits.left
          vx = abs(vx) * 0.72f
        }
        if (x > limits.right) {
          impact(abs(vx), "右边框")
          x = limits.right
          vx = -abs(vx) * 0.72f
        }
        if (y < limits.top) {
          impact(abs(vy), "上边框")
          y = limits.top
          vy = abs(vy) * 0.72f
        }
        if (y > limits.bottom) {
          if (abs(vy) > dp(260f)) triggerSquash(0.84f)
          impact(abs(vy), "下边框")
          y = limits.bottom
          vy = if (abs(vy) < dp(80f)) 0f else -abs(vy) * 0.62f
          vx *= max(0f, 1f - 3.6f * step)
        }
      }
      tiltDeg = (vx * 0.012f / density).coerceIn(-16f, 16f)
      if (abs(vx) > dp(60f)) face = if (vx > 0) 1f else -1f
      if (y >= limits.bottom - 1 && abs(vy) < dp(1f) && abs(vx) < dp(14f)) {
        flying = false
        vx = 0f
        vy = 0f
        tiltDeg = 0f
        if (clip != "hurt") returnToIdle()
      }
      updatePosition()
    } else if (!dragging) {
      tiltDeg *= max(0f, 1f - 10f * dt)
    }

    invalidate()
    schedule()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (standbyHidden || released) return
    val now = SystemClock.uptimeMillis()

    var spec = CLIPS[clip] ?: CLIPS["idle"]!!
    var sheet = bank.get(spec.sheet)
    if (sheet == null) {
      spec = CLIPS["idle"]!!
      sheet = bank.get("idle") ?: return
    }

    val total = spec.holds.sum()
    val elapsed = (now - clipAt).coerceAtLeast(0)
    var index = 0
    if (reduced) {
      index = if (clip == "hurt") 3 else 0
    } else if (spec.loop) {
      val loopStartMs = if (spec.loopFrom > 0) spec.holds.take(spec.loopFrom).sum() else 0
      val loopLen = (total - loopStartMs).coerceAtLeast(1)
      var time = if (elapsed < total) elapsed.toInt() else loopStartMs + ((elapsed - total) % loopLen).toInt()
      while (index < spec.holds.lastIndex && time >= spec.holds[index]) {
        time -= spec.holds[index]
        index++
      }
    } else {
      var time = min(elapsed, (total - 1).toLong()).toInt().coerceAtLeast(0)
      while (index < spec.holds.lastIndex && time >= spec.holds[index]) {
        time -= spec.holds[index]
        index++
      }
    }

    val frame = spec.startFrame + index
    val cw = sheet.width / spec.cols
    val ch = sheet.height / spec.rows
    src.set((frame % spec.cols) * cw, (frame / spec.cols) * ch, ((frame % spec.cols) + 1) * cw, ((frame / spec.cols) + 1) * ch)

    val reveal = if (reduced) 1f else ((now - born) / 260f).coerceIn(0f, 1f)
    val rise = dp(8f) * (1f - reveal) * (1f - reveal)

    val breathPeriod = when {
      edgeRest || clip == "sleep" -> 0.0020f
      clip == "walk" || clip == "dance" -> 0.0095f
      else -> 0.0036f
    }
    val breathWave = if (reduced || dragging || flying) 0f else sin(now * breathPeriod)
    val breathScaleX = 1f + breathWave * 0.018f
    val breathScaleY = 1f - breathWave * 0.016f
    val breathBobY = breathWave * dp(2.2f)
    val breathRot = if (clip == "idle" || clip == "peek") breathWave * 1.4f else 0f

    val petW = dp(98f * scaleFactor)
    val petH = dp(131f * scaleFactor)
    val petLeft = (width - petW) / 2f
    val petTop = height - petH - dp(14f) + rise + breathBobY
    val pivotX = width / 2f
    val pivotY = petTop + petH * 0.88f

    // 灵动水波扩散光环（开面板或收到互动时）
    if (hasActiveRipple(now)) {
      val t = ((now - rippleBorn) / 420f).coerceIn(0f, 1f)
      val ease = 1f - (1f - t) * (1f - t)
      ripplePaint.color = rippleColor
      ripplePaint.alpha = ((1f - t) * 165f).roundToInt().coerceIn(0, 255)
      val rx = petW * (0.26f + ease * 0.36f)
      val ry = dp(7f + ease * 8f)
      canvas.drawOval(pivotX - rx, height - dp(16f) - ry, pivotX + rx, height - dp(16f) + ry, ripplePaint)
    }

    // 动态地面软投影
    val elevated = dragging || flying
    uiPaint.color = Color.argb(if (elevated) 22 else 46, 8, 16, 32)
    val shadowW = petW * (if (elevated) 0.36f else 0.50f + breathWave * 0.03f)
    canvas.drawOval(
      pivotX - shadowW / 2f,
      height - dp(18f),
      pivotX + shadowW / 2f,
      height - dp(11f),
      uiPaint,
    )

    // 绘制大肥鱼本体
    canvas.save()
    canvas.translate(pivotX, pivotY)
    canvas.rotate(tiltDeg + breathRot)
    canvas.scale(face * squashX * breathScaleX, squashY * breathScaleY)
    canvas.translate(-pivotX, -pivotY)
    dst.set(petLeft, petTop, petLeft + petW, petTop + petH)
    bitmapPaint.alpha = (255 * reveal).roundToInt()
    canvas.drawBitmap(sheet, src, dst, bitmapPaint)
    canvas.restore()
    bitmapPaint.alpha = 255

    // 贴边安静休息微徽章（小巧月亮胶囊，轻点即可唤醒）
    if (edgeRest && !dragging && !flying) {
      val badgeW = dp(20f)
      val badgeH = dp(20f)
      val bx = if (face > 0) width - badgeW - dp(8f) else dp(8f)
      val by = petTop + dp(8f)
      restBadgeRect.set(bx, by, bx + badgeW, by + badgeH)
      restBadgePaint.color = if (palette.isDark) 0xDD1E293B.toInt() else 0xEEF0F9FF.toInt()
      restBadgeStroke.color = 0x887DD3FC.toInt()
      canvas.drawRoundRect(restBadgeRect, dp(10f), dp(10f), restBadgePaint)
      canvas.drawRoundRect(restBadgeRect, dp(10f), dp(10f), restBadgeStroke)
      restGlyphPaint.color = if (palette.isDark) 0xFFBAE6FD.toInt() else 0xFF0284C7.toInt()
      canvas.drawText("☾", restBadgeRect.centerX(), restBadgeRect.centerY() + dp(3.6f), restGlyphPaint)
    }

    // 轻量粒子特效
    for (p in particles) {
      if (!p.active || now < p.born) continue
      val t = ((now - p.born).toFloat() / p.life.toFloat()).coerceIn(0f, 1f)
      val a = if (t < 0.2f) t / 0.2f else 1f - (t - 0.2f) / 0.8f
      particlePaint.color = p.color
      particlePaint.alpha = (255 * a).roundToInt().coerceIn(0, 255)
      particlePaint.textSize = dp(if (p.glyph == "Z") 11f else 13f) * (0.85f + sin(t * PI.toFloat()) * 0.35f)
      canvas.drawText(p.glyph, p.x, p.y, particlePaint)
    }
  }

  private fun handleTap(tx: Float, ty: Float) {
    if (panel?.isOpen() == true) {
      panel?.closeAnimated()
      return
    }
    if (panel?.wasRecentlyClosed(360L) == true) return
    val now = SystemClock.uptimeMillis()
    lastInteractionAt = now
    walking = false

    // 贴边休息中：轻点一次直接温柔唤醒，双击直接打开互动面板
    if (edgeRest) {
      if (now - lastTapAt < 340L) {
        lastTapAt = 0L
        openInteractionPanel()
      } else {
        lastTapAt = now
        setEdgeRest(false, announce = true)
      }
      return
    }

    // 若用户偏好「单击直开互动面板」
    if (tapAction == "panel") {
      openInteractionPanel()
      return
    }

    // 双击快速呼出液态玻璃互动面板
    if (now - lastTapAt < 340L) {
      lastTapAt = 0L
      openInteractionPanel()
      return
    }
    lastTapAt = now

    // 分区触摸：上半身（头部）→ 温柔摸头蹭蹭；下半身 → 戳肚子（连戳 4 次傲娇炸毛）
    val petTop = height - dp(131f * scaleFactor) - dp(14f)
    val isHead = ty < petTop + dp(58f * scaleFactor)
    if (isHead) {
      doPat()
      return
    }

    if (now - lastPokeAt > 2500L) pokeStreak = 0
    pokeStreak++
    lastPokeAt = now
    bumpCounter("pendingPokes")

    if (pokeStreak >= 4) {
      pokeStreak = 0
      playClip("hurt", 1250)
      triggerSquash(0.78f)
      spawnParticles("✦", Color.parseColor("#FBBF24"), 4)
      sayBubble(
        if (tsundere >= 68) "够了啦！再戳我就气鼓鼓不理你了！" else "哎呀哎呀投降啦，头都要点晕咯～",
        2600L,
        0xFFF59E0B.toInt(),
        force = true,
      )
      return
    }

    playClip(if (Random.nextBoolean()) "happy" else "wave", 1200)
    triggerSquash(0.83f)
    spawnParticles("✧", Color.parseColor("#67E8F9"), 3)
    val line = if (tsundere >= 68) "喂！摸头可以，戳肚子不行！" else "在呢在呢，${owner}～双击我可以打开互动卡片哦！"
    sayBubble(line, 2400L, 0xFF38BDF8.toInt(), force = true)
  }

  override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
    super.onInitializeAccessibilityNodeInfo(info)
    info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_DISMISS)
  }

  override fun performAccessibilityAction(action: Int, arguments: Bundle?): Boolean {
    if (action == AccessibilityNodeInfo.ACTION_DISMISS) {
      onClose()
      return true
    }
    return super.performAccessibilityAction(action, arguments)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (ghostMode || standbyHidden) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        val panelWasOpen = panel?.isOpen() == true
        suppressTapUntilUp = panelWasOpen || panel?.wasRecentlyClosed(360L) == true
        if (panelWasOpen) panel?.closeAnimated()
        tracker?.recycle()
        tracker = VelocityTracker.obtain()
        track(event)
        downX = event.rawX
        downY = event.rawY
        originX = x
        originY = y
        moved = false
        longPressTriggered = false
        dragging = true
        flying = false
        walking = false
        vx = 0f
        vy = 0f
        shakeDir = 0
        shakeFlips = 0
        lastInteractionAt = SystemClock.uptimeMillis()
        handler.removeCallbacks(longPressRunnable)
        if (!suppressTapUntilUp) {
          handler.postDelayed(longPressRunnable, 480L)
        }
      }
      MotionEvent.ACTION_MOVE -> {
        if (longPressTriggered) return true
        track(event)
        tracker?.computeCurrentVelocity(1000, dp(3600f))
        val velX = tracker?.xVelocity ?: 0f
        val velY = tracker?.yVelocity ?: 0f
        if (!moved && hypot(event.rawX - downX, event.rawY - downY) > dp(6f)) {
          moved = true
          if (edgeRest) setEdgeRest(false, announce = false)
          panel?.closeAnimated()
          handler.removeCallbacks(longPressRunnable)
          playClip("dangle")
        }
        if (moved) {
          tiltDeg = (-velX * 0.016f / density).coerceIn(-22f, 22f)
          if (abs(velX) > dp(650f)) {
            val dir = if (velX > 0) 1 else -1
            val now = SystemClock.uptimeMillis()
            if (shakeDir != 0 && shakeDir != dir) {
              shakeFlips = if (now - shakeFlipAt < 420L) shakeFlips + 1 else 1
              shakeFlipAt = now
              if (shakeFlips >= 4) {
                shakeFlips = 0
                spawnParticles("✦", Color.parseColor("#FBBF24"), 5)
                sayBubble("呜哇哇——别晃啦，鱼脑子要晃匀啦！", 2400L, 0xFFF59E0B.toInt(), force = true)
                if (!reduced) performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
              }
            }
            shakeDir = dir
          }

          val tx = originX + event.rawX - downX
          val ty = originY + event.rawY - downY
          if ((tx < limits.left || tx > limits.right) && x != tx.coerceIn(limits.left, limits.right)) {
            impact(abs(velX), if (tx < limits.left) "左边框" else "右边框")
          }
          if ((ty < limits.top || ty > limits.bottom) && y != ty.coerceIn(limits.top, limits.bottom)) {
            impact(abs(velY), if (ty < limits.top) "上边框" else "下边框")
          }
          x = tx.coerceIn(limits.left, limits.right)
          y = ty.coerceIn(limits.top, limits.bottom)
          updatePosition()
          invalidate()
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        handler.removeCallbacks(longPressRunnable)
        val suppressedTap = suppressTapUntilUp
        suppressTapUntilUp = false
        track(event)
        tracker?.computeCurrentVelocity(1000, dp(3600f))
        dragging = false
        if (!longPressTriggered) {
          if (event.actionMasked == MotionEvent.ACTION_UP && !moved) {
            if (!suppressedTap) handleTap(event.x, event.y)
          } else if (event.actionMasked == MotionEvent.ACTION_UP && !reduced) {
            vx = tracker?.xVelocity ?: 0f
            vy = tracker?.yVelocity ?: 0f
            flying = hypot(vx, vy) > dp(190f)
            lastNanos = 0L
            if (!flying) {
              tiltDeg = 0f
              triggerSquash(0.88f)
              returnToIdle()
            }
          } else {
            tiltDeg = 0f
            returnToIdle()
          }
        }
        tracker?.recycle()
        tracker = null
        schedule()
      }
    }
    return true
  }

  private fun track(event: MotionEvent) {
    val raw = MotionEvent.obtain(event)
    raw.offsetLocation(event.rawX - event.x, event.rawY - event.y)
    tracker?.addMovement(raw)
    raw.recycle()
  }

  fun release() {
    if (released) return
    released = true
    handler.removeCallbacksAndMessages(null)
    Choreographer.getInstance().removeFrameCallback(this)
    tracker?.recycle()
    tracker = null
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    release()
    if (service.isExplicitlyDismissed()) service.stopSelf()
  }
}
