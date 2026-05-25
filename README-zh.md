# agent-memory-service

[English](README.md)

`agent-memory-service` 是一个面向 Agent CLI 的记忆桥，专门解决“运行时一变，上下文连续性就断掉”的问题。

它聚焦一个非常具体的场景：你先把工作区绑定到某个 task，随后切换 Codex 的 provider 或 base URL，下一次 agent 运行看起来像是“换了一个会话”。这个项目的作用，就是在**不读取私有 transcript** 的前提下，把这些不同 locator 继续归回同一个 `workspace` / `projectId` / `taskId`。

## 当前状态

当前已经实现：

- 通过 `resolve` 建立 workspace/task 绑定
- 通过 `context` 恢复上下文
- 通过 `checkpoint` 记录进展
- 通过 `agent-sessions record|list` 记录 metadata-only locator
- Codex provider/base URL 连续性的一键 demo
- Codex、Gemini、Claude 候选来源的 metadata-only discovery
- `discover all` 跨 CLI 候选分组
- `doctor` 诊断、JSON 输出、跨 CLI 覆盖度和 Markdown smoke report

当前尚未实现：

- 跨 CLI 完整 transcript 同步
- 自动修复所有 runtime 问题
- MCP / IDE 集成
- hosted dashboard
- SSO / enterprise permissions

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

- 不读取私有 CLI transcript
- 不导入真实私有会话内容
- 不上传 transcript

## 一键 Demo

M2 当前已经提供第一版一键 demo，用一条命令就能跑通 Codex provider/base URL 切换后的 continuity 故事。

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"
pnpm -C apps/cli start demo codex-continuity
pnpm -C apps/cli start demo codex-continuity --json
pnpm -C apps/cli start demo handoff-continuity
pnpm -C apps/cli start demo handoff-continuity --json
```

它会自动完成：

- 默认创建临时 workspace，或使用你传入的 `--workspace <path>`
- 调用 `resolve` 建立 `projectId` / `taskId` 绑定
- 写入两条固定的 fake Codex locator，分别代表不同 provider/base URL
- 对于 `demo handoff-continuity`，写入 provider-b 的 handoff checkpoint，并从同一个 task context 渲染 provider-a 的 resume prompt
- 运行 `doctor` 汇总结果，并输出人类可读文本或 `--json`
- 全程只保存 metadata，且不会回显 fake query token

当前 M2 边界：

- 这只是把现有手工链路产品化封装成一个入口
- 当前已支持第一版跨 CLI metadata discovery（Codex/Gemini/Claude），但仍不导入正文
- 不读取私有 CLI transcript，不上传 transcript
- 如果 API 没有启动，demo 会在 `resolve` 阶段直接失败，因为当前仍依赖 `AGENT_MEMORY_BASE_URL`

完整演示文档见：[`docs/demo/codex-base-url-continuity.md`](docs/demo/codex-base-url-continuity.md)

## 手工演示步骤

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

pnpm -C apps/cli start doctor --workspace "$PWD"
pnpm -C apps/cli start doctor --workspace "$PWD" --json
pnpm -C apps/cli start agent-sessions list --workspace "$PWD"
pnpm -C apps/cli start agent-sessions list --workspace "$PWD" --json
```

预期结果：

- 两个 Codex locator 都出现在同一个 workspace 下
- 它们共享同一个 `projectId` 和 `taskId`
- 默认输出适合终端演示和截图传播
- `--json` 继续保留给脚本
- 只展示脱敏 metadata，不回显 query 里的敏感 token

## 安全承诺

- 只保存 metadata
- 不读取私有 CLI transcript 原文
- 不上传 transcript
- 不导入真实私有会话内容

## CLI 命令

- `doctor`：诊断当前 workspace 的环境、绑定、locator 摘要、安全边界与下一步建议
- `resolve`：把当前工作区绑定到 project/task
- `context`：读取当前上下文包
- `checkpoint`：写入任务进度、决策与下一步
- `handoff create|resume`：让一个 agent/provider 写入结构化 continuation context，并为下一个 agent/provider 渲染可继续的上下文
- `baseurl switch`：记录 provider/base URL 切换，保留结构化 continuation context，并写入本地缓存
- `flush-outbox`：重试补传延迟事件
- `agent-sessions record|list`：记录并查看 agent session locator
- `demo codex-continuity`：运行 M2 一键 locator 连续性 demo，支持默认可读输出与 `--json`
- `demo handoff-continuity`：运行 handoff/resume demo，让 provider-b 写入 continuation context，再由 provider-a 读取并继续

`doctor` 是当前 M1 onboarding 入口，用来快速判断当前 workspace 是否已经跑通连续性链路；需要脚本消费时可加 `--json`。

现在 `agent-sessions` 默认输出更偏产品可读结果；需要机器可解析结构时，请使用 `--json`。

## 深入阅读

- 测试 quickstart：[`docs/testing-quickstart.md`](docs/testing-quickstart.md)
- FAQ：[`docs/faq.md`](docs/faq.md)
- 产品路线图与验收：[`docs/product/roadmap.md`](docs/product/roadmap.md)
- Release/update 模板：[`docs/release-update-template.md`](docs/release-update-template.md)
- 面向 agent 工具作者的集成指南：[`docs/integrations/agent-tool-authors.md`](docs/integrations/agent-tool-authors.md)
- 技术设计：[`docs/technical-design/agent-cli-session-memory-discovery.md`](docs/technical-design/agent-cli-session-memory-discovery.md)
- 演示脚本：[`docs/demo/codex-base-url-continuity.md`](docs/demo/codex-base-url-continuity.md)
- Demo 截图/录屏指南：[`docs/demo/capture-guide.md`](docs/demo/capture-guide.md)

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

### 本地使用 `agent-memory` binary

CLI package 暴露了 `agent-memory` binary，对应文档里的命令。基于本地 checkout，可以这样 link：

```bash
pnpm install
cd apps/cli
pnpm link --global
agent-memory help
```

如果你的 pnpm global bin 目录还没配置，需要先按本机 pnpm 设置配置 `PNPM_HOME` / `global-bin-dir`。

如果不想做全局 link，也可以继续使用 workspace 形式：

```bash
pnpm -C apps/cli start doctor --workspace "$PWD"
```

### 发现多 CLI locator metadata

跑通 demo 后，可以尝试第一版真实 metadata discovery：

```bash
agent-memory discover codex --home ~/.codex
agent-memory discover gemini --gemini-home ~/.gemini
agent-memory discover claude --claude-home ~/.claude
agent-memory discover codex --codex-home ~/.codex --record codex-1
```

M4 第一版 Discovery 现已支持 Codex、Gemini、Claude 三类 CLI，且只处理 metadata：候选路径、文件统计信息和安全的顶层标识。它不会导入 transcript/message/content/token/query 字段，也不会上传私人会话内容。

### 跨 CLI discovery 打磨

`agent-memory discover all` 可以一次扫描 Codex、Gemini、Claude home，并按 CLI 分组展示 metadata-only 候选。`agent-memory doctor` 也会显示当前 workspace/task 的跨 CLI 覆盖度，方便判断哪些 agent 已经记录 locator。

### 生成可分享的 smoke report

使用 `agent-memory doctor --report` 可以生成 Markdown smoke report，包含绑定状态、跨 CLI 覆盖度、最近 locators、安全边界和下一步建议。它适合粘贴到 issue、release notes 或 onboarding 文档中，并且不会泄露 token query。
