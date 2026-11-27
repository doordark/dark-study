const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-project-ts.cjs')();

const { BACKGROUND_PRESETS } = load('src/constants/backgrounds.ts');
const {
  GLASS_DEPTH,
  resolveFrostedOpticalProfile,
  resolveGlassOpticalProfile,
} = load('src/constants/glassThemes.ts');

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

    // Verify frosted ("柔雾玻璃") optical profile across all 6 tints
    const frostedBase = resolveFrostedOpticalProfile(tint, isDark, false);
    const frostedWallpaper = resolveFrostedOpticalProfile(tint, isDark, true);
    assert.equal(frostedBase.dispersion, 0, `${tint} frosted must disable chromatic dispersion`);
    assert(
      frostedBase.tintAlpha.surface >= 0.38 && frostedBase.tintAlpha.surface <= 0.48,
      `${tint} frosted surface tintAlpha should be creamy mist (0.38..0.48), got ${frostedBase.tintAlpha.surface}`,
    );
    assert(
      frostedBase.tintAlpha.floating >= 0.36 && frostedBase.tintAlpha.floating <= 0.48,
      `${tint} frosted floating tintAlpha should be creamy mist (0.36..0.48), got ${frostedBase.tintAlpha.floating}`,
    );
    assert(frostedBase.tintAlpha.sheet > frostedBase.tintAlpha.surface, `${tint} frosted sheet must be denser than surface`);
    assert(frostedWallpaper.tintAlpha.surface <= frostedBase.tintAlpha.surface, `${tint} frosted wallpaper must not increase veil`);
  }
}

// Verify unknown theme fallback resolves safely to sky
assert.deepEqual(
  resolveGlassOpticalProfile('unknown-theme', false, false),
  resolveGlassOpticalProfile('sky', false, false),
);
assert.deepEqual(
  resolveFrostedOpticalProfile('unknown-theme', false, false),
  resolveFrostedOpticalProfile('sky', false, false),
);

// Verify optical depth hierarchy
assert(GLASS_DEPTH.floating.refraction > GLASS_DEPTH.surface.refraction);
assert(GLASS_DEPTH.surface.refraction > GLASS_DEPTH.sheet.refraction);
assert(GLASS_DEPTH.sheet.blurRadius <= 25 && GLASS_DEPTH.surface.blurRadius >= 10);
assert(
  GLASS_DEPTH.surface.frostedBlurRadius >= 20 &&
    GLASS_DEPTH.floating.frostedBlurRadius >= 20 &&
    GLASS_DEPTH.sheet.frostedBlurRadius <= 24,
  'frostedBlurRadius must stay within soft 20..24 range',
);

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
assert(ktSource.includes('allowTargetLookup'), 'LiquidGlassModule must expose allowTargetLookup prop for native self-healing');
assert(ktSource.includes('findNearestBlurTarget'), 'LiquidGlassModule must support native ancestor-sibling BlurTarget discovery');
assert(ktSource.includes('OnLayoutChangeListener'), 'LiquidGlassModule must observe target layout readiness');
assert(ktSource.includes('removeOnLayoutChangeListener'), 'LiquidGlassModule must clean up layout listener on detach');
assert(ktSource.includes('candidate.rootView === this.rootView'), 'LiquidGlassModule must isolate BlurTarget lookup to the same Android window');
assert(!fs.existsSync(path.join(root, 'modules', 'glass-refraction')), 'obsolete glass-refraction directory must be removed');

// Verify all 4 card materials ("flat", "glass", "frosted", "clear") across settings, backup, backdrop, container, preview, and UI
const settingsSource = fs.readFileSync(path.join(root, 'src', 'store', 'useSettings.ts'), 'utf8');
assert(settingsSource.includes('"clear"') && settingsSource.includes('"frosted"'), 'useSettings.ts must include clear & frosted card materials');
const memStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
  multiGet: async keys => keys.map(k => [k, null]),
  multiSet: async () => {},
  multiRemove: async () => {},
};
const settingsLoad = require('./load-project-ts.cjs')({
  '@react-native-async-storage/async-storage': memStorage,
  'react-native': { Platform: { OS: 'android' } },
});
const { resolveMaterial } = settingsLoad('src/store/useSettings.ts');
assert.equal(resolveMaterial('clear'), 'clear');
assert.equal(resolveMaterial('frosted'), 'frosted');
assert.equal(resolveMaterial('glass'), 'glass');
assert.equal(resolveMaterial('flat'), 'flat');
assert.equal(resolveMaterial('invalid'), 'flat');

const backupSource = fs.readFileSync(path.join(root, 'src', 'utils', 'backup.ts'), 'utf8');
assert(backupSource.includes("'clear'") && backupSource.includes("'frosted'"), 'backup.ts must validate clear & frosted materials');

const settingsScreenSource = fs.readFileSync(path.join(root, 'src', 'screens', 'settings', 'AppearanceSettings.tsx'), 'utf8');
assert(settingsScreenSource.includes('key: "clear"') && settingsScreenSource.includes('label: "清透"'), 'AppearanceSettings must offer the 清透 (clear) material option');
assert(settingsScreenSource.includes('key: "frosted"') && settingsScreenSource.includes('label: "柔雾玻璃"'), 'AppearanceSettings must offer the 柔雾玻璃 (frosted) material option');
assert(settingsScreenSource.includes('flex-wrap') && settingsScreenSource.includes('48%'), 'AppearanceSettings must arrange 4 materials in a 2x2 grid');

const backdropSource = fs.readFileSync(path.join(root, 'src', 'components', 'Backdrop.tsx'), 'utf8');
assert(
  backdropSource.includes('material === "frosted"') &&
    backdropSource.includes('material === "clear"') &&
    backdropSource.includes('glass || frosted') &&
    backdropSource.includes('glass || frosted || clear'),
  'Backdrop must enable blur for glass/frosted and rich backdrop for glass/frosted/clear',
);

const glassContainerSource = fs.readFileSync(path.join(root, 'src', 'components', 'GlassContainer.tsx'), 'utf8');
assert(glassContainerSource.includes('allowTargetLookup={!!glassTarget}'), 'GlassContainer must forward allowTargetLookup to native view');
assert(glassContainerSource.includes('effectiveMaterial === "clear"'), 'GlassContainer must handle clear material without blur');
assert(glassContainerSource.includes('effectiveMaterial === "frosted"') && glassContainerSource.includes('resolveFrostedOpticalProfile'), 'GlassContainer must handle frosted material with soft blur and creamy sheen');

const previewSource = fs.readFileSync(path.join(root, 'src', 'components', 'GlassMaterialPreview.tsx'), 'utf8');
assert(previewSource.includes('material === "frosted"'), 'GlassMaterialPreview must differentiate frosted preview');

console.log('PASS: liquid glass & frosted optical profiles, 4-material pipeline, theme adaptation, and Android AGSL native module contract verified');
