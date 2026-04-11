# 任务记忆分层调研

这份文档补充说明：如果 `agent-memory-service` 要支持单平台多 Agent、多平台多 Agent、多端多 Agent，任务记忆不应该只是一张“聊天记录表”，而应该采用“概要默认加载 + 详细按需加载”的分层模型。

## 背景问题

我们现在讨论的同步目标是“某个任务或需求的信息”，而不是单纯同步某个项目。

一个任务/需求通常会包含很多层次的信息：

- 业务背景
- 需求目标
- 需求细节
- 方案决策
- 子任务进度
- Agent 执行记录
- 文件、分支、PR、日志等产物引用

如果这些内容全部默认塞进 prompt，很快会出现几个问题：

- 上下文太大
- 噪音太多
- 关键状态被淹没
- 不同 Agent 看到的信息不一致
- 多端同步时传输和存储成本过高

所以更合理的方向是：默认只给 Agent 一层 compact memory，详细信息通过工具按需加载。

## 调研结论

当前主流记忆系统大致都在往这个方向走：

- 有一层始终可见或启动时加载的核心记忆
- 有一层不默认进入上下文、需要搜索或读取的详细记忆
- 有一个写入策略，决定哪些内容值得长期保留
- 有一个检索策略，决定什么时候加载哪部分详细内容

## 参考系统

### Claude Code

Claude Code 的记忆分为两类：

- `CLAUDE.md`：用户或团队写的长期指令
- auto memory：Claude 自己写的项目学习和经验

auto memory 也不是全部默认加载。它有一个 `MEMORY.md` 入口文件，启动时只加载前 200 行或 25KB。更详细的 topic 文件不会启动时加载，而是由 Claude 按需读取。

这非常接近我们要的结构：

- `MEMORY.md` 类似概要层
- topic 文件类似详细层
- 启动加载概要
- 需要时读取详细文件

参考：

- https://code.claude.com/docs/en/memory

### Cursor Memories

Cursor 的 Memories 是从 Chat 对话里自动生成的规则。它采用 sidecar 观察方式，让另一个模型在后台观察会话并提取记忆。后台生成的记忆需要用户批准后才保存。

这个设计值得借鉴的地方是：

- 记忆提取不一定要由主 Agent 自己完成
- 可以用 sidecar 做后台提炼
- 自动生成的记忆需要用户或策略确认，避免污染长期记忆

参考：

- https://docs.cursor.com/en/context/memories

### LangGraph

LangGraph 明确区分：

- short-term memory：线程级状态，用 checkpointer 存多轮会话状态
- long-term memory：跨会话的用户或应用级数据，用 store 存储和检索

它也支持 SQLite checkpointer，但官方定位更偏本地、小型、轻量使用；生产环境更推荐 Postgres 这类服务端存储。

这对我们的启发是：

- `session` 级状态和 `task` 长期记忆应该分开
- SQLite 适合本地 checkpoint/cache
- 服务端共享同步更适合 Postgres

参考：

- https://docs.langchain.com/oss/python/langgraph/add-memory
- https://reference.langchain.com/python/langgraph/checkpoints/

### Letta

Letta 的模型很清晰：

- core memory：始终放进上下文的 memory blocks
- archival memory：不在上下文里，作为外部长期记忆，通过工具按需搜索

它还强调 core memory 有长度限制，因为常驻上下文会消耗 token。

这基本就是我们应该采用的两层模式：

- `core/task summary memory`
- `archival/task detail memory`

参考：

- https://docs.letta.com/guides/ade/core-memory/
- https://docs.letta.com/guides/ade/archival-memory/

### Zep / Graphiti

Zep 使用 temporal knowledge graph，把聊天和业务数据融合成动态知识图谱，并且记录事实何时有效、何时失效。

它的重点不是只存“事实”，而是处理事实随时间变化的问题。

对我们有价值的启发是：

- 任务状态会变化，不能只追加事实
- 旧决策可能被新决策废弃
- 记忆需要 `valid_at / invalid_at` 或类似状态
- 需求同步里要能表达“这个结论现在还有效吗”

参考：

- https://help.getzep.com/v2/concepts
- https://www.getzep.com/product/knowledge-graph-mcp/

### AutoGen

AutoGen 的 Memory 协议强调三个动作：

- `add`
- `query`
- `update_context`

它支持向量数据库、Redis、Mem0 等不同后端，核心思想是：先查询相关记忆，再把结果注入 Agent 上下文。

对我们的启发是：

- 服务端不应该只提供“全量 context”
- 也应该提供按条件查询详细记忆的能力
- bridge 或 MCP 工具负责把查询结果注入当前 Agent

参考：

- https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/memory.html

## 为什么很多工具使用 SQLite

你看到很多工具使用 SQLite，这个现象是合理的。

SQLite 的优势是：

- 不需要单独服务器
- 单文件存储，易备份、易删除、易迁移
- 适合桌面端、CLI、插件、本地 Agent
- 适合本地 outbox、缓存、checkpoint
- 可以配合 FTS 做全文检索
- 可以配合 sqlite-vec 之类扩展做本地向量检索

官方 SQLite 文档也强调它是 serverless 的：进程直接读写磁盘文件，不需要中间数据库服务。

参考：

- https://www.sqlite.org/serverless.html

但 SQLite 也有明显边界：

- 不适合作为天然的多端共享数据库
- 不适合直接跨机器并发写
- 不适合当中心协作服务的唯一存储
- 同步、冲突解决、权限、审计都要另做

所以对我们这套系统来说，比较合理的结论是：

- 本地 bridge 可以用 SQLite
- 服务端仍然用 PostgreSQL
- SQLite 负责离线、本地缓存、outbox、快速检索
- PostgreSQL 负责多 Agent、多平台、多端共享真相源

## 推荐记忆模型

基于调研，我建议把任务记忆改成三层，而不是简单两层。

## 第一层：任务概要记忆

默认加载，短、小、稳定。

用于回答：

- 这个任务是什么
- 为什么做
- 当前做到哪
- 下一步是什么
- 有哪些关键约束

建议内容：

- `task_title`
- `task_goal`
- `business_context_summary`
- `current_status`
- `active_decisions`
- `active_constraints`
- `next_steps`
- `open_questions`

这层类似：

- Claude Code 的 `MEMORY.md`
- Letta 的 core memory
- Zep 的 memory context string

## 第二层：任务详细记忆

不默认加载，按需读取。

用于回答：

- 需求细节是什么
- 某个子任务为什么这么做
- 历史 checkpoint 是什么
- 某个决策的来源是什么
- 某个文件为什么改

建议按两种粒度组织：

- `requirement_section`
- `subtask`

例如：

```text
task
  ├── summary memory
  ├── requirement details
  │   ├── background
  │   ├── user stories
  │   ├── acceptance criteria
  │   └── edge cases
  └── subtasks
      ├── api-design
      ├── frontend
      ├── deploy
      └── testing
```

这层可以支持：

- 标题检索
- 标签检索
- 全文检索
- 后续向量检索

## 第三层：原始事件和产物引用

默认不加载，只做追溯和审计。

用于回答：

- 当时发生了什么
- 哪个 Agent 写的
- 哪个 session 写的
- 对应分支、提交、PR、日志在哪里

建议内容：

- `session_events`
- `conversation_entries`
- `checkpoints`
- `artifact_refs`

这一层不应该直接进入 prompt，除非用户或 Agent 明确要求追溯。

## 推荐加载策略

### 默认 context

每次任务开始，默认加载：

- project 概要
- task 概要
- 当前状态
- active decisions
- active constraints
- next steps
- 最近 1 到 3 条 checkpoint 摘要

### 按需加载

Agent 需要更多信息时，再调用工具加载：

- 某个需求章节
- 某个子任务详情
- 某个 checkpoint 原文
- 某个产物引用
- 某个历史决策来源

### 检索加载

当 Agent 不知道该读哪一块时，使用搜索：

- keyword search
- tag search
- 后续 semantic search

## 推荐写入策略

写入也不应该只有一种。

### 1. checkpoint 写入

每次 session 结束时写。

作用：

- 记录这轮发生了什么
- 更新 task summary
- 产生新的详细记忆

### 2. detail 写入

当需求细节、子任务、验收标准发生变化时写。

作用：

- 维护可按需读取的详细层

### 3. summary refresh

当详细层变化较多时，刷新概要层。

作用：

- 保证默认 context 简短且新鲜

### 4. event append

低成本追加事件。

作用：

- 保留追溯链路
- 不影响默认 context 大小

## 推荐数据关系

```text
project
  ├── project_summary_memory
  └── tasks
      ├── task_summary_memory
      ├── task_detail_memories
      ├── task_checkpoints
      ├── task_sessions
      └── artifact_refs
```

## 建议 API 方向

### 1. 默认加载概要

```text
GET /tasks/:taskId/context
```

返回：

- 项目概要
- 任务概要
- 当前状态
- 活跃决策
- 活跃约束
- 下一步
- 最近 checkpoint 摘要

### 2. 按需加载详细记忆

```text
GET /tasks/:taskId/memories?level=detail&section=requirement
GET /tasks/:taskId/memories?level=detail&subtask=api-design
```

### 3. 搜索详细记忆

```text
GET /tasks/:taskId/memories/search?q=callback%20url
```

### 4. 写 checkpoint

```text
POST /tasks/:taskId/checkpoints
```

### 5. 刷新 summary

```text
POST /tasks/:taskId/summary/refresh
```

## 对 SQLite 的建议

不要把 SQLite 当成最终中心库，但可以把它作为 bridge 的本地数据库。

推荐本地 SQLite 存：

- 当前 workspace 到 `taskId` 的绑定
- outbox
- 最近 context cache
- 本地 session events
- 本地全文索引
- 重试状态

推荐服务端 PostgreSQL 存：

- projects
- tasks
- task summary
- task detail memories
- checkpoints
- artifact refs
- agent sessions

这样既能吸收 SQLite 的优点，又不会牺牲多端同步。

## 当前采用方案

基于前面的调研，当前建议不再继续纠结“PostgreSQL 还是 SQLite 二选一”，而是直接采用组合方案：

- 服务端共享层：`PostgreSQL`
- 本地 bridge 层：`SQLite`

这意味着：

- 所有跨 Agent、跨平台、跨设备共享的数据都以服务端 `PostgreSQL` 为准
- 所有本地缓存、失败补偿、绑定关系、轻量检索都放在 bridge 的 `SQLite` 里

这样既符合主流系统的分层思路，也更适合我们要做的任务同步模型。

## 当前建议

我建议我们把之前的 `project / task / session` 模型再补成：

```text
project
  └── task
        ├── summary memory
        ├── detail memories
        ├── sessions
        ├── checkpoints
        └── artifact refs
```

然后把读取策略定成：

```text
默认读 summary memory
需要时读 detail memories
追溯时读 raw events / checkpoints
```

这个模型比单纯“两层记忆”更稳，因为它把“默认上下文”“按需细节”“追溯证据”分开了。

## 下一步

下一份设计文档建议写：

`task-sync-data-model-zh.md`

重点定义：

- `tasks`
- `task_summary_memory`
- `task_detail_memories`
- `task_sessions`
- `task_checkpoints`
- `artifact_refs`
- `local bridge sqlite cache`

其中最重要的是先定清楚：

- 哪些字段默认进入 context
- 哪些字段只能按需加载
- 哪些字段只用于审计和追溯
