const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withMainApplication, withDangerousMod } = require("@expo/config-plugins");

/** Native desktop pet; generated Android files are owned by Expo prebuild. */
module.exports = function withWhaleOverlay(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest["uses-permission"] ??= [];
    for (const permission of ["SYSTEM_ALERT_WINDOW", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_SPECIAL_USE"]) {
      const name = `android.permission.${permission}`;
      if (!manifest["uses-permission"].some((p) => p.$["android:name"] === name)) manifest["uses-permission"].push({ $: { "android:name": name } });
    }
    const app = manifest.application[0];
    app.service ??= [];
    if (!app.service.some((s) => s.$["android:name"] === ".WhaleOverlayService")) app.service.push({
      $: { "android:name": ".WhaleOverlayService", "android:exported": "false", "android:stopWithTask": "false", "android:foregroundServiceType": "specialUse" },
      property: [{ $: { "android:name": "android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE", "android:value": "User-started draggable animated desktop companion, visible above other apps until explicitly dismissed" } }],
    });
    return cfg;
  });
  config = withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== "kt") throw new Error("Whale overlay requires a Kotlin MainApplication");
    if (!cfg.modResults.contents.includes("add(WhaleOverlayPackage())")) {
      const marker = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!marker.test(cfg.modResults.contents)) throw new Error("Could not register WhaleOverlayPackage");
      cfg.modResults.contents = cfg.modResults.contents.replace(marker, "$&\n          add(WhaleOverlayPackage())");
    }
    return cfg;
  });
  return withDangerousMod(config, ["android", async (cfg) => {
    const root = path.join(cfg.modRequest.platformProjectRoot, "app/src/main");
    const pkg = cfg.android.package;
    const target = path.join(root, "java", ...pkg.split("."));
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "WhaleOverlay.kt"), fs.readFileSync(path.join(__dirname, "whale-overlay/WhaleOverlay.kt"), "utf8").replaceAll("__PACKAGE__", pkg));
    const assets = path.join(root, "assets/whale-overlay");
    fs.mkdirSync(assets, { recursive: true });
    for (const name of ["pet-idle-v2.png", "pet-actions-v2.png", "pet-hurt-v1.png"]) {
      fs.copyFileSync(path.join(cfg.modRequest.projectRoot, "assets/whale", name), path.join(assets, name));
    }
    return cfg;
  }]);
};
