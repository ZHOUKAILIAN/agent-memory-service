# 推荐记忆模型

这份文档是当前 `agent-memory-service` 后续设计的记忆模型总纲。它不是调研文档，而是当前建议采用的方案。

## 一句话结论

我们建议采用“任务中心的三层记忆模型”：

```text
默认加载任务概要
按需加载需求/子任务详细记忆
追溯时读取原始事件和产物引用
```

存储上采用：

```text
服务端共享层 -> PostgreSQL
本地 bridge 层 -> SQLite
```

## 要解决的场景

这套记忆模型服务于三类场景：

- 单平台多 Agent
- 多平台多 Agent
- 多端多 Agent

目标是让不同 Agent、不同平台、不同设备都能围绕同一个任务或需求继续工作。

## 核心对象层级

不要只按 `project` 存记忆。真正要同步的是某个任务或需求的状态。

推荐对象层级是：

```text
project
  └── task
        └── session
```

### `project`

长期工程背景。

例如：

- 仓库
- 产品线
- 长期项目

### `task`

一次明确的需求、缺陷、任务或工作项。

例如：

- 修复登录回调漏洞
- 实现订单页筛选功能
- 调查线上慢查询问题

### `session`

某一次具体的 Agent 运行或人机协作过程。

例如：

- 一次 Codex 会话
- 一次 Claude Code 会话
- 一次 OpenClaw 自动执行

## 三层记忆

围绕 `task`，记忆分成三层。

## 第一层：`summary memory`

默认加载。

它应该短、小、稳定，负责让下一个 Agent 立刻知道当前任务的关键信息。

建议包含：

- 任务标题
- 任务目标
- 业务背景概要
- 当前状态
- 活跃决策
- 活跃约束
- 下一步
- 未解决问题
- 可按需加载的 detail memory 索引

这一层对应：

- OpenClaw 的 daily memory 入口
- Claude Code 的 `MEMORY.md`
- Cline 的 `activeContext.md`

## 第二层：`detail memories`

默认不加载，按需读取。

它负责保存需求和子任务的详细上下文。

推荐使用混合颗粒度：

- 按 `requirement_section`
- 按 `subtask`

也就是：

```text
task
  ├── summary memory
  └── detail memories
      ├── requirement sections
      │   ├── background
      │   ├── acceptance criteria
      │   ├── edge cases
      │   └── api contract
      └── subtasks
          ├── backend
          ├── frontend
          ├── testing
          └── deployment
```

detail memory 可以通过：

- 标题
- tag
- section
- subtask
- keyword
- path glob
- 后续 semantic search

按需加载。

## 第三层：`raw events / checkpoints / artifact refs`

默认不进入上下文。

这一层用于追溯、审计和排障。

建议包含：

- session events
- conversation entries
- checkpoints
- branch
- commit hash
- PR 链接
- 日志链接
- 文档链接
- 重要文件路径

这一层不是给 Agent 默认读的，而是在需要追溯“为什么这么做”或者“当时发生了什么”时再加载。

## 默认加载策略

每次任务开始时，默认加载：

- project 概要
- task summary memory
- 当前状态
- 活跃决策
- 活跃约束
- 下一步
- 最近 1 到 3 条 checkpoint 摘要

不默认加载：

- 完整聊天
- 完整 diff
- 长日志
- 大段代码
- 历史全部 checkpoint
- 所有 detail memories

## 按需加载策略

当 Agent 需要更多信息时，再加载：

- 某个需求章节
- 某个子任务详情
- 某个历史决策来源
- 某个 checkpoint 原文
- 某个 artifact ref

典型工具可以是：

- `load_memory_detail`
- `search_task_memory`
- `load_checkpoint`
- `list_artifacts`

## 写入策略

写入采用“三段式同步”。

### 1. 开始读

任务开始前读取 summary context。

### 2. 过程中轻量记

任务进行中只记录关键事件，例如：

- 状态切换
- 决策形成
- 关键失败
- 关键产物产生

### 3. 结束写 checkpoint

session 结束时写结构化 checkpoint。

checkpoint 至少包含：

- 本轮做了什么
- 当前状态
- 关键决策
- 下一步
- 阻塞点
- 涉及文件
- 分支
- 来源 Agent

checkpoint 写入后，可以更新：

- `task_summary_memory`
- `task_detail_memories`
- `task_checkpoints`

## 自动记忆的审核状态

自动提取的长期记忆不应该直接污染正式记忆。

推荐增加 `memory_proposals`，状态包括：

- `proposed`
- `accepted`
- `rejected`
- `archived`

这样 sidecar 或 Agent 可以先提出记忆，后续由用户、规则或可信 Agent 确认。

## 存储分工

## 服务端：PostgreSQL

服务端是跨 Agent、跨平台、跨设备的共享真相源。

建议保存：

- projects
- tasks
- task summary memory
- task detail memories
- task sessions
- task checkpoints
- artifact refs
- memory proposals

## 本地：SQLite

本地 bridge 使用 SQLite。

建议保存：

- workspace bindings
- task bindings
- context cache
- outbox events
- local session events
- local search index
- retry state

SQLite 不作为多端共享真相源，只做本地缓存、离线补偿和快速检索。

## 推荐数据结构

```text
project
  ├── project_summary_memory
  └── tasks
      ├── task_summary_memory
      ├── task_detail_memories
      ├── task_sessions
      ├── task_checkpoints
      ├── artifact_refs
      └── memory_proposals
```

本地 bridge：

```text
local SQLite
  ├── workspace_bindings
  ├── task_bindings
  ├── context_cache
  ├── outbox_events
  ├── local_session_events
  └── local_search_index
```

## 推荐接入方式

使用统一 bridge，而不是每个 Agent 单独接服务端。

bridge 提供：

- CLI
- MCP server

不同 Agent 的接入方式：

- Codex：`AGENTS.md + MCP + hooks`
- Claude Code：`CLAUDE.md + MCP + hooks`
- OpenClaw：`CLI wrapper + 后续原生集成`

## 当前不做什么

第一版不建议做：

- 自动把完整聊天同步为长期记忆
- 把 SQLite 当多端共享中心库
- 把规则文件当动态任务状态
- 把所有 detail memories 默认塞进上下文
- 完全无审核地接受自动提取记忆

## 后续实现优先级

### Phase 1

先做中心数据模型：

- `tasks`
- `task_summary_memory`
- `task_detail_memories`
- `task_checkpoints`

### Phase 2

做本地 bridge：

- SQLite local cache
- outbox
- workspace/task binding
- CLI

### Phase 3

做 MCP 和 hooks：

- `read_context`
- `load_memory_detail`
- `checkpoint`
- `flush_outbox`

### Phase 4

做自动提取和审核：

- `memory_proposals`
- accepted/rejected 状态
- sidecar extraction
- 用户或可信 Agent 确认

## 最终口径

最终口径是：

`agent-memory-service` 不是聊天记录仓库，而是一个任务协作记忆层。

它的核心设计是：

- 以 task 为同步单位
- summary 默认加载
- detail 按需加载
- raw event 只追溯
- PostgreSQL 做共享真相源
- SQLite 做本地 bridge
- MCP + CLI 做统一接入
