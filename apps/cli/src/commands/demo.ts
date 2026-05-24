import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ApiClient } from "../http/client.ts";
import { buildDoctorSnapshot } from "./doctor.ts";
import { resolveWorkspaceBinding } from "./resolve.ts";
import {
  buildAgentSessionLocatorInput,
  formatAgentSessionLocatorSummary,
  saveBoundAgentSessionLocator
} from "./agent-sessions.ts";
import { getWorkspaceBinding, listAgentSessionLocators } from "../storage/sqlite.ts";

type DemoResult = {
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

  if (subcommand !== "codex-continuity") {
    input.writeStderr("Usage: agent-memory demo codex-continuity [--workspace <path>] [--json]\n");
    return 1;
  }

  try {
    const result = await runCodexContinuityDemo(args, input);

    if (args.has("json")) {
      input.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    input.writeStdout(formatDemoSummary(result));
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
): Promise<DemoResult> {
  const requestedWorkspace = args.get("workspace")?.[0];
  const workspace = prepareDemoWorkspace(requestedWorkspace);

  assertWorkspaceIsClean(workspace.path);

  const resolveArgs = new Map<string, string[]>([
    ["name", [args.get("name")?.[0] ?? "codex-continuity-demo-task"]],
    ["project-name", [args.get("project-name")?.[0] ?? "codex-continuity-demo-project"]],
    ["description", [args.get("description")?.[0] ?? "Created by agent-memory demo"]],
    ["project-description", [args.get("project-description")?.[0] ?? "Created by agent-memory demo"]]
  ]);

  const binding = await resolveWorkspaceBinding(resolveArgs, {
    apiClient: input.apiClient,
    cwd: workspace.path
  });

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
    binding: {
      projectId: binding.projectId,
      projectName: binding.projectName,
      taskId: binding.taskId ?? null,
      taskTitle: binding.taskTitle ?? null
    },
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

function formatDemoSummary(result: DemoResult) {
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
