# 大肥鱼轻量化混合语音与全彩蛋音效

## 设计目标

替代历史上 100+ MB 的本地 Kokoro 离线语音包（`zf_001` 成熟播音腔不符合大肥鱼软萌傲娇人设，且安装包过度膨胀）与生硬的系统朗读：

- **零新增原生依赖**：全部基于项目已安装的 `expo-audio`、`expo-file-system`、`expo-secure-store`、`expo-speech`。
- **极小体积**：全套 35 个农场与隐藏彩蛋音效 + 大肥鱼 5 种情绪软萌拟声由 `scripts/build-sfx-assets.py` 合成并通过 `ffmpeg` 压制为单声道 48kbps MP3，总大小约 **183 KB（< 0.2 MB）**。
- **人设贴合**：参考 B 站「蓝色大肥鱼（DeepSeek 鲸鱼娘）」公认的「软萌为底 + 傲娇 + 奶凶」少女音，提供多引擎自由切换，离线或无 Key 时默认柔和回退为软萌鲸鱼拟声，不再默认播放机械系统音。

## 大肥鱼混合语音架构

主聊天（[AssistantScreen.tsx](file:///d:/dark%20study/src/screens/AssistantScreen.tsx)）、桌宠（[WhalePet.tsx](file:///d:/dark%20study/src/components/WhalePet.tsx)）与农场串门大肥鱼（[FarmScreen.tsx](file:///d:/dark%20study/src/screens/FarmScreen.tsx)）共用 `speakWhale(text)` / `stopWhaleVoice()`：

1. **智能混合（`auto`，默认）**：已配置 Key 时优先使用 BreezeBlue「大肥鱼」或硅基流动 `CosyVoice2-0.5B` → 未配置 Key 时在移动端尝试免 Key Edge 少女音（`zh-CN-XiaoyiNeural` / `zh-CN-XiaoshuangNeural`，含 `Sec-MS-GEC` v2 鉴权与高萌语调微调）→ 离线或异常时自动播放内置 5 情绪软萌鲸鱼拟声。
2. **BreezeBlue「大肥鱼」（`breezeblue`，BYOK）**：对接 `POST https://api.breeze.blue/v1/text-to-speech/{voice_id}`（`xi-api-key` 存 `expo-secure-store`），支持在「大肥鱼设置 → 声音音效」一键检索「大肥鱼」机灵/迷糊少女音。
3. **硅基流动 CosyVoice2-0.5B（`siliconflow`，BYOK）**：国内直连 `https://api.siliconflow.cn/v1/audio/speech`，内置 `diana` / `claire` / `bella` / `anna`，亦支持填入 3 秒干声复刻的自定义 `speech:...` URI。
4. **免 Key Edge 少女音（`edge`）**：纯 TypeScript 实现 v2 DRM 鉴权与 SSML 语调微调（Web 端受浏览器 WebSocket 头限制自动降级）。
5. **纯离线软萌拟声（`cute_sfx`）**与显式 **系统朗读（`system`）**。
6. **本地 MP3 LRU 缓存**：上限 50 MiB，按 `(version, provider, voiceId, mood, text)` 缓存，高频问候二次播报 0 延迟、0 流量消耗。

## 彩蛋与农场音效系统

由 [soundEffects.ts](file:///d:/dark%20study/src/services/soundEffects.ts) 与独立开关 [useSoundEffects.ts](file:///d:/dark%20study/src/store/useSoundEffects.ts) 统一管理，支持并发池上限（6 路）、45ms 防抖冷却、切后台自动停音、以及连击/集星动态升调：

- **农场彩蛋**：播种、浇水、打水、施肥、单株/批量收获、买卖金币、做菜/鱼汤、升级与每日领奖、进出小屋/切房/盖被子睡觉、摸坤坤与鸡窝、篝火聚会、随机奇遇、伴读钟、池塘垂钓（甩竿/咬钩/上鱼/漂流瓶/脱钩）、抓虫连击升调、**夜间「恐怖徐睡阴」降临与成功劝退**。
- **全应用隐藏彩蛋**：课表 7 次秘密充能升调、隐藏夜空收集 7 颗星升调 / 星座解锁 / 猫头鹰呼唤与带路、「放学后」三大彩蛋（星光列车 / 云朵咖啡搅拌 / 请假条盖章）、失重 `ZERO-G`、大肥鱼水花召唤/潜回退场与桌宠摸头/狂戳炸毛/吃团子/跳舞转圈。

## 回归检查

- `node scripts/check-whale-voice.cjs`
- `node scripts/check-sound-effects.cjs`
- `npx tsc --noEmit` & `npx expo lint`
