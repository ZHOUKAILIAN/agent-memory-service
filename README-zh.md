# agent-continuity-bridge

[English](README.md)

`agent-continuity-bridge` 是一个面向 Agent CLI 的连续性桥接工具。

它现在聚焦一个很具体的问题：你在同一个工作区里已经绑定了一个 `projectId` / `taskId`，随后切换 Codex provider、base URL，或者切到另一个 Agent CLI locator，下次运行仍然应该接着同一个任务上下文继续，而不是重新解释一遍。

推荐的本地 CLI 命令是 `agent-continuity`。`agent-memory` 会继续保留为兼容旧用法的 alias。

## 这次定位变化

这个仓库最早想做通用的 agent 记忆服务，所以曾经包含原始 conversation 写入、project 级 memory block、project 级 context bundle 等能力。

现在主线收敛为：

- 用 workspace 作为稳定锚点
- 用 `resolve` 绑定 workspace 到 project/task
- 用 `checkpoint`、`context`、`handoff` 保存和恢复结构化任务上下文
- 用 `baseurl switch` 和 `agent-sessions` 把 provider/base URL/locator 变化记录成 metadata
- 不读取、不导入、不上传私有 CLI transcript

## 本地试用

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动 API

当前 CLI 连续性链路仍依赖本地 API 保存 project/task context。

```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/agent_continuity_bridge"
pnpm -C apps/api db:migrate
pnpm -C apps/api dev
```

另开一个终端：

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"
```

### 3. 跑一键 demo

```bash
pnpm -C apps/cli start demo codex-continuity
pnpm -C apps/cli start demo handoff-continuity
```

预期结果：

- 两个 provider/base URL locator 归到同一个 `projectId` / `taskId`
- query token 会被脱敏
- 输出只描述 metadata 和结构化上下文
- 不会导入私有 transcript 内容

需要脚本断言时，可以给 demo 加 `--json`。

## 手工跑 base URL 连续性流程

用真实工作区或临时目录都可以：

```bash
mkdir -p /tmp/acb-demo
cd /tmp/acb-demo
```

先绑定 workspace：

```bash
pnpm -C /path/to/agent-continuity-bridge/apps/cli start resolve \
  --workspace "$PWD" \
  --name demo-task
```

记录第一个 provider/base URL：

```bash
pnpm -C /path/to/agent-continuity-bridge/apps/cli start baseurl switch \
  --workspace "$PWD" \
  --agent-cli codex \
  --provider provider-a \
  --base-url "https://api.first.example/v1?token=fake-secret-a" \
  --yes
```

再切换到另一个 provider/base URL：

```bash
pnpm -C /path/to/agent-continuity-bridge/apps/cli start baseurl switch \
  --workspace "$PWD" \
  --agent-cli codex \
  --provider provider-b \
  --base-url "https://api.second.example/v1?token=fake-secret-b" \
  --yes
```

然后检查连续性：

```bash
pnpm -C /path/to/agent-continuity-bridge/apps/cli start doctor --workspace "$PWD"
pnpm -C /path/to/agent-continuity-bridge/apps/cli start context --workspace "$PWD"
pnpm -C /path/to/agent-continuity-bridge/apps/cli start handoff resume --workspace "$PWD"
```

本地缓存位置：

```text
.agent-memory/cache/continuation-latest.json
.agent-memory/cache/baseurl-switches.jsonl
```

## CLI 命令

- `agent-continuity resolve`：把 workspace 绑定到 project/task
- `agent-continuity checkpoint`：写入任务进展、决策、约束和下一步
- `agent-continuity context`：读取当前 task context bundle
- `agent-continuity handoff create|resume`：创建或渲染结构化接续上下文
- `agent-continuity baseurl switch`：记录 provider/base URL 变化，并保留任务上下文
- `agent-continuity agent-sessions record|list`：记录和查看 metadata-only agent locator
- `agent-continuity discover codex|gemini|claude|all`：扫描 metadata-only locator 候选
- `agent-continuity doctor`：诊断绑定状态、locator 覆盖度、安全边界和下一步
- `agent-continuity flush-outbox`：重试本地排队的 task checkpoint 写入
- `agent-continuity demo codex-continuity|handoff-continuity`：运行本地连续性 demo

## 当前安全边界

- 保存 workspace/project/task identity
- 只把 provider/base URL/locator 保存为脱敏 metadata
- 保存结构化 task checkpoint 和 handoff context
- 不读取私有 CLI transcript
- 不上传私有 session 内容
- 不回显 query string 里的 token

## 仓库结构

```text
.
├── apps
│   ├── api
│   └── cli
├── docs
├── README.md
├── README-zh.md
└── package.json
```

## 开发命令

```bash
pnpm -C apps/cli test
pnpm -C apps/cli test:e2e
pnpm -C apps/api test
pnpm typecheck
```

## 更多文档

- 测试 quickstart：[`docs/testing-quickstart.md`](docs/testing-quickstart.md)
- FAQ：[`docs/faq.md`](docs/faq.md)
- 产品路线图：[`docs/product/roadmap.md`](docs/product/roadmap.md)
- 技术设计：[`docs/technical-design/agent-cli-session-memory-discovery.md`](docs/technical-design/agent-cli-session-memory-discovery.md)
- Demo 说明：[`docs/demo/codex-base-url-continuity.md`](docs/demo/codex-base-url-continuity.md)
- 集成指南：[`docs/integrations/agent-tool-authors.md`](docs/integrations/agent-tool-authors.md)
