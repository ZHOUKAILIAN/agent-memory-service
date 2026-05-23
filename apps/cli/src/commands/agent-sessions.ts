import {
  type AgentCli,
  type AgentSessionLocatorRecord,
  getWorkspaceBinding,
  listAgentSessionLocators,
  saveAgentSessionLocator
} from "../storage/sqlite.ts";
import { sanitizeBaseUrl } from "../base-url.ts";

const allowedAgentCli = new Set<AgentCli>(["codex", "gemini", "claude", "other"]);

type AgentSessionRecordInput = {
  agentCli: AgentCli;
  locator: string;
  sessionPath?: string;
  providerLabel?: string;
  baseUrl?: string;
  taskKey?: string;
};

export async function agentSessionsCommand(
  args: Map<string, string[]>,
  input: {
    cwd: string;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const action = args.get("_subcommand")?.[0];

  if (action === "record") {
    return recordAgentSessionLocator(args, input);
  }

  if (action === "list") {
    return listAgentSessions(args, input);
  }

  input.writeStderr("Usage: agent-memory agent-sessions <record|list> [flags]\n");
  return 1;
}

async function recordAgentSessionLocator(
  args: Map<string, string[]>,
  input: {
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

  const parsed = parseRecordInput(args);

  if ("error" in parsed) {
    input.writeStderr(`${parsed.error}\n`);
    return 1;
  }

  const sanitizedBaseUrl = sanitizeBaseUrl(parsed.baseUrl);
  const record = saveAgentSessionLocator(input.cwd, {
    workspacePath: binding.workspacePath,
    projectId: binding.projectId,
    taskId: binding.taskId ?? null,
    taskKey: parsed.taskKey ?? null,
    agentCli: parsed.agentCli,
    locator: parsed.locator,
    sessionPath: parsed.sessionPath ?? null,
    providerLabel: parsed.providerLabel ?? null,
    baseUrlHash: sanitizedBaseUrl?.hash ?? null,
    baseUrlLabel: sanitizedBaseUrl?.label ?? null,
    metadata: {}
  });

  if (args.has("json")) {
    input.writeStdout(`${JSON.stringify(record, null, 2)}\n`);
    return 0;
  }

  input.writeStdout(formatRecordSummary(record));
  return 0;
}

async function listAgentSessions(
  args: Map<string, string[]>,
  input: {
    cwd: string;
    writeStdout: (chunk: string) => void;
  }
) {
  const records = listAgentSessionLocators(input.cwd);

  if (args.has("json")) {
    input.writeStdout(`${JSON.stringify(records, null, 2)}\n`);
    return 0;
  }

  input.writeStdout(formatListSummary(input.cwd, records));
  return 0;
}

function parseRecordInput(args: Map<string, string[]>): AgentSessionRecordInput | { error: string } {
  const agentCliValue = args.get("agent-cli")?.[0];
  const locator = args.get("locator")?.[0] ?? args.get("session-path")?.[0];

  if (!agentCliValue) {
    return { error: "Missing required flag: --agent-cli" };
  }

  if (!allowedAgentCli.has(agentCliValue as AgentCli)) {
    return { error: "Invalid --agent-cli. Expected one of: codex, gemini, claude, other" };
  }

  if (!locator) {
    return { error: "Missing required flag: --locator (or provide --session-path)" };
  }

  return {
    agentCli: agentCliValue as AgentCli,
    locator,
    sessionPath: args.get("session-path")?.[0],
    providerLabel: args.get("provider")?.[0],
    baseUrl: args.get("base-url")?.[0],
    taskKey: args.get("task-key")?.[0]
  };
}

function formatRecordSummary(record: AgentSessionLocatorRecord) {
  const lines = [
    `Recorded ${record.agentCli} locator for workspace ${record.workspacePath}.`,
    `projectId: ${record.projectId}`,
    `taskId: ${record.taskId ?? "-"}`,
    `agentCli: ${record.agentCli}`,
    `locator: ${record.locator}`
  ];

  if (record.providerLabel) {
    lines.push(`provider: ${record.providerLabel}`);
  }

  if (record.baseUrlLabel) {
    lines.push(`baseUrl: ${record.baseUrlLabel}`);
  }

  if (record.taskKey) {
    lines.push(`taskKey: ${record.taskKey}`);
  }

  lines.push("metadata: metadata only; no transcript or ~/.codex content stored.");
  return `${lines.join("\n")}\n`;
}

function formatListSummary(workspacePath: string, records: AgentSessionLocatorRecord[]) {
  if (records.length === 0) {
    return [
      `Workspace: ${workspacePath}`,
      "Locator count: 0",
      "No recorded agent session locators."
    ].join("\n") + "\n";
  }

  const lines = [
    `Workspace: ${workspacePath}`,
    `Locator count: ${records.length}`,
    "metadata: metadata only; no transcript or ~/.codex content stored."
  ];

  for (const record of records) {
    lines.push(
      `- ${record.agentCli} ${record.locator} | projectId=${record.projectId} | taskId=${record.taskId ?? "-"} | provider=${record.providerLabel ?? "-"} | baseUrl=${record.baseUrlLabel ?? "-"} | updatedAt=${record.updatedAt}`
    );
  }

  return `${lines.join("\n")}\n`;
}
