import { existsSync } from "node:fs";

import { sanitizeBaseUrl } from "../base-url.ts";
import { getBaseUrl } from "../config.ts";
import {
  getWorkspaceBinding,
  listAgentSessionLocators,
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
  safety: {
    metadataOnly: true;
    readsExternalCliHome: false;
    uploadsTranscript: false;
  };
  nextSteps: string[];
};

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

  input.writeStdout(formatDoctorSummary(snapshot));
  return 0;
}

export function buildDoctorSnapshot(cwd: string, env: NodeJS.ProcessEnv = process.env): DoctorSnapshot {
  const bridgePath = getBridgeDatabaseFilePath(cwd);
  const bridgeExists = existsSync(bridgePath);
  const binding = bridgeExists ? getWorkspaceBinding(cwd) : null;
  const locators = bridgeExists ? listAgentSessionLocators(cwd) : [];
  const safeBaseUrl = sanitizeBaseUrl(getBaseUrl(env));

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
    safety: {
      metadataOnly: true,
      readsExternalCliHome: false,
      uploadsTranscript: false
    },
    nextSteps: buildNextSteps(cwd, binding !== null, locators.length)
  };
}

function buildNextSteps(cwd: string, hasBinding: boolean, locatorCount: number) {
  if (!hasBinding) {
    return [
      `Run: pnpm -C apps/cli start resolve --workspace "${cwd}" --name <task-name>`,
      "Reason: this workspace is not bound to a project/task yet, so continuity has not started."
    ];
  }

  if (locatorCount === 0) {
    return [
      `Run: pnpm -C apps/cli start agent-sessions record --workspace "${cwd}" --agent-cli codex --locator <locator>`,
      "Reason: project/task identity exists, but no agent session locator metadata has been recorded yet."
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
