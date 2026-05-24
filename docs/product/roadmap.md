# Product roadmap and acceptance

`agent-memory-service` 的正式产品语义不是“再存一份聊天记录”，而是为多 agent / 多客户端切换场景提供**项目级连续性上下文**：当用户切换 Codex provider、base URL、CLI 入口，或者未来切到 IDE / MCP 集成时，下一次运行仍能发现足够的只读上下文事实，继续同一个工程线程，而不是把它当成一段全新的会话。

本文档是当前仓库的正式产品路线图与验收入口。它以仓库里已经存在的 CLI、demo、技术设计和测试事实为基础，说明当前能做什么、距离完整产品还差什么、接下来按什么里程碑推进，以及每个里程碑如何做端到端验收。

## 1. 产品定位与目标

### 产品定位

- 对外主叙事：一个 **CLI-first continuity bridge**，帮助开发者在运行时变化后继续同一个项目/任务上下文。
- 底层能力定位：沿用现有“shared project memory layer / project -> task 绑定”事实，但把它提升为“跨 provider、跨客户端、跨 agent 的连续性承接产品”。
- 核心对象：项目级连续性上下文，而不是单一聊天会话。这个上下文至少包含 workspace 身份、project/task 绑定、结构化进展、以及外部 agent locator 的只读来源元数据。

### 产品目标

- 让用户从仓库入口就能理解：本项目解决的是“切换运行时后上下文断裂”，不是“无限保存聊天”。
- 让已有 CLI 能证明一个最小而真实的连续性故事：同一 workspace 在 Codex provider/base URL 切换后，仍被识别为同一个 project/task。
- 用清晰 roadmap 把 onboarding、discovery、跨 CLI、IDE/MCP 集成和传播资产组织成对外可理解的产品演进，而不是零散 TODO。
- 把 `1000+ GitHub stars` 作为开源传播牵引目标，而不是结果承诺；任何对外表达都必须避免把未实现能力写成已支持事实。

## 2. 目标用户与典型场景

### 主要用户

1. 经常在 Codex、其他 Agent CLI、脚本化自动化流程之间切换的个人开发者。
2. 需要在团队内共享任务上下文、但不希望复制原始私有 transcript 的工程团队。
3. 希望将连续性能力接入自己工具链的 CLI / IDE / MCP 集成作者。

### 典型场景

- 在同一仓库中，先用一个 Codex provider 完成绑定与任务推进，再切换到另一个 provider 或 base URL，继续同一个任务。
- 在 CLI 中创建或恢复 project/task 绑定后，后续由另一种 agent 入口读取只读元数据，判断“这是同一个工程线程”。
- 对外演示或传播时，需要一条不依赖私有会话内容的产品故事：展示连续性、展示边界、展示可复用性。

## 3. 端到端用户旅程：Codex provider/base URL 切换后的连续性

### 当前最小可用旅程

1. 用户在一个 workspace 内运行 `resolve`，把本地工作区绑定到已有或新建的 `projectId` / `taskId`。
2. 用户记录第一个 Codex locator，附带 provider 与 base URL 元数据。
3. 用户切换到另一个 provider 或 base URL，再记录第二个 Codex locator。
4. 用户运行 `agent-sessions list`，看到两个 locator 仍归属于同一个 workspace、同一个 `projectId`、同一个 `taskId`。
5. 用户确认 CLI 输出只展示脱敏后的 metadata，没有暴露 query 中的 token，也没有导入真实私有 transcript。

### 旅程价值

- 变化的是接入通道，不是项目身份。
- 用户无需重新解释“我是谁、我在哪个仓库、我正在做哪一个任务”。
- 团队可以用统一的 project/task 事实承接不同 agent 入口，而不依赖复制原始聊天历史。

### 事实锚点

- 演示文档：[`docs/demo/codex-base-url-continuity.md`](../demo/codex-base-url-continuity.md)
- 发现与安全设计：[`docs/technical-design/agent-cli-session-memory-discovery.md`](../technical-design/agent-cli-session-memory-discovery.md)
- 现有 CLI 命令：`resolve`、`context`、`checkpoint`、`flush-outbox`、`agent-sessions record|list`

## 4. 当前已完成能力（AMS-001/002/003）与产品差距

### AMS-001：项目/任务绑定与上下文恢复基础

**当前用户已经能做什么**

- 在本地 workspace 建立 `project -> task` 绑定。
- 用 `context` 恢复当前任务上下文，用 `checkpoint` 记录结构化进展。
- 使用 `flush-outbox` 处理延迟同步事件，保持 CLI-first 工作流可继续。
- 通过 `doctor` 在当前 workspace 视角下检查环境、binding、locator 摘要、安全边界与下一步建议。

**距离完整产品还缺什么**

- 对外入口仍偏技术说明，首次接触用户不一定能快速理解“连续性产品”而不是“普通记忆服务”。
- 已具备第一版 onboarding / doctor 诊断能力，但仍缺少自动修复与更低摩擦的一键演示。

**差距归类**

- 产品入口已补上第一版，剩余差距集中在自动修复与更完整 onboarding 叙事。

**Roadmap 归属**

- 里程碑 M1：Onboarding / Doctor。

### AMS-002：本地 locator metadata 记录与查看

**当前用户已经能做什么**

- 用 `agent-sessions record|list` 记录并查看 agent session locator metadata。
- 在不新增服务端 API、不做服务端 migration 的前提下，把 locator metadata 附着到既有 workspace 绑定上。
- 以人类可读默认输出做终端演示，同时保留 `--json` 供脚本消费。

**距离完整产品还缺什么**

- 当前记录依赖显式 CLI 操作，尚不具备真实 Codex locator discovery。
- 还没有对其他 CLI 的统一只读 metadata discovery 能力，也没有跨工具入口的标准化读取叙事。

**差距归类**

- 真实 discovery 能力差距。

**Roadmap 归属**

- 里程碑 M3：真实 Codex locator discovery。
- 里程碑 M4：跨 CLI 只读 metadata discovery。

### AMS-003：Codex provider/base URL 连续性故事成形

**当前用户已经能做什么**

- 通过 demo 和测试证明：同一 workspace 下切换 Codex provider/base URL 后，仍归属于同一个 `projectId` / `taskId`。
- 用脱敏 base URL label/hash 展示来源变化，同时避免泄露敏感参数。
- 形成可对外讲述的最小连续性桥接故事。

**距离完整产品还缺什么**

- 还没有“一键 demo”来降低试用门槛。
- 还没有 IDE / MCP 集成来覆盖更真实的多入口工作流。
- 还没有成体系的开源传播资产来支撑持续扩散。

**差距归类**

- 演示体验、生态集成与传播资产差距。

**Roadmap 归属**

- 里程碑 M2：一键 Demo。
- 里程碑 M5：MCP / IDE 集成。
- 里程碑 M6：发布与传播资产。

## 5. Roadmap 里程碑

### M1：Onboarding / Doctor

**当前进展**

- 已实现 `agent-memory doctor [--workspace <path>] [--json]`。
- 默认输出可读诊断摘要，`--json` 提供脚本稳定快照。
- 诊断范围覆盖环境、workspace binding、最近 locator、安全边界与下一步建议。

**目标**

- 让新用户在 5 分钟内判断自己是否能成功跑通最小连续性旅程。

**范围**

- 明确安装与环境检查入口。
- 说明 workspace 绑定、当前任务、bridge 状态与安全边界。
- 帮助用户定位“为什么现在还不能继续同一个上下文”。

**不应宣称**

- 不应把 doctor 写成自动修复所有运行时问题的能力。

### M2：一键 Demo

**当前进展**

- 已实现 `agent-memory demo codex-continuity` 顶层 CLI 命令。
- 默认自动创建临时 workspace，也支持 `--workspace <path>` 与 `--json`。
- 命令会串联 `resolve`、写入两条 fake Codex locator、执行 `doctor`，并输出可读摘要或稳定 JSON。
- 当前实现明确只演示 M2 产品化封装，不声称真实 Codex locator discovery。

**目标**

- 把当前可执行但偏手工的演示流程压缩成更低摩擦的试用路径。

**范围**

- 提供一条能快速复现 provider/base URL 连续性的标准 demo 路径。
- 保持演示结果可截图、可录屏、可复用于 README / release / 社媒素材。
- 保留 `--json` 供脚本断言，同时默认输出不泄露 fake query token。

**不应宣称**

- 不应把 demo 包装成真实生产集成，也不应要求真实私有会话内容参与验证。
- 不应把 M2 一键 demo 写成 M3 真实 discovery 已完成。

### M3：真实 Codex locator discovery

**目标**

- 降低手工录入 locator 的成本，让 Codex 场景更接近真实日常使用。

**范围**

- 基于已批准的安全边界，只做最小必要元数据发现。
- 继续把 provider/base URL 视为辅助观测字段，而不是项目身份主键。

**不应宣称**

- 不应声称读取 `~/.codex` 私有 transcript。
- 不应声称导入真实会话正文或上传敏感内容。

### M4：跨 CLI 只读 metadata discovery

**目标**

- 让连续性叙事从 Codex 扩展到更多 CLI 入口，但仍然维持只读 metadata 模式。

**范围**

- 对不同 CLI 做来源适配与身份映射。
- 统一回落到现有 `workspace binding -> project -> task` 语义。

**不应宣称**

- 不应把“跨 CLI 发现”写成“跨 CLI 完整会话同步”。

### M5：MCP / IDE 集成

**目标**

- 让用户在更接近真实工程环境的入口里感受到连续性价值。

**范围**

- 提供只读 metadata discovery 或上下文承接集成。
- 支持“从 CLI 建立事实，再由 IDE/MCP 读取继续”的叙事。

**不应宣称**

- 不应在没有实现前宣称通用 IDE 全量支持。

### M6：发布与传播资产

**目标**

- 建立稳定、可重复复用的对外传播材料，支撑开源增长与外部理解。

**范围**

- 官网/README 文案骨架、演示截图/录屏、FAQ、安全边界说明、里程碑更新说明。
- 明确“为什么值得 star / 试用 / 集成”，但不夸大实际能力。

**不应宣称**

- 不应承诺一定获得 `1000+ GitHub stars`。

## 6. 每个里程碑的 E2E 验收标准

### M1：Onboarding / Doctor 验收

- 新用户按仓库入口说明完成安装后，能够知道需要哪些依赖、如何启动最小环境、如何判断是否已经绑定 workspace。
- 用户能够看到清晰的失败原因分类：环境未就绪、workspace 未绑定、当前仅支持 metadata continuity、尚未支持的 discovery/集成能力。
- 验收结果必须明确说明安全边界，而不是把未来能力混入现状。

### M2：一键 Demo 验收

- 评审者在不读取任何真实私有会话内容的前提下，按单一路径完成一次 provider/base URL 切换演示。
- 演示结果能清楚展示两个 locator 归属同一 `projectId` / `taskId`。
- 演示输出中不会回显 query token、cookie、Authorization 或环境变量原文。

### M3：真实 Codex locator discovery 验收

- 用户无需手工填写完整 locator 细节，也能发现同一 workspace 下的 Codex 来源变化。
- 验收能证明：provider/base URL 是辅助元数据，而 workspace/project/task 绑定仍是主身份语义。
- 验收能证明：没有读取真实私有 transcript，也没有把敏感内容落盘或上传。

### M4：跨 CLI 只读 metadata discovery 验收

- 至少两个不同 CLI 来源能被映射回同一 workspace/project/task 语义。
- 验收过程只依赖最小必要元数据，不要求导入第三方私有会话正文。
- 用户能够区分“已支持只读 metadata discovery”和“未支持完整跨 CLI 会话恢复”。

### M5：MCP / IDE 集成验收

- 用户能从一个已建立连续性事实的 workspace 出发，在 CLI 之外的入口读取到足够继续工作的只读上下文。
- 验收能证明：CLI 建立的绑定事实仍是主来源，IDE/MCP 集成不会绕开安全边界创建另一套身份规则。
- 文档明确哪些集成已完成、哪些仍是 roadmap，避免传播口径超前。

### M6：发布与传播资产验收

- 仓库入口、正式产品文档、演示材料与 FAQ 之间形成一致叙事。
- 任何对外资产都能回答“它解决什么问题、当前真的能做什么、边界在哪里、下一步是什么”。
- 所有传播材料都不得把 roadmap 项目写成当前已完成能力。

## 7. `agent-team` 反馈闭环：何时修 AGT runtime、何时继续产品

### 优先修 AGT runtime 的条件

- runtime 问题直接阻断核心连续性旅程的演示、验收或试用。
- runtime 缺陷让用户无法稳定完成“绑定 workspace -> 记录 locator -> 切换 provider/base URL -> 继续同一任务”这条主链路。
- runtime 缺陷导致安全边界无法被可信地维持或表达。

### 优先继续产品层工作的条件

- runtime 已足以支撑最小连续性旅程，阻塞点主要变成 onboarding、入口表达、演示摩擦、生态集成或传播材料不足。
- 问题本质是“用户不知道怎么开始/怎么理解/为什么值得试”，而不是“底层流程根本跑不通”。

### 决策原则

- 是否优先修 runtime，不由底层技术兴趣决定，而由它是否阻断“连续性价值被验证”决定。
- 一旦 runtime 不再阻断核心旅程，后续优先级应转回产品表达、试用门槛和生态入口建设。

## 8. 开源传播资产清单

以下资产是为开源增长服务的产品资产，不是当前全部都已完成：

- README / README-zh 的产品化入口。
- 一份正式产品路线图与验收文档。
- 一条最小连续性 demo 脚本与截图/录屏素材。
- FAQ：为什么只存 metadata、为什么不读 transcript、与普通 chat history 的区别。
- 面向集成作者的技术入口：discovery 设计、workspace/task 身份原则、安全边界。
- milestone 更新模板：说明新增了什么、仍缺什么、不能夸大什么。

## 9. 安全边界与不可夸大承诺

### 当前必须坚持的安全边界

- 不新增服务端 API 作为本次产品路线图交付内容。
- 不做 `apps/api` 服务端 DB migration。
- 不读取 `~/.codex` 或其他第三方 CLI 的真实私有会话正文。
- 不上传 transcript、密钥、cookie、token、环境变量原文。
- 只允许用最小必要 metadata 解释连续性，不把 provider/base URL 当成主身份字段。

### 对外表达边界

- 可以说“当前已支持 CLI-first continuity bridge 与 Codex provider/base URL 切换演示”。
- 不可以说“当前已完成真实 Codex locator discovery”。
- 可以说“当前已完成 M4 第一版跨 CLI metadata discovery（Codex、Gemini、Claude，且仅限 metadata-only）”。
- 不可以说“当前已完成 MCP / IDE 集成”。
- 不可以承诺“项目一定获得 `1000+ GitHub stars`”；只能说这是一个开源增长目标与路线图校准目标。

## 10. 当前仓库入口与下一步

- 仓库入口：[`README.md`](../../README.md) / [`README-zh.md`](../../README-zh.md)
- 演示旅程：[`docs/demo/codex-base-url-continuity.md`](../demo/codex-base-url-continuity.md)
- 技术设计依据：[`docs/technical-design/agent-cli-session-memory-discovery.md`](../technical-design/agent-cli-session-memory-discovery.md)

当前仓库已经能证明“同一 workspace 在 provider/base URL 切换后仍保持 project/task 连续性”的最小产品事实。接下来的路线图重点不是发明新的上层叙事，而是在守住安全边界的前提下，持续降低试用门槛、增强真实 discovery、扩展跨入口读取能力，并用清晰传播资产把这条产品主线讲明白。

### M4 cross-CLI metadata discovery

M4 extends discovery to `agent-memory discover codex|gemini|claude` as the first cross-CLI metadata discovery path. It can scan an explicit `--home` or source-specific home flag for candidate session locators, list metadata-only candidates, and record a selected candidate with `--record <candidate-id>` after the current workspace has been resolved.

The boundary is strict: discovery may use candidate paths, file stats, and safe top-level identifiers such as session ids or sanitized base URL origins. It must not import transcript/message/content fields, must not echo token query strings, and must not upload private session content.

### M4.1 discovery UX polish

M4.1 adds `agent-memory discover all`, candidate reason/source summaries, and doctor cross-CLI coverage. This turns discovery from separate commands into a product-readable diagnostic flow while preserving the metadata-only boundary.

### M4.2 smoke report

M4.2 adds `agent-memory doctor --report`, a Markdown diagnostic report that summarizes workspace binding, locator coverage, recent locators, safety boundaries, and next steps. The report is intended for issues, onboarding, and release notes while preserving token/base URL sanitization.
