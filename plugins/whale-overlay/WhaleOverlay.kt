package __PACKAGE__

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.*
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.view.*
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.util.concurrent.Executors
import kotlin.math.*

private const val PREFS = "whale_desktop_pet"
private const val EVENT = "WhaleOverlayChanged"
private const val STOP = "whale.overlay.STOP"
private const val CHANNEL = "whale_desktop_pet"

@Suppress("DEPRECATION")
private fun overlayWindowType() = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE

class WhaleOverlayPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(WhaleOverlayModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class WhaleOverlayModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "WhaleOverlay"
  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(c: Context?, intent: Intent?) {
      if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT, null)
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
  // @ReactMethod bodies must return void: UiThreadUtil.runOnUiThread returns Boolean in RN 0.88,
  // and expression bodies would make TurboModule interop reject the module at startup.
  @ReactMethod fun getStatus(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      promise.resolve(Arguments.createMap().apply {
        putBoolean("permission", Settings.canDrawOverlays(context))
        putBoolean("running", WhaleOverlayService.instance?.attached() == true)
        putDouble("lastImpactAt", prefs.getLong("impactAt", 0).toDouble())
        putString("lastImpactText", prefs.getString("impactText", "") ?: "")
      })
    }
  }
  @ReactMethod fun acknowledgeImpact(at: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (prefs.getLong("impactAt",0) == at.toLong()) prefs.edit().remove("impactAt").remove("impactText").apply()
      promise.resolve(null)
    }
  }
  @ReactMethod fun openPermission(promise: Promise) {
    try {
      context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("OVERLAY_PERMISSION", "无法打开悬浮窗权限设置，请在系统设置中手动允许", error) }
  }
  @ReactMethod fun start(payload: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        if (!Settings.canDrawOverlays(context)) throw SecurityException("请先允许显示在其他应用上层")
        if (context.currentActivity == null) throw IllegalStateException("请回到软件内开启桌面桌宠")
        JSONObject(payload)
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
  @ReactMethod fun stop(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      WhaleOverlayService.instance?.dismiss()
      context.stopService(Intent(context, WhaleOverlayService::class.java))
      promise.resolve(null)
    }
  }
}

class WhaleOverlayService : Service() {
  companion object {
    @Volatile var instance: WhaleOverlayService? = null
    var launchResult: ((Throwable?) -> Unit)? = null
  }
  private var pet: DesktopPetView? = null
  private lateinit var window: WindowManager
  private val handler = Handler(Looper.getMainLooper())
  private val loader = Executors.newSingleThreadExecutor()
  private var alive = true
  private var loading = false
  private var options = JSONObject()
  private val screen = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      pet?.setScreenAwake(intent?.action != Intent.ACTION_SCREEN_OFF)
    }
  }
  override fun onBind(intent: Intent?) = null
  override fun onCreate() {
    super.onCreate()
    instance = this
    val windowContext = if (Build.VERSION.SDK_INT >= 30) createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null) else this
    window = windowContext.getSystemService(WINDOW_SERVICE) as WindowManager
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "桌面大肥鱼", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
    val launch = packageManager.getLaunchIntentForPackage(packageName)!!.apply { data = Uri.parse("dark-study://whale-settings") }
    val open = PendingIntent.getActivity(this, 7630, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val stop = PendingIntent.getService(this, 7631, Intent(this, WhaleOverlayService::class.java).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    val notification = builder.setSmallIcon(android.R.drawable.ic_menu_info_details).setContentTitle("大肥鱼在桌面陪着你")
      .setContentText("拖动或抛掷 · 点一下挥手 · 点右上角 × 收回")
      .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "收回桌宠", stop).build()
    if (Build.VERSION.SDK_INT >= 34) startForeground(7630, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(7630, notification)
    val filter = IntentFilter().apply { addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON) }
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, filter, RECEIVER_NOT_EXPORTED) else registerReceiver(screen, filter)
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) { dismiss(); return START_NOT_STICKY }
    try {
      if (!Settings.canDrawOverlays(this)) throw SecurityException("悬浮窗权限已关闭")
      options = JSONObject(intent?.getStringExtra("options") ?: "{}")
      if (pet != null) { pet!!.configure(options); resolveStart(null); return START_NOT_STICKY }
      if (!loading) {
        loading = true
        loader.execute {
          val sheets = mutableMapOf<String, Bitmap>()
          try {
            for ((key, file) in mapOf("idle" to "pet-idle-v2.png", "actions" to "pet-actions-v2.png", "hurt" to "pet-hurt-v1.png")) {
              assets.open("whale-overlay/$file").use { stream ->
                sheets[key] = BitmapFactory.decodeStream(stream, null, BitmapFactory.Options().apply { inScaled = false }) ?: error("无法读取桌宠贴图 $file")
              }
            }
            handler.post {
              if (!alive) { sheets.values.forEach { it.recycle() }; return@post }
              try {
                val view = DesktopPetView(this, window, sheets, ::dismiss)
                pet = view
                view.configure(options)
                window.addView(view, view.params)
                view.setScreenAwake((getSystemService(POWER_SERVICE) as PowerManager).isInteractive)
                changed()
                resolveStart(null)
              } catch (error: Exception) { resolveStart(error); dismiss() }
            }
          } catch (error: Exception) {
            sheets.values.forEach { it.recycle() }
            handler.post { resolveStart(error); dismiss() }
          }
        }
      }
    } catch (error: Exception) { resolveStart(error); dismiss() }
    return START_NOT_STICKY // No boot receiver or unrequested resurrection.
  }
  private fun resolveStart(error: Throwable?) { val callback = launchResult; launchResult = null; callback?.invoke(error) }
  fun attached() = pet?.isAttachedToWindow == true
  private fun changed() { sendBroadcast(Intent("$packageName.$EVENT").setPackage(packageName)) }
  fun dismiss() {
    pet?.let { runCatching { window.removeViewImmediate(it) }; it.release() }
    pet = null
    changed()
    stopSelf()
  }
  override fun onConfigurationChanged(config: Configuration) { super.onConfigurationChanged(config); pet?.updateBounds() }
  override fun onDestroy() {
    alive = false
    pet?.let { runCatching { window.removeViewImmediate(it) }; it.release() }
    pet = null
    loader.shutdownNow()
    handler.removeCallbacksAndMessages(null)
    runCatching { unregisterReceiver(screen) }
    instance = null
    resolveStart(IllegalStateException("桌宠已收回"))
    changed()
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}

/** Canvas renders authored frames; only active flight uses Choreographer at display rate. */
private class DesktopPetView(
  private val service: WhaleOverlayService,
  private val window: WindowManager,
  private val sheets: Map<String, Bitmap>,
  private val close: () -> Unit,
) : View(service), Choreographer.FrameCallback {
  private val density = resources.displayMetrics.density
  private fun dp(value: Float) = value * density
  val params = WindowManager.LayoutParams(dp(112f).roundToInt(), dp(152f).roundToInt(), overlayWindowType(),
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.LEFT }
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val src = Rect()
  private val dst = RectF()
  private val limits = RectF()
  private val handler = Handler(Looper.getMainLooper())
  private val redraw = Runnable { invalidate(); schedule() }
  private var awake = false
  private var released = false
  private var reduced = false
  private var dragging = false
  private var flying = false
  private var x = 0f
  private var y = 0f
  private var vx = 0f
  private var vy = 0f
  private var face = 1f
  private var lastNanos = 0L
  private var born = SystemClock.uptimeMillis()
  private var clip = "wave"
  private var clipAt = born
  private var message = "我出来陪你啦～"
  private var messageUntil = born + 2200
  private var impactAt = 0L
  private var owner = "你"
  private var downX = 0f
  private var downY = 0f
  private var originX = 0f
  private var originY = 0f
  private var moved = false
  private var tracker: VelocityTracker? = null
  private val idleHolds = intArrayOf(900,400,400,400,70,70,90,70,90,400,400,400)
  private val hurtHolds = intArrayOf(70,70,70,70,70,70,70,70)

  init {
    contentDescription = "桌面大肥鱼，可拖动抛掷，点右上角关闭"
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    updateBounds()
    x = (limits.right - dp(12f)).coerceIn(limits.left,limits.right)
    y = limits.top + (limits.bottom-limits.top) * .55f
    params.x = x.roundToInt(); params.y = y.roundToInt()
  }
  fun configure(options: JSONObject) {
    owner = options.optString("userName", "你").take(16)
    reduced = options.optBoolean("reducedMotion") || Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    schedule()
  }
  fun updateBounds() {
    if (Build.VERSION.SDK_INT >= 30) {
      val metrics = window.currentWindowMetrics
      val insets = metrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
      limits.set(insets.left.toFloat(), insets.top.toFloat(), max(insets.left, metrics.bounds.width()-insets.right-params.width).toFloat(), max(insets.top, metrics.bounds.height()-insets.bottom-params.height).toFloat())
    } else {
      @Suppress("DEPRECATION") val display = android.util.DisplayMetrics().also { window.defaultDisplay.getRealMetrics(it) }
      val topId = resources.getIdentifier("status_bar_height", "dimen", "android")
      val bottomId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
      val top = if (topId > 0) resources.getDimensionPixelSize(topId) else 0
      val bottom = if (bottomId > 0) resources.getDimensionPixelSize(bottomId) else 0
      limits.set(0f, top.toFloat(), max(0,display.widthPixels-params.width).toFloat(), max(top,display.heightPixels-bottom-params.height).toFloat())
    }
    x = x.coerceIn(limits.left,limits.right); y = y.coerceIn(limits.top,limits.bottom)
    updatePosition()
  }
  private fun updatePosition() {
    params.x = x.roundToInt(); params.y = y.roundToInt()
    if (isAttachedToWindow) try { window.updateViewLayout(this,params) } catch (_: Exception) { close() }
  }
  fun setScreenAwake(value: Boolean) {
    val wasAwake = awake
    awake = value
    handler.removeCallbacks(redraw)
    Choreographer.getInstance().removeFrameCallback(this)
    // Screen-off time never accumulates into a fling or an action clip.
    flying = false; vx = 0f; vy = 0f; lastNanos = 0
    if (!value || wasAwake) clip = "idle"
    clipAt = SystemClock.uptimeMillis()
    if (value) { invalidate(); schedule() }
  }
  private fun schedule() {
    handler.removeCallbacks(redraw)
    if (!awake || released) return
    if (flying || (!reduced && SystemClock.uptimeMillis()-born < 280)) {
      Choreographer.getInstance().removeFrameCallback(this)
      Choreographer.getInstance().postFrameCallback(this)
    } else if (!reduced || messageUntil > SystemClock.uptimeMillis() || clip != "idle") {
      val elapsed = (SystemClock.uptimeMillis()-clipAt).coerceAtLeast(0)
      val holds = if (clip == "hurt") hurtHolds else if (clip == "wave") IntArray(8) {70} else idleHolds
      val total = holds.sum()
      var remaining = if (clip == "idle") (elapsed % total).toInt() else min(elapsed,total.toLong()).toInt()
      var index = 0
      while (index < holds.lastIndex && remaining >= holds[index]) { remaining -= holds[index]; index++ }
      var delay = (holds[index]-remaining).coerceAtLeast(16).toLong()
      if (reduced) delay = if (clip != "idle") (total-elapsed).coerceAtLeast(16) else (messageUntil-SystemClock.uptimeMillis()).coerceAtLeast(16)
      handler.postDelayed(redraw,delay)
    }
  }
  private fun setClip(next: String) { clip = next; clipAt = SystemClock.uptimeMillis(); invalidate(); schedule() }
  private fun impact(speed: Float, edge: String) {
    val now = SystemClock.uptimeMillis()
    if (speed < dp(550f) || now-impactAt < 1400) return
    impactAt = now
    message = if (speed > dp(1200f)) "呜……撞疼了，轻一点嘛" else "哎哟，撞到${edge}啦"
    messageUntil = now + 2200
    setClip("hurt")
    context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putLong("impactAt",System.currentTimeMillis())
      .putString("impactText","（撞到了屏幕$edge）$message").apply()
    context.sendBroadcast(Intent("${context.packageName}.$EVENT").setPackage(context.packageName))
    if (!reduced) performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
  }
  override fun doFrame(nanos: Long) {
    if (!awake || released) return
    val dt = if (lastNanos == 0L) 0f else ((nanos-lastNanos)/1_000_000_000f).coerceIn(0f,.032f)
    lastNanos = nanos
    if (flying) {
      val steps = ceil(hypot(vx,vy)*dt / dp(8f)).toInt().coerceIn(1,16)
      val step = dt/steps
      repeat(steps) {
        vy += dp(1400f)*step
        x += vx*step; y += vy*step
        if (x < limits.left) { impact(abs(vx),"左边框"); x = limits.left; vx = abs(vx)*.68f }
        if (x > limits.right) { impact(abs(vx),"右边框"); x = limits.right; vx = -abs(vx)*.68f }
        if (y < limits.top) { impact(abs(vy),"上边框"); y = limits.top; vy = abs(vy)*.68f }
        if (y > limits.bottom) {
          impact(abs(vy),"下边框"); y = limits.bottom
          vy = if (abs(vy) < dp(80f)) 0f else -abs(vy)*.58f
          vx *= max(0f,1f-4f*step)
        }
      }
      if (abs(vx) > dp(60f)) face = if (vx > 0) 1f else -1f
      if (y >= limits.bottom-1 && abs(vy) < dp(1f) && abs(vx) < dp(12f)) { flying = false; vx = 0f; vy = 0f }
      updatePosition()
    }
    invalidate(); schedule()
  }
  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val now = SystemClock.uptimeMillis()
    var elapsed = (now-clipAt).coerceAtLeast(0)
    var holds = if (clip == "hurt") hurtHolds else if (clip == "wave") IntArray(8) {70} else idleHolds
    if (clip != "idle" && elapsed >= holds.sum()) { clip = "idle"; clipAt = now; elapsed = 0; holds = idleHolds }
    var time = (elapsed % holds.sum()).toInt()
    var index = 0
    while (index < holds.lastIndex && time >= holds[index]) { time -= holds[index]; index++ }
    if (reduced) index = if (clip == "hurt") 3 else 0
    val sheet = sheets[if (clip == "wave") "actions" else if (clip == "hurt") "hurt" else "idle"] ?: return
    val columns = if (clip == "wave") 8 else 4
    val frame = if (clip == "wave") index+8 else index
    val cw = sheet.width/columns
    val ch = sheet.height/(if (clip == "wave") 5 else if (clip == "hurt") 2 else 3)
    src.set(frame%columns*cw, frame/columns*ch, (frame%columns+1)*cw,(frame/columns+1)*ch)
    val reveal = if (reduced) 1f else ((now-born)/280f).coerceIn(0f,1f)
    val rise = dp(9f)*(1f-reveal)*(1f-reveal)
    canvas.save()
    canvas.translate(width/2f,0f); canvas.scale(face,1f); canvas.translate(-width/2f,0f)
    dst.set(dp(8f),dp(16f)+rise,dp(104f),dp(144f)+rise)
    paint.alpha = (255*reveal).roundToInt()
    canvas.drawBitmap(sheet,src,dst,paint)
    canvas.restore()
    paint.alpha = 255
    paint.color = Color.parseColor("#CC173449")
    canvas.drawCircle(width-dp(10f),dp(10f),dp(10f),paint)
    paint.color = Color.WHITE; paint.textSize = dp(15f); paint.textAlign = Paint.Align.CENTER
    canvas.drawText("×",width-dp(10f),dp(15f),paint)
    if (messageUntil > now) {
      paint.color = Color.parseColor("#EE173449")
      canvas.drawRoundRect(0f,height-dp(23f),width.toFloat(),height.toFloat(),dp(9f),dp(9f),paint)
      paint.color = Color.WHITE; paint.textSize = dp(9f)
      canvas.drawText(message,width/2f,height-dp(8f),paint)
    }
  }
  override fun performClick(): Boolean {
    super.performClick()
    message = "$owner，我在这儿呢～"; messageUntil = SystemClock.uptimeMillis()+2200
    setClip("wave")
    return true
  }
  override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
    super.onInitializeAccessibilityNodeInfo(info)
    info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_DISMISS)
  }
  override fun performAccessibilityAction(action: Int, arguments: Bundle?): Boolean {
    if (action == AccessibilityNodeInfo.ACTION_DISMISS) { close(); return true }
    return super.performAccessibilityAction(action, arguments)
  }
  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        tracker?.recycle(); tracker = VelocityTracker.obtain(); track(event)
        downX = event.rawX; downY = event.rawY; originX = x; originY = y
        moved = false; dragging = true; flying = false; vx = 0f; vy = 0f
      }
      MotionEvent.ACTION_MOVE -> {
        track(event)
        tracker?.computeCurrentVelocity(1000,dp(3600f))
        val tx = originX+event.rawX-downX; val ty = originY+event.rawY-downY
        if (hypot(event.rawX-downX,event.rawY-downY) > dp(5f)) moved = true
        if ((tx < limits.left || tx > limits.right) && x != tx.coerceIn(limits.left,limits.right)) impact(abs(tracker?.xVelocity ?: 0f),if(tx<limits.left) "左边框" else "右边框")
        if ((ty < limits.top || ty > limits.bottom) && y != ty.coerceIn(limits.top,limits.bottom)) impact(abs(tracker?.yVelocity ?: 0f),if(ty<limits.top) "上边框" else "下边框")
        x = tx.coerceIn(limits.left,limits.right); y = ty.coerceIn(limits.top,limits.bottom)
        updatePosition()
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        track(event); tracker?.computeCurrentVelocity(1000,dp(3600f))
        dragging = false
        if (event.actionMasked == MotionEvent.ACTION_UP && !moved) {
          if (event.x > width-dp(30f) && event.y < dp(30f)) close() else performClick()
        } else if (event.actionMasked == MotionEvent.ACTION_UP && !reduced) {
          vx = tracker?.xVelocity ?: 0f; vy = tracker?.yVelocity ?: 0f
          flying = hypot(vx,vy) > dp(180f)
          lastNanos = 0
        }
        tracker?.recycle(); tracker = null
        schedule()
      }
    }
    return true
  }
  private fun track(event: MotionEvent) {
    // The window moves under the finger: velocity must use screen coordinates.
    val raw = MotionEvent.obtain(event)
    raw.offsetLocation(event.rawX-event.x,event.rawY-event.y)
    tracker?.addMovement(raw)
    raw.recycle()
  }
  fun release() {
    if (released) return
    released = true
    handler.removeCallbacksAndMessages(null)
    Choreographer.getInstance().removeFrameCallback(this)
    tracker?.recycle(); tracker = null
    sheets.values.forEach { if (!it.isRecycled) it.recycle() }
  }
  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    release()
    service.stopSelf()
  }
}
