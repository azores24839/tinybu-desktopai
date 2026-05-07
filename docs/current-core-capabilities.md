# TinyBu 当前已实现核心能力

本文档记录当前代码中已经落地的核心能力，用于产品、设计和开发对齐。

## 一句话定位

TinyBu 是一个 desktop-first 的 AI 语言学习工作台。它把浏览器选中文本、文章、视频 transcript、粘贴内容、剪贴板片段和桌面截图，转化为：

`Inbox -> Organize -> Topics -> Study Room -> Practice -> Practice Review -> Notebook / Bu's Memory`

TinyBu 不是课程型产品，而是一个把零散真实内容整理成主题，再进入理解、表达练习和记忆沉淀的学习工作台。

## 当前主流程

1. 用户通过浏览器扩展、桌宠复制捕捉、截图、粘贴或 demo 内容创建 Capture。
2. Capture 先进入 Inbox，并显示状态、来源、摘要和 Suggested Topic。
3. 用户在 Inbox 中查看、归档、删除、移动 Capture，或进入 Organize。
4. Organize 将未整理 captures 按语义聚合成 Suggested Topics，用户可确认、重命名、合并或移动内容。
5. Topics 展示所有 Topic，用户进入 Topic Detail。
6. Topic Detail 展示 Sources、Learning Overview、Practice goals，并进入 Study Room 或直接 Start Practice。
7. Study Room 先帮助用户理解 Topic 下的 source，展示原文、摘要、关键问题和 Useful Expressions。
8. Practice 围绕 Topic 做低压力表达练习。
9. Practice Review 展示练习总结、更自然表达、保存建议和下一步。
10. Notebook 保存用户真正想带走的表达，Bu's Memory 记录长期学习状态。

## 导航与页面

主应用 Shell 是桌面横屏工作台：

- 固定左侧 Sidebar：`Home`、`Inbox`、`Topics`、`Notebook`、`Bu's Memory`、`Settings`
- `Organize` 是 Inbox 内子页面。
- `Topic Detail`、`Study Room`、`Practice`、`Practice Review` 是 Topic 内流程页，不出现在一级导航。

当前页面：

- Welcome：首次入口，支持 Start 和 Try Demo。
- Onboarding：设置母语、目标语言、水平、目标、开口压力和支架偏好。
- Companion Setup：设置 TinyBu 风格、反馈时机和语速。
- Home：显示当前学习建议、Learning Queue 和 Practice Rhythm。
- Inbox：三栏布局，支持搜索、状态筛选、来源筛选、capture 详情和快捷操作。
- Organize：三栏布局，支持未整理 captures、AI suggested topics 和 topic editor。
- Topics：左侧 Topic 列表，右侧 Topic 详情与 Study / Practice 入口。
- Topic Detail：展示 topic 信息、sources 和 learning overview。
- Study Room：三栏布局，包含 source navigator、main study area 和 useful expressions。
- Practice：左右双栏，左侧练习对话，右侧 topic/source/tips/saved support。
- Practice Review：练习总结、better expressions、saved suggestions 和 next step。
- Notebook：三栏表达库，按 All / By Topic / Recently Saved / Review Later 查看。
- Bu's Memory：学习伙伴式 dashboard，展示兴趣、困难、表达方向和建议。
- Settings：语言、AI provider、模型、API key、数据和桌面连接设置。

## 数据模型与状态

### Capture

Capture 支持来源：

- `selection`
- `article`
- `youtube`
- `video`
- `screenshot`
- `manual`

当前 Capture 状态：

- `unsorted`：刚收集，未整理。
- `suggested`：系统已建议 topic。
- `in-topic`：已进入某个 Topic。
- `studied`：已在 Study Room 学习过。
- `practiced`：已完成表达练习。
- `archived`：归档。

代码保留旧状态兼容：

- `new -> unsorted`
- `in-practice -> studied`
- `completed -> practiced`

### Topic

Topic 已持久化为独立记录，包含：

- name
- summary
- captureIds
- tags
- practiceGoal
- status：`ready`、`in-progress`、`practiced`
- savedExpressionCount
- createdAt / updatedAt
- lastStudiedAt / lastPracticedAt

## 内容导入能力

### 手动与 Demo

- Welcome 支持 Try Demo，生成 demo Capture。
- Home 支持手动粘贴文本、文章片段或字幕。
- 支持 URL query `nomiCapture` 导入外部 payload。

### 浏览器扩展

`apps/extension` 是 Chrome MV3 扩展，支持：

- Popup 捕捉当前页面内容。
- 右键菜单发送选中文本、保存页面、捕捉 YouTube transcript。
- 页面内选中文本后提示“要记下这句话吗？”。
- 文章正文抽取。
- YouTube transcript 面板文本；无 transcript 时退回可见字幕。
- 优先发送到桌面桥：`http://127.0.0.1:1421/v1/captures`
- 桌面桥不可用时退回 Web 页或扩展 pending 队列。

### 桌宠复制捕捉

桌宠支持：

- 开启 / 关闭复制捕捉。
- 监听剪贴板复制内容并弹出确认。
- `CommandOrControl+Shift+N` 快捷键兜底。
- 捕捉成功后写入 Tauri capture bridge pending 队列。
- 主 App 会监听 bridge 更新并自动导入 pending captures。
- 支持撤销上一条捕捉和清零计数。

### 桌面截图

截图链路：

- 桌宠菜单打开截图选择层。
- 截图时临时隐藏主窗口和桌宠，避免遮挡。
- 选择层透明显示桌面，只在选区外轻微变暗。
- 用户框选区域后，Tauri 使用系统截图能力截取 PNG data URL。
- 主 App 接收 `tinybu-screenshot-captured`，创建 screenshot Capture。
- 默认是截图预览模式，不调用 AI、不产生识别费用。
- Settings 开启截图识别后，使用 vision model 做 OCR 和屏幕理解。
- 识别成功后，用户可通过 `Confirm text` 确认提取结果并清除持久化的截图图片。
- 确认后长期保留的是提取文本、摘要、可见文字、页面类型、错误信息、交互元素和截图问答记录。
- 支持截图问答，必要时会把图片一起发送给模型。
- 识别失败会生成诊断 Capture，保留截图预览和错误原因。
- 识别失败的诊断 Capture 会自动成为当前选中的 capture，方便用户查看失败原因。

## Study Room 与 Practice

### Study Room

Study Room 用于先理解 Topic：

- 左栏 Source Navigator：切换 topic 下的 source。
- 中栏 Main Study Area：原文、AI summary、plain explanation、key ideas。
- 右栏 Useful Expressions：expression、meaning、when to use、example、Save to Notebook。
- 底部 / 顶部可 Start Practice。

### Practice

Practice 围绕 Topic 生成 3-5 个表达问题：

- 每次显示一个问题。
- 用户输入目标语言回答。
- TinyBu 给出轻量回应。
- 右侧展示 Topic 摘要、本轮进度、source summary、Tips。

Tips 逻辑：

- 第一次点击：给思路 / 回答方向。
- 第二次点击：给一句完整参考答案。
- 第三次不再展开。

### Practice Review

完成后生成 Practice Review：

- Practice Review 总结。
- What You Practiced。
- Better Expressions。
- Saved Suggestions。
- Next Step。

Review 会保存表达到 Notebook，并更新 Bu's Memory。

## Notebook 与 Bu's Memory

### Notebook

Notebook 现在只突出用户真正想带走的表达，不再作为完整材料库。

支持：

- All Expressions
- By Topic
- Recently Saved
- Review Later
- 表达详情：meaning、when to use、example、source、user's own version
- Edit / Delete / Mark review / Mark learned

### Bu's Memory

Bu's Memory 是面向用户展示的长期学习档案，不是冷冰冰的 log。

展示：

- Memory Summary
- Topics You Care About
- Expressions You're Building
- Bu's Suggestions
- 可编辑 memory notes

Memory 类型：

- `interest`
- `expression`
- `support`
- `anxiety`
- `next`

## 桌宠能力

Tauri 配置两个主要窗口：

- `main`：主应用窗口。
- `pet`：透明、无边框、置顶、跳过任务栏的桌面宠物窗口。

桌宠已实现：

- idle、dragging、capturing、thinking 四种头像状态。
- 拖拽移动。
- 自动调整菜单展开方向和窗口尺寸。
- 展示 capture count。
- 打开主应用。
- 开启 / 关闭复制捕捉。
- 截图识别入口。
- 撤销上一条捕捉。
- 隐藏。
- 清零。
- Quick Chat。

Quick Chat 当前实现：

- 使用主 App Settings 中的 provider、API key、chat model。
- `User API key` 模式下会自动识别 OpenRouter key：`sk-or-...`。
- 对 `MiniMax-M2.7` 做 OpenRouter 模型名映射：`minimax/minimax-m2.7`。
- 走轻量纯文本请求，不使用 JSON schema。
- `max_tokens` 为 70。
- 12 秒超时；超时显示真实错误。
- 回复会压短，气泡向上自适应，不向下遮挡桌宠形象。
- 不再使用预设兜底句隐藏错误。

## AI Provider

当前 AI 层支持三种模式：

### Rules fallback

- 不依赖网络或 API key。
- 用本地规则跑 demo 和基础练习。
- 不是真 AI。
- quick chat 在 rules 模式下会提示切换 provider，而不是返回假 AI 回复。

### User API key

- 用户在 Settings 中保存 API key。
- Tauri 环境优先写系统 keychain，同时保留同源 localStorage 备份。
- 读取时优先 keychain，失败或为空时读本地备份。
- Settings 提供 `Check saved key` 检查 TinyBu 是否读得到 key。
- 默认 OpenAI key 走 OpenAI Responses API。
- OpenRouter key（`sk-or-...`）强制走 OpenRouter Chat Completions。
- 模型名包含 `/` 也会走 OpenRouter。
- 截图相关 task 使用独立 vision model。

### Cloud proxy

`apps/api/server.mjs` 提供本地代理：

- 默认监听：`http://127.0.0.1:8787/v1/nomi/task`
- 支持 `ANTHROPIC_AUTH_TOKEN`
- 支持 `OPENROUTER_API_KEY`
- 支持 `OPENAI_API_KEY`
- 支持 `OPENROUTER_BASE_URL`
- 支持 `API_TIMEOUT_MS`
- 普通学习 task 使用 JSON schema。
- 截图类 task 支持图片输入。
- `quickPetChat` 使用轻量纯文本路径，不走 JSON schema。
- 同时配置 MiniMax/Anthropic-compatible token 和 OpenRouter key 时：
  - MiniMax 模型名，如 `MiniMax-M2.7`，走 `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`。
  - Provider/model ID，如 `qwen/qwen3.6-35b-a3b`，走 OpenRouter。
  - 缺少对应 provider key 时会报明确配置错误，不再静默落到错误 provider。

已实现 AI task：

- `contentUnderstanding`
- `recommendFragments`
- `practiceQuestions`
- `practiceTip`
- `practiceTurn`
- `review`
- `memory`
- `screenshotCapture`
- `screenshotQuestion`
- `quickPetChat`

## Settings

Settings 当前包含：

- Source language
- Target language
- Support strength
- Provider mode
- Chat / learning model
- Screenshot / vision model
- OpenRouter base URL
- Cloud proxy URL
- API key save / clear / check
- Screenshot recognition toggle
- Clear Bu's Memory
- Clear learning data
- Reset onboarding

推荐 OpenRouter 配置：

- Provider mode：`User API key`
- API key：`sk-or-...`
- Chat / learning model：`MiniMax-M2.7` 或 `minimax/minimax-m2.7`
- Screenshot / vision model：`qwen/qwen3.6-35b-a3b`
- OpenRouter base URL：`https://openrouter.ai/api/v1`

推荐 MiniMax + OpenRouter 混合配置：

- Provider mode：`Cloud proxy`
- Chat / learning model：`MiniMax-M2.7`
- Screenshot / vision model：`qwen/qwen3.6-35b-a3b`
- 本地 proxy 环境变量：
  - `ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic`
  - `ANTHROPIC_AUTH_TOKEN=your-minimax-key`
  - `OPENROUTER_API_KEY=your-openrouter-key`

## 数据持久化

前端使用 Dexie / IndexedDB：

- appState
- captures
- topics
- practiceSessions
- reviews
- expressions
- talkSessions
- mirrorCards
- memories

Tauri 侧：

- capture bridge pending 队列保存在进程内存。
- API key 使用 keychain + localStorage backup。

## 当前边界与已知限制

- 截图 AI 识别默认关闭，需要在 Settings 中开启。
- 纯本地 rules 模式不能做真实视觉 OCR。
- 截图图片是 base64 data URL，保存在 IndexedDB capture 记录里；识别成功后建议确认文字并清图，避免长期占用本地存储。
- 浏览器扩展对超长文章和字幕会裁剪。
- YouTube transcript 捕捉在 transcript 面板打开时效果最好。
- Cloud proxy 模式需要单独启动 `npm run api:dev` 并提供环境变量 key。
- 当前没有流式输出；桌宠 quick chat 用短 prompt 和低 token 优化响应速度。
- 早期 Watch / Talk / Mirror Card 文档属于历史草图，当前主实现以 Topic 工作台流程为准。

## 当前代码结构状态

截至 2026-05-07，前端已经从单一大 `App.tsx` 逐步拆分出以下模块：

- `src/components/`：`AppHeader`、`EmptyState`、`NomiOrb`
- `src/features/captures/`：Inbox、Organize、capture 工具函数
- `src/features/topics/`：Topics、Topic Detail、Study Room、topic 工具函数
- `src/features/screenshots/`：截图导入 flow、预览、确认清图、截图问答
- `src/features/setup/`：Welcome、Onboarding、Companion Setup
- `src/features/notebook/`：Notebook 页面
- `src/features/memory/`：Bu's Memory 页面
- `src/features/settings/`：Settings 页面
- `src/lib/appOptions.ts`、`src/lib/uiCopy.ts`：共享选项和 UI 文案

仍在 `App.tsx` 的主要职责：

- 主路由和全局状态。
- capture/topic/practice/review/memory 的业务 flow。
- Home / Practice / Practice Review 等尚未拆出的页面。

下一步低风险拆分建议：

1. Home。
2. Practice 与 Practice Review 页面组件。
3. 最后再拆 Practice flow 和 AI provider。
