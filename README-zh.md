# agent-memory-service

[English](README.md)

`agent-memory-service` 是一个面向 Agent CLI 的记忆桥，专门解决“运行时一变，上下文连续性就断掉”的问题。

它聚焦一个非常具体的场景：你先把工作区绑定到某个 task，随后切换 Codex 的 provider 或 base URL，下一次 agent 运行看起来像是“换了一个会话”。这个项目的作用，就是在**不读取私有 transcript** 的前提下，把这些不同 locator 继续归回同一个 `workspace` / `projectId` / `taskId`。

## 它解决什么问题

- Agent CLI 会话在重启、换机、换工具后容易断上下文。
- Codex 的 `provider` / `base_url` 切换，会让同一条工程线程看起来像不同来源。
- 团队需要一个安全的桥，只追踪归属 metadata，而不是复制原始聊天内容。

## 为什么是 metadata，而不是 transcript

这个项目的核心价值不是“保存更多聊天记录”，而是“把不同 agent 入口重新绑定回同一个 workspace/task”。

AMS-003 这次展示的连续性流只记录这些内容：

- workspace 绑定事实
- project/task 绑定事实
- agent CLI 名称与 locator
- provider label
- 脱敏后的 base URL label/hash

不会做这些事：

- 不读取 `~/.codex`
- 不导入真实私有会话内容
- 不上传 transcript

## 最小演示

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"

pnpm -C apps/cli start resolve --workspace "$PWD" --name demo-task

pnpm -C apps/cli start agent-sessions record \
  --workspace "$PWD" \
  --agent-cli codex \
  --locator codex-provider-a \
  --provider provider-a \
  --base-url 'https://api.first.example/v1?token=secret-a'

pnpm -C apps/cli start agent-sessions record \
  --workspace "$PWD" \
  --agent-cli codex \
  --locator codex-provider-b \
  --provider provider-b \
  --base-url 'https://api.second.example/v1?token=secret-b'

pnpm -C apps/cli start agent-sessions list --workspace "$PWD"
pnpm -C apps/cli start agent-sessions list --workspace "$PWD" --json
```

预期结果：

- 两个 Codex locator 都出现在同一个 workspace 下
- 它们共享同一个 `projectId` 和 `taskId`
- 默认输出适合终端演示和截图传播
- `--json` 继续保留给脚本
- 只展示脱敏 metadata，不回显 query 里的敏感 token

完整演示文档见：[`docs/demo/codex-base-url-continuity.md`](docs/demo/codex-base-url-continuity.md)

## 安全承诺

- 只保存 metadata
- 不读取 `~/.codex` 原文
- 不上传 transcript
- 不导入真实私有会话内容

## CLI 命令

- `resolve`：把当前工作区绑定到 project/task
- `context`：读取当前上下文包
- `checkpoint`：写入任务进度、决策与下一步
- `flush-outbox`：重试补传延迟事件
- `agent-sessions record|list`：记录并查看 agent session locator

现在 `agent-sessions` 默认输出更偏产品可读结果；需要机器可解析结构时，请使用 `--json`。

## 深入阅读

- 技术设计：[`docs/technical-design/agent-cli-session-memory-discovery.md`](docs/technical-design/agent-cli-session-memory-discovery.md)
- 演示脚本：[`docs/demo/codex-base-url-continuity.md`](docs/demo/codex-base-url-continuity.md)

## 仓库结构

```text
.
├── apps
│   ├── cli
│   └── api
├── docs
├── README.md
├── README-zh.md
└── package.json
```

## 本地开发

### 环境要求

- Node.js 22+
- pnpm 10+
- PostgreSQL
- shell 中可用 `psql` 执行 migration

### 启动 API

```bash
pnpm install
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/project_memory_service"
pnpm -C apps/api db:migrate
pnpm -C apps/api dev
```

### 常用命令

```bash
pnpm -C apps/cli test
pnpm -C apps/cli test:e2e
pnpm -C apps/api test
pnpm -C apps/api typecheck
```
