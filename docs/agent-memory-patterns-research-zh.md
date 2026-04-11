# Agent 记忆模式调研

这份文档专门调研 OpenClaw、Claude Code、Codex、Cline、Windsurf、Continue 等 Agent 或 AI IDE 的记忆处理方式，并提炼哪些设计可以借鉴到 `agent-memory-service`。

目标不是照搬某一个产品，而是找到适合“单平台多 Agent、多平台多 Agent、多端多 Agent 同步同一个任务/需求”的通用模式。

## 总结结论

当前主流做法大致可以归纳成 6 条：

1. 默认上下文只放概要和索引
2. 详细记忆按主题、文件、子任务或检索结果按需加载
3. 原始对话和可复用记忆分开存
4. 本地记忆适合个人机器，跨端共享需要中心服务
5. session 开始、结束、压缩前是最重要的同步时机
6. 自动记忆需要过滤、审批或置信度控制，否则容易污染长期记忆

这和我们现在的方向一致：

```text
默认读 summary memory
需要时读 detail memories
追溯时读 raw events / checkpoints
服务端用 PostgreSQL
本地 bridge 用 SQLite
```

## OpenClaw

OpenClaw 的设计非常值得借鉴，因为它本身就是面向 Agent workspace 和长期协作的。

### 它怎么做

OpenClaw 的记忆主要分两类：

- daily memory
- long-term memory

daily memory 会记录当天做了什么，类似工作日志。long-term memory 用来存稳定事实、用户偏好、项目约定、重要决策。

OpenClaw 不会把全部记忆都塞进上下文。它的加载策略更像：

- session 启动时加载 today 和 yesterday 的 daily memory
- 通过向量索引检索 long-term memory
- compaction 之前主动 flush，避免压缩时丢失重要内容

OpenClaw 的 workspace 里也有两个值得借鉴的点：

- workspace 里的 `logs/`、`memory/`、`plans/` 等目录用于保存可复用工作产物
- 原始 session transcripts 存在单独位置，不直接放进 workspace

### 可以借鉴什么

我们可以借鉴 5 点：

1. `task_summary_memory` 类似 OpenClaw 的 daily memory 索引入口
2. `task_detail_memories` 类似 long-term memory 和 topic memory
3. `task_checkpoints` 类似 daily work log
4. 原始 session events 不默认进入上下文，只用于追溯
5. 在 compaction 前或 session 结束前强制写 checkpoint

### 不应该照搬什么

OpenClaw 的记忆更偏单 Agent workspace。我们要支持多 Agent、多平台、多端，所以不能只依赖本地 workspace 文件。

适合我们的改造是：

- 本地 workspace 仍然保留缓存和 outbox
- 中心服务保存共享任务记忆
- 不同 Agent 通过同一个 `taskId` 读写同一份任务状态

参考：

- https://openclawlab.com/en/docs/concepts/memory/
- https://openclawlab.com/en/docs/concepts/agent-workspace/

## Claude Code

Claude Code 的记忆分为手工和自动两类。

### 它怎么做

Claude Code 有：

- `CLAUDE.md`
- auto memory

`CLAUDE.md` 更像团队或项目级的长期规则，适合放固定约定。auto memory 用于 Claude 自己学习项目经验。

auto memory 的结构也很接近“概要 + 详细”：

- `MEMORY.md` 是主索引
- topic 文件是详细记忆
- 启动时只加载 `MEMORY.md` 的前 200 行或 25KB
- topic 文件按需读取

另外，Claude Code auto memory 默认是 machine-local，也就是本地机器上的记忆，不会天然跨设备共享。

### 可以借鉴什么

1. 用 `summary/index` 文件作为默认上下文入口
2. 详细内容拆成 topic 文件或 topic records
3. 默认加载有明确大小限制
4. 本地自动记忆和共享记忆要分开

### 对我们的启发

我们的 `task_summary_memory` 应该像 `MEMORY.md`，负责告诉 Agent：

- 当前任务是什么
- 哪些详细块值得按需读取
- 当前状态和下一步是什么

详细记忆则通过：

- `requirement_section`
- `subtask`
- `topic`
- `tags`

来按需加载。

参考：

- https://code.claude.com/docs/en/memory

## Codex

Codex 当前更偏“项目指令 + hooks + MCP”这一套，而不是内建一个像 OpenClaw 那样的完整自动记忆系统。

### 它怎么做

Codex 的持久项目约定主要放在 `AGENTS.md`。它也支持 hooks，能在 session lifecycle 和 tool lifecycle 的节点执行命令。

这意味着 Codex 更适合作为外部 memory service 的消费者：

- 通过 `AGENTS.md` 告诉 Codex 如何使用 memory
- 通过 MCP 暴露 `read_context`、`checkpoint` 等工具
- 通过 hooks 在 session start、user prompt、stop 等节点做自动读写

### 可以借鉴什么

1. 用项目说明文件定义“怎么使用记忆”
2. 用 hooks 在关键生命周期同步
3. 用 MCP 作为跨工具的标准接入层

### 对我们的启发

我们不要假设 Codex 自己会维护长期任务记忆。更稳的方式是：

- `agent-memory-service` 做中心记忆
- `agent-memory-mcp` 给 Codex 暴露读写工具
- `AGENTS.md` 写清楚任务开始读 context、结束写 checkpoint
- hooks 做自动化补强

参考：

- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/hooks
- https://developers.openai.com/codex/mcp

## Cline

Cline 的 Memory Bank 是很典型的文件化项目记忆。

### 它怎么做

Cline Memory Bank 通常包含这些文件：

- `projectbrief.md`
- `productContext.md`
- `activeContext.md`
- `systemPatterns.md`
- `techContext.md`
- `progress.md`

这些文件不是无差别聊天记录，而是把项目知识拆成稳定结构：

- 项目目标
- 产品背景
- 当前上下文
- 系统模式
- 技术上下文
- 进度

它的重点是：下一轮 Agent 先读这些文件，就能恢复工作状态。

### 可以借鉴什么

1. 任务记忆需要固定结构
2. `activeContext` 和 `progress` 非常适合作为 checkpoint 来源
3. `projectbrief` 和 `productContext` 适合映射为项目/任务概要
4. 文件化结构适合导出、备份和人工编辑

### 对我们的启发

我们的数据模型可以对应为：

- `projectbrief` -> `project_summary_memory`
- `productContext` -> `business_context_summary`
- `activeContext` -> `task_summary_memory.current_state`
- `progress` -> `task_checkpoints`
- `systemPatterns` -> `constraints / decisions`
- `techContext` -> `task_detail_memories`

参考：

- https://docs.cline.bot/prompting/cline-memory-bank
- https://docs.cline.bot/features/focus-chain

## Windsurf

Windsurf 的记忆也分成不同层级。

### 它怎么做

Windsurf 的 Memories 是 Cascade 从对话里自动生成的偏好和事实。它们通常是本地的，不适合当团队共享真相源。

更适合团队共享的是：

- Rules
- AGENTS.md

Rules 可以有不同激活方式，例如 always on、model decision、glob、manual 等。

### 可以借鉴什么

1. 自动记忆适合个性化和本地偏好
2. 团队共享规则应该放到显式规则文件或中心服务
3. 详细记忆可以带激活条件，而不是全部默认加载

### 对我们的启发

`task_detail_memories` 可以支持类似激活条件：

- `always`
- `manual`
- `keyword`
- `path_glob`
- `agent_decision`

这样 Agent 在处理某些文件或主题时，才加载相关详细记忆。

参考：

- https://docs.windsurf.com/windsurf/cascade/memories
- https://docs.windsurf.com/windsurf/cascade/rules

## Cursor

Cursor 的 Memories 也是自动从 Chat 对话中提取。它的设计重点是：由后台模型观察对话并提取候选记忆，保存前需要用户批准。

### 可以借鉴什么

1. sidecar 可以负责从对话中提取记忆
2. 自动生成的长期记忆最好经过确认
3. 不是所有对话都应该直接变成长期记忆

### 对我们的启发

未来可以加一个 `memory-review` 状态：

- `proposed`
- `accepted`
- `rejected`
- `archived`

自动生成的 detail memory 或长期 decision 先进入 `proposed`，再由用户、策略或可信 Agent 确认。

参考：

- https://docs.cursor.com/en/context/memories

## Continue

Continue 的设计重点不是自动记忆，而是 rules 和 context providers。

### 它怎么做

Continue 可以通过规则文件管理项目级指令，也可以通过 context providers 给模型提供特定上下文。

这类机制更像“记忆入口”和“上下文选择器”，而不是自动长期记忆库。

### 可以借鉴什么

1. rules 适合存团队共享约定
2. context provider 适合把外部 memory 注入模型
3. 记忆服务应该暴露标准读取接口，而不是要求 Agent 直接理解数据库

参考：

- https://docs.continue.dev/customize/rules
- https://docs.continue.dev/customize/context-providers

## 可复用设计模式

综合这些系统，适合我们复用的模式如下。

### 1. 概要索引层

类似：

- OpenClaw daily memory
- Claude Code `MEMORY.md`
- Cline `activeContext.md`

在我们这里对应：

- `task_summary_memory`

默认进入 context。

### 2. 详细主题层

类似：

- Claude Code topic files
- OpenClaw long-term memory
- Cline 多个 memory bank 文件

在我们这里对应：

- `task_detail_memories`

按需加载。

### 3. 原始事件层

类似：

- OpenClaw session transcripts
- Cline checkpoints
- agent execution logs

在我们这里对应：

- `task_sessions`
- `task_checkpoints`
- `conversation_entries`
- `artifact_refs`

追溯时加载。

### 4. 生命周期同步

核心触发点：

- session start
- user prompt submitted
- compaction before
- tool completed
- session stop

在我们这里对应：

- 开始读 context
- 过程中轻量记 event
- compaction 前 flush
- 结束写 checkpoint

### 5. 本地和中心分层

本地层：

- SQLite
- cache
- outbox
- workspace binding
- local search index

中心层：

- PostgreSQL
- shared task state
- shared memory
- checkpoints
- artifact refs

## 不应该照搬的地方

### 1. 不要只做本地记忆

Claude Code auto memory 和 Windsurf Memories 更偏本地机器。我们要做多端同步，所以必须有中心服务。

### 2. 不要把规则文件当任务状态

`CLAUDE.md`、`AGENTS.md`、rules 适合存长期约定，不适合存动态任务进度。

### 3. 不要把完整对话当长期记忆

聊天记录可以用于追溯，但不能默认作为 reusable memory。

### 4. 不要完全信任自动提取

自动 memory extraction 很容易写入错误、过时或低价值信息，所以需要：

- 状态
- 来源
- 置信度
- 审批
- 过期机制

## 对当前项目的建议

基于这次调研，建议后续数据模型按下面方向设计：

```text
project
  └── task
        ├── task_summary_memory
        ├── task_detail_memories
        ├── task_sessions
        ├── task_checkpoints
        ├── artifact_refs
        └── memory_proposals
```

同时本地 bridge 使用：

```text
local SQLite
  ├── workspace_bindings
  ├── context_cache
  ├── outbox_events
  ├── local_session_events
  └── local_search_index
```

## 建议优先实现顺序

### Phase 1：结构化任务记忆

- `tasks`
- `task_summary_memory`
- `task_detail_memories`
- `task_checkpoints`

先打通任务级记忆的中心模型。

### Phase 2：本地 bridge

- SQLite local cache
- outbox
- workspace 到 task 绑定
- CLI

先让不同 Agent 能通过命令接入。

### Phase 3：MCP 和 hooks

- MCP `read_context`
- MCP `load_memory_detail`
- MCP `checkpoint`
- hooks 示例

让 Codex、Claude Code、OpenClaw 更自动地使用这套记忆。

### Phase 4：记忆提取和审核

- `memory_proposals`
- accepted/rejected 状态
- 自动提取
- 用户或可信 Agent 确认

避免长期记忆被低质量信息污染。

## 最终建议

最值得借鉴的是 OpenClaw 和 Claude Code 的分层加载方式，以及 Cline 的结构化 Memory Bank。

落到我们这里，建议明确成一句话：

`默认加载任务概要，按需加载需求/子任务详情，追溯时读取原始事件；本地 SQLite 做缓存和 outbox，服务端 PostgreSQL 做共享真相源。`
