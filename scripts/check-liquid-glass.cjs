const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-project-ts.cjs')();

const { BACKGROUND_PRESETS } = load('src/constants/backgrounds.ts');
const { GLASS_DEPTH, resolveGlassOpticalProfile } = load('src/constants/glassThemes.ts');

const root = path.join(__dirname, '..');
const tints = Object.keys(BACKGROUND_PRESETS);

assert.equal(tints.length, 6, 'expected 6 background theme presets');

for (const tint of tints) {
  const preset = BACKGROUND_PRESETS[tint];
  assert.equal(preset.glassLight.length, 3, `${tint}.glassLight must have 3 stops`);
  assert.equal(preset.glassDark.length, 3, `${tint}.glassDark must have 3 stops`);
  assert.equal(preset.glassLightGlowRgb.length, 4, `${tint}.glassLightGlowRgb must have 4 orbs`);
  assert.equal(preset.glassDarkGlowRgb.length, 4, `${tint}.glassDarkGlowRgb must have 4 orbs`);

  for (const isDark of [false, true]) {
    for (const hasWallpaper of [false, true]) {
      const profile = resolveGlassOpticalProfile(tint, isDark, hasWallpaper);
      assert.equal(profile.tintRgb.length, 3);
      assert.equal(profile.accentRgb.length, 3);
      assert.equal(profile.reflectionRgb.length, 3);
      for (const ch of [...profile.tintRgb, ...profile.accentRgb, ...profile.reflectionRgb]) {
        assert(ch >= 0 && ch <= 1, `${tint} normalized color channel out of [0,1]: ${ch}`);
      }
      assert(profile.saturation >= 1.15 && profile.saturation <= 1.7, `${tint} saturation out of optical range`);
      assert(profile.tintAlpha.surface < profile.tintAlpha.sheet, `${tint} sheet must be denser than surface`);
      assert(profile.tintAlpha.floating <= 0.25, `${tint} floating glass must stay highly translucent`);
      assert.equal(profile.rimStops.length, 4);
      assert.equal(profile.sheenColors.length, 3);
    }

    const base = resolveGlassOpticalProfile(tint, isDark, false);
    const wallpaper = resolveGlassOpticalProfile(tint, isDark, true);
    assert(wallpaper.tintAlpha.surface <= base.tintAlpha.surface, `${tint} wallpaper mode should stay more transparent`);
    assert(wallpaper.saturation >= base.saturation, `${tint} wallpaper mode should keep or boost vibrancy`);
  }
}

// Verify unknown theme fallback resolves safely to sky
assert.deepEqual(
  resolveGlassOpticalProfile('unknown-theme', false, false),
  resolveGlassOpticalProfile('sky', false, false),
);

// Verify optical depth hierarchy
assert(GLASS_DEPTH.floating.refraction > GLASS_DEPTH.surface.refraction);
assert(GLASS_DEPTH.surface.refraction > GLASS_DEPTH.sheet.refraction);
assert(GLASS_DEPTH.sheet.blurRadius <= 25 && GLASS_DEPTH.surface.blurRadius >= 10);

// Verify native Android module manifest & Kotlin AGSL uniforms stay in sync
const moduleRoot = path.join(root, 'modules', 'liquid-glass');
const config = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'expo-module.config.json'), 'utf8'));
assert.deepEqual(config.platforms, ['android']);
assert.deepEqual(config.android.modules, ['expo.modules.liquidglass.LiquidGlassModule']);

const ktSource = fs.readFileSync(
  path.join(moduleRoot, 'android', 'src', 'main', 'java', 'expo', 'modules', 'liquidglass', 'LiquidGlassModule.kt'),
  'utf8',
);
const requiredUniforms = [
  'backdrop',
  'size',
  'radius',
  'density',
  'isDark',
  'tintColor',
  'accentColor',
  'reflectionTint',
  'refractionStrength',
  'dispersion',
  'saturation',
  'rimStrength',
  'reflectionStrength',
  'luminanceLift',
];
for (const u of requiredUniforms) {
  assert(ktSource.includes(u), `missing AGSL uniform ${u} in LiquidGlassModule.kt`);
}
assert(ktSource.includes('Color.TRANSPARENT'), 'BlurView must use transparent overlay to avoid muddy gray veil');
assert(ktSource.includes('createRuntimeShaderEffect'), 'API 33+ must use RuntimeShader RenderEffect');
assert(ktSource.includes('createColorFilterEffect'), 'API 31-32 fallback must use ColorMatrix vibrancy RenderEffect');
assert(!fs.existsSync(path.join(root, 'modules', 'glass-refraction')), 'obsolete glass-refraction directory must be removed');

console.log('PASS: liquid glass optical profiles, theme adaptation, and Android AGSL native module contract verified');
