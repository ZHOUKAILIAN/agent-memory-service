# Agent 同步流程说明

这份文档专门解释 `agent-memory-service` 是怎么工作的，以及像 OpenClaw 这样的 Agent 应该怎么把上下文写进来、再读出去。

## 一句话理解

把它想成一个给多个 Agent 共用的“项目记事本”。

- `projectId` 是记事本编号
- `conversation_entries` 存原始对话和事件
- `memory_blocks` 存长期有效的结构化重点
- `context` 是给下一个 Agent 的精简 briefing

## 整体流程

一个完整循环通常是这样：

1. 第一次接入时创建项目，拿到 `projectId`
2. OpenClaw 把这个 `projectId` 保存到自己的任务状态里
3. 每次任务开始前，先调用 `GET /projects/:id/context`
4. 每次一轮对话完成后，写一条 `conversation`
5. 每次出现明确决策、状态、约束、待办变化时，写一条 `memory-block`
6. 下一个 Agent 再使用同一个 `projectId` 读取 `context`

也就是：

```text
create project -> save projectId -> read context -> write conversations -> write memory blocks -> next agent reads context
```

## `projectId` 从哪来

`projectId` 由服务端生成，第一次创建项目时返回。

### 创建项目

```bash
curl -X POST http://localhost:3000/projects \
  -H "content-type: application/json" \
  -d '{
    "name": "openclaw-demo",
    "description": "OpenClaw 和其他 agent 共用的记忆空间",
    "repo_url": "https://github.com/your-org/your-repo"
  }'
```

返回大概会是：

```json
{
  "project": {
    "id": "prj_abc123",
    "name": "openclaw-demo",
    "description": "OpenClaw 和其他 agent 共用的记忆空间",
    "repo_url": "https://github.com/your-org/your-repo",
    "created_at": "2026-04-11T12:00:00.000Z",
    "updated_at": "2026-04-11T12:00:00.000Z"
  }
}
```

这里的 `prj_abc123` 就是后续所有同步都要用的 `projectId`。

## `projectId` 要保存在哪里

当前 `v1` 没有实现按 `name` 或 `repo_url` 自动查回项目，所以调用方必须自己保存 `projectId`。

最常见的保存位置有：

- OpenClaw 的任务状态
- 任务配置文件
- 数据库里的任务记录
- 某个 repo 对应的本地缓存

推荐最少保存成这样：

```json
{
  "memory_project_id": "prj_abc123"
}
```

## 文本到底存在哪里

这套服务里，文本分两层。

### 1. 原始内容：`conversation_entries`

这里存的是原始事件流，比如：

- 用户消息
- assistant 回复
- 工具输出摘要
- 某次任务结束说明

写入接口：

```text
POST /projects/:id/conversations
```

例子：

```bash
curl -X POST http://localhost:3000/projects/prj_abc123/conversations \
  -H "content-type: application/json" \
  -d '{
    "source": "openclaw",
    "entry_type": "assistant_message",
    "actor": "assistant",
    "content": "我刚刚定位到 callback URL 校验缺失。",
    "summary": "定位到 callback URL 校验缺失",
    "tags": ["openclaw", "auth", "debug"]
  }'
```

结构大概是：

```json
{
  "id": "cev_xxx",
  "project_id": "prj_abc123",
  "source": "openclaw",
  "entry_type": "assistant_message",
  "actor": "assistant",
  "content": "完整原文",
  "summary": "一句话摘要",
  "tags": ["openclaw", "auth", "debug"],
  "created_at": "..."
}
```

### 2. 结构化重点：`memory_blocks`

这里存的是长期有效的信息，不是完整聊天。

推荐写进来的内容包括：

- 当前状态
- 关键决策
- 明确约束
- 下一步待办
- 稳定背景信息

写入接口：

```text
POST /projects/:id/memory-blocks
```

例子：

```bash
curl -X POST http://localhost:3000/projects/prj_abc123/memory-blocks \
  -H "content-type: application/json" \
  -d '{
    "block_type": "decisions",
    "title": "服务端校验 callback URL",
    "content": "跳转前必须在服务端校验 callback URL，不信任客户端传参。",
    "source": "openclaw",
    "importance": 0.95
  }'
```

结构大概是：

```json
{
  "id": "mem_xxx",
  "project_id": "prj_abc123",
  "block_type": "decisions",
  "title": "服务端校验 callback URL",
  "content": "跳转前必须在服务端校验 callback URL，不信任客户端传参。",
  "source": "openclaw",
  "importance": 0.95,
  "created_at": "...",
  "updated_at": "..."
}
```

## 服务怎么“压缩”上下文

当前 `v1` 没有内置 AI 自动压缩。

也就是说：

- 服务不会自己调用模型把长对话压成摘要
- 压缩动作由调用方完成
- 调用方负责写 `summary`
- 调用方负责把长期重点写进 `memory_blocks`

当前读取逻辑是：

- 如果某条 conversation 有 `summary`，优先返回 `summary`
- 如果没有 `summary`，回退到 `content`
- `memory_blocks` 会按 `importance` 和 `updated_at` 排序

所以推荐做法是：

- `content`：保留原文或较完整内容
- `summary`：写一句简短摘要
- `memory_blocks`：写长期重点

## Agent 怎么获取上下文

读取接口是：

```text
GET /projects/:id/context?limit=10
```

例子：

```bash
curl "http://localhost:3000/projects/prj_abc123/context?limit=10"
```

返回结构大概是：

```json
{
  "project": {
    "id": "prj_abc123",
    "name": "openclaw-demo",
    "description": "OpenClaw 和其他 agent 共用的记忆空间",
    "repo_url": "https://github.com/your-org/your-repo"
  },
  "memory": {
    "background": [],
    "constraints": [],
    "decisions": [
      {
        "id": "mem_xxx",
        "title": "服务端校验 callback URL",
        "content": "跳转前必须在服务端校验 callback URL，不信任客户端传参。",
        "source": "openclaw",
        "importance": 0.95,
        "updated_at": "..."
      }
    ],
    "todo": [],
    "status": []
  },
  "conversation": {
    "recent_entries": [
      {
        "id": "cev_xxx",
        "summary": "定位到 callback URL 校验缺失",
        "created_at": "..."
      }
    ]
  },
  "generated_at": "..."
}
```

下一个 Agent 真正该读取的是这份 `context`，而不是完整数据库内容。

## 推荐给 OpenClaw 的接入点

如果你要接 OpenClaw，最少做这 3 个 hook：

### `before_run`

在任务开始前读取：

```text
GET /projects/:id/context
```

### `after_response`

在 assistant 完成一轮输出后写：

```text
POST /projects/:id/conversations
```

### `after_state_change`

当出现明确决策、状态、待办变化时写：

```text
POST /projects/:id/memory-blocks
```

## 一个最小同步闭环

```text
1. OpenClaw 创建项目，拿到 projectId
2. OpenClaw 保存 projectId
3. OpenClaw 每次开始任务前读取 context
4. OpenClaw 每次输出后写 conversation
5. OpenClaw 每次有重要结论时写 memory block
6. 下次继续任务时复用同一个 projectId
```

## 什么时候不该把东西直接塞进来

不建议把这些内容长期原样同步成上下文：

- 超长终端日志
- 完整 diff
- 大段代码原文
- 重复工具输出
- 大量堆栈报错

更推荐的做法是：

- conversation 写原文加摘要
- memory blocks 只写长期重点
- 下游 agent 只读 `context`

## 当前公网部署示例

如果你已经按照当前服务器部署方式接入，那么基地址形如：

```text
http://<host>:32117/agent-memory
```

对应的健康检查是：

```text
GET /agent-memory/health
```

其余接口只是统一加上这个前缀，例如：

```text
POST /agent-memory/projects
GET /agent-memory/projects/:id/context
```

## 当前版本的限制

- `v1` 没有项目查找接口，所以必须自己保存 `projectId`
- `v1` 没有内置 AI 自动摘要
- `v1` 没有 auth 和权限控制

## 后续建议

如果准备长期给 OpenClaw 用，下一步最值得加的两个能力是：

1. 项目查找接口，例如按 `repo_url` 或 `name` 查项目
2. 自动 compact 流程，把最近 conversation 自动提炼成 memory blocks
