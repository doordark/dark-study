# 大肥鱼：四层认知记忆与动态人格系统

入口：设置 → 大肥鱼 · 人设与记忆；鲸鱼人格对话页右上角快捷入口。

## 架构升级（借鉴 Mem0 / Letta / Generative Agents / PersonaUI / PAD 模型）

1. **四层认知记忆（[whaleMemory.ts](file:///d:/dark%20study/src/utils/whaleMemory.ts)、[useWhaleMemory.ts](file:///d:/dark%20study/src/store/useWhaleMemory.ts)）**
   - **L1 工作记忆与实时生活上下文**：最近 24 条消息（10000 字符预算）+ 跨入口即时接续 + 自动注入当前星期/时段、距上次互动间隔、今日课表与近期下节课提醒。
   - **L2 核心语义事实（上限 100 条）**：支持 6 大分类（身份称呼 / 偏好喜好 / 目标学习 / 关系约定 / 习惯作息 / 交流边界）、重要度、访问强化与 Mem0 风格 `upsert / delete` + 词项语义重叠去重；满额时仅淘汰最久未用的低权重自动事实，**绝不覆盖或淘汰手动记忆**，严格保留原话证据校验与敏感凭证拦截。
   - **L3 情景回忆（50 条）与未来牵挂（20 条）**：自动记录有情绪起伏的重要事件，并追踪用户提到的考试、DDL、出行与约定（解析相对时间线索如“明天/周五/12月1日”），到期前后自动置顶注入上下文，让大肥鱼自然主动关心进展。
   - **L4 反思洞察与默契手账（24 条，[whaleReflection.ts](file:///d:/dark%20study/src/services/whaleReflection.ts)）**：每累计 14 轮对话（可开关）或手动点击「立即帮她整理一次回忆」时，异步执行一次记忆反思，提炼相处洞察、共同默契与里程碑，并安全归并重复自动事实或完结已结束的牵挂（严格受 `epoch / revision` 竞态保护）。
   - **三维综合检索评分**：引入中文停用词过滤，综合 **Relevance（词项相关度）+ Recency（30 天指数衰减）+ Importance & 访问强化** 排序召回。

2. **动态 PAD 情绪状态机 + 羁绊成长 + 隐藏内心独白（[whaleEmotion.ts](file:///d:/dark%20study/src/utils/whaleEmotion.ts)、[ai.ts](file:///d:/dark%20study/src/services/ai.ts)）**
   - 连续跟踪愉悦（Pleasure）、活跃（Arousal）、傲娇掌控（Dominance）三维情绪，按约 3.5 小时半衰期平滑衰减回人设滑条基线；摸头、喂饭、撞边与对话内容均自然驱动心境变化。
   - 结合陪伴天数、对话轮数、互动次数与好感形成 5 阶羁绊成长（初遇微光 → 灵魂家人），细腻提升熟悉感，且严格不覆盖用户的性格滑条与已确立的称呼/亲子关系。
   - 鲸鱼聊天与桌宠对话 JSON 顶层增加隐藏内心思考字段 `thought`（客户端永不展示），在关闭重思考模式保持低延迟的同时大幅提升共情力、记忆联动与防 OOC 能力。

3. **备份与回归验证**
   - [backup.ts](file:///d:/dark%20study/src/utils/backup.ts) 完整支持新记忆字段的导出、合并与旧版备份零损兼容。
   - 验证命令：
     - `node scripts/check-whale-memory.cjs`
     - `node scripts/check-pet-chat-lifecycle.cjs`
     - `node scripts/check-animation-atlases.cjs`
     - `node scripts/check-app-backup.cjs`
     - `npx tsc --noEmit` & `npx eslint ...`
