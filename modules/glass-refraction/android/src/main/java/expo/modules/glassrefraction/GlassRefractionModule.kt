package expo.modules.glassrefraction

import android.content.Context
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

class GlassRefractionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DarkStudyGlassRefraction")

    View(GlassRefractionView::class) {
      Prop("radius") { view: GlassRefractionView, radius: Float ->
        view.updateRadius(radius)
      }
    }
  }
}

// Only the already-blurred backdrop is a child of this view. Text and controls
// render outside the effect and keep their original contrast and geometry.
class GlassRefractionView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var radiusDp = 0f

  fun updateRadius(radius: Float) {
    if (radiusDp == radius) return
    radiusDp = radius
    updateEffect()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updateEffect()
  }

  private fun updateEffect() {
    if (Build.VERSION.SDK_INT >= 33 && width > 0 && height > 0) {
      applyRefraction()
    }
  }

  @RequiresApi(33)
  private fun applyRefraction() {
    val density = resources.displayMetrics.density
    val shader = RuntimeShader(REFRACTION)
    shader.setFloatUniform("size", width.toFloat(), height.toFloat())
    shader.setFloatUniform("radius", radiusDp * density)
    shader.setFloatUniform("density", density)
    setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "backdrop"))
  }
}

private const val REFRACTION = """
  uniform shader backdrop;
  uniform float2 size;
  uniform float radius;
  uniform float density;

  half4 main(float2 position) {
    float2 halfSize = size * 0.5;
    float cornerRadius = clamp(radius, 0.0, min(halfSize.x, halfSize.y));
    float2 centered = position - halfSize;
    float2 edge = abs(centered) - (halfSize - cornerRadius);
    float2 corner = max(edge, float2(0.0));
    float cornerLength = length(corner);
    float signedDistance = cornerLength + min(max(edge.x, edge.y), 0.0) - cornerRadius;

    // Bend rays towards the interior near the bevel and keep the center aligned.
    float bevelWidth = min(13.0 * density, min(halfSize.x, halfSize.y) * 0.6);
    float bend = 1.0 - smoothstep(0.0, bevelWidth, -signedDistance);
    float2 side = edge.x > edge.y ? float2(1.0, 0.0) : float2(0.0, 1.0);
    float2 normal = sign(centered) * (cornerLength > 0.0 ? corner / cornerLength : side);
    float2 samplePosition = position - normal * (0.78 * bevelWidth * bend);
    return backdrop.eval(samplePosition);
  }
"""
