# 多 Agent 折中同步设计

这份文档描述 `agent-memory-service` 的下一步推荐接入方式，目标不是只接 OpenClaw，而是同时支持 `Codex`、`Claude Code`、`OpenClaw` 这一类代码型 Agent。

## 设计目标

- 让多个 Agent 能共享同一个项目记忆
- 尽量减少用户手工说“同步一下”的次数
- 不把完整长对话、完整日志、完整 diff 全量塞进服务
- 保持 `v1` 后端简单，把复杂度放在接入层

## 设计结论

推荐采用一层独立的 `agent-memory-bridge`，放在 Agent 和 `agent-memory-service` 之间。

这层 bridge 提供两种入口：

- `MCP server`
- `CLI`

这样不同 Agent 可以按自己的能力接入：

- `Codex` 走 `MCP` 为主，必要时补 `CLI`
- `Claude Code` 走 `MCP + hooks`
- `OpenClaw` 走 `CLI wrapper` 或原生插件

服务端本身仍然只负责：

- 存项目
- 存 conversation
- 存 memory blocks
- 组装 context

服务端不负责：

- 监听每个 Agent 的运行过程
- 自动抓取聊天记录
- 自动做 AI 摘要

## 为什么不用“完全自动同步”

完全自动同步听起来方便，但落地上问题很多：

- 不同 Agent 暴露生命周期事件的方式不一样
- 原始对话很容易混入日志、diff、堆栈、敏感信息
- 内容会快速膨胀，后续 Agent 反而更难读

所以更合适的模式是“折中同步”：

- 开始时自动读取上下文
- 过程中只记录轻量事件
- 结束时统一写 checkpoint
- 长期信息再提炼成 `memory_blocks`

## 推荐同步模式

### 1. 任务开始前

bridge 自动做两件事：

1. 解析当前项目对应的 `projectId`
2. 调用 `GET /projects/:id/context`

然后把结果注入给当前 Agent，作为本轮任务的背景。

### 2. 任务进行中

只记录轻量事件，不记录每一句完整聊天。

推荐保留的事件包括：

- 本次 session 开始
- 当前分支名
- 用户当前目标的一句话描述
- 关键工具动作摘要
- 关键文件变更摘要

不推荐默认同步的内容包括：

- 超长终端输出
- 完整 diff
- 大段源码
- 重复工具日志
- 敏感配置和密钥

### 3. 任务结束后

bridge 生成一份结构化 checkpoint，再写入服务。

checkpoint 至少应包含：

- 当前用户目标
- 本轮完成了什么
- 当前状态
- 关键决策
- 下一步待办
- 阻塞点
- 涉及文件列表
- 分支名
- 来源 Agent

然后 bridge 负责把 checkpoint 拆成两类数据：

- 一条 `conversation_entry`
- 若干条 `memory_blocks`

## 推荐架构

```text
Codex / Claude Code / OpenClaw
                |
                v
        agent-memory-bridge
        |      |        |
        |      |        +-- local outbox
        |      +----------- project resolver/cache
        +------------------ MCP + CLI
                |
                v
        agent-memory-service
                |
                v
             PostgreSQL
```

## Bridge 应该做什么

`agent-memory-bridge` 建议承担下面这些职责。

### 1. 项目解析

用户不应该自己记 `projectId`。

bridge 应该根据以下信息自动定位项目：

- `repo_url`
- `workspace_path`
- `project_name`
- 可选 `branch`

如果服务端已有项目就复用，没有就创建。

### 2. 本地缓存

bridge 应该把解析出的 `projectId` 缓存在工作区本地，例如：

```text
.agent-memory/project.json
```

推荐结构：

```json
{
  "project_id": "prj_abc123",
  "repo_url": "https://github.com/example/repo",
  "workspace_path": "/workspace/repo",
  "updated_at": "2026-04-11T12:00:00.000Z"
}
```

这个文件建议默认加入 `.gitignore`。

### 3. 失败补偿

如果同步时网络异常，不应该丢数据。

bridge 应该先把待同步内容写到：

```text
.agent-memory/outbox/*.json
```

成功后再删除。这样就算服务暂时不可用，下一次也能补传。

### 4. 内容裁剪

bridge 应该在本地先做一次裁剪：

- 截断过长文本
- 过滤敏感信息
- 把长日志转成摘要
- 把一次任务结束整理成结构化 checkpoint

也就是说，压缩动作应主要发生在客户端，而不是服务端。

## 为什么要同时提供 MCP 和 CLI

因为三类 Agent 的集成能力并不一样。

### MCP 的优势

- 对支持 MCP 的 Agent 来说接入更自然
- 可以暴露标准工具和资源
- 更适合“任务开始读 context、任务中手动触发 checkpoint”

### CLI 的优势

- 适合 wrapper、hook、脚本、CI
- 不依赖 Agent 一定支持 MCP
- 更适合从外部运行时接入

所以推荐不是二选一，而是两者都做：

- `agent-memory-mcp`
- `agent-memory` CLI

## 面向不同 Agent 的建议接入方式

### `Codex`

推荐优先使用 `MCP`。

做法：

- 在 Codex 配置里注册 `agent-memory-mcp`
- 在项目级说明文件里要求任务开始先读 context
- 在阶段性收尾时调用 checkpoint 工具

Codex 侧不强依赖底层 runtime hook，而是依赖：

- MCP 工具
- 项目说明
- 必要时的 wrapper 命令

这样实现更稳，不容易被某个特定运行时细节绑死。

如果后面需要更高自动化，也可以再补 Codex hooks，把读取 context 和写 checkpoint 的动作部分前移到运行时事件里。

### `Claude Code`

推荐使用 `MCP + hooks`。

做法：

- 用 MCP 提供读写工具
- 用 Claude Code hooks 在 session 开始和结束时自动触发脚本

其中 Claude Code 的 hooks 更适合自动做：

- Session Start 时读取 context
- Stop / SubagentStop / Session End 时写 checkpoint

这样用户平时基本不需要额外提醒它“去同步”。

### `OpenClaw`

推荐先走 `CLI wrapper`。

做法：

- 外层 wrapper 启动任务前先 `agent-memory context`
- 任务结束后执行 `agent-memory checkpoint`
- 有明确状态变化时执行 `agent-memory note`

如果后面 OpenClaw 提供更稳定的插件机制，再补原生集成。

## 推荐提供的 MCP 工具

建议 bridge 暴露这几个工具：

- `resolve_project`
- `read_context`
- `record_event`
- `checkpoint`
- `upsert_memory_block`

其中最重要的是：

- `read_context`
- `checkpoint`

因为这两个工具正好对应折中模式里的“开始读”和“结束写”。

## 推荐提供的 CLI 命令

建议最少提供这些命令：

- `agent-memory init`
- `agent-memory context`
- `agent-memory checkpoint`
- `agent-memory note`
- `agent-memory flush-outbox`

示意：

```bash
agent-memory init --repo-url https://github.com/example/repo
agent-memory context
agent-memory checkpoint --status in_progress --summary "完成登录页鉴权修复"
agent-memory note --type decisions --title "统一使用服务端回调校验"
agent-memory flush-outbox
```

## 服务端建议新增的 API

为了让 bridge 更好用，建议在 `agent-memory-service` 上增加两个能力。

### 1. `POST /projects/resolve`

目标是让调用方不需要手工持有 `projectId`。

输入建议包含：

- `name`
- `repo_url`
- `workspace_path`
- `source`

行为建议是：

- 如果匹配到已有项目，直接返回
- 如果没有匹配到，就创建一个新项目

### 2. `POST /projects/:id/checkpoints`

目标是让客户端一次提交完整交接，不用自己拆很多次请求。

输入建议包含：

- `source_agent`
- `branch`
- `summary`
- `status`
- `completed`
- `decisions`
- `todos`
- `blockers`
- `files`
- `raw_notes`

服务端负责：

- 写一条 `conversation_entry`
- 生成一组标准 `memory_blocks`

这会比客户端自己手工发多次请求更一致。

## 建议的数据落点

推荐在工作区放一个本地目录：

```text
.agent-memory/
```

包含：

- `project.json`
- `outbox/`
- `config.json`

其中：

- `project.json` 存项目绑定结果
- `outbox/` 存待补传事件
- `config.json` 存 bridge 配置，例如服务地址、默认 source、过滤规则

## 安全与体积控制

这部分应该在 `v1.1` 一开始就做，不要等到后面再补。

### 1. 敏感信息过滤

默认不上传：

- token
- password
- cookie
- 私钥
- `.env` 内容

### 2. 体积控制

默认做限制：

- 单条 event 长度上限
- 单次 checkpoint 文件数上限
- 单次同步日志截断上限

### 3. 默认摘要优先

能上传摘要就不要上传原文。

只有在明确需要审计时，才保留更多原始信息。

## 推荐分阶段落地

### Phase 1

先做最小闭环：

- `POST /projects/resolve`
- `agent-memory` CLI
- `checkpoint` 提交格式
- 本地 `.agent-memory/outbox`

这个阶段先让 `OpenClaw` 和 shell wrapper 能稳定用起来。

### Phase 2

再做：

- `agent-memory-mcp`
- `read_context`
- `checkpoint`
- `upsert_memory_block`

这个阶段让 `Codex` 和 `Claude Code` 开始通过 MCP 接入。

### Phase 3

最后再补：

- Claude Code hooks 示例
- Codex 项目模板说明
- 更完整的红线过滤和体积控制

## 这个设计解决了什么问题

它主要解决四个现实问题：

1. 用户不需要自己记 `projectId`
2. 不需要每次手动说“把这段写进去”
3. 不会把所有原始聊天和日志无脑塞进服务
4. 不同 Agent 可以共享同一套接入层

## 当前建议

如果按收益和实现成本排序，最值得先做的是：

1. `POST /projects/resolve`
2. `checkpoint` 聚合接口
3. `agent-memory` CLI
4. `agent-memory-mcp`

先把“项目解析 + 结束交接”这条链打通，后面再逐步自动化。

## 参考

- Codex MCP: https://developers.openai.com/codex/mcp
- Codex hooks: https://developers.openai.com/codex/hooks
- Claude Code MCP: https://docs.anthropic.com/en/docs/claude-code/mcp
- Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
