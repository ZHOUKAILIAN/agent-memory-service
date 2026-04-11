# agent-memory-service

[English README](README.md)

面向 AI Agent 的共享记忆与上下文同步服务。

`agent-memory-service` 是一个轻量 HTTP 服务，用来帮助 AI Agent 在不同会话、设备和运行时之间继续同一项工程任务。它会同时保存原始对话历史和结构化项目记忆，并组装出一个紧凑的上下文包，让下一个 agent 不必重放整段对话也能继续工作。

## 这个项目解决什么问题

智能体协作经常会出现上下文割裂：

- 某次本地编码会话里的关键决策，下一次运行时看不到
- 手机端或后续智能体需要用户重新描述背景和当前状态
- 有价值的信息埋在长对话里，无法作为结构化记忆复用

这个服务的目标，就是给所有智能体提供一个项目级的共享记忆后端。

## V1 已实现内容

- 创建项目并生成稳定的 `project_id`
- 写入原始对话消息和工具事件
- 写入结构化 memory block，支持背景、约束、决策、待办、状态
- 基于确定性规则组装 context bundle
- 提供显式的 context refresh 接口
- 提供 PostgreSQL migration 脚手架
- 提供自动化 API 测试

## V1 暂不包含

- 认证与权限控制
- 向量检索或语义召回
- Web 管理界面
- 面向特定智能体厂商的 SDK
- 后台 worker 或异步索引能力

## 技术栈

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Zod
- Vitest

## 仓库结构

```text
.
├── apps
│   └── api
│       ├── src
│       └── test
├── docs
│   ├── agent-sync-flow-zh.md
│   ├── api-draft.md
│   ├── data-model.md
│   ├── example-requests.md
│   ├── multi-agent-sync-design-zh.md
│   ├── use-cases.md
│   ├── v1-scope.md
│   └── vision.md
├── README.md
├── README-zh.md
└── package.json
```

## 数据模型

### `projects`

表示一个需求、仓库任务或持续中的工程线程。

### `conversation_entries`

表示由智能体或工具写入的原始对话型事件。

### `memory_blocks`

表示后续智能体应该优先读取的结构化记忆。

`v1` 支持的 `block_type` 有：

- `background`
- `constraints`
- `decisions`
- `todo`
- `status`

## Context 如何组装

`GET /projects/:id/context` 和 `POST /projects/:id/context/refresh` 使用同一套确定性规则：

1. 读取项目本身
2. 读取该项目下的全部 memory blocks
3. 按 `block_type` 分组
4. 每组内按 `importance` 倒序、再按 `updated_at` 倒序排序
5. 读取最近的 conversation entries
6. continuation payload 优先使用 `summary`，没有时回退到 `content`

这样做的目标是让 `v1` 保持简单、可观察、易调试。

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `POST` | `/projects` | 创建项目 |
| `POST` | `/projects/:id/conversations` | 追加对话记录 |
| `POST` | `/projects/:id/memory-blocks` | 写入或更新结构化记忆 |
| `GET` | `/projects/:id/context` | 读取组装后的上下文包 |
| `POST` | `/projects/:id/context/refresh` | 显式刷新并返回同一套上下文结果 |

示例请求见 [docs/example-requests.md](docs/example-requests.md)。
接入流程说明见 [docs/agent-sync-flow-zh.md](docs/agent-sync-flow-zh.md)。
多 Agent 接入设计见 [docs/multi-agent-sync-design-zh.md](docs/multi-agent-sync-design-zh.md)。

## 本地开发

### 环境要求

- Node.js 22+
- pnpm 10+
- PostgreSQL
- shell 环境里可用 `psql`，用于执行 migration 脚本

### 启动方式

```bash
pnpm install
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/project_memory_service"
pnpm -C apps/api db:migrate
pnpm -C apps/api dev
```

服务默认启动在 `http://localhost:3000`。

### 常用命令

```bash
pnpm -C apps/api dev
pnpm -C apps/api test
pnpm -C apps/api typecheck
pnpm -C apps/api db:migrate
```

## 测试覆盖

当前测试覆盖了：

- health check
- project creation
- conversation ingestion
- memory block upsert
- deterministic context assembly
- explicit refresh behavior

运行方式：

```bash
pnpm -C apps/api test
pnpm -C apps/api typecheck
```

## 当前状态

`v1` 已经实现为一个单体 Fastify API 服务，包含 repository abstraction、确定性的 context 组装逻辑、PostgreSQL migration 脚手架，以及端点级自动化测试。

当前主要还差的运行时外部条件，是提供真实的 `DATABASE_URL` 和 PostgreSQL 实例，完成端到端本地联调。

## 后续方向

- auth 与租户能力
- semantic retrieval
- 模型辅助的 memory refresh
- 面向不同智能体运行时的 SDK
- 项目记忆的可视化 inspection UI
