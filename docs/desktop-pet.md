# Android 桌面大肥鱼

本次实现 Android 手机桌面及其他应用上方的系统悬浮桌宠。Windows 桌面和 iOS 应用外悬浮不包含在本次改动中；Web/iOS 保留软件内桌宠。

## 使用

新增原生服务，旧安装包、Expo Go 和仅 JS 热更新不会获得此功能。重新原生构建并安装 APK 后，进入「人设与记忆 → 桌宠 → 开启桌面桌宠」，允许「显示在其他应用上层」并返回软件；按 Home 键查看。

本地已有 android 工程时，先让 Expo 应用配置插件，再构建：

```powershell
npx expo prebuild --platform android --no-install
npx expo run:android
```

不使用 `--clean`。本次未覆盖现有生成的 Android 工程，也没有触碰其他任务的原生修改。云构建沿用项目现有 APK 构建流程。

- 拖动、抛掷：原生窗口移动和 Choreographer 物理，不依赖 React/JS 在后台继续运行。
- 点一下挥手；右上角 ×、无障碍 dismiss 操作或常驻通知的「收回桌宠」关闭。不会开机自动启动。
- 超过 550 dp/s 的撞击触发疼痛姿势，强撞有不同气泡，冷却 1400ms；拖到边缘停住不会反复喊疼。
- 应用内及桌面共用 8 帧疼痛图，包含受惊、闭眼、抬手、捂头、揉脸与恢复。入场保持比例，只淡入并轻轻上浮。
- 撞击记录会同步到现有共享聊天；桌面后台只暂存最近一次，JS 恢复后导入并确认消费，避免删除聊天后再次恢复。无需 AI 请求。桌面版不在后台调用语音；聊天、喂饭和设置继续使用软件内入口。
- 桌面悬浮开启时隐藏软件内那一只，避免重复显示。关闭桌面版后，软件内原有 visible 状态仍生效。
- 熄屏移除帧回调和动画定时唤醒，抛掷不追赶熄屏时间。减少动态效果时使用静止姿势，关闭抛掷和出现时的移动。
- 窗口仅覆盖桌宠的小区域，不占据全屏，不接管键盘焦点；透明留白仍属于该小窗口的触摸区域。

## 文件

- `plugins/withWhaleOverlay.js`：Expo 插件，添加权限、specialUse 前台服务、ReactPackage 注册，以及贴图复制。保留其他插件。
- `plugins/whale-overlay/WhaleOverlay.kt`：原生桥、服务、通知、窗口、绘制、手势和碰撞。
- `src/services/desktopPet.ts`、`src/store/useDesktopPet.ts`、`src/hooks/useDesktopPetSync.ts`：系统权限、实际运行状态、启动/关闭和撞击记录同步。
- `src/components/DesktopPetSettings.tsx`、`src/screens/WhaleSettingsScreen.tsx`：授权并开启、状态提示和桌宠设置页。
- `src/components/WhalePet.tsx`：应用内入场、撞边疼痛、桌面模式去重。
- `src/components/WhaleSummonFX.tsx`：删除角色的夸张 scaleX/scaleY 弹性变形，降低入水/出水倾斜幅度。
- `src/components/PetAnimation.tsx`：新增 hurt 单次动作。
- `app.json`：只追加本次配置插件，保留已有版本、权限和其他配置。

## 新素材与生成记录

内置 imagegen，以 `assets/whale/pet-actions-v2.png` 为角色参考。仅生成一套 8 帧疼痛动作；首稿背景不透明，因此用第二次编辑仅移除背景。

最终原图：`assets/animation-sources/pet-hurt.png`。运行图：`assets/whale/pet-hurt-v1.png`，768×512，4 列×2 行，192×256 单格，RGBA 解码约 1.5 MiB。以 Pillow LANCZOS 从 1536×1024 等比缩小，没有增加、复制或插值动作帧。

提示词：保持现有蓝发女仆鲸鱼的脸、头发、海军蓝金边服装、鲸鱼围裙、白色头饰、蓝蝴蝶结、尾巴及比例画风；8 帧连续轻微卡通撞痛反应：受惊、闭眼皱眉、抬手、捂额头含泪、揉额头/脸颊、放手噘嘴、睁眼缓和、恢复中立；4×2 等尺寸格，身体中心和脚底稳定，全身完整，透明 alpha，无文字、符号、背景、阴影、伤口或淤青。修正编辑只移除蓝灰背景，保持角色与布局不变。

## 必要检查

- TypeScript、Expo lint：通过。
- Kotlin 源文件：使用本机缓存 Kotlin 2.4.20、React Native 0.88 AAR 和 Android 36 SDK 进行独立编译，通过。存在兼容旧通知 API 和 ReactPackage 的弃用警告，不是编译错误。
- Expo config introspection：已确认悬浮权限、两个前台服务权限、非导出的 specialUse 服务和用途声明正确合入 manifest。
- 贴图尺寸/alpha：已检查。

按要求没有跑全量测试、Web 浏览器巡检、完整 Gradle APK 构建或实机流程。上述原生文件编译不等于完整 APK 构建。需真机确认授权返回自动出现、桌面拖拽/抛掷/撞边、通知收回、横竖屏/导航栏边界、熄屏恢复，以及设备厂商后台管理是否影响常驻。若厂商系统结束进程，需在软件内重新开启。

Android 官方参考：

- https://developer.android.com/reference/android/provider/Settings#ACTION_MANAGE_OVERLAY_PERMISSION
- https://developer.android.com/develop/background-work/services/fgs/service-types#special-use
- https://docs.expo.dev/config-plugins/plugins/
