const { withAppBuildGradle, withGradleProperties, withXcodeProject } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/** Bundle the checked-in model, without downloading anything on the user's device. */
module.exports = function withWhaleOfflineVoice(config) {
  const checkAssets = (root) => {
    for (const file of ["model.int8.onnx", "voices.bin", "tokens.txt", "lexicon.txt"]) {
      const target = path.join(root, "assets/voice/models/whale-kokoro-v2", file);
      if (!fs.existsSync(target)) throw new Error(`Bundled whale voice is missing: ${file}`);
    }
  };
  config = withAppBuildGradle(config, (mod) => {
    checkAssets(mod.modRequest.projectRoot);
    const marker = "// Bundled whale offline voice";
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `\n${marker}\nandroid {\n    sourceSets.main.assets.srcDir(new File(rootProject.projectDir, '../assets/voice'))\n    androidResources { noCompress += ['onnx', 'bin'] }\n}\n`;
    }
    return mod;
  });
  config = withGradleProperties(config, (mod) => {
    for (const key of ["sherpaOnnxDisableFfmpeg", "sherpaOnnxDisableLibarchive"]) {
      const existing = mod.modResults.find((item) => item.type === "property" && item.key === key);
      if (existing) existing.value = "true";
      else mod.modResults.push({ type: "property", key, value: "true" });
    }
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    checkAssets(mod.modRequest.projectRoot);
    const project = mod.modResults;
    // A folder reference preserves lexicon / phonemizer subdirectories in the bundle.
    project.addResourceFile("../assets/voice/models", { lastKnownFileType: "folder" },
      project.getFirstProject().firstProject.mainGroup);
    return mod;
  });
};
