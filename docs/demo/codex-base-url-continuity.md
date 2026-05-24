# Codex base URL / provider continuity demo

这个 demo 展示：同一个 workspace/task 下，即使 Codex 切换了 provider 或 base URL，`agent-memory-service` 仍然只记录安全的 locator metadata，并把它们绑定回同一个 `projectId` / `taskId`。

M2 当前首推入口已经升级为一键 demo：`demo codex-continuity`。它是对现有本地能力的产品化编排，不是 M3 的真实 locator discovery。

## 安全边界

- 只保存 metadata：workspace 归属、task 归属、locator、provider label、脱敏后的 base URL label/hash。
- 不读取 `~/.codex` 原文。
- 不上传 transcript。
- 不导入真实私有会话内容。

## 前置条件

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"
```

当前 demo 仍依赖现有 API 的 `resolve` 链路，所以需要先确保 `apps/api` 已启动且 `AGENT_MEMORY_BASE_URL` 可访问。

## 一键 Demo

```bash
pnpm -C apps/cli start demo codex-continuity
pnpm -C apps/cli start demo codex-continuity --json
```

默认行为：

- 未传 `--workspace` 时自动创建临时 workspace
- 通过 `resolve` 建立 `projectId` / `taskId`
- 记录两条 fake Codex locator：`codex-provider-a` 与 `codex-provider-b`
- 自动运行 `doctor` 汇总
- 默认输出可截图，`--json` 可脚本断言
- 输出不会泄露 `token=fake-secret-*` query

如果你想指定目录：

```bash
workspace="$(mktemp -d)"
pnpm -C apps/cli start demo codex-continuity --workspace "$workspace"
```

注意：指定的 `--workspace` 必须是空目录，或至少不能已有 `workspace binding` / `locator` 记录；否则 demo 会直接失败，以保证 M2 演示结果稳定、可重复、可截图。

## 预期结果

- 默认输出显示 workspace 路径、`projectId`、`taskId`、两条 locator、provider、脱敏后的 base URL、doctor 摘要与安全边界。
- 两条 locator 共享同一个 `projectId` / `taskId`。
- `--json` 返回稳定结构，包含 `checks.sameProjectTask === true`、`checks.queryTokenRedacted === true`、`doctor.locators.count === 2`。
- 任意输出都不应包含 transcript、Authorization、cookie、`~/.codex` 内容，或 fake token query 明文。

## 底层展开步骤

如果你需要理解一键 demo 背后实际调用的底层能力，可继续手工执行下面的等价流程：

```bash
workspace="$(mktemp -d)"

pnpm -C apps/cli start resolve --workspace "$workspace" --name demo-task

pnpm -C apps/cli start agent-sessions record \
  --workspace "$workspace" \
  --agent-cli codex \
  --locator codex-provider-a \
  --provider provider-a \
  --base-url 'https://api.first.example/v1?token=secret-a'

pnpm -C apps/cli start agent-sessions record \
  --workspace "$workspace" \
  --agent-cli codex \
  --locator codex-provider-b \
  --provider provider-b \
  --base-url 'https://api.second.example/v1?token=secret-b'

pnpm -C apps/cli start doctor --workspace "$workspace"
pnpm -C apps/cli start doctor --workspace "$workspace" --json
pnpm -C apps/cli start agent-sessions list --workspace "$workspace"
pnpm -C apps/cli start agent-sessions list --workspace "$workspace" --json
```

## 对应自动化验证

- 主验证：`pnpm -C apps/cli test`
- 单独 E2E：`pnpm -C apps/cli test:e2e`

自动化场景已覆盖 `apps/cli/test/demo.e2e.test.ts`，并保留 `apps/cli/test/agent-sessions.e2e.test.ts` 作为底层连续性事实验证。
