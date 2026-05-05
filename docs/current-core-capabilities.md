# TinyBu 当前已实现核心能力

本文档记录当前代码中已经落地的核心能力，用于产品梳理、后续设计和开发对齐。

## 一句话定位

TinyBu 是一个桌面优先的 AI 外语表达伙伴。它把浏览器选中文本、文章、字幕、粘贴内容、剪贴板内容和桌面截图，转化为“理解内容 → 选择片段 → 回答问题 → 温和复盘 → 保存表达与记忆”的低压力语言练习流程。

## 核心学习闭环

当前主流程已经从早期的 Watch / Talk 原型，收敛为更明确的 Practice 流程：

1. 导入真实内容，生成 Capture。
2. TinyBu 理解内容，提取主题、摘要、关键词、问题和可用表达。
3. 用户选择要练习的片段；短内容和字幕默认全选，长内容由 TinyBu 推荐 3-6 条。
4. TinyBu 基于所选片段生成 3-5 个渐进练习问题。
5. 用户逐题回答，TinyBu 给出轻量回应和鼓励。
6. 用户卡住时可请求 Tips，第一层给回答结构，第二层给参考句。
7. 完成后生成 Review，包含聊了什么、做得好的地方、更自然表达、保存到 Notebook 的表达和下次练习建议。
8. Review 自动更新 Notebook 和 TinyBu Memory。

## 已实现的内容导入能力

### 手动与 Demo 内容

- Welcome 页支持 Try Demo，直接生成一条 demo Capture 并进入 Practice。
- Home 页支持粘贴文本、文章片段或字幕，创建手动 Capture。
- 支持通过 URL query 中的 `nomiCapture` 接收外部 capture payload。

### 浏览器扩展导入

`apps/extension` 中已经实现 Chrome MV3 捕捉扩展：

- Popup 按钮捕捉当前页面内容。
- 右键菜单支持发送选中文本、保存页面、捕捉 YouTube transcript。
- 页面内 content script 支持选中文本后提示“要记下这句话吗？”。
- 支持文章正文抽取，优先使用 `article`、`main` 或段落密集区域。
- 支持 YouTube transcript 面板文本；没有 transcript 时可退回到当前可见字幕。
- 捕捉结果优先发送到桌面桥 `http://127.0.0.1:1421/v1/captures`。
- 桌面桥不可用时，退回到打开的 TinyBu Web 页或扩展本地 pending 队列。
- 捕捉计数保存在扩展本地存储，并展示“已记录 N 条”。

### 桌面剪贴板导入

Tauri 桌面宠物窗口已经支持：

- 开启 / 关闭复制捕捉。
- 监听剪贴板复制内容并弹出“要记下吗？”确认。
- 使用 `CommandOrControl+Shift+N` 作为剪贴板捕捉快捷键兜底。
- 捕捉成功后写入桌面 capture bridge 的 pending 队列。
- 支持撤销上一条捕捉和清零计数。

### 桌面截图导入

桌面端已经实现截图捕捉链路：

- 宠物菜单可打开截图选择层。
- 截图时会临时隐藏主窗口和宠物窗口，避免遮挡被截内容。
- 用户框选区域后，Tauri 使用系统截图能力截取指定区域并返回 PNG data URL。
- 主应用接收 `tinybu-screenshot-captured` 事件，创建 screenshot Capture。
- 默认可进入截图预览模式，不调用 AI，也不产生识别费用。
- Settings 中可开启截图 AI 识别；开启后使用 vision model 做 OCR 和屏幕理解。
- 截图 Capture 支持保存图片、识别语言、屏幕类型、可见文本、错误信息和可交互元素。
- 支持对截图继续提问，例如“这段文字是什么意思？”；必要时会把图片一起发给模型。
- 识别失败时会生成诊断 Capture，保留截图预览和错误原因。

## Practice 练习能力

### Capture 理解与片段推荐

创建 Capture 时会执行内容理解：

- 拆分原始文本为 fragments。
- 清理字幕时间戳和多余空白。
- 生成 topic、summary、keywords、questions、suggestedExpressions。
- 字幕内容或短内容默认全选。
- 长内容调用推荐逻辑选择 3-6 个更适合开口练习的片段。
- 所有片段都保留原始顺序、推荐状态和选中状态。

### Select 阶段

Practice 第一阶段用于决定“这次到底练什么”：

- 展示内容主题、摘要、推荐表达和预览问题。
- 展示所有 fragments，用户可逐条勾选。
- 支持 Select all 和 Clear all。
- 显示已选数量和 TinyBu 推荐标记。
- 如果是 screenshot Capture，会额外展示截图预览、屏幕信息、错误信息、交互元素和截图问答记录。

### Answer 阶段

开始练习后，TinyBu 会基于所选片段生成问题：

- 每次显示一个问题，问题数量最多 5 个。
- 问题类型覆盖理解、观点、个人连接和表达使用。
- 右侧保留所选片段上下文，并高亮当前问题关联片段。
- 用户输入目标语言回答并发送。
- TinyBu 对回答给出简短鼓励和自然回应。
- 每题回答后自动进入下一题。

### Tips 支架

回答阶段支持卡住时请求 Tips：

- 第一次请求给出回答结构或思路。
- 第二次请求给出短参考句。
- 参考句可一键填入输入框。
- 支架强度会参考用户水平、目标语言、母语和支架偏好。

### Review 阶段

完成最后一题后自动生成 Review：

- What you talked about：总结本次聊了什么。
- What you did well：列出表达成功的地方。
- More natural expressions：给出 1-2 组更自然表达。
- Saved to Notebook：把有价值表达保存为 ExpressionRecord。
- Next practice：给出下次练习建议。
- 同时把本次 PracticeSession 标记为 completed，把 Capture 标记为 completed。

## Notebook 与 Memory

### Notebook

Notebook 当前承担两类信息管理：

- 最近学习材料：保留 capture title、topic、summary、sourceUrl、source kind 和字符数。
- 表达记录：展示 Review 自动保存的表达卡。

表达记录支持：

- Need Practice、Saved、Learned 三个视图。
- 按日期和来源分组。
- 显示 scene、pattern、original、meaning、练习次数和状态。
- Practice again：练习次数 +1，并标记为 need-practice。
- Save：保存表达。
- Mark as learned：标记已学会。
- Delete：删除表达。

### TinyBu Memory

TinyBu Memory 用于保存学习辅助信息，不作为隐私标签：

- 支持 memory 类型：interest、expression、support、anxiety、next。
- Practice Review 后会自动生成或更新 memories。
- 每条 memory 都可编辑 title 和 body。
- 支持逐条删除，也支持在 Settings 中清空全部 Memory。

## 桌面宠物能力

Tauri 配置了两个窗口：

- `main`：主应用窗口。
- `pet`：透明、无边框、置顶、跳过任务栏的桌面宠物窗口。

宠物窗口已实现：

- idle、dragging、capturing、thinking 四种头像状态。
- 拖拽移动。
- 自动调整菜单展开方向和窗口尺寸。
- 展示 capture count。
- 打开主应用练习入口。
- 开启 / 关闭复制捕捉。
- 截图识别入口。
- 撤销上一条捕捉。
- 隐藏宠物。
- 清零计数。
- 极短 Quick Chat，调用本地 cloud proxy 的 `quickPetChat` task。

## AI 能力与 Provider

当前 AI 层支持三种模式：

- `rules`：本地规则模式，不依赖网络或 API Key。
- `user-key`：使用用户保存的 API Key。
- `cloud-proxy`：调用本地代理服务 `apps/api/server.mjs`。

已实现的 AI task 包括：

- `contentUnderstanding`：内容理解。
- `recommendFragments`：推荐适合练习的片段。
- `practiceQuestions`：生成练习问题。
- `practiceTip`：生成分层提示。
- `practiceTurn`：回应用户回答。
- `review`：生成练习复盘。
- `memory`：更新学习记忆。
- `screenshotCapture`：截图 OCR 和屏幕理解。
- `screenshotQuestion`：回答截图相关问题。
- `quickPetChat`：宠物极短聊天。
- 早期 Talk / Rescue / Mirror / Expression Card 相关 task 和本地规则仍保留在 AI 层，作为后续恢复或兼容基础。

### 用户 Key 模式

- 使用 Tauri keyring 保存、读取和清除 API Key。
- 默认调用 OpenAI Responses API。
- 如果模型名包含 `/` 且配置了 OpenRouter Base URL，则走 OpenRouter Chat Completions。
- 截图和截图问答会使用独立的 vision model 配置。

### Cloud Proxy 模式

`apps/api/server.mjs` 提供本地代理：

- 默认监听 `http://127.0.0.1:8787/v1/nomi/task`。
- 支持 Anthropic-compatible Messages API。
- 支持 OpenRouter。
- 支持 OpenAI Responses API。
- 对每个 task 使用结构化 JSON schema。
- 支持截图类任务的图片输入。
- 请求超时时间可通过 `API_TIMEOUT_MS` 配置。

### 本地规则兜底

除截图 OCR 这类必须依赖视觉模型的能力外，大多数 AI task 都有本地规则兜底：

- AI 模式为 `rules` 时直接使用本地规则。
- API 调用失败时自动 fallback 到本地规则。
- 这样 demo、手动粘贴和基础练习流程可以在没有远程模型时继续运行。

## 数据持久化

前端使用 Dexie / IndexedDB 持久化：

- appState
- captures
- practiceSessions
- reviews
- expressions
- talkSessions
- mirrorCards
- memories

Settings 已支持：

- 保存学习设置和 TinyBu 设置。
- 保存 AI 模式、模型名、vision model、OpenRouter Base URL、Cloud Proxy URL。
- 保存或清除用户 API Key。
- 开启 / 关闭截图 AI 识别。
- 清空 TinyBu Memory。
- 重置 onboarding。
- 清空学习数据。

## 已实现页面

当前主应用页面包括：

- Welcome：产品入口，支持开始设置或 Try Demo。
- Onboarding：设置母语、目标语言、系统语言、水平、目标、开口压力和支架偏好。
- Companion Setup：设置 TinyBu 风格、反馈时机和语速。
- Home：展示新捕捉、继续练习、手动粘贴、近期进度和清空入口。
- Practice：包含 Select、Answer、Review 三阶段。
- Notebook：管理学习材料和保存表达。
- TinyBu Memory：编辑或删除学习记忆。
- Settings：管理学习设置、TinyBu 设置、AI 模式和数据。

## 当前边界与已知限制

- 截图 AI 识别默认关闭，需要在 Settings 中开启并配置可用模型。
- 纯本地规则模式不能真正做视觉 OCR。
- 浏览器扩展对非常长的文章和字幕会裁剪文本。
- YouTube transcript 捕捉在 transcript 面板打开时效果最好。
- 任意视频平台字幕捕捉尚未通用化。
- 早期 Talk Mode、Rescue Buttons、Mirror Card UI 文档中仍有历史描述；当前主实现以 Practice 三阶段和 Review 为准。
