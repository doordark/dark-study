# 连续 sprite 动画升级验收

2026-11-03，项目 `D:\dark study`。在当前未提交工作上追加修改，没有 reset、checkout 或丢弃改动。农场的路径、坐标、碰撞与规则由并行任务维护，本任务只给最新的移动共享值追加动画接线。

## 本任务修改文件

- `src/components/AnimatedAtlas.tsx`：UI-thread 统一播放器，支持 frames、frameDuration/fps、可选 holds、loop/active、单次完成停止、后台暂停、减少动态效果。按数组内容判定序列变化，稳定回调引用；恢复时保留相位，不追赶后台时间。缺失、超长、非正或非法 holds 有逐项兜底。
- `src/utils/atlasTimeline.ts`：计时与帧选择 helper。
- `src/hooks/useAnimationActive.ts`：AppState 生命周期开关，不是逐帧时钟。
- `src/components/farm/FarmPersonSprite.tsx`：7 个角色共 140 个真实生成姿势，按实际位移调整步频，UI-thread bob/轻微倾斜，110ms 起停淡化。停下后冻结步态并淡出，不额外多走一轮。
- `src/components/farm/FarmResident.tsx`、`src/screens/FarmScreen.tsx`：仅追加 positionX/positionY、玩家名义步速与 active 参数。保留其他任务的新寻路实现。
- `src/components/PetAnimation.tsx`：新 atlas 和动作节奏；一次性动作完成后停在末帧；睡眠先播放入睡，再只循环闭眼呼吸。
- `src/components/WhalePet.tsx`：只增加动画生命周期接入、减少动态效果的 bob 限制；原拖拽、抛掷、重力、反弹、翻转及落地压缩公式保留，物理 callback 后台停用。
- `src/components/WhaleSummonFX.tsx`：召唤/离开沿用原场景时钟，复用新 wave/spin，移除旧大图引用。
- `src/components/NightSky.tsx`：保留并行任务的 v2 美术；星光、流星、halo、burst、owl 继续使用 Reanimated，新增后台/减少动态效果的停止与清理。猫头鹰保留原来的两张图，未扩充低优先级位图。
- 删除 `src/components/PetIdleAnimation.tsx`：搜索确认没有实际引用，idle 统一由 PetAnimation + AnimatedAtlas 播放。
- `assets/visual-updates.md`：修正旧播放器说明，保留已有其他说明。
- `scripts/pack-animation-atlases.py`、`scripts/check-animation-atlases.cjs`：可复现打包和回归检查。
- `assets/animation-sources/`：7 张原始生成图、`atlas-metrics.json`、`prompts.md`。原有 atlas 保留但运行时不再引用。

## 帧数与节奏

下面 FPS 是配置的 sprite 播放速率，不是实测设备刷新率。含停顿动作同时列出循环平均值；不能把低频 idle 的平均 FPS 等同于移动卡顿。

| 动作 | 原播放帧数 | 新素材帧数 | 原平均 sprite FPS | 新 sprite FPS |
|---|---:|---:|---:|---|
| Farm idle，每个角色 | 1 | 6 | 0 | 整轮 1.94；眨眼 11.1–12.5 |
| Farm walk，每个角色 | 2 | 8 | 7.14 | 名义 12.5，按真实位移调速；零位移不踏步 |
| Farm talk，每个角色 | 2 | 6 | 2 | 9.09 |
| Pet idle | 8 | 12 | 2.69 | 整轮 3.25；眨眼 11.1–14.3 |
| Pet happy/jump | 4 | 8 | 4.17 | 14.29，单次 |
| Pet wave | 4 个播放位，3 个不同姿势 | 8 | 6.25 | 14.29，单次 |
| Pet eat | 4 | 8 | 2.16 | 14.29，单次 |
| Pet study | 4 | 8 | 1.14 | 手部/翻页 9.09；含阅读停顿整轮 3.88 |
| Pet sleep | 4 | 8 | 0.73 | 入睡 6.25–9.09；稳定闭眼呼吸 4 姿势、2 FPS，叠加连续 bob |
| Pet dance | 8 | 16 | 7.14 | 15.38 |
| Pet spin | 8 | 16 | 7.14 | 15.38 |

睡眠入场停顿和闭眼呼吸刻意较慢；没有把慢呼吸伪装为 14 FPS。转身角度来自生成的连续朝向，并非几何精确的 22.5 度采样。所有新帧均来自 imagegen，以现有角色为参考，没有复制位图凑帧。像素哈希能排除逐字节重复，但不代替对动作解剖和连贯性的美术审核。

## 新运行时 atlas

全部为真透明 RGBA PNG；Farm 单格 128×160，Pet 单格 192×256；最大边 1536，不超过 2048。大小与内存的精确数值见 `assets/animation-sources/atlas-metrics.json`。

| 文件（assets 下） | 像素尺寸 | 文件 KiB | 估算 RGBA MiB |
|---|---|---:|---:|
| images/farm-people-walk-v2.png | 1024×1120 | 1189.4 | 4.375 |
| images/farm-people-idle-v2.png | 768×1120 | 898.9 | 3.281 |
| images/farm-people-talk-v2.png | 768×1120 | 996.5 | 3.281 |
| whale/pet-idle-v2.png | 768×768 | 826.9 | 2.250 |
| whale/pet-dance-v2.png | 768×1024 | 1065.5 | 3.000 |
| whale/pet-spin-v2.png | 768×1024 | 999.5 | 3.000 |
| whale/pet-actions-v2.png | 1536×1280 | 2597.7 | 7.500 |

公式 width × height × 4；不包括 GPU 副本、缓存、mipmap、原生视图及运行环境开销。桌宠四张运行图合计 15.75 MiB，对比旧四张 30 MiB。Farm 三张合计 10.9375 MiB，对比旧一张 8.75 MiB；每人姿势数由 4 增到 20。两类合计 26.6875 MiB，对比 38.75 MiB，减少约 31%。原始生成图未被运行时代码 require，不计运行解码内存。

## 验证

- `node scripts/check-animation-atlases.cjs`：通过。真实播放器 worklet/effect 的轻量 hook host 覆盖普通重渲染、回调引用稳定、active/AppState 暂停恢复、减少动态效果、单次停止、睡眠入场、异常时长及数组长度。模拟 60Hz 运行 10 分钟无累计相位漂移；224 个格子的真透明边缘、尺寸上限和非重复哈希全部通过。这是确定性模拟，不是手机性能采样。
- 浏览器使用独立 Playwright 测试工具缓存，没有修改 package.json/lock。Browser 插件技能未在会话工具中提供，因此使用 regular Playwright + 本机 Chrome headless。
- 实际页面 `/farm`：393×852 手机、1280×900 桌面；内容非空、没有框架错误遮罩；点击第 1 块田地，玩家走向目标，截取移动前后画面；console/pageerror 均无应用错误。
- 实际页面 `/assistant`：本地口令“召唤大肥鱼”→“桌宠”→三连点桌宠打开面板→“跳舞”。召唤和舞蹈图正常显示；170ms 两次采样中 atlas 从 `matrix(1,0,0,1,0,0)` 切到 `matrix(1,0,0,1,-168,0)`，确认真实换帧。没有调用 AI API；没有向其他人发送消息。
- 手机截图已目视检查，人物无背景矩形、无单格裁切。桌面截图已生成。像素与脚底留白由打包检查进一步验证。
- `check-farm-economy`、`check-farm-life`、`check-farm-map`、`check-farm-progress`、`check-farm-time`、`check-whale-memory`、`check-whale-voice` 在运行时通过。
- `check-life-chat-client` 失败：并行服务代码返回 `AbortError: 请求已取消`，现有断言期待 `/请求超时/`。`check-sky-network` 失败：并行服务代码返回 `DeepSeekError: AI 服务暂时繁忙，请稍后再试`，旧断言期待 `/503/`。未修改这些服务或断言。
- 最终 lint 通过；Web export 通过，产物 `output/animation-web`，日志 `output/animation-export.log`。动画回归检查通过。
- 全项目 TypeScript 最终未通过：并行任务仍更新 farmLife 接口，`FarmLifeLayer.tsx` 的 `LifeLine`/`interval` 引用与新接口不匹配，`farmLife.ts` 出现 tuple spread 类型错误，新文件 `farmResidentAI.ts` 出现联合类型 target 索引错误。本任务早先全项目 TypeScript 通过，最终不能沿用旧结果。详细错误保存在 `output/animation-typecheck.log`；没有修改这些并行接口来掩盖错误。
- 开发服务器的 React Native DevTools 下载遇到沙箱路径拒绝访问，CLI 自动回退；不影响上述浏览器交互。Web export 曾因创建 `_expo` 目录失败，预创建输出目录后导出成功。

## Android 待确认

adb 可用，但 `adb devices -l` 没有连接设备，未启动新的模拟器，也未生成/改写 android 原生工程。仍需 Android 真机确认：实际显示大小的清晰度、60Hz/高刷 transform 与物理帧率、低内存设备的解码/缓存峰值、连续行走时步幅观感、拖拽/高速抛掷/反弹/落地压缩/翻转、后台恢复、系统减少动态效果。不能把 Web 交互或模拟计时结果当成 Android 60 FPS 性能验收。

## Diff 范围

`output/animation-diff-stat.txt` 是交付时整个共享工作区的 `git diff --stat`，含原有及并行任务改动；不是本任务独占统计，且 git 默认不包括尚未跟踪的新 PNG、脚本和文档。请结合上面的本任务文件清单和 `git status --short` 查看。
