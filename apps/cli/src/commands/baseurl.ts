import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { sanitizeBaseUrl } from "../base-url.ts";
import type { ApiClient } from "../http/client.ts";
import { getWorkspaceBinding, listAgentSessionLocators, type AgentCli } from "../storage/sqlite.ts";
import { getBridgeDirectory } from "../workspace.ts";
import { buildAgentSessionLocatorInput, saveBoundAgentSessionLocator } from "./agent-sessions.ts";

const allowedAgentCli = new Set<AgentCli>(["codex", "gemini", "claude", "other"]);

type ContinuityCache = {
  workspacePath: string;
  projectId: string;
  taskId: string | null;
  taskTitle: string | null;
  agentCli: AgentCli;
  locator: string;
  providerLabel: string | null;
  baseUrlLabel: string | null;
  baseUrlHash: string | null;
  previousBaseUrlLabel: string | null;
  previousBaseUrlHash: string | null;
  changed: boolean;
  preserved: boolean;
  continuation: {
    summary: string;
    currentStatus: string | null;
    decisions: string[];
    constraints: string[];
    nextSteps: string[];
  };
  safety: {
    transcriptImport: false;
    metadataOnly: true;
  };
  updatedAt: string;
};

export async function baseurlCommand(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const subcommand = args.get("_subcommand")?.[0];

  if (subcommand !== "switch") {
    input.writeStderr("Usage: agent-memory baseurl switch --agent-cli <codex|gemini|claude|other> --base-url <url> [--provider <label>] [--locator <id>] [--yes] [--json]\n");
    return 1;
  }

  return await switchBaseUrl(args, input);
}

async function switchBaseUrl(
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

  const agentCliValue = args.get("agent-cli")?.[0];
  const baseUrl = args.get("base-url")?.[0];

  if (!agentCliValue) {
    input.writeStderr("Missing required flag: --agent-cli\n");
    return 1;
  }

  if (!allowedAgentCli.has(agentCliValue as AgentCli)) {
    input.writeStderr("Invalid --agent-cli. Expected one of: codex, gemini, claude, other\n");
    return 1;
  }

  if (!baseUrl) {
    input.writeStderr("Missing required flag: --base-url\n");
    return 1;
  }

  const sanitizedBaseUrl = sanitizeBaseUrl(baseUrl);

  if (!sanitizedBaseUrl) {
    input.writeStderr("Invalid --base-url\n");
    return 1;
  }

  const agentCli = agentCliValue as AgentCli;
  const providerLabel = args.get("provider")?.[0] ?? null;
  const locator = args.get("locator")?.[0] ?? `${agentCli}:${sanitizedBaseUrl.hash.slice(0, 12)}`;
  const previous = findPreviousBaseUrl(input.cwd, agentCli, sanitizedBaseUrl.hash);
  const changed = Boolean(previous && previous.baseUrlHash !== sanitizedBaseUrl.hash);
  const preserve = args.has("yes") || args.has("preserve") || !args.has("no-preserve");

  const record = saveBoundAgentSessionLocator(input.cwd, {
    binding,
    record: buildAgentSessionLocatorInput({
      agentCli,
      locator,
      providerLabel: providerLabel ?? undefined,
      baseUrl,
      metadata: {
        source: "baseurl-switch",
        changed,
        preserve
      }
    })
  });

  const continuation = binding.taskId && preserve
    ? await loadContinuation(input.apiClient, binding.taskId)
    : emptyContinuation();

  const cache: ContinuityCache = {
    workspacePath: binding.workspacePath,
    projectId: binding.projectId,
    taskId: binding.taskId ?? null,
    taskTitle: binding.taskTitle ?? null,
    agentCli,
    locator: record.locator,
    providerLabel,
    baseUrlLabel: record.baseUrlLabel ?? null,
    baseUrlHash: record.baseUrlHash ?? null,
    previousBaseUrlLabel: previous?.baseUrlLabel ?? null,
    previousBaseUrlHash: previous?.baseUrlHash ?? null,
    changed,
    preserved: preserve,
    continuation,
    safety: {
      transcriptImport: false,
      metadataOnly: true
    },
    updatedAt: new Date().toISOString()
  };

  writeContinuityCache(input.cwd, cache);

  if (args.has("json")) {
    input.writeStdout(`${JSON.stringify(cache, null, 2)}\n`);
    return 0;
  }

  input.writeStdout(formatSwitchSummary(cache));
  return 0;
}

function findPreviousBaseUrl(cwd: string, agentCli: AgentCli, newBaseUrlHash: string) {
  const records = listAgentSessionLocators(cwd)
    .filter((record) => record.agentCli === agentCli && record.baseUrlHash)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return records.find((record) => record.baseUrlHash !== newBaseUrlHash) ?? records[0] ?? null;
}

async function loadContinuation(apiClient: ApiClient, taskId: string): Promise<ContinuityCache["continuation"]> {
  try {
    const context = await apiClient.getTaskContext(taskId, 3);
    return {
      summary: context.summary.summary,
      currentStatus: context.summary.current_status,
      decisions: context.summary.active_decisions,
      constraints: context.summary.active_constraints,
      nextSteps: context.summary.next_steps
    };
  } catch {
    return emptyContinuation();
  }
}

function emptyContinuation(): ContinuityCache["continuation"] {
  return {
    summary: "",
    currentStatus: null,
    decisions: [],
    constraints: [],
    nextSteps: []
  };
}

function writeContinuityCache(cwd: string, cache: ContinuityCache) {
  const cacheDirectory = path.join(getBridgeDirectory(cwd), "cache");
  mkdirSync(cacheDirectory, { recursive: true });
  const latestPath = path.join(cacheDirectory, "continuation-latest.json");
  const historyPath = path.join(cacheDirectory, "baseurl-switches.jsonl");

  writeFileSync(latestPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");

  let history = "";
  try {
    history = readFileSync(historyPath, "utf8");
  } catch {
    history = "";
  }
  writeFileSync(historyPath, `${history}${JSON.stringify(cache)}\n`, "utf8");
}

function formatSwitchSummary(cache: ContinuityCache) {
  const lines = [
    cache.changed ? "Base URL switch detected." : "Base URL recorded.",
    `workspace: ${cache.workspacePath}`,
    `projectId: ${cache.projectId}`,
    `taskId: ${cache.taskId ?? "-"}`,
    `agentCli: ${cache.agentCli}`,
    `provider: ${cache.providerLabel ?? "-"}`,
    `previousBaseUrl: ${cache.previousBaseUrlLabel ?? "-"}`,
    `currentBaseUrl: ${cache.baseUrlLabel ?? "-"}`,
    `changed: ${cache.changed ? "yes" : "no"}`,
    `preservedContext: ${cache.preserved ? "yes" : "no"}`,
    `nextSteps: ${cache.continuation.nextSteps.length}`,
    "cache: .agent-memory/cache/continuation-latest.json",
    "safety: metadata/structured context only; no private transcript import"
  ];

  if (cache.changed && cache.preserved) {
    lines.push("resume: run `agent-memory handoff resume` or feed the cached continuation context to the next provider/baseUrl.");
  }

  return `${lines.join("\n")}\n`;
}
