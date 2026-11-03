# 大肥鱼自然鱼语

实现日期：2026-11-03。代码接入已完成；没有真实 Fish 凭证或可用 Android 调试设备，本次不宣称完成音质验收与 Android 真机回归。

## 架构与边界

旧版统一入口 `speakWhale(text)` 调用 expo-speech，再由 Android/iOS 系统 TTS 发声。清理文本、调音高、分句能改善节奏，但无法改变系统引擎的声线与朗读感。

现在主聊天、桌宠和设置试听共用一个通道：

```text
AssistantScreen ─┐
WhalePet ────────┼─ speakWhale(text, options?)
声音试听 ───────┘       │
                清理文本 → 判断 mood → generation token
                       │
             本地 MP3 cache 命中 → expo-audio
                       │ miss
                Fish REST → bytes → File cache → expo-audio
                       │ 请求、写盘或播放失败
                expo-speech 原有分句与音色策略
                       │ 不可用
                      静音
```

调用层没有 Fish 请求、播放器、文件或 AbortController。桌宠 1800 ms throttle 保持不变。不修改农场、动画、记忆、人设 prompt、DeepSeek 或课表。

## 文件职责

- `src/services/whaleVoice.ts`：统一编排、token、取消、缓存优先、降级、开发计时。
- `fishAudio.ts`：REST、受控情绪标签、12 秒超时、HTTP/MP3 校验、安全错误信息。
- `whaleAudioPlayer.ts`：全局唯一播放器；结束、停止、出错时 remove；5 秒加载保护和 120 秒播放保护。
- `whaleSystemVoice.ts`：保留旧中文 Enhanced 音色选择、pitch/rate 差分、180 字分句、420 ms 句间停顿。
- `whaleVoiceText.ts`：保留并提取 toSpeakable、detectMood、分句；增加 URL 清理；Fish 最多约 220 字，优先完整标点边界，一次请求整段。
- `whaleVoiceCacheKey.ts`：缓存身份与轻量双 32 位 hash。
- `whaleVoiceCache.ts`：手机文件缓存、索引修复、LRU。
- `whaleVoiceCache.web.ts`：Web 临时 Blob URL，播放完成或取消后撤销，不持久缓存。
- `whaleVoiceCredentials.ts`：Fish Key 安全存取。
- `src/store/useWhaleVoice.ts`：原全局开关、引擎选择与 referenceId；不含 Key。
- `src/components/WhaleVoiceSettings.tsx`：声音设置与试听。
- `scripts/check-whale-voice.cjs`：不联网、不用真实 Key 的服务回归。

## Fish 接口与模型

2026-11-03 查询官方页面确认：

- 开发者入口：https://fish.audio/developers/
- REST：https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
- 情绪：https://docs.fish.audio/developer-guide/core-features/emotions
- SDK 58 Audio：https://docs.expo.dev/versions/v58.0.0/sdk/audio/
- SDK 58 FileSystem：https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/
- SDK 58 SecureStore：https://docs.expo.dev/versions/v58.0.0/sdk/securestore/

请求 `POST https://api.fish.audio/v1/tts`，JSON，Bearer Key，`model: s2.1-pro-free` header；body 使用 `text`、`reference_id`、`format: mp3` 和 `prosody.speed`。

模型常量为 `s2.1-pro-free`，`voiceProfileVersion = 1`。本项目没有默认 Voice ID，也没有伪造 Voice ID。免费模型是否对具体账户开放，以该账户实时权限为准。如果将来官方取消免费模型，在确认文档与费用后修改 `FISH_MODEL` 为正式模型；不会因一次 429/5xx 自动切换到付费模型。

首次没有完整配置时自动使用系统语音；完整配置后默认自然鱼语。显式选择系统语音后会保留该选择。缓存优先路径可以在没有网络/Key 时复用已生成的本地音频。

## Key 与个人数据

Android/iOS：SecureStore，`WHEN_UNLOCKED_THIS_DEVICE_ONLY`。不把 Fish Key 放 AsyncStorage、源码、app.json、日志或 Git。设置不回显已存 Key，只显示是否存在。删除 Key 不删除已缓存声音；清理语音缓存可单独完成。

Web：没有等价的 OS SecureStore，Key 只在当前 JavaScript 会话内存中保留，刷新后失效。UI 明确说明。Web 系统语音兼容保留；Fish 可用性还受浏览器自动播放与 Fish CORS 策略影响，未实测。

朗读文本会发送给 Fish 服务，设置页明确说明 BYOK 与额度使用。音频和缓存身份包含用户台词，存于应用私有缓存目录；清缓存会一起移除。不重构 DeepSeek Key。

## 配置与原创音色

进入「大肥鱼 · 人设与记忆 → 声音」：

1. 输入自己的 Fish API Key，点「保存 Key」。不要把真实 Key 发到聊天或写入项目。
2. 在 Fish 创建原创成年角色 Voice Design，复制生成的 Voice ID。
3. 输入 Voice ID，点「保存 Voice ID」。
4. 选择「自然鱼语」，打开「鱼语」，点击「试听大肥鱼」。
5. 依次试听普通、开心、兴奋、困困、安慰和当前称呼。

没有可访问的用户 Fish 账户，本次没有创建或挑选真实音色；音色自然度仍需试听确认。

原创 Voice Design 建议描述：

> 20～24 岁成年年轻女性，普通话自然。声音清亮、柔软、软糯、微甜，有很轻微的气声与自然笑意，像关系很熟的人靠近手机轻声聊天。音高略高于普通年轻女声，但绝对不尖锐、不幼儿化、不夹嗓。语速偏轻快，短句有自然呼吸和停顿，句尾偶尔自然上扬。有一点慵懒、调皮、黏人、小得意，但不要刻意撒娇。避免播音腔、客服腔、导航腔、主播营业腔和夸张动漫配音。长期听也应自然舒服。

不克隆现实人物。不使用幼女、萝莉、极高 pitch、过度夹嗓的方向。优先自然度、耐听、角色一致性，再看可爱程度。

重新设计声音后，替换 Voice ID 即可。相同 ID 的底层声音或内部 direction 策略发生改变时，递增 `VOICE_PROFILE_VERSION`；新 ID 本来就有独立缓存。

## 情绪与控制隔离

沿用五种 Mood，完全不把人设滑条映射成语音参数。清理 LLM 文本后才检测情绪；方括号 cue、括号动作、emoji、Markdown、代码、URL 被清理，LLM 无法直接提供 Fish 控制标签。

| Mood | 应用固定 cue | speed |
| --- | --- | --- |
| tender | `[relaxed][soft tone]` | 1 |
| happy | `[happy]` | 1 |
| excited | `[excited]` | 1 |
| sleepy | `[calm][soft tone]` | 0.9 |
| sad | `[empathetic][soft tone]` | 0.95 |

标签和 prosody 字段来自官方文档；具体音色上的可爱程度、困倦区别和长期耐听尚未真人试听。若调整映射，递增 profile version，避免混用旧声音。

## 缓存

手机目录：`new Directory(Paths.cache, "whale-tts")`，不是 Documents。MP3 响应为 Uint8Array，`File.write(bytes)`，临时文件写完再移动为最终 MP3；没有 Base64、没有 AsyncStorage 音频。

identity 为 JSON 数组：`[voiceProfileVersion, model, referenceId, mood, cleanText]`。两个 32 位累积器生成 16 位十六进制 hash，索引还会比对完整 identity，碰撞不能误读另一条台词。API Key 不参与 identity。

`index.json` 记录 key、identity、file、size、lastAccess。cache hit 校验文件存在与长度；访问更新 lastAccess。索引字段校验、文件名白名单限制在本目录；损坏索引清理重建。串行队列避免多个异步写入丢失索引，启动清理中断写入和孤立音频。

约 100 MiB 音频上限，写入后按 lastAccess 淘汰旧条目。播放只保留当前所需数据，不把所有 MP3 常驻 JS 内存。缓存目录可被系统回收；丢失时正常重新生成。缓存写入/播放故障走系统语音。

自定义称呼直接进入 cleanText，因此「大爹，我在呢」与「阿顾，我在呢」有不同身份，不会读到旧称呼。没有打包任何固定台词 MP3。

## Stop、取消与前后台

每次 speak 先 stop；stop 自增 token、abort 当前生成请求、停止/移除播放器、清理系统分句定时器并停止 expo-speech。新发声等待 native 系统 stop 完成；每次异步凭证读取、缓存、生成和播放后复核 token。旧请求即使忽略 abort 而返回，也不会播放。

播放器取消等待 audio session 初始化后也会检查 signal。每个片段使用独立 native 实例，避免旧源的状态事件污染新源；完成/停止/错误只移除所属实例。SDK 58 使用 `remove()` 释放播放器资源。

RootLayout 监听 AppState，inactive/background 立即 stop，回前台不恢复；关闭开关、修改引擎、Voice ID 也会 stop。Assistant 发送前、失去页面焦点与卸载时停止，隐藏页面收到的回复不发声；桌宠收回停止保持。声音 tab 卸载停止试听。

Audio session：duckOthers、shouldPlayInBackground=false、allowsRecording=false、keepAudioSessionActive=false。音频插件关闭后台播放与录音；显式 blockedPermissions 排除 RECORD_AUDIO；不启用锁屏控制、不注册媒体前台服务。Android 上其他音乐的 duck/recover 行为仍须真机确认。

## 错误与试听

401/403/404/429/5xx、402 额度不足、400/422 参数或 Voice ID、断网、12 秒超时、空音频、非音频 MIME、非法 MP3 头、播放器加载/解码错误均回退系统。常规调用不弹 Toast；开发日志只输出固定错误与阶段计时，不打印 Key、服务端原始错误体或台词。

试听绕过缓存验证当前 Key 和 Voice ID，所以错误 Key 不会被旧缓存掩盖。试听仍通过统一入口，Fish 失败后播放系统语音，并在页面显示安全错误信息。普通调用使用缓存优先。

系统 fallback 仍按句播放，保留原 prosody 和音色选择。系统引擎也不可用时安静失败，不影响聊天、AI 回复或其他页面。`VoiceResult.engine=system` 表示已尝试调度系统语音，并不证明设备扬声器实际发声。

## 检查与验收

执行：

```sh
node scripts/check-whale-voice.cjs
npx expo lint
npx tsc --noEmit
npx expo-doctor
npx expo export --platform web --output-dir output/whale-voice-web
```

本轮结果：lint 通过（无 warning/error），TypeScript 通过，Expo Doctor 20/20，Web 生产导出通过，git diff --check 通过。Doctor 仍输出原有 userInterfaceStyle 建议，未为此修改外观配置。Android/iOS 原生运行和设置页视觉检查未实测。

服务 mock 通过：HTTP 字段、错误状态、断网、超时、无效响应、cache miss/hit、100 MiB LRU、索引损坏、自定义称呼、Key 与缓存隔离、预览错误 Key、stop race、静音、前后台守卫、cue 清理、播放器停止/结束/错误释放。Mock 不等于真实平台验证。

真机清单（本次全部待实测）：

| 项目 | 验收动作与期望 |
| --- | --- |
| Fish 首次 | 正确 Key + 原创 Voice ID：返回 MP3、落盘、自然声音 |
| cache hit | 相同台词/mood/Voice ID 再触发，不请求 Fish |
| 称呼 | 大爹改阿顾；当前称呼试听和实际聊天与文字一致 |
| 主聊天 | 召唤、自动发声、发下一条打断、离开停止 |
| 桌宠 | 单击/连点/摸头/喂饭/吃团子/跳舞/转圈/学习/睡觉/AI 动态回复/收回，无重叠 |
| 慢网竞态 | A 生成中发送 B，A 最后返回也不能响 |
| wrong key | 试听显示验证失败，普通对话自动系统 fallback |
| wrong Voice ID | 试听明确错误，普通对话 fallback |
| 断网 | 本地缓存照播，miss 失败后系统 fallback |
| background | 生成或播放中切后台、锁屏、inactive 均停止，返回不续播 |
| 音乐 | 其他 App 音乐 duck 后正常恢复，无锁屏控制/常驻媒体通知 |
| 自然度 | 七条选声样本 + 长句，无导航/客服/夹嗓感，五种情绪仍像同一角色 |

选声样本：摸头可以，摸肚子不行！ / 今天也一起加油吧，我陪着你。 / 团子我可不客气啦！ / 嗯……已经很晚了，你也别熬太久。 / 再戳？再戳我真的要游走了。 / 嘿嘿，能出来陪你真好。 / 今天课还挺多的，先把最麻烦的那一门解决掉吧，剩下的慢慢来就好。

## Android 实测数据

| 数据 | 本轮结果 |
| --- | --- |
| 设备/系统/网络/Voice ID | 无可用调试设备，无真实 Fish 配置 |
| Fish 首次 TTFA | 未实测 |
| cache hit TTFA（目标 <150 ms） | 未实测 |
| 典型 MP3 大小 | 未实测 |
| 当前设备 cache 大小 | 未实测；页面会读取真实目录大小 |
| duckOthers 与恢复 | 未实测 |

开发日志 `[WhaleVoice]` 记录 request start、response received（字节数）、file cached（字节数）、playback started/cache playback started 相对于 speak 调用的毫秒数。首次收到 playing 状态作为发声近似时刻；50 ms 状态轮询有误差，严格 TTFA 需录屏/录音同步测量，不能用 mock 执行时间代替。

新增依赖 expo-audio、expo-secure-store；Doctor 要求补齐 expo-asset（Audio peer）与 expo-linking（原有 Router peer）。需要包含新 native modules 的开发构建才能在既有自定义客户端中运行；本任务不自动构建或发布 APK，不 commit、不 push。
