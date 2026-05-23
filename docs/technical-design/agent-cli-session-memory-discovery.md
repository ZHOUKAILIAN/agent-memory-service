# Agent CLI 会话/记忆发现与项目身份稳定化设计

## 1. 背景与问题陈述

`agent-memory-service` 已经通过 CLI-first 工作流把当前工作区与 `.agent-memory/bridge.sqlite` 绑定起来，并在本地 `workspace_bindings` 中保存 `project_id`、`task_id`、`repo_url` 等事实。这套机制已经能支撑同一工作区内的上下文恢复，但当用户在同一工程中切换不同 Agent CLI，或在 Codex CLI 中切换 base URL/provider 时，外部 CLI 自带的会话目录、账户目录和本地布局往往发生变化，导致用户误以为“原来的上下文消失了”。

本设计文档定义：AMS 如何把 Codex CLI、Gemini CLI、Claude Code/Claude CLI 统一视为外部来源类型，并通过“工作区主锚点 + 多信号稳定身份 + 最小必要发现元数据”的方式，保证同一工程任务在来源变化后仍可找回原有项目/任务归属。

## 2. 术语定义

### 2.1 Agent CLI 来源

外部 Agent CLI 运行时所产生的可观察来源类型。本设计仅抽象来源类别，不把任何单一 CLI 的本地目录结构升级为正式规范。

- `codex`：Codex CLI 及其不同 provider/base URL 组合
- `gemini`：Gemini CLI 及其账户或本地目录布局变体
- `claude`：Claude Code / Claude CLI 及其本地会话来源

### 2.2 Project Identity

用于判断“是不是同一个工程/工作区”的稳定身份层。它由工作区路径、仓库根、`git remote`、仓库名等稳定信号共同决定，而不是由第三方 CLI 的 provider 目录决定。

### 2.3 Task Identity

用于判断“是不是同一个持续任务”的稳定身份层。它优先复用已有 `task_id` 绑定；若本地尚无绑定，再结合显式 `task key`、外部引用、任务标题规范化值等稳定信号进行匹配。

### 2.4 Workspace Binding

当前工作区与 AMS 项目/任务归属之间的本地持久化事实，存放在工作区下 `.agent-memory/bridge.sqlite`。现有实现中的 `workspace_bindings` 已保存：

- `workspace_path`
- `project_id`
- `project_name`
- `task_id`
- `task_title`
- `repo_url`
- `created_at`
- `updated_at`

### 2.5 Session/Memory Discovery

指对外部 Agent CLI 来源进行“发现与归属映射”的过程。该过程只处理最小必要元数据，不以读取或持久化外部完整私人会话正文为前提。

## 3. 设计约束

本议题在当前阶段遵循以下硬性约束：

1. 不新增服务端 API。
2. 不做数据库 migration。
3. 不真实读取 `~/.codex`、`~/.gemini`、Claude 本地目录中的私人会话正文。
4. 不上传 transcript、密钥、令牌、环境变量等敏感内容。
5. 不把 provider 名称、base URL、账户信息或本地目录路径定义为主身份主键。

这些约束既是本次交付范围，也是 AMS 在跨 CLI 发现问题上的安全边界。

## 4. 稳定身份模型

### 4.1 设计结论

AMS 的连续性恢复必须建立在稳定身份层上，而不是建立在某个 Agent CLI 的目录结构上。`Project Identity` 与 `Task Identity` 的判定顺序如下：

1. 先确定当前工作区根目录。
2. 确定仓库边界与 `git remote`。
3. 读取现有 `.agent-memory/bridge.sqlite` 中的 `workspace_bindings` 作为已知事实。
4. 若已有 `task_id` 绑定，则优先视为同一任务连续体。
5. 若无 `task_id`，再使用显式 `task key`、外部引用、任务标题规范化值等稳定信号辅助匹配。
6. provider、base URL、本地目录路径仅作为观测元数据，不得单独决定新建身份空间。

### 4.2 为什么不能依赖 provider-specific 目录

对 Codex CLI 而言，base URL/provider 变化只代表访问通道变化，不代表工程或任务变化。如果把主身份绑定在 provider-specific 目录上，则同一工作区只要切换模型供应商，就会被错误识别为全新项目，进而丢失原有的：

- 上下文索引归属
- 文件归属
- checkpoint 关系
- 任务延续历史

因此，本设计要求所有来源都遵循同一规则：**上下文归属恢复依赖 `workspace + repository + task key` 一类稳定组合，而不是 provider-specific path**。

## 5. 多 CLI 来源发现模型

### 5.1 抽象模型

来源发现统一抽象为：

- `SourceKind = codex | gemini | claude`
- `DiscoverySignal`：
  - 当前工作区路径与仓库边界
  - `git remote` 与仓库名称
  - 用户显式提供的任务键或外部引用
  - CLI 可公开提供的会话标识或来源标识
  - 用户授权输入的最小必要附加元数据
- `DiscoveryOutput`：
  - 来源类型
  - 是否检测到可关联来源
  - 可用于归属的最小元数据
  - 风险级别与授权要求
  - 是否能映射到现有 `workspace_binding`

### 5.2 三类来源的共同规则

#### Codex CLI

- base URL/provider 只记录为辅助元数据。
- provider 变化不能触发新的 Project Identity。
- 只要工作区与任务稳定信号未变，就应继续复用原有 `project/task` 归属。

#### Gemini CLI

- 本地来源目录差异、账户差异不参与主身份定义。
- 如发现可公开的会话标识，也仅用于辅助匹配，不作为唯一主键。

#### Claude Code / Claude CLI

- 会话来源只表示“可能存在历史工作痕迹”的外部来源。
- Claude 本地目录、账号上下文或供应商配置不定义 AMS 主身份。

## 6. 控制流与运行时对齐

### 6.1 控制流

跨 CLI 连续性恢复的控制流如下：

1. 用户在某工作区启动任一 Agent CLI。
2. 本地桥接层从当前工作区定位 `.agent-memory/bridge.sqlite`。
3. 读取 `workspace_bindings`，获得当前已知 `project_id` / `task_id`。
4. 若存在外部 CLI 来源，只提取最小必要来源元数据并执行授权检查。
5. 将这些来源元数据映射到稳定 `Project Identity` / `Task Identity`。
6. 后续上下文恢复仍沿用现有 AMS `project -> task` 链路。
7. 若 provider/base URL 变化，但工作区与稳定信号不变，则继续复用原有归属。

### 6.2 与现有实现的对齐结论

本设计明确对齐以下现有实现事实：

- `apps/cli/src/workspace.ts`：定义 `.agent-memory` 与 `bridge.sqlite` 的工作区路径规则。
- `apps/cli/src/storage/sqlite.ts`：定义 `workspace_bindings` 以及本地工作区绑定持久化事实。
- `apps/cli/src/commands/resolve.ts`：当工作区尚未绑定时，负责 resolve/创建 `project` 与 `task`，并保存绑定。
- `apps/cli/src/commands/context.ts`：恢复上下文时，先读取当前工作区绑定，再按 `task` 或 `project` 获取上下文。

因此，跨 CLI 会话/记忆发现并不是新增一套平行身份系统，而是对现有 `project -> task` 与 `workspace binding` 模型的扩展解释：外部来源只负责补充“如何识别这是同一工作区/同一任务”的信号，最终归属仍落在 AMS 的统一项目/任务语义下。

## 7. 安全、授权与脱敏边界

本设计要求所有后续实现都遵守以下边界：

1. 默认不读取第三方 CLI 的完整私人会话正文。
2. 默认不上传私人 transcript、密钥、令牌、环境变量或未脱敏敏感片段。
3. 发现流程只允许使用最小必要元数据判断归属可能性。
4. 如果未来支持更深层发现，必须建立在显式授权与默认脱敏前提之上。
5. 家目录真实路径、用户账号信息、供应商配置细节不得成为必要依赖条件。

安全边界本身属于设计的一部分，而不是附属建议。

## 8. Codex provider/base URL 变化场景说明

当用户在同一仓库中从一个 Codex provider/base URL 切换到另一个 provider/base URL 时，AMS 应遵循以下解释：

1. 变化的是访问通道，不是项目身份。
2. 如果工作区、仓库边界、`git remote`、任务键保持稳定，则应继续映射到原有 `project_id` / `task_id`。
3. 外部来源目录即使变化，也只能作为“来源发生变化”的观测事实，不能覆盖 `workspace_bindings` 已建立的本地绑定现实。

这保证了 Codex 切换 provider 后，仍能找回原上下文索引、文件归属与任务延续历史。

## 9. 验证与后续演进

### 9.1 本次文档交付验证点

验证至少应覆盖以下项目：

1. 本文档存在于正式仓库文档目录中。
2. 文档明确覆盖 Codex CLI、Gemini CLI、Claude Code/Claude CLI 三类来源。
3. 文档明确说明不能依赖 provider-specific 目录，而必须依赖工作区与稳定信号。
4. 文档明确与现有 `project -> task` 模型及 `.agent-memory/bridge.sqlite` 对齐。
5. 文档明确安全边界：无新增 API、无 migration、不读取真实私有原文、不上传敏感内容。
6. `README.md` 与 `README-zh.md` 提供到本文档的可见入口。

### 9.2 后续演进方向

后续如需真正实现来源适配器或发现器，应继续遵守本文档定义：

- 只做来源发现与映射，不以抓取完整原文为默认能力。
- 让所有来源回落到现有 `workspace binding -> project -> task` 归属链路。
- 把 provider/base URL 视为可变辅助元数据，而不是主身份字段。

## 10. 非目标与开放问题

### 10.1 非目标

当前设计明确不包含：

- 真实的多 CLI 本地扫描器实现
- 新的 server endpoint
- 新的 CLI 命令
- 数据库 schema 调整或 migration
- 第三方完整历史对话导入

### 10.2 开放问题

以下问题保留给后续方案评审，不在本文档中做实现承诺：

1. 如果未来允许用户显式授权更深层发现，最小可接受元数据集合应如何定义。
2. 跨仓库但任务语义延续时，Task Identity 是否需要额外跨仓库策略。
3. 不同 CLI 若能提供标准化会话标识，是否需要统一适配器接口，但仍不能改变稳定身份主键规则。
