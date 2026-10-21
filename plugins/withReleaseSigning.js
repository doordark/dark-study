const {
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
  withSettingsGradle,
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

/** 构建期 gradle 属性：控制产物体积（prebuild 重生成时自动补回） */
const GRADLE_PROPS = {
  // 只打 arm64-v8a：真机无需其他 ABI，APK 直接减半
  reactNativeArchitectures: "arm64-v8a",
  // 资源裁剪（移除未被引用的 drawable/布局/字符串）
  "android.enableShrinkResourcesInReleaseBuilds": "true",
  // 不使用 RN Image 的 GIF/WebP 解码（图片统一走 expo-image），省掉对应 native 库
  "expo.gif.enabled": "false",
  "expo.webp.enabled": "false",
  // 网络不稳定：短超时 + 重试，避免连接挂死后长时间无响应
  "systemProp.org.gradle.internal.http.connectionTimeout": "30000",
  "systemProp.org.gradle.internal.http.socketTimeout": "60000",
  "systemProp.org.gradle.internal.repository.max.retries": "5",
  "systemProp.org.gradle.internal.repository.initial.backoff": "500",
};

/** maven 镜像（国内直连 dl.google.com / repo1 经常挂死） */
const MIRRORS = [
  "https://maven.aliyun.com/repository/google",
  "https://maven.aliyun.com/repository/central",
  "https://mirrors.cloud.tencent.com/nexus/repository/maven-public/",
];

const mirrorLines = (indent) =>
  MIRRORS.map((u) => `${indent}maven { url '${u}' }\n`).join("");

/** 在 buildscript / allprojects 的 repositories 首位插入镜像 */
function injectMirrorRepos(contents) {
  if (contents.includes("maven.aliyun.com")) return contents;
  return contents
    .replace(
      /(buildscript\s*\{\r?\n\s*repositories\s*\{\r?\n)/,
      (m) => m + mirrorLines("    "),
    )
    .replace(
      /(allprojects\s*\{\r?\n\s*repositories\s*\{\r?\n)/,
      (m) => m + mirrorLines("    "),
    );
}

function applyProps(props, map) {
  for (const [key, value] of Object.entries(map)) {
    const existing = props.find((p) => p.type === "property" && p.key === key);
    if (existing) existing.value = value;
    else props.push({ type: "property", key, value });
  }
}

function withReleaseSigning(config) {
  // 1) 写入 gradle.properties：签名参数 + 体积优化开关
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const signing = {};
    for (const [suffix, value] of Object.entries(DEFAULTS)) {
      signing[PREFIX + suffix] = value;
    }
    applyProps(props, signing);
    applyProps(props, GRADLE_PROPS);
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

  // 3) android/build.gradle 与 settings.gradle 注入国内 maven 镜像
  config = withProjectBuildGradle(config, (cfg) => {
    cfg.modResults.contents = injectMirrorRepos(cfg.modResults.contents);
    return cfg;
  });
  config = withSettingsGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes("maven.aliyun.com")) {
      contents = contents.replace(
        /(pluginManagement\s*\{\r?\n)/,
        (m) =>
          m +
          "  repositories {\n" +
          mirrorLines("    ") +
          "    maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }\n" +
          "    gradlePluginPortal()\n" +
          "  }\n",
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

module.exports = withReleaseSigning;
