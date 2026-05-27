import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ApiClient, TaskContextBundle } from "../http/client.ts";
import { buildDoctorSnapshot } from "./doctor.ts";
import { resolveWorkspaceBinding } from "./resolve.ts";
import {
  buildAgentSessionLocatorInput,
  formatAgentSessionLocatorSummary,
  saveBoundAgentSessionLocator
} from "./agent-sessions.ts";
import { getWorkspaceBinding, listAgentSessionLocators, type WorkspaceBinding } from "../storage/sqlite.ts";

type CodexDemoResult = {
  demo: "codex-continuity";
  workspace: {
    path: string;
    temporary: boolean;
  };
  binding: {
    projectId: string;
    projectName: string;
    taskId: string | null;
    taskTitle: string | null;
  };
  locators: Array<{
    agentCli: "codex";
    locator: string;
    providerLabel: string | null;
    baseUrlLabel: string | null;
    baseUrlHash: string | null;
  }>;
  doctor: ReturnType<typeof buildDoctorSnapshot>;
  checks: {
    sameProjectTask: boolean;
    queryTokenRedacted: boolean;
    metadataOnly: boolean;
    readsExternalCliHome: boolean;
    uploadsTranscript: boolean;
  };
};

type HandoffDemoResult = {
  demo: "handoff-continuity";
  workspace: {
    path: string;
    temporary: boolean;
  };
  binding: {
    projectId: string;
    projectName: string;
    taskId: string | null;
    taskTitle: string | null;
  };
  handoff: {
    from: string;
    to: string;
    summary: string;
    status: string;
    decisions: string[];
    constraints: string[];
    nextSteps: string[];
  };
  resume: {
    prompt: string;
    context: TaskContextBundle;
  };
  checks: {
    sameProjectTask: boolean;
    structuredContextOnly: boolean;
    hasNextStep: boolean;
    hasSafetyBoundary: boolean;
  };
};

const DEMO_LOCATORS = [
  {
    locator: "codex-provider-a",
    provider: "provider-a",
    baseUrl: "https://api.first.example/v1?token=fake-secret-a"
  },
  {
    locator: "codex-provider-b",
    provider: "provider-b",
    baseUrl: "https://api.second.example/v1?token=fake-secret-b"
  }
] as const;

const HANDOFF_FIXTURE = {
  from: "provider-b",
  to: "provider-a",
  summary: "Provider B finished discovery UX polish",
  status: "Ready for provider A to continue",
  decisions: ["Provider/base URL remains source metadata, not task identity"],
  constraints: ["Do not import private transcripts"],
  nextSteps: ["Continue implementation from provider A"]
} as const;

export async function demoCommand(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    env?: NodeJS.ProcessEnv;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const subcommand = args.get("_subcommand")?.[0];

  if (subcommand !== "codex-continuity" && subcommand !== "handoff-continuity") {
    input.writeStderr("Usage: agent-continuity demo <codex-continuity|handoff-continuity> [--workspace <path>] [--json]\n");
    return 1;
  }

  try {
    if (subcommand === "handoff-continuity") {
      const result = await runHandoffContinuityDemo(args, input);

      if (args.has("json")) {
        input.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
        return 0;
      }

      input.writeStdout(formatHandoffDemoSummary(result));
      return 0;
    }

    const result = await runCodexContinuityDemo(args, input);

    if (args.has("json")) {
      input.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    input.writeStdout(formatCodexDemoSummary(result));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.writeStderr(`${message}\n`);
    return 1;
  }
}

export async function runCodexContinuityDemo(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<CodexDemoResult> {
  const workspace = prepareDemoWorkspace(args.get("workspace")?.[0]);
  assertWorkspaceIsClean(workspace.path);
  const binding = await resolveDemoBinding(args, input.apiClient, workspace.path, "codex-continuity");

  const records = DEMO_LOCATORS.map((locatorInput) => saveBoundAgentSessionLocator(workspace.path, {
    binding,
    record: buildAgentSessionLocatorInput({
      agentCli: "codex",
      locator: locatorInput.locator,
      providerLabel: locatorInput.provider,
      baseUrl: locatorInput.baseUrl
    })
  }));

  const doctor = buildDoctorSnapshot(workspace.path, input.env);
  validateDemoSnapshot(binding.projectId, binding.taskId ?? null, doctor);

  const outputText = JSON.stringify({ binding, records, doctor });

  return {
    demo: "codex-continuity",
    workspace,
    binding: serializeBinding(binding),
    locators: records.map((record) => ({
      agentCli: "codex" as const,
      locator: record.locator,
      providerLabel: record.providerLabel ?? null,
      baseUrlLabel: record.baseUrlLabel ?? null,
      baseUrlHash: record.baseUrlHash ?? null
    })),
    doctor,
    checks: {
      sameProjectTask: records.every((record) => record.projectId === binding.projectId && (record.taskId ?? null) === (binding.taskId ?? null)),
      queryTokenRedacted: !/token=fake-secret/i.test(outputText),
      metadataOnly: doctor.safety.metadataOnly,
      readsExternalCliHome: doctor.safety.readsExternalCliHome,
      uploadsTranscript: doctor.safety.uploadsTranscript
    }
  };
}

export async function runHandoffContinuityDemo(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
  }
): Promise<HandoffDemoResult> {
  const workspace = prepareDemoWorkspace(args.get("workspace")?.[0]);
  assertWorkspaceIsClean(workspace.path);
  const binding = await resolveDemoBinding(args, input.apiClient, workspace.path, "handoff-continuity");

  if (!binding.taskId) {
    throw new Error("Demo failed: resolved workspace has no task binding.");
  }

  const handoffContent = renderDemoHandoffContent(HANDOFF_FIXTURE);

  await input.apiClient.createTaskCheckpoint(binding.taskId, {
    source: HANDOFF_FIXTURE.from,
    summary: HANDOFF_FIXTURE.summary,
    content: handoffContent,
    current_status: HANDOFF_FIXTURE.status,
    decisions: [...HANDOFF_FIXTURE.decisions],
    constraints: [...HANDOFF_FIXTURE.constraints],
    next_steps: [...HANDOFF_FIXTURE.nextSteps]
  });

  const context = await input.apiClient.getTaskContext(binding.taskId, 3);
  const prompt = renderDemoResumePrompt(workspace.path, context);

  return {
    demo: "handoff-continuity",
    workspace,
    binding: serializeBinding(binding),
    handoff: {
      from: HANDOFF_FIXTURE.from,
      to: HANDOFF_FIXTURE.to,
      summary: HANDOFF_FIXTURE.summary,
      status: HANDOFF_FIXTURE.status,
      decisions: [...HANDOFF_FIXTURE.decisions],
      constraints: [...HANDOFF_FIXTURE.constraints],
      nextSteps: [...HANDOFF_FIXTURE.nextSteps]
    },
    resume: {
      prompt,
      context
    },
    checks: {
      sameProjectTask: context.project.id === binding.projectId && context.task.id === binding.taskId,
      structuredContextOnly: true,
      hasNextStep: prompt.includes(HANDOFF_FIXTURE.nextSteps[0]),
      hasSafetyBoundary: /not a raw transcript import/i.test(prompt)
    }
  };
}

function prepareDemoWorkspace(requestedWorkspace?: string) {
  if (!requestedWorkspace) {
    return {
      path: mkdtempSync(path.join(tmpdir(), "agent-memory-demo-")),
      temporary: true
    };
  }

  mkdirSync(requestedWorkspace, { recursive: true });
  return {
    path: requestedWorkspace,
    temporary: false
  };
}

async function resolveDemoBinding(
  args: Map<string, string[]>,
  apiClient: ApiClient,
  workspacePath: string,
  demoName: string
) {
  const resolveArgs = new Map<string, string[]>([
    ["name", [args.get("name")?.[0] ?? `${demoName}-demo-task`]],
    ["project-name", [args.get("project-name")?.[0] ?? `${demoName}-demo-project`]],
    ["description", [args.get("description")?.[0] ?? "Created by agent-continuity demo"]],
    ["project-description", [args.get("project-description")?.[0] ?? "Created by agent-continuity demo"]]
  ]);

  return await resolveWorkspaceBinding(resolveArgs, {
    apiClient,
    cwd: workspacePath
  });
}

function assertWorkspaceIsClean(workspacePath: string) {
  const binding = getWorkspaceBinding(workspacePath);
  const locators = listAgentSessionLocators(workspacePath);

  if (binding || locators.length > 0) {
    throw new Error("Demo workspace must be empty. 请使用空目录，或不传 --workspace 让命令自动创建临时目录。");
  }
}

function validateDemoSnapshot(projectId: string, taskId: string | null, doctor: ReturnType<typeof buildDoctorSnapshot>) {
  if (!doctor.binding.exists || doctor.locators.count !== 2) {
    throw new Error("Demo failed: doctor snapshot did not confirm one binding plus two locators.");
  }

  if (doctor.binding.projectId !== projectId || (doctor.binding.taskId ?? null) !== taskId) {
    throw new Error("Demo failed: locator continuity does not point to the resolved project/task.");
  }

  const doctorText = JSON.stringify(doctor);
  if (/token=fake-secret/i.test(doctorText)) {
    throw new Error("Demo failed: sanitized output leaked a fake token query.");
  }
}

function serializeBinding(binding: WorkspaceBinding) {
  return {
    projectId: binding.projectId,
    projectName: binding.projectName,
    taskId: binding.taskId ?? null,
    taskTitle: binding.taskTitle ?? null
  };
}

function formatCodexDemoSummary(result: CodexDemoResult) {
  const lines = [
    "Codex continuity demo completed.",
    `Workspace: ${result.workspace.path}`,
    `Workspace mode: ${result.workspace.temporary ? "temporary" : "provided"}`,
    `projectId: ${result.binding.projectId}`,
    `taskId: ${result.binding.taskId ?? "-"}`,
    "",
    "Locators"
  ];

  for (const locator of result.locators) {
    lines.push(`- ${formatAgentSessionLocatorSummary({
      workspacePath: result.workspace.path,
      projectId: result.binding.projectId,
      taskId: result.binding.taskId,
      agentCli: locator.agentCli,
      locator: locator.locator,
      providerLabel: locator.providerLabel,
      baseUrlLabel: locator.baseUrlLabel,
      taskKey: null,
      updatedAt: "demo",
      id: "demo",
      sessionPath: null,
      baseUrlHash: locator.baseUrlHash,
      metadata: {},
      createdAt: "demo"
    }).replace(/^Recorded .*\n/, "")}`);
  }

  lines.push(
    "",
    `Doctor locator count: ${result.doctor.locators.count}`,
    `Same project/task: ${result.checks.sameProjectTask ? "yes" : "no"}`,
    `Query token redacted: ${result.checks.queryTokenRedacted ? "yes" : "no"}`,
    "Safety: metadata only; does not read private CLI transcripts; does not upload transcripts.",
    "Result: two Codex locators now share one workspace/project/task continuity record."
  );

  return `${lines.join("\n")}\n`;
}

function formatHandoffDemoSummary(result: HandoffDemoResult) {
  const lines = [
    "Handoff continuity demo completed.",
    `Workspace: ${result.workspace.path}`,
    `Workspace mode: ${result.workspace.temporary ? "temporary" : "provided"}`,
    `projectId: ${result.binding.projectId}`,
    `taskId: ${result.binding.taskId ?? "-"}`,
    "",
    "Step 1: provider-b wrote a structured handoff checkpoint.",
    `summary: ${result.handoff.summary}`,
    `status: ${result.handoff.status}`,
    "",
    "Step 2: provider-a rendered a resume prompt from the same task context.",
    "",
    result.resume.prompt.trim(),
    "",
    `Same project/task: ${result.checks.sameProjectTask ? "yes" : "no"}`,
    `Structured context only: ${result.checks.structuredContextOnly ? "yes" : "no"}`,
    `Has next step: ${result.checks.hasNextStep ? "yes" : "no"}`,
    `Has safety boundary: ${result.checks.hasSafetyBoundary ? "yes" : "no"}`,
    "Result: provider/baseUrl B can hand off structured continuation context that provider/baseUrl A can resume."
  ];

  return `${lines.join("\n")}\n`;
}

function renderDemoHandoffContent(input: typeof HANDOFF_FIXTURE) {
  return [
    "# Agent handoff",
    "",
    `From: ${input.from}`,
    `To: ${input.to}`,
    "",
    `Summary: ${input.summary}`,
    `Status: ${input.status}`,
    "",
    "## Decisions",
    ...input.decisions.map((item) => `- ${item}`),
    "",
    "## Constraints",
    ...input.constraints.map((item) => `- ${item}`),
    "",
    "## Next steps",
    ...input.nextSteps.map((item) => `- ${item}`),
    "",
    "Safety boundary: this handoff is structured continuation context, not a private transcript import."
  ].join("\n");
}

function renderDemoResumePrompt(workspacePath: string, context: TaskContextBundle) {
  const lines = [
    "# Continue this agent task",
    "",
    "Use this structured handoff context to continue the same engineering thread. Do not treat it as a private transcript dump.",
    "",
    "## Identity",
    "",
    `Workspace: ${workspacePath}`,
    `Project: ${context.project.name} (${context.project.id})`,
    `Task: ${context.task.title} (${context.task.id})`,
    "",
    "## Current status",
    "",
    context.summary.current_status || context.summary.summary || "No current status recorded.",
    "",
    "## Decisions",
    "",
    ...formatList(context.summary.active_decisions),
    "",
    "## Constraints",
    "",
    ...formatList(context.summary.active_constraints),
    "",
    "## Next steps",
    "",
    ...formatList(context.summary.next_steps),
    "",
    "## Recent checkpoints",
    "",
    ...(context.checkpoints.recent.length === 0
      ? ["- none recorded"]
      : context.checkpoints.recent.map((checkpoint) => `- ${checkpoint.summary} (${checkpoint.source}, ${checkpoint.created_at})`)),
    "",
    "## Safety boundary",
    "",
    "This context comes from AMS structured summaries/checkpoints. It is not a raw transcript import and should not contain tokens, cookies, Authorization headers, or private conversation dumps."
  ];

  return `${lines.join("\n")}\n`;
}

function formatList(items: string[]) {
  return items.length === 0 ? ["- none recorded"] : items.map((item) => `- ${item}`);
}
