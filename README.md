# Dark study

一款面向我自己的智能课程表 App，采用十分甚至九分的现代设计语言（大圆角扁平卡片、弹簧跟手动效、120fps UI 线程动画）。

## 功能

- **课程表**：日视图 / 周网格双模式，按真实时间线性对齐；「进行中」课程按当前时钟精确匹配，带呼吸光效
- **多课表管理**：可为每个学期建立独立课表（如「大二下」），自由命名、一键切换
- **学期时间**：自定义开学 / 放假日期，自动推算「当前第几周」与学期总周数
- **AI 智能导入**：相册识图 / 拍照识别 / 文档导入，识别课表、作息时间、绩点规则与成绩单
- **AI 助手**：对话式增删改课程，自动带上下文
- **绩点计算**：自定义绩点换算规则，支持多规则（保研绩点 / 出国 4.0 制等）
- **个性化**：深色 / 浅色 / 跟随系统主题，支持自定义背景图

## 技术栈

- [Expo SDK 58](https://docs.expo.dev/) + [Expo Router](https://docs.expo.dev/router/introduction)（文件路由）
- [NativeWind v4](https://www.nativewind.dev/)（Tailwind CSS，`darkMode: "class"` 手动切换）
- [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated/) v4（UI 线程弹簧动效）
- [react-native-gesture-handler](https://docs.swmansion.com/react-native-gesture-handler/)（跟手手势）
- [zustand](https://github.com/pmndrs/zustand) + AsyncStorage（持久化）
- DeepSeek API（多模态识图 `deepseek-flash` / 文本 `deepseek-chat`）

## 开发

```bash
npm install        # 安装依赖
npx expo start     # 启动开发服务器
npx expo lint      # 代码检查
npx tsc --noEmit   # 类型检查
```

## 安全须知

- DeepSeek API Key **由使用者在 App「设置」中自行填写**，仅保存在本地设备（AsyncStorage），代码与仓库中不包含任何真实 Key
- 请勿将 API Key 硬编码进代码或提交到仓库；生产环境请通过自有服务端中转调用
- `.env`、密钥证书等敏感文件已被 `.gitignore` 排除

## 目录结构

```
src/
├── app/          # Expo Router 路由（每个文件即一个页面）
├── screens/      # 页面主体 UI
├── components/   # 通用组件（卡片、导航栏、弹窗面板等）
├── store/        # zustand 状态（课表、成绩、设置）
├── services/     # DeepSeek 接入、文件导入
├── constants/    # 调色板、示例数据
├── types/        # TypeScript 类型定义
└── utils/        # 时间/学期计算等工具
```
