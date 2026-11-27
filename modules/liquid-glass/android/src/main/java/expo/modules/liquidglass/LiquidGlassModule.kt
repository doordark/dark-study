package expo.modules.liquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Path
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.view.View
import android.view.View.MeasureSpec
import android.view.ViewGroup
import androidx.annotation.RequiresApi
import eightbitlab.com.blurview.BlurTarget
import eightbitlab.com.blurview.BlurView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

class LiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DarkStudyLiquidGlass")

    View(LiquidGlassView::class) {
      Name("LiquidGlassView")

      Prop("blurTargetId") { view: LiquidGlassView, targetId: Int? ->
        view.setBlurTargetId(targetId)
      }

      Prop("allowTargetLookup") { view: LiquidGlassView, allow: Boolean ->
        view.allowTargetLookup = allow
      }

      Prop("blurRadius") { view: LiquidGlassView, radius: Float ->
        view.blurRadiusDp = radius
      }

      Prop("cornerRadius") { view: LiquidGlassView, radius: Float ->
        view.cornerRadiusDp = radius
      }

      Prop("isDark") { view: LiquidGlassView, isDark: Boolean ->
        view.isDarkMode = isDark
      }

      Prop("tintRgba") { view: LiquidGlassView, rgba: FloatArray? ->
        if (rgba != null && rgba.size >= 4) {
          view.tintRgba = floatArrayOf(rgba[0], rgba[1], rgba[2], rgba[3])
        }
      }

      Prop("accentRgb") { view: LiquidGlassView, rgb: FloatArray? ->
        if (rgb != null && rgb.size >= 3) {
          view.accentRgb = floatArrayOf(rgb[0], rgb[1], rgb[2])
        }
      }

      Prop("reflectionRgb") { view: LiquidGlassView, rgb: FloatArray? ->
        if (rgb != null && rgb.size >= 3) {
          view.reflectionRgb = floatArrayOf(rgb[0], rgb[1], rgb[2])
        }
      }

      Prop("refractionStrength") { view: LiquidGlassView, strength: Float ->
        view.refractionStrength = strength
      }

      Prop("dispersion") { view: LiquidGlassView, dispersion: Float ->
        view.dispersion = dispersion
      }

      Prop("saturation") { view: LiquidGlassView, saturation: Float ->
        view.saturation = saturation
      }

      Prop("rimStrength") { view: LiquidGlassView, strength: Float ->
        view.rimStrength = strength
      }

      Prop("reflectionStrength") { view: LiquidGlassView, strength: Float ->
        view.reflectionStrength = strength
      }

      Prop("luminanceLift") { view: LiquidGlassView, lift: Float ->
        view.luminanceLift = lift
      }

      OnViewDidUpdateProps { view: LiquidGlassView ->
        view.syncGlassState()
      }
    }

    View(LiquidGlassTargetView::class) {
      Name("LiquidGlassTargetView")
    }
  }
}

private class UIManagerCompatibleLiquidBlurTarget(context: Context) : BlurTarget(context) {
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    // React Native UIManager lays out children directly.
  }

  @SuppressLint("MissingSuperCall")
  override fun requestLayout() {
    // Prevent redundant layout passes inside RN Fabric/UIManager.
  }
}

@SuppressLint("ViewConstructor")
class LiquidGlassTargetView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  internal val blurTarget: BlurTarget = UIManagerCompatibleLiquidBlurTarget(context)

  init {
    super.addView(
      blurTarget,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
  }

  override fun addView(child: View?) {
    if (child === blurTarget) {
      super.addView(child)
      return
    }
    blurTarget.addView(child)
  }

  override fun addView(child: View?, index: Int) {
    if (child === blurTarget) {
      super.addView(child, index)
      return
    }
    blurTarget.addView(child, index)
  }

  override fun addView(child: View?, params: ViewGroup.LayoutParams?) {
    if (child === blurTarget) {
      super.addView(child, toHostLayoutParams(params))
      return
    }
    blurTarget.addView(child, params)
  }

  override fun addView(child: View?, index: Int, params: ViewGroup.LayoutParams?) {
    if (child === blurTarget) {
      super.addView(child, index, toHostLayoutParams(params))
      return
    }
    blurTarget.addView(child, index, params)
  }

  override fun addView(child: View?, width: Int, height: Int) {
    if (child === blurTarget) {
      super.addView(child, width, height)
      return
    }
    blurTarget.addView(child, width, height)
  }

  override fun updateViewLayout(view: View?, params: ViewGroup.LayoutParams?) {
    if (view === blurTarget) {
      super.updateViewLayout(view, toHostLayoutParams(params))
      return
    }
    blurTarget.updateViewLayout(view, params)
  }

  override fun removeView(view: View?) {
    if (view === blurTarget) {
      super.removeView(view)
      return
    }
    blurTarget.removeView(view)
  }

  override fun removeViewAt(index: Int) = blurTarget.removeViewAt(index)
  override fun removeViews(start: Int, count: Int) = blurTarget.removeViews(start, count)
  override fun removeViewsInLayout(start: Int, count: Int) = blurTarget.removeViewsInLayout(start, count)
  override fun removeAllViews() = blurTarget.removeAllViews()
  override fun removeAllViewsInLayout() = blurTarget.removeAllViewsInLayout()
  override fun getChildCount(): Int = blurTarget.childCount
  override fun getChildAt(index: Int): View? = blurTarget.getChildAt(index)

  override fun indexOfChild(child: View?): Int {
    if (child === blurTarget) {
      return super.indexOfChild(child)
    }
    return blurTarget.indexOfChild(child)
  }

  override fun startViewTransition(view: View?) {
    if (view === blurTarget) {
      super.startViewTransition(view)
      return
    }
    blurTarget.startViewTransition(view)
  }

  override fun endViewTransition(view: View?) {
    if (view === blurTarget) {
      super.endViewTransition(view)
      return
    }
    blurTarget.endViewTransition(view)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    val height = MeasureSpec.getSize(heightMeasureSpec)
    setMeasuredDimension(width, height)
    blurTarget.measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    blurTarget.layout(0, 0, right - left, bottom - top)
  }

  private fun toHostLayoutParams(params: ViewGroup.LayoutParams?): LayoutParams = when (params) {
    null -> LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    is LayoutParams -> params
    else -> LayoutParams(params)
  }
}

/**
 * Renders only the optical glass backdrop (pure zero-veil BlurView + Android 13+ AGSL
 * liquid glass shader, or Android 12 ColorMatrix vibrancy fallback).
 * Foreground text and controls live outside this view and stay 100% sharp.
 */
@SuppressLint("ViewConstructor")
class LiquidGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  internal var allowTargetLookup = true
  internal var blurRadiusDp = 16f
  internal var cornerRadiusDp = 24f
  internal var isDarkMode = false
  internal var tintRgba = floatArrayOf(1f, 1f, 1f, 0.16f)
  internal var accentRgb = floatArrayOf(0.22f, 0.74f, 0.97f)
  internal var reflectionRgb = floatArrayOf(0.95f, 0.98f, 1f)
  internal var refractionStrength = 1.0f
  internal var dispersion = 0.45f
  internal var saturation = 1.42f
  internal var rimStrength = 0.85f
  internal var reflectionStrength = 0.78f
  internal var luminanceLift = 0.22f

  private var blurTargetId: Int? = null
  private var targetView: BlurTarget? = null
  private var configuredTarget: BlurTarget? = null
  private var observedTarget: BlurTarget? = null
  private var cachedShader: Any? = null
  private var agslActive = false
  private var agslFailed = false
  private var bindRetryCount = 0
  private var bindRetryScheduled = false

  private val clipPath = Path()
  private val clipRect = RectF()
  private var needsClipUpdate = true

  private val targetLayoutListener = OnLayoutChangeListener { v, _, _, _, _, _, _, _, _ ->
    if (v.width > 0 && v.height > 0 && isAttachedToWindow) {
      configureBlurTarget()
      applyRenderEffect()
      v.invalidate()
      blurView.invalidate()
      invalidate()
    }
  }

  private val retryBindRunnable = Runnable {
    bindRetryScheduled = false
    if (!isAttachedToWindow) return@Runnable
    resolveAndConfigure(allowRetry = true)
  }

  private val postBindRefreshRunnable = Runnable {
    if (!isAttachedToWindow) return@Runnable
    val target = configuredTarget ?: return@Runnable
    if (target.width > 0 && target.height > 0) {
      target.invalidate()
      blurView.invalidate()
      applyRenderEffect()
      invalidate()
    }
  }

  private val blurView = BlurView(context).also {
    it.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    it.setOverlayColor(Color.TRANSPARENT)
    addView(it)
  }

  init {
    setBackgroundColor(Color.TRANSPARENT)
    setWillNotDraw(false)
  }

  fun setBlurTargetId(targetId: Int?) {
    if (blurTargetId == targetId && targetView != null && targetView?.isAttachedToWindow == true) {
      return
    }
    blurTargetId = targetId
    bindRetryCount = 0
    resolveAndConfigure(allowRetry = true)
  }

  private fun extractBlurTarget(view: View?): BlurTarget? {
    return when (view) {
      is LiquidGlassTargetView -> view.blurTarget
      is BlurTarget -> view
      is ViewGroup -> {
        if (view.childCount > 0) {
          val firstChildParent = view.getChildAt(0)?.parent
          if (firstChildParent is BlurTarget) firstChildParent else null
        } else {
          null
        }
      }
      else -> null
    }
  }

  /**
   * Resolves the page's BlurTarget via explicit React tag first, then falls back to
   * walking up the native Android ancestor chain to locate the sibling LiquidGlassTargetView.
   * This eliminates Fabric findNodeHandle / modal transition race conditions.
   */
  private fun findNearestBlurTarget(): BlurTarget? {
    var current: ViewGroup? = parent as? ViewGroup
    var depth = 0
    while (current != null && depth < 24) {
      for (i in 0 until current.childCount) {
        val child = current.getChildAt(i)
        if (child === this) continue
        val candidate = when (child) {
          is LiquidGlassTargetView -> child.blurTarget
          is BlurTarget -> child
          else -> null
        }
        if (candidate != null && candidate.rootView === this.rootView) {
          return candidate
        }
      }
      current = current.parent as? ViewGroup
      depth++
    }
    return null
  }

  private fun resolveBlurTarget(targetId: Int?): BlurTarget? {
    if (targetId != null) {
      val byId = extractBlurTarget(appContext.findView<View>(targetId))
      if (byId != null && byId.rootView === this.rootView) {
        return byId
      }
    }
    if (allowTargetLookup && isAttachedToWindow) {
      return findNearestBlurTarget()
    }
    return null
  }

  private fun observeTarget(nextTarget: BlurTarget?) {
    if (observedTarget === nextTarget) return
    observedTarget?.removeOnLayoutChangeListener(targetLayoutListener)
    observedTarget = nextTarget
    nextTarget?.addOnLayoutChangeListener(targetLayoutListener)
  }

  private fun scheduleBindRetry() {
    if (bindRetryScheduled || !isAttachedToWindow || bindRetryCount >= MAX_BIND_RETRIES) {
      return
    }
    bindRetryScheduled = true
    bindRetryCount++
    postOnAnimation(retryBindRunnable)
  }

  private fun resolveAndConfigure(allowRetry: Boolean) {
    val currentTarget = targetView
    if (currentTarget == null || !currentTarget.isAttachedToWindow) {
      targetView = resolveBlurTarget(blurTargetId)
    }
    observeTarget(targetView)
    configureBlurTarget()
    applyRenderEffect()

    val target = targetView
    if (allowRetry && isAttachedToWindow && Build.VERSION.SDK_INT >= 31) {
      if (target == null || !target.isAttachedToWindow || target.width <= 0 || target.height <= 0) {
        scheduleBindRetry()
      }
    }
  }

  private fun configureBlurTarget() {
    val target = targetView
    if (target == null || Build.VERSION.SDK_INT < 31) {
      blurView.setBlurEnabled(false)
      configuredTarget = null
      return
    }
    if (!isAttachedToWindow || !target.isAttachedToWindow) {
      return
    }

    val clampedRadius = blurRadiusDp.coerceIn(1f, 25f)
    if (configuredTarget !== target) {
      val decorBg = appContext.currentActivity?.window?.decorView?.background
      val facade = blurView.setupWith(target)
        .setBlurAutoUpdate(true)
        .setBlurRadius(clampedRadius)
      if (decorBg != null) {
        facade.setFrameClearDrawable(decorBg)
      }
      blurView.setOverlayColor(Color.TRANSPARENT)
      configuredTarget = target
      // Ensure BlurTarget records its RenderNode and BlurView redraws once modal/entering animations settle.
      removeCallbacks(postBindRefreshRunnable)
      postOnAnimation(postBindRefreshRunnable)
      postDelayed(postBindRefreshRunnable, 120L)
    } else {
      blurView.setBlurAutoUpdate(true)
      blurView.setBlurRadius(clampedRadius)
    }
    blurView.setBlurEnabled(true)
    if (target.width > 0 && target.height > 0) {
      target.invalidate()
    }
    blurView.invalidate()
  }

  fun syncGlassState() {
    needsClipUpdate = true
    resolveAndConfigure(allowRetry = true)
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    bindRetryCount = 0
    configuredTarget = null
    resolveAndConfigure(allowRetry = true)
  }

  override fun onDetachedFromWindow() {
    removeCallbacks(retryBindRunnable)
    removeCallbacks(postBindRefreshRunnable)
    bindRetryScheduled = false
    observeTarget(null)
    blurView.setBlurAutoUpdate(false)
    blurView.setBlurEnabled(false)
    agslActive = false
    if (Build.VERSION.SDK_INT >= 31) {
      setRenderEffect(null)
    }
    cachedShader = null
    configuredTarget = null
    targetView = null
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    needsClipUpdate = true
    if (w > 0 && h > 0 && isAttachedToWindow) {
      resolveAndConfigure(allowRetry = true)
    }
  }

  override fun draw(canvas: Canvas) {
    // When AGSL is active, the shader itself performs smooth subpixel SDF clipping.
    // On API 31-32 fallback, clip via rounded rect Path.
    if (agslActive || cornerRadiusDp <= 0f) {
      super.draw(canvas)
      return
    }
    if (needsClipUpdate) {
      val rPx = cornerRadiusDp * resources.displayMetrics.density
      clipRect.set(0f, 0f, width.toFloat(), height.toFloat())
      clipPath.reset()
      clipPath.addRoundRect(clipRect, rPx, rPx, Path.Direction.CW)
      needsClipUpdate = false
    }
    val save = canvas.save()
    canvas.clipPath(clipPath)
    super.draw(canvas)
    canvas.restoreToCount(save)
  }

  private fun applyRenderEffect() {
    if (Build.VERSION.SDK_INT < 31 || width <= 0 || height <= 0) {
      return
    }
    if (Build.VERSION.SDK_INT >= 33 && !agslFailed) {
      if (applyAgslLiquidGlass()) {
        agslActive = true
        return
      }
    }
    agslActive = false
    applyApi31VibrancyFallback()
  }

  @RequiresApi(33)
  private fun applyAgslLiquidGlass(): Boolean {
    return try {
      val shader = (cachedShader as? RuntimeShader) ?: RuntimeShader(LIQUID_GLASS_AGSL).also {
        cachedShader = it
      }
      val density = resources.displayMetrics.density
      shader.setFloatUniform("size", width.toFloat(), height.toFloat())
      shader.setFloatUniform("radius", cornerRadiusDp * density)
      shader.setFloatUniform("density", density)
      shader.setFloatUniform("isDark", if (isDarkMode) 1f else 0f)
      shader.setFloatUniform("tintColor", tintRgba[0], tintRgba[1], tintRgba[2], tintRgba[3])
      shader.setFloatUniform("accentColor", accentRgb[0], accentRgb[1], accentRgb[2])
      shader.setFloatUniform("reflectionTint", reflectionRgb[0], reflectionRgb[1], reflectionRgb[2])
      shader.setFloatUniform("refractionStrength", refractionStrength.coerceIn(0f, 2f))
      shader.setFloatUniform("dispersion", dispersion.coerceIn(0f, 1.5f))
      shader.setFloatUniform("saturation", saturation.coerceIn(0.8f, 2.0f))
      shader.setFloatUniform("rimStrength", rimStrength.coerceIn(0f, 1.5f))
      shader.setFloatUniform("reflectionStrength", reflectionStrength.coerceIn(0f, 1.5f))
      shader.setFloatUniform("luminanceLift", luminanceLift.coerceIn(0f, 0.7f))
      setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "backdrop"))
      true
    } catch (_: Throwable) {
      agslFailed = true
      false
    }
  }

  @RequiresApi(31)
  private fun applyApi31VibrancyFallback() {
    val matrix = ColorMatrix().apply {
      setSaturation(saturation.coerceIn(1.0f, 1.8f))
    }
    setRenderEffect(RenderEffect.createColorFilterEffect(ColorMatrixColorFilter(matrix)))
  }

  companion object {
    private const val MAX_BIND_RETRIES = 48
  }
}

private const val LIQUID_GLASS_AGSL = """
  uniform shader backdrop;
  uniform float2 size;
  uniform float radius;
  uniform float density;
  uniform float isDark;
  uniform float4 tintColor;
  uniform float3 accentColor;
  uniform float3 reflectionTint;
  uniform float refractionStrength;
  uniform float dispersion;
  uniform float saturation;
  uniform float rimStrength;
  uniform float reflectionStrength;
  uniform float luminanceLift;

  half4 main(float2 fragCoord) {
    float2 halfSize = size * 0.5;
    float minHalf = max(min(halfSize.x, halfSize.y), 1.0);
    float r = clamp(radius, 0.0, minHalf);
    float2 p = fragCoord - halfSize;
    float2 q = abs(p) - (halfSize - float2(r));
    float2 cornerVec = max(q, float2(0.0));
    float cornerLen = length(cornerVec);
    float d = cornerLen + min(max(q.x, q.y), 0.0) - r;

    float aa = smoothstep(0.65, -0.65, d);
    if (aa <= 0.001) {
      return half4(0.0);
    }

    // Smooth outward normal with seamless interior transition (no 45-deg crease).
    float2 edgeBlend = float2(
      smoothstep(q.y - 2.0 * density, q.y + 2.0 * density, q.x),
      smoothstep(q.x - 2.0 * density, q.x + 2.0 * density, q.y)
    );
    float2 innerDir = normalize(edgeBlend + float2(0.0001));
    float2 rawDir = cornerLen > 0.001 ? (cornerVec / cornerLen) : innerDir;
    float2 sgn = float2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
    float2 n = sgn * rawDir;

    // Curved convex bevel lens refraction + subtle chromatic dispersion along edges.
    float bevelWidth = clamp(13.5 * density, 5.0 * density, minHalf * 0.58);
    float depth = max(-d, 0.0);
    float t = clamp(depth / max(bevelWidth, 0.001), 0.0, 1.0);
    float edgeCurve = pow(max(1.0 - t, 0.0001), 2.15);
    float bendPx = bevelWidth * 0.56 * refractionStrength * edgeCurve;
    float dispPx = 2.0 * density * dispersion * edgeCurve;

    float2 minBound = float2(1.0);
    float2 maxBound = max(size - float2(1.0), minBound);
    float2 basePos = fragCoord - n * bendPx;
    float2 posR = clamp(basePos - n * dispPx, minBound, maxBound);
    float2 posG = clamp(basePos, minBound, maxBound);
    float2 posB = clamp(basePos + n * dispPx, minBound, maxBound);

    float3 col = float3(
      float(backdrop.eval(posR).r),
      float(backdrop.eval(posG).g),
      float(backdrop.eval(posB).b)
    );

    // Vibrancy / saturation boost so blurred colors transmit vividly without turning gray.
    float luma = dot(col, float3(0.2126, 0.7152, 0.0722));
    col = clamp(mix(float3(luma), col, saturation), 0.0, 1.0);

    float2 uv = fragCoord / max(size, float2(1.0));
    if (isDark < 0.5) {
      // Light mode: adaptive shadow lift keeps dark text legible while bright hues pass clearly.
      float shadowLift = (1.0 - luma) * luminanceLift;
      col = mix(col, float3(0.985, 0.992, 1.0), clamp(shadowLift, 0.0, 0.42));
      col = mix(col, tintColor.rgb, tintColor.a);
      // Gentle physical thickness tone across the pane so light glass reads as tangible crystal.
      float bodyGrad = clamp(uv.x * 0.35 + uv.y * 0.65, 0.0, 1.0);
      col = mix(col, col * (0.955 + 0.045 * (1.0 - bodyGrad)) + accentColor * 0.025, 0.35);
    } else {
      // Dark mode: luminous vibrant transmission like HyperOS Control Center.
      col = clamp(col * (1.06 + luminanceLift * 0.35) + float3(0.015), 0.0, 1.0);
      col = mix(col, tintColor.rgb, tintColor.a);
    }

    // Opposing diagonal light vectors (iconic top-left + bottom-right liquid glass speculars).
    float2 keyLight = normalize(float2(-0.68, -0.73));
    float2 bounceLight = normalize(float2(0.66, 0.75));
    float keyDot = max(dot(n, keyLight), 0.0);
    float bounceDot = max(dot(n, bounceLight), 0.0);

    // 1) Glossy glass surface reflection sweep across upper-left pane.
    float diag = uv.x * 0.52 + uv.y * 0.85;
    float topSheen = smoothstep(0.62, 0.0, diag);
    float glossRibbon = exp(-pow((diag - 0.18) / 0.14, 2.0)) * 0.45;
    float surfaceRefl = (topSheen * 0.55 + glossRibbon) * reflectionStrength;
    float3 reflCol = mix(float3(1.0), reflectionTint, 0.25);
    float reflGain = isDark < 0.5 ? 0.23 : 0.11;
    col = mix(col, reflCol, clamp(surfaceRefl * reflGain, 0.0, 0.34));

    // 2) Inner bevel caustic glow (internal light reflection hugging the curved edge).
    float causticFalloff = exp(-depth / max(4.6 * density, 0.001));
    float causticDir = 0.20
      + pow(max(keyDot, 0.0001), 1.45) * 0.85
      + pow(max(bounceDot, 0.0001), 1.80) * 0.52;
    float causticAmt = causticFalloff * causticDir * reflectionStrength * (isDark < 0.5 ? 0.25 : 0.22);
    float3 causticCol = mix(float3(1.0), mix(col, accentColor, 0.45) * 0.35 + 0.72, 0.38);
    col = clamp(col + causticCol * causticAmt, 0.0, 1.0);

    // 3) Razor-sharp specular rim highlight around the glass perimeter.
    float rimCenter = 0.85 * density;
    float rimWidth = 0.85 * density;
    float rimLine = exp(-pow((depth - rimCenter) / max(rimWidth, 0.001), 2.0));
    float rimDir = 0.26
      + pow(max(keyDot, 0.0001), 1.55) * 0.92
      + pow(max(bounceDot, 0.0001), 1.95) * 0.68;
    float rimAlpha = clamp(rimLine * rimDir * rimStrength, 0.0, 0.96);
    float3 rimCol = mix(float3(1.0), mix(col, reflectionTint, 0.40) * 0.25 + 0.80, 0.24);
    col = mix(col, rimCol, rimAlpha);

    // 4) Light-mode subtle outer bevel definition on shadow-facing side so glass pops on pale themes.
    if (isDark < 0.5 && rimStrength > 0.01) {
      float outerLine = exp(-pow(depth / max(0.85 * density, 0.001), 2.0));
      float shadowSide = clamp(1.0 - keyDot * 0.85 - bounceDot * 0.35, 0.18, 1.0);
      float3 edgeTone = mix(float3(0.42, 0.50, 0.62), accentColor * 0.52, 0.42);
      col = mix(col, edgeTone, clamp(outerLine * shadowSide * 0.20 * min(rimStrength, 1.0), 0.0, 0.24));
    }

    return half4(clamp(col, 0.0, 1.0) * aa, aa);
  }
"""
