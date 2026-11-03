# 大肥鱼：人设与记忆

入口：设置 → 大肥鱼 · 人设与记忆；鲸鱼人格的对话页右上角也有入口。

## 行为

- 4 组性格预设，只调整滑条，保留自定义文字。
- 傲娇、黏人、温柔、活泼、话量分别为 1–100；可拖动、点击轨道、按加减按钮及使用读屏增减。
- 名字、对用户的称呼、背景与说话习惯可编辑，点击「保存人设」本地持久化。文字设定优先于滑条。
- 主聊天、桌宠与联网回答共用角色提示词。聊天窗口最近 24 条非空消息最多 10000 字符，长期事实和相关旧对话另外按预算注入。
- 两端聊天记录各保留最近 200 条。长期事实最多 60 条，每次回复最多提取 3 条，满额不自动淘汰手写内容。
- 自动记忆附用户原话、来源消息和更新时间；本地校验原话存在于当前用户消息。模型仍可能理解错误，可在小本本里修改。
- 同主题更正复用 key；手动修改后不接受自动覆盖。自动记忆开关关闭后保留现有记忆供回答使用。
- 删除自动事实时同步删除其来源消息；长按删除消息会删除由它产生的事实。清空涵盖两端聊天、归档及长期事实，保留人设。
- 清空、删消息时使旧请求失效，阻止旧回复/自动事实恢复。编辑或删除记忆时阻止已发出的提取请求覆盖修改。
- 旧存档缺少新字段时沿用默认值，聊天记录保留。旧聊天按相关性找回，不会额外调用模型批量摘要。
- 自动记忆与回复同一次模型调用生成，不增加后台模型请求。内容在本机保存，聊天时必要上下文发送到现有 AI 服务。
- 有 API Key 时桌宠聊天交给模型理解，避免「我喜欢吃草莓」被本地喂饭正则截断。无 Key 时保留基本动作指令。

## 参考与取舍

学习设计思路，未复制项目源代码，也未引入其运行时依赖：

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) 与 [Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)：把角色描述放在稳定上下文中，控制人设长度，避免挤掉聊天。
- [SillyTavern memory extension](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions/memory/index.js)：参考记忆与近期窗口分层的思路。本项目选择结构化用户事实和关键词检索，避免手机端向量服务与额外摘要请求。
- [Mem0](https://github.com/mem0ai/mem0) 的 [fact extraction prompts](https://github.com/mem0ai/mem0/blob/main/mem0/configs/prompts.py)：参考从用户陈述抽取稳定偏好、独立更新事实的思路；加入原话校验、手动覆盖保护和遗忘竞态保护。
- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)、[Router](https://docs.expo.dev/router/introduction/) 与 [React Native responder](https://reactnative.dev/docs/panresponder)：沿用现有 Router 和 RN 组件，滑条无需添加原生依赖。

## 验证

```sh
node scripts/check-whale-memory.cjs
npx expo lint
npx tsc --noEmit
```

脚本使用真实 store、提示词构建与两端 AI 服务，替换设备存储和模型传输；不读取 API Key，不产生收费请求。真实模型的口吻与记忆提取质量仍需实际对话验证。
