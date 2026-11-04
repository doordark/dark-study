# 大肥鱼离线语音

用户只看到“鱼语”开关。聊天与桌宠共用 `speakWhale(text)` / `stopWhaleVoice()`，默认开启并保留已有开关状态。无需 API Key、账号、网络、首次启动下载或服务端。

内置 Kokoro v1.1 中文 INT8 模型，固定中文女声 `zf_001`（上游 speaker ID 3）。替代原来的 Fish S2.1 Pro / Voice ID；Fish 的云端 Voice ID 不是可下载的离线模型。当前音色作为软萌方向的候选，实际幼态、自然程度需真机听感确认，不保证复制 Fish 音色。

自动判断 normal / happy / excited / sleepy / comfort，常规内容默认 normal。Kokoro 不提供 Fish 式情绪标签；这里只对同一说话人的语速做小幅变化，不切换音色、不拉高播放音高。

链路：清理 Markdown、代码、URL、emoji、颜文字和动作 → 判断语气 → 短句缓存 → 本机合成 PCM16 WAV → expo-audio。首段最长 28 字，后段最长 64 字；下一段在上一段播放时准备。启动且鱼语开启时预热模型。无云端等待，但首次模型解包、加载和手机计算仍有耗时；未做延迟测量。

缓存约 100 MiB，键包含模型、Voice ID、文本、语气及 voiceVersion；旧 Fish 缓存失效。停止操作同时取消本机生成、停止播放器、停止系统朗读并使旧 token 失效；旧结果不能恢复播放。模型不在可清理的语音缓存内。

模型文件随源码放在 `assets/voice/models/whale-kokoro-v2/`。`plugins/withWhaleOfflineVoice.js` 在原生构建时把资源目录加入 Android assets / iOS bundle，缺文件时直接报错。新装 App 不需要联网下载。模型来源及许可证见 `assets/voice/README.md`。

新增原生库需要包含它的新安装包；仅刷新 JS、旧 APK 或 Expo Go 无法获得内置引擎。此次按要求不构建 APK、不执行 prebuild、不做真机测试。原生库初始化/合成失败时保留 expo-speech 容错；此时音色及离线能力取决于设备已安装的系统语音，不应作为固定音色验收结果。Web 同样使用系统朗读。

本次仅运行 `npx expo lint`、`npx tsc --noEmit`。保留并迁移旧语音回归脚本的 mock，但不运行它。用户后续在新原生安装包中确认：首次启动断网朗读、软萌听感、长短句衔接、快速切换消息/关开语音、桌宠和聊天音色一致。
