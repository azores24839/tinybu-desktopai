# Airi 对 Nomi 的参考笔记

## Nomi 最终在做什么

根据当前代码库来看，Nomi 是一个基于 Tauri、React、Dexie 和 AI Provider 层构建的桌面端语言学习陪伴应用。它的核心产品闭环是：

1. 学习者观看内容，或粘贴真实文本 / transcript。
2. Nomi 帮用户从内容中提取可复用表达。
3. 学习者围绕这个内容进行低压力的口语或文字对话练习。
4. Nomi 生成一次对话后的 Mirror Card。
5. Nomi 更新学习记忆，服务于之后的练习。

所以，Nomi 的最终形态看起来不是一个泛聊天机器人，而更像是一个「内容到表达」的语言陪伴工具：它把用户本来就关心的输入，转化成用户能说出口、能复用的语言。

最强的产品差异点不是聊天本身，而是这个学习闭环：

- 内容理解
- 表达捕捉
- 支架式对话
- 温和反馈
- 可编辑记忆
- 下一次练习的连续性

## Airi 中值得参考的部分

### 1. 将 Agent Runtime 和 UI 解耦

Airi 是一个大型多包项目，包含 apps、packages、services、integrations、plugins 等不同区域。它的 README 将自己描述为一个自托管 AI 伴侣，支持实时语音聊天、桌面端 / Web、多种外部集成，例如 Minecraft 和 Factorio。

参考：https://github.com/moeru-ai/airi

对 Nomi 来说，真正值得借鉴的是分层思路，而不是项目规模。

当前 Nomi 的大部分 AI 编排逻辑都在 `src/ai/provider.ts` 中。对于早期原型这是合理的，但一旦加入流式输出、语音、更多 Provider、取消请求、重试或任务历史，这个文件会迅速变得拥挤。

建议 Nomi 逐步演化成这样的结构：

- `src/ai/tasks.ts`：定义任务名称、任务 payload 和结果类型
- `src/ai/providers/`：OpenAI、云端代理、本地规则等 Provider 实现
- `src/ai/runTask.ts`：统一处理 fallback、错误、解析、取消请求
- `src/ai/session.ts`：处理 Talk Session 的对话编排

### 2. 把 Companion 当作状态，而不是装饰

Airi 的核心概念不是普通助手，而是 AI 角色 / 伴侣。Nomi 现在已经有了这个雏形，例如 `CompanionProfile`、`NomiState` 和 orb 状态。

下一步有价值的方向，是让 Nomi 的状态更加明确。

可以考虑这样的状态模型：

- `mood`：calm、encouraging、focused、celebrating
- `activity`：idle、reading、thinking、listening、speaking
- `supportMode`：gentle、balanced、direct
- `currentGoal`：explain、rescue、converse、review

这样 UI、prompt 和未来的语音行为都可以响应同一套状态，而不是每个页面各自发明一套行为。

### 3. Provider 注册表和校验机制

Airi 近期 release notes 中出现了很多 Provider / Model 设置相关的工作，例如 Provider 校验、模型选择、本地 Provider 支持、Ollama thinking mode、语音和 TTS Provider 等。

参考：https://github.com/moeru-ai/airi/releases

Nomi 可以借鉴「Provider Registry」这个想法，但要做得轻量：

- Provider 元数据：名称、设置字段、是否支持 streaming、是否支持 JSON schema
- Provider 校验：保存前测试 API Key 或云端代理是否可用
- 模型预设：提供安全默认值，同时允许手动覆盖
- Provider 健康状态：可用、缺少 key、校验失败

这和现有的 `AiProviderMode` 很契合：

- `rules`
- `user-key`
- `cloud-proxy`

以后可以逐步扩展成：

- `openai`
- `openai-compatible`
- `ollama`
- `cloud-proxy`
- `local-rules`

### 4. 结构化的 Chat Lifecycle

Nomi 现在是在按钮事件里直接生成每一轮 Talk turn。这样很清楚，但一旦加入语音、流式响应或打断能力，交互就需要一个更明确的生命周期。

一个有用的生命周期可以是：

1. 创建用户 turn。
2. 构建上下文。
3. 运行 AI task。
4. 应用 AI response。
5. 更新本轮对话中被使用的表达。
6. 必要时建议 rescue。
7. 持久化所有变化。

这部分可以变成 `submitTalkTurn()` 这样的服务函数，从 `App.tsx` 中移出去，让组件更专注于渲染和 UI 事件。

### 5. 将 Memory 作为一等产品表面

Airi 将长期陪伴看作产品的重要部分。Nomi 的 memory 更偏学习场景，这是正确的。当前 `MemoryItem` 的结构已经朝着合适方向走了：

- interest
- expression
- support
- anxiety
- next

受 Airi 启发，Nomi 可以进一步定义 memory 的作用域：

- session memory：这一次 Talk 里发生了什么
- learning memory：稳定的学习偏好和重复出现的模式
- expression memory：用户想复用的短语和句型
- support memory：什么样的支架能帮助用户继续说下去

所有 memory 都应该保持可编辑。Nomi 的信任感，取决于学习者是否觉得这些记忆是可见、可控的。

### 6. 语音和实时能力是未来层，而不是地基

Airi 的实时语音方向对 Nomi 是相关的，但 Nomi 不应该从这里开始。当前产品闭环在没有语音的情况下也成立。语音应该放在同一套 Talk lifecycle 之上：

- speech-to-text 创建用户 turn
- AI task 创建 Nomi turn
- text-to-speech 读出回复
- memory / mirror 仍然使用同一套持久化 session

这样未来的语音模式不会变成另一个独立产品。

### 7. Tool / Plugin 架构是更后面的模式

Airi 有 integrations 和 plugin 式扩展能力。对 Nomi 来说，近期对应的东西不是通用插件系统，而是内容来源：

- 粘贴 transcript
- YouTube transcript
- 本地字幕文件
- 网页文章
- PDF 或文档片段

如果以后真的加入 plugin-like 架构，它最好先从「内容来源 adapter」开始，而不是一开始就做任意工具系统。

## 暂时不建议借鉴的部分

现在不建议借鉴这些：

- 大型 monorepo 结构
- Live2D / VRM 角色渲染
- 游戏集成
- MCP / plugin 复杂度
- billing / server runtime 相关机制
- 重型 observability 基础设施

这些解决的是 Airi 那种规模的问题。Nomi 眼下最大的风险不是架构不够大，而是丢掉学习闭环的清晰度。

## 推荐的 Nomi 优先级

### 现在

- 将 AI task 执行逻辑从 `provider.ts` 中抽离出来。
- 添加 Provider registry 元数据。
- 在 Settings 中加入 Provider 校验。
- 将 Talk turn 编排逻辑从 `App.tsx` 中移出。
- 强化 memory merge 行为，避免重复生成相似记忆。

### 下一步

- 添加 streaming 或可取消的 task 执行。
- 添加更好的 task history 和错误状态。
- 添加内容来源 import adapters。
- 建立更明确的 companion state model。

### 更后面

- 添加语音输入 / 输出。
- 添加本地或 OpenAI-compatible Provider。
- 如果它真的能帮助学习信心，再加入更丰富的 avatar 行为。
- 等内容来源 adapter 稳定后，再考虑 plugin-like 内容源扩展。

## 结论

Airi 的价值在于证明：AI companion 产品会受益于清晰的 runtime 分层、Provider 抽象、角色状态、记忆系统和实时扩展能力。Nomi 应该借鉴这些原则，但保持产品范围更窄、更清楚：

Nomi 首先不是要成为一个通用虚拟伴侣。它要成为一个语言陪伴者，帮助学习者把真实内容转化成更自信、可复用、说得出口的表达。
