import { existsSync } from "node:fs";

import { sanitizeBaseUrl } from "../base-url.ts";
import { getBaseUrl } from "../config.ts";
import {
  getWorkspaceBinding,
  listAgentSessionLocators,
  type AgentCli,
  type AgentSessionLocatorRecord
} from "../storage/sqlite.ts";
import { getBridgeDatabaseFilePath } from "../workspace.ts";

type DoctorSnapshot = {
  workspace: string;
  environment: {
    nodeVersion: string;
    baseUrlLabel: string | null;
    bridgePath: string;
    bridgeExists: boolean;
  };
  binding: {
    exists: boolean;
    projectId: string | null;
    projectName: string | null;
    taskId: string | null;
    taskTitle: string | null;
  };
  locators: {
    count: number;
    recent: Array<{
      agentCli: string;
      locator: string;
      providerLabel: string | null;
      baseUrlLabel: string | null;
      updatedAt: string;
    }>;
  };
  coverage: {
    targetAgentCli: AgentCli[];
    countsByCli: Record<AgentCli, number>;
    recordedAgentCli: AgentCli[];
    missingAgentCli: AgentCli[];
    status: "none" | "partial" | "full";
    summary: string;
  };
  safety: {
    metadataOnly: true;
    readsExternalCliHome: false;
    uploadsTranscript: false;
  };
  nextSteps: string[];
};

const TARGET_AGENT_CLI: AgentCli[] = ["codex", "gemini", "claude"];

export async function doctorCommand(
  args: Map<string, string[]>,
  input: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    writeStdout: (chunk: string) => void;
  }
) {
  const snapshot = buildDoctorSnapshot(input.cwd, input.env);

  if (args.has("json")) {
    input.writeStdout(`${JSON.stringify(snapshot, null, 2)}\n`);
    return 0;
  }

  if (args.has("report")) {
    input.writeStdout(formatDoctorReport(snapshot));
    return 0;
  }

  input.writeStdout(formatDoctorSummary(snapshot));
  return 0;
}

export function buildDoctorSnapshot(cwd: string, env: NodeJS.ProcessEnv = process.env): DoctorSnapshot {
  const bridgePath = getBridgeDatabaseFilePath(cwd);
  const bridgeExists = existsSync(bridgePath);
  const binding = bridgeExists ? getWorkspaceBinding(cwd) : null;
  const locators = bridgeExists ? listAgentSessionLocators(cwd) : [];
  const safeBaseUrl = sanitizeBaseUrl(getBaseUrl(env));
  const coverage = buildCoverage(locators);

  return {
    workspace: cwd,
    environment: {
      nodeVersion: process.version,
      baseUrlLabel: safeBaseUrl?.label ?? null,
      bridgePath,
      bridgeExists
    },
    binding: {
      exists: binding !== null,
      projectId: binding?.projectId ?? null,
      projectName: binding?.projectName ?? null,
      taskId: binding?.taskId ?? null,
      taskTitle: binding?.taskTitle ?? null
    },
    locators: {
      count: locators.length,
      recent: locators.slice(0, 5).map(mapLocatorSummary)
    },
    coverage,
    safety: {
      metadataOnly: true,
      readsExternalCliHome: false,
      uploadsTranscript: false
    },
    nextSteps: buildNextSteps(cwd, binding !== null, locators.length, coverage)
  };
}

function buildCoverage(locators: AgentSessionLocatorRecord[]) {
  const countsByCli: Record<AgentCli, number> = {
    codex: 0,
    gemini: 0,
    claude: 0,
    other: 0
  };

  for (const locator of locators) {
    countsByCli[locator.agentCli] += 1;
  }

  const recordedAgentCli = TARGET_AGENT_CLI.filter((agentCli) => countsByCli[agentCli] > 0);
  const missingAgentCli = TARGET_AGENT_CLI.filter((agentCli) => countsByCli[agentCli] === 0);
  const status = recordedAgentCli.length === 0
    ? "none"
    : missingAgentCli.length === 0
      ? "full"
      : "partial";

  const recordedSummary = recordedAgentCli.length > 0
    ? recordedAgentCli.map((agentCli) => `${agentCli}(${countsByCli[agentCli]})`).join(", ")
    : "none";
  const missingSummary = missingAgentCli.length > 0 ? missingAgentCli.join(", ") : "none";

  return {
    targetAgentCli: TARGET_AGENT_CLI,
    countsByCli,
    recordedAgentCli,
    missingAgentCli,
    status,
    summary: `recorded ${recordedSummary}; missing ${missingSummary}`
  } satisfies DoctorSnapshot["coverage"];
}

function buildNextSteps(
  cwd: string,
  hasBinding: boolean,
  locatorCount: number,
  coverage: DoctorSnapshot["coverage"]
) {
  if (!hasBinding) {
    return [
      `Run: pnpm -C apps/cli start resolve --workspace "${cwd}" --name <task-name>`,
      "Reason: this workspace is not bound to a project/task yet, so continuity has not started."
    ];
  }

  if (locatorCount === 0) {
    return [
      `Run: pnpm -C apps/cli start discover all --workspace "${cwd}"`,
      "Reason: project/task identity exists, but no agent session locator metadata has been recorded yet.",
      `Alternative: pnpm -C apps/cli start agent-sessions record --workspace "${cwd}" --agent-cli codex --locator <locator>`
    ];
  }

  if (coverage.status !== "full") {
    return [
      `Run: pnpm -C apps/cli start discover all --workspace "${cwd}"`,
      `Optional: ${coverage.missingAgentCli.map((agentCli) => `pnpm -C apps/cli start discover ${agentCli} --workspace "${cwd}"`).join(" | ")}`,
      "Reason: this workspace has partial cross-CLI coverage; record missing CLI locator metadata to improve continuity." 
    ];
  }

  return [
    `Run: pnpm -C apps/cli start context --workspace "${cwd}"`,
    `Optional: pnpm -C apps/cli start checkpoint --workspace "${cwd}" --summary <what-changed>`,
    "Optional: record more provider/base URL changes with agent-sessions record to keep continuity observable."
  ];
}

function mapLocatorSummary(record: AgentSessionLocatorRecord) {
  return {
    agentCli: record.agentCli,
    locator: record.locator,
    providerLabel: record.providerLabel ?? null,
    baseUrlLabel: record.baseUrlLabel ?? null,
    updatedAt: record.updatedAt
  };
}


export function formatDoctorReport(snapshot: DoctorSnapshot) {
  const bindingStatus = snapshot.binding.exists ? "present" : "missing";
  const locatorRows = snapshot.locators.recent.length === 0
    ? "| - | - | - | - |\n"
    : snapshot.locators.recent.map((locator) => (
      `| ${locator.agentCli} | ${escapeMarkdown(locator.locator)} | ${escapeMarkdown(locator.providerLabel ?? "-")} | ${escapeMarkdown(locator.baseUrlLabel ?? "-")} |`
    )).join("\n") + "\n";
  const nextSteps = snapshot.nextSteps.map((step) => `- ${step}`).join("\n");

  return `# agent-continuity doctor report\n\n` +
    `## Summary\n\n` +
    `- Workspace: \`${escapeMarkdown(snapshot.workspace)}\`\n` +
    `- Bridge DB: ${snapshot.environment.bridgeExists ? "present" : "missing"}\n` +
    `- Workspace binding: ${bindingStatus}\n` +
    `- Project: ${snapshot.binding.projectId ?? "-"} (${snapshot.binding.projectName ?? "-"})\n` +
    `- Task: ${snapshot.binding.taskId ?? "-"} (${snapshot.binding.taskTitle ?? "-"})\n` +
    `- Locator count: ${snapshot.locators.count}\n` +
    `- Coverage: ${snapshot.coverage.status} — ${snapshot.coverage.summary}\n\n` +
    `## Coverage by CLI\n\n` +
    `| CLI | Locators |\n| --- | ---: |\n` +
    `| codex | ${snapshot.coverage.countsByCli.codex} |\n` +
    `| gemini | ${snapshot.coverage.countsByCli.gemini} |\n` +
    `| claude | ${snapshot.coverage.countsByCli.claude} |\n` +
    `| other | ${snapshot.coverage.countsByCli.other} |\n\n` +
    `## Recent locators\n\n` +
    `| CLI | Locator | Provider | Base URL |\n| --- | --- | --- | --- |\n` +
    locatorRows +
    `\n## Safety\n\n` +
    `- Metadata only\n` +
    `- Does not read private CLI transcripts\n` +
    `- Does not upload transcripts\n` +
    `- Base URL labels are sanitized to origins\n\n` +
    `## Next steps\n\n${nextSteps}\n`;
}

function escapeMarkdown(value: string) {
  return value.replace(/[|`]/g, "\\$&");
}

function formatDoctorSummary(snapshot: DoctorSnapshot) {
  const lines = [
    "Doctor summary",
    `Workspace: ${snapshot.workspace}`,
    `Node.js: ${snapshot.environment.nodeVersion}`,
    `Base URL: ${snapshot.environment.baseUrlLabel ?? "-"}`,
    `Bridge DB: ${snapshot.environment.bridgeExists ? "present" : "missing"} (${snapshot.environment.bridgePath})`,
    `Workspace binding: ${snapshot.binding.exists ? "present" : "missing"}`,
    `Locator count: ${snapshot.locators.count}`,
    "",
    "Binding",
    `projectId: ${snapshot.binding.projectId ?? "-"}`,
    `projectName: ${snapshot.binding.projectName ?? "-"}`,
    `taskId: ${snapshot.binding.taskId ?? "-"}`,
    `taskTitle: ${snapshot.binding.taskTitle ?? "-"}`,
    "",
    "Cross-CLI coverage",
    `status: ${snapshot.coverage.status}`,
    `summary: ${snapshot.coverage.summary}`,
    `codex: ${snapshot.coverage.countsByCli.codex}`,
    `gemini: ${snapshot.coverage.countsByCli.gemini}`,
    `claude: ${snapshot.coverage.countsByCli.claude}`,
    `other: ${snapshot.coverage.countsByCli.other}`,
    `missing: ${snapshot.coverage.missingAgentCli.length > 0 ? snapshot.coverage.missingAgentCli.join(", ") : "none"}`,
    "",
    "Recent locators"
  ];

  if (snapshot.locators.recent.length === 0) {
    lines.push("- none recorded");
  } else {
    for (const locator of snapshot.locators.recent) {
      lines.push(
        `- ${locator.agentCli} ${locator.locator} | provider=${locator.providerLabel ?? "-"} | baseUrl=${locator.baseUrlLabel ?? "-"} | updatedAt=${locator.updatedAt}`
      );
    }
  }

  lines.push(
    "",
    "Safety",
    "- metadata only",
    "- does not read private CLI transcripts",
    "- does not upload transcripts",
    "",
    "Next steps"
  );

  for (const step of snapshot.nextSteps) {
    lines.push(`- ${step}`);
  }

  return `${lines.join("\n")}\n`;
}
