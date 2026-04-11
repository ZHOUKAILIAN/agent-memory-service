# 已部署服务使用说明

本文档对应当前已经部署在服务器上的 `agent-memory-service`。

## 服务地址

- 公网 IP：`60.204.233.73`
- 对外基地址：`http://60.204.233.73:32117/agent-memory`
- 健康检查：`http://60.204.233.73:32117/agent-memory/health`

快速验证：

```bash
curl http://60.204.233.73:32117/agent-memory/health
```

预期返回：

```json
{"status":"ok"}
```

## 你最推荐的接入方式

当前最推荐先走 `CLI-first`：

1. 你的本地 agent 只需要调用 `apps/cli`
2. `apps/cli` 会把当前工作区绑定到远端 `project + task`
3. 本地状态落在工作区里的 `.agent-memory/bridge.sqlite`
4. 远端共享状态落在服务器 PostgreSQL

这套方式最适合：

- Codex
- Claude Code
- OpenClaw
- 你自己写的 shell / wrapper 脚本

## CLI 用法

先在你本地项目目录里设置服务地址：

```bash
export AGENT_MEMORY_BASE_URL="http://60.204.233.73:32117/agent-memory"
```

第一次把当前项目和当前任务绑定到服务：

```bash
pnpm -C apps/cli start resolve --workspace "$PWD" \
  --project-name "openclaw-sync-demo" \
  --project-description "OpenClaw / Codex / Claude Code shared memory demo" \
  --name "实现任务记忆同步" \
  --description "验证多平台多 agent 同步同一个需求"
```

你会拿到类似结果：

```json
{
  "workspacePath": "/your/workspace/path",
  "projectId": "prj_xxx",
  "projectName": "openclaw-sync-demo",
  "taskId": "tsk_xxx",
  "taskTitle": "实现任务记忆同步",
  "repoUrl": null,
  "createdAt": "2026-04-11T00:00:00.000Z",
  "updatedAt": "2026-04-11T00:00:00.000Z"
}
```

这里最重要的是：

- `projectId`：共享项目容器
- `taskId`：当前需求 / 当前任务容器

读取当前任务上下文：

```bash
pnpm -C apps/cli start context --workspace "$PWD"
```

写入一条 checkpoint：

```bash
pnpm -C apps/cli start checkpoint --workspace "$PWD" \
  --summary "已经完成任务记忆服务部署" \
  --status "in_progress" \
  --decision "先走 CLI-first，再考虑 MCP" \
  --constraint "目前服务还没有鉴权" \
  --next-step "让 OpenClaw 接入 resolve/context/checkpoint"
```

如果当时网络异常，本地会先进入 outbox，之后补传：

```bash
pnpm -C apps/cli start flush-outbox --workspace "$PWD"
```

## HTTP 直接调用示例

如果你不想先接 CLI，也可以直接走 HTTP。

### 1. resolve project

```bash
curl -X POST "http://60.204.233.73:32117/agent-memory/projects/resolve" \
  -H "content-type: application/json" \
  -d '{
    "name": "openclaw-sync-demo",
    "description": "OpenClaw / Codex / Claude Code shared memory demo"
  }'
```

### 2. resolve task

把上一步返回的 `project.id` 填进去：

```bash
curl -X POST "http://60.204.233.73:32117/agent-memory/tasks/resolve" \
  -H "content-type: application/json" \
  -d '{
    "project_id": "prj_xxx",
    "title": "实现任务记忆同步",
    "description": "验证多平台多 agent 同步同一个需求",
    "source": "openclaw"
  }'
```

### 3. 写 checkpoint

把 `task.id` 填进去：

```bash
curl -X POST "http://60.204.233.73:32117/agent-memory/tasks/tsk_xxx/checkpoints" \
  -H "content-type: application/json" \
  -d '{
    "source": "openclaw",
    "summary": "OpenClaw 已接入任务同步",
    "content": "OpenClaw 已能写入 checkpoint",
    "current_status": "in_progress",
    "decisions": ["先同步摘要和状态"],
    "constraints": ["暂时不做全文向量检索"],
    "next_steps": ["增加按需加载 detail memory"]
  }'
```

### 4. 读取 task context

```bash
curl "http://60.204.233.73:32117/agent-memory/tasks/tsk_xxx/context"
```

返回结构重点如下：

```json
{
  "project": {
    "id": "prj_xxx",
    "name": "openclaw-sync-demo"
  },
  "task": {
    "id": "tsk_xxx",
    "title": "实现任务记忆同步"
  },
  "summary": {
    "summary": "当前任务的摘要",
    "current_status": "in_progress",
    "active_decisions": [],
    "active_constraints": [],
    "next_steps": []
  },
  "checkpoints": {
    "recent": []
  },
  "generated_at": "2026-04-11T00:00:00.000Z"
}
```

## 给 OpenClaw / Codex / Claude Code 的建议接入方式

推荐统一成一个很薄的 adapter：

1. 开始处理任务前，先调用 `resolve`
2. 进入任务时，先调用 `context`
3. 阶段性完成后，调用 `checkpoint`
4. 网络失败时，本地先缓存，空闲时再 `flush-outbox`

也就是说，不需要先做 MCP。

如果你的 agent 能调用 shell，那么直接复用 CLI 是最快的。
如果你的 agent 更容易发 HTTP，那就直接打上面的接口。

## 当前已知限制

- 现在还是无鉴权版本，不适合直接暴露给不可信公网流量
- 当前是 `summary + recent checkpoints` 模型，还没有做 detail memory 按需拉取
- 当前更适合同步任务摘要、状态、决策、约束、下一步，不适合把整段原始长文本持续塞进来
