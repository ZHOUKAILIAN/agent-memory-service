import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline/promises";
import path from "node:path";

import { sanitizeBaseUrl } from "../base-url.ts";
import type { ApiClient } from "../http/client.ts";
import { getWorkspaceBinding, listAgentSessionLocators, type AgentCli } from "../storage/sqlite.ts";
import { getBridgeDirectory } from "../workspace.ts";
import { buildAgentSessionLocatorInput, saveBoundAgentSessionLocator } from "./agent-sessions.ts";

const allowedAgentCli = new Set<AgentCli>(["codex", "gemini", "claude", "other"]);

type PromptMode = "auto" | "yes" | "no" | "skipped";

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
  promptMode: PromptMode;
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
    stdin?: NodeJS.ReadStream;
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
    stdin?: NodeJS.ReadStream;
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

  if (!sanitizedBaseUrl || !sanitizedBaseUrl.label) {
    input.writeStderr("Invalid --base-url\n");
    return 1;
  }

  const agentCli = agentCliValue as AgentCli;
  const providerLabel = args.get("provider")?.[0] ?? null;
  const locator = args.get("locator")?.[0] ?? `${agentCli}:${sanitizedBaseUrl.hash.slice(0, 12)}`;
  const previous = findPreviousBaseUrl(input.cwd, agentCli, sanitizedBaseUrl.hash);
  const changed = Boolean(previous && previous.baseUrlHash !== sanitizedBaseUrl.hash);
  const decision = await decidePreserve(args, {
    changed,
    previousBaseUrlLabel: previous?.baseUrlLabel ?? null,
    currentBaseUrlLabel: sanitizedBaseUrl.label,
    stdin: input.stdin,
    writeStdout: input.writeStdout
  });
  const preserve = decision.preserve;

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
    promptMode: decision.mode,
    continuation,
    safety: {
      transcriptImport: false,
      metadataOnly: true
    },
    updatedAt: new Date().toISOString()
  };

  writeContinuityCache(input.cwd, cache);

  if (!args.has("json") && !args.has("no-animation")) {
    input.writeStdout(renderSwitchAnimation(cache));
  }

  if (args.has("json")) {
    input.writeStdout(`${JSON.stringify(cache, null, 2)}\n`);
    return 0;
  }

  input.writeStdout(formatSwitchSummary(cache));
  return 0;
}

async function decidePreserve(
  args: Map<string, string[]>,
  input: {
    changed: boolean;
    previousBaseUrlLabel: string | null;
    currentBaseUrlLabel: string;
    stdin?: NodeJS.ReadStream;
    writeStdout: (chunk: string) => void;
  }
): Promise<{ preserve: boolean; mode: PromptMode }> {
  if (args.has("yes") || args.has("preserve")) {
    return { preserve: true, mode: "yes" };
  }

  if (args.has("no-preserve")) {
    return { preserve: false, mode: "no" };
  }

  if (!input.changed) {
    return { preserve: true, mode: "skipped" };
  }

  if (!input.stdin?.isTTY || !process.stdout.isTTY) {
    return { preserve: true, mode: "auto" };
  }

  input.writeStdout(renderSwitchPrompt(input.previousBaseUrlLabel, input.currentBaseUrlLabel));
  const rl = readline.createInterface({ input: input.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Keep current task context for the new baseUrl? [Y/n] ");
    const normalized = answer.trim().toLowerCase();
    return {
      preserve: normalized === "" || normalized === "y" || normalized === "yes",
      mode: "auto"
    };
  } finally {
    rl.close();
  }
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

function renderSwitchPrompt(previousBaseUrlLabel: string | null, currentBaseUrlLabel: string) {
  return [
    "",
    "╭────────────────────────────────────────────╮",
    "│ ⚡ Base URL switch detected                │",
    "╰────────────────────────────────────────────╯",
    `from  ${previousBaseUrlLabel ?? "-"}`,
    `to    ${currentBaseUrlLabel}`,
    "",
    "AMS can keep your workspace/project/task context and prepare it for the new provider/baseUrl.",
    "Safety: structured context only; no transcript import.",
    ""
  ].join("\n");
}

function renderSwitchAnimation(cache: ContinuityCache) {
  const marker = cache.changed ? "↻" : "+";
  const preserve = cache.preserved ? "preserved" : "not preserved";
  return [
    "╭────────────────────────────────────────────╮",
    `│ ${marker} AMS continuity cache                 │`,
    "╰────────────────────────────────────────────╯",
    `  ${cache.previousBaseUrlLabel ?? "first baseUrl"}`,
    "          │",
    "          ▼",
    `  ${cache.baseUrlLabel ?? "-"}`,
    "",
    `  context: ${preserve}`,
    `  task: ${cache.taskId ?? "-"}`,
    `  next steps cached: ${cache.continuation.nextSteps.length}`,
    ""
  ].join("\n");
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
    `promptMode: ${cache.promptMode}`,
    `nextSteps: ${cache.continuation.nextSteps.length}`,
    "cache: .agent-memory/cache/continuation-latest.json",
    "safety: metadata/structured context only; no private transcript import"
  ];

  if (cache.changed && cache.preserved) {
    lines.push("resume: run `agent-memory handoff resume` or feed the cached continuation context to the next provider/baseUrl.");
  }

  return `${lines.join("\n")}\n`;
}
