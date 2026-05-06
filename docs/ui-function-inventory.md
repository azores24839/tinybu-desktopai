# 历史 UI 草图：Nomi 早期界面与功能梳理

> 状态说明：这是一份历史 UI 草图文档，仍保留 Nomi / Watch / Talk / Mirror Card 等早期概念，已经不代表当前产品实现。
>
> 当前产品名是 TinyBu。当前主流程是：
>
> `Browse / Capture -> Inbox -> Organize -> Topics -> Study Room -> Practice -> Practice Review -> Notebook / Bu's Memory`
>
> 当前权威产品与实现说明请以 `docs/current-core-capabilities.md` 为准。除非明确要参考早期草图，不应再按本文档设计或实现新页面。

这份文档用于辅助生成 UI 草图，只描述信息架构、页面功能和用户流程，不包含视觉设计要求。

## 产品定位

Nomi 是一个桌面端 AI 外语表达伙伴。核心目标是帮助用户把看过、读过或粘贴进来的真实内容，转化成可以开口表达、可以反复练习、可以被记住的语言素材。

核心闭环：

1. 导入或选择内容。
2. 阅读 / 观看内容。
3. 捕捉有用表达。
4. 和 Nomi 进行低压力 Talk。
5. 生成 Mirror Card 复盘。
6. 更新 Notebook 和 Memory。

## 全局结构

### 未进入主应用前

- Welcome
- Onboarding
- Companion Setup

### 主应用 Shell

主应用使用桌面端侧边栏导航结构。

侧边栏入口：

- Home
- Watch
- Talk
- Notebook
- Memory
- Settings

全局状态：

- 顶部 busy banner：AI 正在生成表达卡、准备讨论、生成 Mirror Card 等。
- Nomi 状态：idle、listening、speaking、thinking、encouraging、celebrating。
- Expression Modal：表达卡弹窗，可在多个场景中打开。

## 页面清单

### 1. Welcome

用途：首次进入产品时说明 Nomi 的核心价值，并提供开始路径。

主要内容：

- 品牌：Nomi / 诺米
- 核心文案：把看过的内容变成说得出口的表达
- 产品预览：示例 transcript、捕捉表达、表达卡、Nomi 鼓励语

主要操作：

- Start with Nomi：进入 Onboarding
- Try Demo：跳过设置，直接进入 demo 内容的 Watch Room

### 2. Onboarding

用途：收集学习者基础信息，用于决定语言、水平、目标和支架强度。

字段：

- 母语
- 目标语言
- 系统语言
- 当前水平：A1、A2、B1、B2
- 学习目标：日常聊天、旅行交流、学习 / 留学、工作沟通、观点表达、看视频学表达、减少开口焦虑
- 自定义目标
- 开口压力：1-5
- 支架偏好：Gentle、Balanced、Direct

主要操作：

- Skip：使用默认 profile
- Continue：保存用户 profile，进入 Companion Setup

功能规则：

- 如果开口压力较高，系统自动倾向 Gentle 支架和温和反馈。

### 3. Companion Setup

用途：创建或确认 Nomi 的陪伴方式。

主要内容：

- 角色信息：名字、身份、性格
- 陪伴风格：Warm Friend、Gentle Coach、Native Buddy、Calm Listener
- 反馈方式：
  - 对话后再反馈，不打断我
  - 我卡住时再提示
  - 可以适当即时建议
  - 直接帮我改自然
- 语速：慢速、正常、稍快

主要操作：

- Use Default Nomi
- Create Nomi

### 4. Home

用途：主入口，帮助用户选择今天要转化成口语练习的内容。

主要内容：

- 当前学习目标概览：目标语言、水平、支架偏好
- 快捷入口：
  - Watch with Nomi
  - Paste Transcript
  - Try Demo Content
- 示例内容列表：
  - Productivity and Learning
  - Language Learning
  - Travel and Daily Life
- 粘贴 Transcript 输入区
- 最近学习概览：
  - 最近捕捉的表达
  - 最近 Talk
  - Nomi 最近记住的内容

主要操作：

- 打开 demo 内容进入 Watch Room
- 粘贴 transcript 并生成练习内容
- 进入 Settings

外部内容能力：

- 当前代码支持通过 URL query 中的 `nomiCapture` 接收外部 capture payload。
- payload 可包含 kind、title、url、text、capturedAt。
- 支持来源类型：selection、article、youtube、video、manual。
- 如果检测到外部 capture，会直接进入 Watch Room。

### 5. Watch Room

用途：阅读 / 观看内容，并从内容中捕捉可以复用的表达。

主要内容：

- 内容标题
- 内容摘要
- 来源链接：如果有 source URL，显示 Web / YouTube source
- 步骤提示：
  - 1 阅读 / 观看
  - 2 捕捉表达
  - 3 开始 Talk
- 当前片段
- Transcript 行列表
- 右侧 Nomi companion panel
- 已捕捉表达列表

每一行 transcript 的操作：

- 捕捉：生成 Expression Card 并保存到表达列表
- 解释：生成临时 Expression Card，帮助理解当前句
- 稍后问我：捕捉该句，并用于之后 Talk

底部操作：

- 捕捉当前句
- 解释当前句
- 加入讨论问题
- 开始 Talk / 先不捕捉，直接 Talk

状态：

- 没有捕捉表达时，右侧显示 empty state。
- 已有捕捉表达时，步骤 2 高亮，右侧展示 Captured Expressions。

### 6. Talk Mode

用途：围绕内容进行低压力对话练习。

主要内容：

- Talk 标题
- 简短说明：每次只聊一个问题，卡住时可以用支架按钮
- 对话消息流：
  - Nomi message
  - User message
  - Rescue message
- 输入区
- 语音输入按钮占位
- Send 按钮
- Rescue 支架按钮区
- 右侧 Nomi companion panel
- 右侧显示可用 captured expressions

用户输入：

- 输入英文回答
- Enter 发送
- 点击 Send 发送

Rescue 类型：

- Help me start / 帮我开头
- Help me continue / 帮我续句
- Give me words / 给关键词
- Say it simply / 说简单点
- Say it with me / 带我说一句
- Use my language first / 先用母语

主要操作：

- Send：提交回答，生成 Nomi 下一轮回复和问题
- Rescue：生成 1-3 条支架提示
- End Talk：结束对话，生成 Mirror Card 和 Memory

空状态：

- 如果还没有 Talk Session，提示用户先从 Watch Room 开始。

### 7. Mirror Card

用途：对一次 Talk 进行温和复盘，帮助用户看到自己表达成功的部分，并给出自然表达建议。

主要内容：

- 生成时间
- What you talked about
- What Nomi understood
- What worked
- More natural expression
- Try again
- Memory updated

主要操作：

- Save to Notebook：把 Try again 句子保存到 Notebook
- Try this sentence again：回到 Talk 再练一次
- Finish：返回 Home

空状态：

- 如果没有 Mirror Card，提示完成一次 Talk 后生成。

### 8. Notebook

用途：管理和复用表达。它不是普通收藏夹，而是让表达再次进入练习。

主要内容：

- 表达筛选：
  - all
  - captured
  - my-sentence
  - pattern
  - need-practice
  - used
- 表达卡列表
- 每条表达包含：
  - 来源标题
  - pattern
  - original sentence
  - meaning
  - 练习次数
  - 使用状态

每条表达的操作：

- Practice again：练习次数 +1，并标记为 need-practice
- Use in a new sentence：标记为 my-sentence
- Talk with Nomi：带着该表达进入对应内容的 Watch / Talk 流程
- Mark as learned：标记已学会
- Delete：删除表达

空状态：

- 如果 Notebook 为空，提示去 Watch Room 捕捉一句表达。

### 9. Memory

用途：展示和编辑 Nomi 记住的学习支架。强调不是隐私标签，而是学习辅助信息。

Memory 类型：

- interest
- expression
- support
- anxiety
- next

每条 Memory 内容：

- 类型
- 标题
- 正文

主要操作：

- 编辑 title
- 编辑 body
- Delete 删除

空状态：

- 如果还没有记忆，提示完成一次 Talk 后生成。

### 10. Settings

用途：调整学习设置、Nomi 行为、AI 模式和数据。

分区：

- 学习设置
- Nomi 设置
- AI 模式
- 数据

学习设置：

- 母语
- 目标语言
- 当前水平
- 开口压力

Nomi 设置：

- Nomi 风格
- 语速
- 开启温和反馈
- 显示母语辅助

AI 模式：

- 本地规则
- 用户 Key
- 云端代理
- 模型名称
- Cloud Proxy URL
- OpenAI API Key
- 清除 Key

数据操作：

- 清空记忆
- 重置 onboarding
- 清空学习数据

底部操作：

- Save Settings

## 弹窗

### Expression Card Modal

用途：展示一个捕捉到的表达，帮助用户理解、保存、稍后使用或立即练习。

主要内容：

- Pattern
- Original
- Meaning
- Useful Pattern
- Use it about yourself
- Scene

主要操作：

- Save to Notebook
- Use later in Talk
- Practice now
- Close

触发场景：

- Watch Room 捕捉句子
- Watch Room 解释句子
- Watch Room 加入讨论问题

## 核心对象

### Content

内容可以来自：

- demo
- pasted transcript
- external capture

包含：

- title
- topic
- source type
- source URL
- source kind
- transcript lines
- summary
- keywords
- questions

### Expression

表达卡包含：

- original
- meaning
- keywords
- pattern
- scene
- practice stem
- source title
- captured time
- saved / use later / used in talk / learned
- practice count
- category

### Talk Session

对话包含：

- topic
- content id
- title
- messages
- rescue used
- round count
- status
- created / ended time

### Mirror Card

复盘卡包含：

- topic summary
- what Nomi understood
- what worked
- natural expression suggestions
- try again sentence
- memory updated
- next suggestion

### Memory

记忆包含：

- type
- title
- body
- editable
- updated time

## 主要用户流程

### 首次使用流程

Welcome → Onboarding → Companion Setup → Home

### Demo 快速体验流程

Welcome → Try Demo → Watch Room → Talk Mode → Mirror Card

### 粘贴内容练习流程

Home → Paste Transcript → Watch Room → 捕捉表达 → Talk Mode → Mirror Card → Notebook / Memory

### 外部内容导入流程

外部 capture payload → Watch Room → 捕捉表达 / 解释 → Talk Mode → Mirror Card

### 表达复习流程

Notebook → 选择表达 → Practice again / Talk with Nomi / Mark as learned

### 记忆管理流程

Memory → 编辑记忆 → 删除不想保留的记忆

## 给 UI 草图 AI 的简短提示词

请为一个桌面端 AI 外语表达伙伴 Nomi 生成低保真 UI 草图。不要做视觉风格设计，只做信息架构和功能布局。产品核心流程是：导入或选择真实内容，阅读 transcript，捕捉可复用表达，和 Nomi 进行低压力 Talk，生成 Mirror Card 复盘，并把表达保存到 Notebook、把学习偏好保存到可编辑 Memory。需要覆盖这些页面：Welcome、Onboarding、Companion Setup、Home、Watch Room、Talk Mode、Mirror Card、Notebook、Memory、Settings，以及 Expression Card Modal。主应用使用左侧导航，包含 Home、Watch、Talk、Notebook、Memory、Settings。每个页面请体现主要模块、用户操作、空状态和关键数据对象，但不要指定颜色、字体、插画或具体视觉风格。
