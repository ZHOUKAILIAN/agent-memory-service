# Codex base URL / provider continuity demo

这个 demo 展示：同一个 workspace/task 下，即使 Codex 切换了 provider 或 base URL，`agent-memory-service` 仍然只记录安全的 locator metadata，并把它们绑定回同一个 `projectId` / `taskId`。

## 安全边界

- 只保存 metadata：workspace 归属、task 归属、locator、provider label、脱敏后的 base URL label/hash。
- 不读取 `~/.codex` 原文。
- 不上传 transcript。
- 不导入真实私有会话内容。

## 步骤

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

pnpm -C apps/cli start agent-sessions list --workspace "$workspace"
pnpm -C apps/cli start agent-sessions list --workspace "$workspace" --json
```

## 预期结果

- `record` 默认输出显示 `workspace`、`projectId`、`taskId`、`agentCli`、`locator`、`provider`、脱敏后的 `baseUrl`。
- `list` 默认输出显示 2 条 locator，且两条记录共享同一个 `projectId` / `taskId`。
- `list --json` 返回机器可读结构，可看到 `providerLabel` 与 `baseUrlLabel`，但不会回显 query token。
- 任意输出都不应包含 transcript、Authorization、cookie 或 `~/.codex` 内容。

## 对应自动化验证

- 主验证：`pnpm -C apps/cli test`
- 单独 E2E：`pnpm -C apps/cli test:e2e`

自动化场景对应 `apps/cli/test/agent-sessions.e2e.test.ts`，确保文档叙事和 CLI 行为保持一致。
