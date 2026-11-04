# 大肥鱼语音

主聊天和桌宠共用 speakWhale / stopWhaleVoice。清理文本并自动判断 normal、happy、excited、sleepy、comfort 后，优先使用本地缓存；未命中时调用 Fish Audio S2.1 Pro，失败回退系统语音。统一播放器支持中断，进入后台停止。

固定 Voice ID：627dbb2dd0944f46bbd354270ac4d847。声音实际效果和语气需要用户试听确认。

在项目根目录的 .env.local 设置 EXPO_PUBLIC_FISH_API_KEY=你的Key，重启 Expo 后完整重新加载。该文件已被 .gitignore 忽略；Expo 会把 EXPO_PUBLIC_ 值嵌入应用包，获得应用包的人可能提取 Key。公开分发前需要服务端保护密钥。没有 Key 时缓存未命中会使用系统语音。S2.1 Pro 的账户权限和费用以 Fish 当前规则为准。

用户界面只有鱼语开关。缓存位于系统缓存目录 whale-tts，约 100 MiB 上限，键包含模型、Voice ID、文本、情绪与版本。更改音色或生成策略时递增 VOICE_PROFILE_VERSION。
