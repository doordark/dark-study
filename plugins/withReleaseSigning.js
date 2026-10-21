const {
  withAppBuildGradle,
  withGradleProperties,
} = require("@expo/config-plugins");

/**
 * 本地构建签名插件（CNG 工作流）：
 * android/ 目录由 prebuild 生成，模板默认用 debug.keystore 签 release 包。
 * debug 密钥随每次生成随机变化——换机器或 clean prebuild 后签名不一致，
 * 应用内「检查更新」下载的新 APK 会因签名冲突无法覆盖安装。
 * 此插件把 release 签名固定指向 keystore/dark-study-release.keystore
 * （该文件不入库，务必本地备份；丢失后新版本将无法覆盖安装旧版本）。
 * 签名参数可通过 android/gradle.properties 中的同名属性覆盖。
 */

const PREFIX = "DARKSTUDY_RELEASE_";

const DEFAULTS = {
  STORE_FILE: "../../keystore/dark-study-release.keystore",
  STORE_PASSWORD: "darkstudy2026",
  KEY_ALIAS: "dark-study",
  KEY_PASSWORD: "darkstudy2026",
};

function withReleaseSigning(config) {
  // 1) 写入 gradle.properties：签名参数
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    for (const [suffix, value] of Object.entries(DEFAULTS)) {
      const key = PREFIX + suffix;
      const existing = props.find(
        (p) => p.type === "property" && p.key === key,
      );
      if (existing) existing.value = value;
      else props.push({ type: "property", key, value });
    }
    return cfg;
  });

  // 2) 注入 app/build.gradle：release signingConfig + 切换 buildTypes
  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes("signingConfigs.release")) {
      const block = [
        "",
        "        release {",
        `            storeFile file(${PREFIX}STORE_FILE)`,
        `            storePassword ${PREFIX}STORE_PASSWORD`,
        `            keyAlias ${PREFIX}KEY_ALIAS`,
        `            keyPassword ${PREFIX}KEY_PASSWORD`,
        "        }",
      ].join("\n");
      contents = contents.replace(/(signingConfigs\s*\{\n)/, `$1${block}\n`);
    }
    contents = contents.replace(
      /signingConfig signingConfigs\.debug/g,
      "signingConfig signingConfigs.release",
    );
    // Windows 路径超长（>260 字符）修复：AGP 默认的 CMake 3.22.1
    // 自带 ninja 不支持长路径，Fabric codegen 的 .o 文件路径必然超限。
    // CMake 3.31.1 捆绑 ninja 1.12+，配合系统 LongPathsEnabled=1 可正常编译。
    // RNGP 会动态补 path，这里只声明 version，两者自动合并。
    if (!contents.includes("3.31.1")) {
      contents = contents.replace(
        /(android\s*\{\r?\n)/,
        [
          "$1",
          "    externalNativeBuild {",
          "        cmake {",
          '            version "3.31.1"',
          "        }",
          "    }",
          "",
        ].join("\n"),
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

module.exports = withReleaseSigning;
