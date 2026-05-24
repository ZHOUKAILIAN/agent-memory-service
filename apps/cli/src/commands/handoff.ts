import type { ApiClient, TaskContextBundle } from "../http/client.ts";
import { getWorkspaceBinding } from "../storage/sqlite.ts";

export async function handoffCommand(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const subcommand = args.get("_subcommand")?.[0] ?? "resume";

  if (subcommand === "create") {
    return await createHandoff(args, input);
  }

  if (subcommand === "resume") {
    return await resumeHandoff(args, input);
  }

  input.writeStderr("Usage: agent-memory handoff <create|resume> [flags]\n");
  return 1;
}

async function createHandoff(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const binding = getWorkspaceBinding(input.cwd);

  if (!binding) {
    input.writeStderr("No workspace binding found. Run `agent-memory resolve` first.\n");
    return 1;
  }

  if (!binding.taskId) {
    input.writeStderr("No task binding found. Run `agent-memory resolve --name <task>` first.\n");
    return 1;
  }

  const summary = args.get("summary")?.[0];

  if (!summary) {
    input.writeStderr("Missing required flag: --summary\n");
    return 1;
  }

  const from = args.get("from")?.[0] ?? args.get("source")?.[0] ?? "agent-memory-handoff";
  const to = args.get("to")?.[0];
  const status = args.get("status")?.[0];
  const decisions = args.get("decision") ?? [];
  const constraints = args.get("constraint") ?? [];
  const nextSteps = args.get("next-step") ?? [];
  const content = renderHandoffContent({
    from,
    to,
    summary,
    status,
    decisions,
    constraints,
    nextSteps
  });

  await input.apiClient.createTaskCheckpoint(binding.taskId, {
    source: from,
    summary,
    content,
    current_status: status,
    decisions,
    constraints,
    next_steps: nextSteps
  });

  input.writeStdout(renderCreateSummary({
    workspacePath: binding.workspacePath,
    projectId: binding.projectId,
    taskId: binding.taskId,
    taskTitle: binding.taskTitle,
    from,
    to,
    summary,
    status,
    decisions,
    constraints,
    nextSteps
  }));
  return 0;
}

async function resumeHandoff(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const binding = getWorkspaceBinding(input.cwd);

  if (!binding) {
    input.writeStderr("No workspace binding found. Run `agent-memory resolve` first.\n");
    return 1;
  }

  if (!binding.taskId) {
    input.writeStderr("No task binding found. Run `agent-memory resolve --name <task>` first.\n");
    return 1;
  }

  const limitFlag = args.get("limit")?.[0];
  const limit = typeof limitFlag === "string" ? Number(limitFlag) : undefined;
  const context = await input.apiClient.getTaskContext(
    binding.taskId,
    Number.isFinite(limit) ? limit : undefined
  );

  if (args.get("json")?.[0] === "true") {
    input.writeStdout(`${JSON.stringify(buildResumePayload(binding.workspacePath, context), null, 2)}\n`);
    return 0;
  }

  input.writeStdout(renderResumePrompt(binding.workspacePath, context));
  return 0;
}

function renderHandoffContent(input: {
  from: string;
  to?: string;
  summary: string;
  status?: string;
  decisions: string[];
  constraints: string[];
  nextSteps: string[];
}) {
  const lines = [
    "# Agent handoff",
    "",
    `From: ${input.from}`
  ];

  if (input.to) {
    lines.push(`To: ${input.to}`);
  }

  lines.push("", `Summary: ${input.summary}`);

  if (input.status) {
    lines.push(`Status: ${input.status}`);
  }

  pushList(lines, "Decisions", input.decisions);
  pushList(lines, "Constraints", input.constraints);
  pushList(lines, "Next steps", input.nextSteps);

  lines.push(
    "",
    "Safety boundary: this handoff is structured continuation context, not a private transcript import."
  );

  return `${lines.join("\n")}\n`;
}

function renderCreateSummary(input: {
  workspacePath: string;
  projectId: string;
  taskId: string;
  taskTitle?: string | null;
  from: string;
  to?: string;
  summary: string;
  status?: string;
  decisions: string[];
  constraints: string[];
  nextSteps: string[];
}) {
  const lines = [
    "Handoff checkpoint created",
    `workspace: ${input.workspacePath}`,
    `projectId: ${input.projectId}`,
    `taskId: ${input.taskId}`,
    `task: ${input.taskTitle ?? "-"}`,
    `from: ${input.from}`
  ];

  if (input.to) {
    lines.push(`to: ${input.to}`);
  }

  lines.push(`summary: ${input.summary}`);

  if (input.status) {
    lines.push(`status: ${input.status}`);
  }

  lines.push(
    `decisions: ${input.decisions.length}`,
    `constraints: ${input.constraints.length}`,
    `nextSteps: ${input.nextSteps.length}`,
    "safety: metadata/structured context only; no private transcript import"
  );

  return `${lines.join("\n")}\n`;
}

function renderResumePrompt(workspacePath: string, context: TaskContextBundle) {
  const lines = [
    "# Continue this agent task",
    "",
    "Use this structured handoff context to continue the same engineering thread. Do not treat it as a private transcript dump.",
    "",
    "## Identity",
    "",
    `Workspace: ${workspacePath}`,
    `Project: ${context.project.name} (${context.project.id})`,
    `Task: ${context.task.title} (${context.task.id})`
  ];

  if (context.project.repo_url) {
    lines.push(`Repo: ${context.project.repo_url}`);
  }

  lines.push("", "## Current status", "", context.summary.current_status || context.summary.summary || "No current status recorded.");

  pushList(lines, "Decisions", context.summary.active_decisions);
  pushList(lines, "Constraints", context.summary.active_constraints);
  pushList(lines, "Next steps", context.summary.next_steps);

  lines.push("", "## Recent checkpoints");

  if (context.checkpoints.recent.length === 0) {
    lines.push("", "- none recorded");
  } else {
    lines.push("");
    for (const checkpoint of context.checkpoints.recent) {
      lines.push(`- ${checkpoint.summary} (${checkpoint.source}, ${checkpoint.created_at})`);
      if (checkpoint.current_status) {
        lines.push(`  status: ${checkpoint.current_status}`);
      }
    }
  }

  lines.push(
    "",
    "## Safety boundary",
    "",
    "This context comes from AMS structured summaries/checkpoints. It is not a raw transcript import and should not contain tokens, cookies, Authorization headers, or private conversation dumps."
  );

  return `${lines.join("\n")}\n`;
}

function buildResumePayload(workspacePath: string, context: TaskContextBundle) {
  return {
    workspacePath,
    project: context.project,
    task: context.task,
    summary: context.summary,
    checkpoints: context.checkpoints,
    safety: {
      transcriptImport: false,
      privateContentBoundary: "structured summaries/checkpoints only"
    },
    generatedAt: context.generated_at
  };
}

function pushList(lines: string[], title: string, items: string[]) {
  lines.push("", `## ${title}`);

  if (items.length === 0) {
    lines.push("", "- none recorded");
    return;
  }

  lines.push("");
  for (const item of items) {
    lines.push(`- ${item}`);
  }
}
