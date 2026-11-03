# Dark Study Farm V3 交付记录

## 第二阶段：居民生活与玩家命令

入口仍是农场底部「居民生活」和点击人物后的「我的聊天」。本阶段没有重新生成地图，没有修改声音客户端、依赖或原生目录，未 commit/push。

### 中央状态与移动

`useFarmResidents` 持有一个 `FarmResidentEngine`，统一维护六位居民的 logicalPosition、currentWaypoint、targetWaypoint、state、task、conversationPartner、lastInteractionAt、lastConversationAt，以及不可变的动画路线描述。

状态包括 idle、wandering、walking、talking、working、going_home。`FarmResident` 只负责显示、朝向和 Reanimated 动画，不再持有散步定时器或自行挑选聊天对象。

居民通过既有 `farmMap.WAYPOINTS` 的双向邻接表进行 BFS；起点/终点与路网之间用可见性检查连接，必要时使用第一阶段的小型 blocker 可见图绕行。顾偏好田边、池塘、小屋、广场；door 偏好家、田边、长椅；坤坤偏好鸡窝和田边；孩子偏好广场、池边及田地。距离影响权重，夜间增加回家/回窝权重，并由夜间活跃度减少活动。

### 自然偶遇

逻辑每 500ms 更新六位居民，每 2 秒检查一次邻近关系。只有距离小于 22 个逻辑单位、视线不穿越 blocker、双方无任务/对话锁、个人及 pair 冷却到期、概率通过时，才就地停下聊天。不会把两人传唤到固定广场坐标。

开始交流即锁定双方；第三人不能抢占。同一人不能参加两段交流。对话按 2～6 轮、每轮双方各一句播放，结束、被命令打断、切后台或面板暂停时释放锁。AI 等待超过 15 秒会恢复本地对白，任务另有 90 秒前台超时，不会无限等待。

### 模式与设置

提供安静农场、日常生活、热闹村庄、AI 小镇四种预设，默认日常生活。日常生活默认关闭自动联网；配置 Key 后可主动打开，或选择 AI 小镇。个人主动聊天与自动居民对话额度明确区分。

高级设置采用数字输入和加减 stepper：走动间隔 4～60 秒、偶遇概率 0～100%、聊天冷却 20～600 秒、轮数 2～6、AI 比例 0～100%、AI 冷却 1～60 分钟、每日 AI 上限 0～50、夜间活跃度 0～100%。所有入口 normalize；手动修改后标为 custom。原 roaming/chatter/online/aiMinutes/dailyLimit 保留，旧 interval 迁移为聊天冷却。

### 记录模型与面板

`ResidentConversation` 包含 id、participants、startedAt、endedAt、source、online、lines；每句含 speaker、text、at。source 为 encounter、scheduled/local 或 player_command。

保留最近 40 段交流；旧单句日志按相邻时间与实际出现的角色安全分组，无法确定的聊天对象不会凭空补出，坏数据不会崩溃。面板每段一张卡，显示双方姓名、时间、开始来源、本地/AI，发言按人物颜色区分。支持全部/偶遇/AI/我的命令以及人物筛选，先显示 20 段，可继续展开到 40 段。

### NPC Action schema 与游戏校验

个人对话返回严格 JSON：

```json
{"reply":"好呀，我去池边。","action":{"type":"fetch_water"}}
```

普通聊天为 `action: null`；`none` 也会归一为空动作。支持：

| 动作 | 行为 |
| --- | --- |
| fetch_water | 到池边，工作片刻，再由游戏层将水壶补到容量；已满时不增加 |
| water_crops | 到田边，消耗当前水壶中真实剩余次数，调用与玩家相同的 `waterFarmPlots`；无水时明确反馈 |
| talk_to + ResidentId | 校验目标、锁定双方，请求者走到目标附近；目标有高优先级任务时明确失败，完成后写入 player_command 记录 |
| visit + FarmLocation | 前往 pond/farm/plaza/house/coop/bench/market，停留后恢复生活 |
| rest | 原地休息后恢复生活 |
| go_home | 返回房门；坤坤返回鸡窝 |

拒绝未知动作、未知人物、未知地点和额外字段。JSON 解析失败只退回聊天，不执行动作。未配置 Key 时，明确的本地命令也能执行；否定、普通知识提问不会当作命令。

例如可以输入「顾，帮我打一壶水」「小八帮我把地浇一下」「小八去找玉洁聊聊天」「唯纲去池塘玩会」「回家休息吧」。命令优先于自主散步和偶遇；完成或取消后才恢复。打水、浇水在到达后由游戏层结算，存在任务 id 和幂等保护，共用水资源；模型拿不到任意修改金币、种子、库存、奖励、等级的接口。没有加入可直接结算经济奖励的 harvest_ready。

### AI 请求与生命周期

农场使用独立 `farmChat` 适配器，复用应用当前模型名和 JSON 协议，但不改动通用 DeepSeek/声音接口。自动对话按 AI 比例抽样，按现实日期计每日额度，保存额度预留成功后才发起唯一一次 HTTP 请求；失败、取消也占额度，没有自动重试。无 Key、关联网、额度耗尽、冷却未满、解析失败或网络失败均使用本地对白。

本地对白覆盖 15 对人物，每对 6 组主题，共 90 组双句场景，支持组合成 2～6 轮，农场不联网也能生活。自动请求只携带固定人物设定和本轮背景，不上传玩家的个人聊天历史。

AppState background/inactive、离开农场或商店/手账/抓虫/小屋/居民面板打开时，停止逻辑 interval、冻结路线、结束当前交流、Abort 自动请求。恢复后重新从当前位置/任务进度开始，不模拟离线几十分钟的聊天。个人聊天打开时暂停自主活动，明确发出的帮忙任务可以继续；关闭个人聊天会取消尚未返回的个人 AI 请求。reduced motion 关闭自动走动和呼吸/步行动画，明确命令仍由游戏逻辑完成。

### 文件

- 新增 `src/hooks/useFarmResidents.ts`：中央控制器、设置/额度/记录持久化、请求取消、生命周期。
- 新增 `src/utils/farmResidentAI.ts`：状态机、偏好、偶遇、任务、锁、超时。
- 新增 `src/utils/farmActions.ts`：白名单、严格 JSON 校验、本地显式指令。
- 新增 `src/utils/farmWatering.ts`：玩家和 NPC 共享的合法浇水与生长计算。
- 新增 `src/services/farmChat.ts`：单次、限长、可取消的农场 JSON 请求。
- 修改 `FarmScreen.tsx`、`FarmLifeLayer.tsx`、`FarmResident.tsx`、`farmLife.ts`：接入中央系统、个人结构化聊天和记录设置面板。
- 扩展 `farmNavigation.ts` 的 BFS 接路，移除不再使用的固定会面点；未改变地图贴图。
- 新增 `scripts/check-farm-residents.cjs`、`scripts/check-farm-chat.cjs`；更新旧 life 测试的设置迁移预期。

### 验证与边界

已通过中央逻辑测试、请求 mock 测试、旧 life/map/economy/progress/time 回归、`npx expo lint`、`npx tsc --noEmit`，以及 Android Hermes 导出检查。测试没有发送真实付费请求。

逻辑测试覆盖四种预设、自定义及旧设置迁移、旧日志迁移、散步/聊天/联网关闭、无 Key 和额度/冷却、三人抢占、玩家命令优先级、六类动作、忙目标、重复结算、用水守恒、AI 超时、本地回退、暂停及长时间后台恢复、reduced activity 和记录上限。

按照用户最新要求，第二阶段停止浏览器验收。没有连接的 Android 真机，未实测最终 UI 手感、云端回复质量或真机 FPS。个人聊天继续按 NPC 分开，保留当前会话最近 40 条；本阶段没有新增其跨重启持久化。居民位置/在途任务不做离线存档模拟，重新进场从配置的起点恢复生活。

## 第一阶段：地图与小屋（本次第二阶段沿用）

旧版左侧约 25 单位宽、从房门延伸到底部的贯穿直道已经取消。改为约 3～6 单位宽的短分叉路径：小屋院子、中央 4×4 田地、下方小广场、右下池塘错位组织；小铺和鸡窝分别在田地侧下方及右侧。

生活细节包括长椅、木桶、木柴棚、晾衣绳、农具架、稻草、菜篮、鸟屋、路灯、蘑菇、石块、花草、池边芦苇和莲叶。背景合并地表静物；房屋、鸡窝、小铺、池塘、长椅和大树是独立透明图层，用脚点深度遮挡人物。

所有场景尺寸、田块、设施、点击区域、blocker、居民起点和 waypoint 集中在 `src/constants/farmMap.ts`。houseDoor → housePath → farmLeft/market → farmBottom → plaza 是主骨架，田地北/东侧支路接 coop，广场再接 pondBench/pond/pondWest/pondSouth/gate。farmCenter 是田地下方工作边缘，居民不会走进四块田中央。

素材为本项目生成的像素画。参考源、生产素材和重建说明见 `assets/farm-v3/README.md`；昼夜通过同一几何的确定性调色生成，未分别随机生成地图。小屋改为两张 720×540 的日/夜像素房间图，家具全部属于画面，仅床铺保留原生可访问点击区域。

图层解码内存的静态估算：新外景约 5.80 MiB，对比旧版两张大背景约 12.00 MiB；不包含人物动画等其他资源，不代表真机总内存或 FPS。decorReady/folkReady/texReady 与 700ms 昼夜交叉淡化保留，人物层延后实际挂载，静态装饰不再分成大量 SVG 节点。

第一阶段通过 IAB 检查过真实项目夜景、打水/种植/浇水、地图小铺、房子点击和睡觉；393×852、360×780、412×915、600×1024 未见水平溢出，短屏 320×640 在隔离副本校准；白天/夜晚参考与同几何图层进行了图片对照。修复了设施/室内图片使用原图尺寸溢出的跨端问题。早期隔离副本用于避开并行任务尚未落盘的人物素材，已删除，原项目声音和动画改动未被覆盖。

视觉对照记录：四区构图一致；旧贯穿道路取消、田地支路为确定性校准；日夜色板变化不移动设施；透明设施与田块命中区域一致；小屋家具像素语言统一；短屏采用等比缩放和安静侧边留白，保留底部三个经营入口。HUD 沿用原有文案，仅做窄屏换行；无新增营销式 UI。

## git 差异快照

下面的农场相关 tracked diff 包含第一、二阶段累计修改；新增文件还未跟踪，不计入该统计。人物精灵文件同时包含并行人物动画任务的修改。其他声音、夜空和大肥鱼文件保持用户工作区原样，未 reset/restore/clean，未提交或推送。

```text
 scripts/check-farm-life.cjs              |   3 +-
 src/components/farm/FarmLifeLayer.tsx    | 402 ++++++++++++++----------
 src/components/farm/FarmPersonSprite.tsx |  64 +++-
 src/components/farm/FarmResident.tsx     | 184 +++++++----
 src/components/farm/FarmWater.tsx        |  51 +--
 src/components/farm/HouseInterior.tsx    | 521 +++----------------------------
 src/screens/FarmScreen.tsx               | 429 ++++++++++---------------
 src/utils/farmLife.ts                    | 323 ++++++++++++++++---
 8 files changed, 920 insertions(+), 1057 deletions(-)
```
