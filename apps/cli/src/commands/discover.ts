import { readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { getWorkspaceBinding } from "../storage/sqlite.ts";
import { saveBoundAgentSessionLocator } from "./agent-sessions.ts";

type DiscoveryAgentCli = "codex" | "gemini" | "claude";

type DiscoveryCandidate = {
  id: string;
  agentCli: DiscoveryAgentCli;
  locator: string;
  sessionPath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  metadata: Record<string, unknown>;
};

type DiscoveryAdapter = {
  agentCli: DiscoveryAgentCli;
  displayName: string;
  defaultHome: string;
  homeAlias: string;
};

const DISCOVERY_ADAPTERS: Record<DiscoveryAgentCli, DiscoveryAdapter> = {
  codex: {
    agentCli: "codex",
    displayName: "Codex",
    defaultHome: path.join(os.homedir(), ".codex"),
    homeAlias: "codex-home"
  },
  gemini: {
    agentCli: "gemini",
    displayName: "Gemini",
    defaultHome: path.join(os.homedir(), ".gemini"),
    homeAlias: "gemini-home"
  },
  claude: {
    agentCli: "claude",
    displayName: "Claude",
    defaultHome: path.join(os.homedir(), ".claude"),
    homeAlias: "claude-home"
  }
};

const SAFE_TOP_LEVEL_KEYS = [
  "id",
  "sessionId",
  "conversationId",
  "model",
  "provider",
  "providerLabel",
  "createdAt",
  "updatedAt",
  "baseUrl"
] as const;

export async function discoverCommand(
  args: Map<string, string[]>,
  input: {
    cwd: string;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const target = args.get("_subcommand")?.[0];
  if (!target || !isDiscoveryAgentCli(target)) {
    input.writeStderr("Usage: agent-memory discover <codex|gemini|claude> [--home <path>] [--codex-home <path>] [--gemini-home <path>] [--claude-home <path>] [--json] [--record <candidate-id>]\n");
    return 1;
  }

  const adapter = DISCOVERY_ADAPTERS[target];
  const home = resolveDiscoveryHome(args, adapter);
  const candidates = discoverCandidates(adapter, home);
  const recordId = args.get("record")?.[0];

  if (recordId) {
    const binding = getWorkspaceBinding(input.cwd);
    if (!binding) {
      input.writeStderr(`No workspace binding found. Run \`agent-memory resolve\` first before recording a discovered ${adapter.displayName} locator.\n`);
      return 1;
    }
    const candidate = candidates.find((item) => item.id === recordId);
    if (!candidate) {
      input.writeStderr(`No ${adapter.displayName} discovery candidate found for id: ${recordId}\n`);
      return 1;
    }
    const record = saveBoundAgentSessionLocator(input.cwd, {
      binding,
      record: {
        agentCli: candidate.agentCli,
        locator: candidate.locator,
        sessionPath: candidate.sessionPath,
        providerLabel: stringMetadata(candidate.metadata.providerLabel) ?? stringMetadata(candidate.metadata.provider) ?? candidate.agentCli,
        baseUrl: stringMetadata(candidate.metadata.baseUrl),
        metadata: {
          discovery: candidate.agentCli,
          candidateId: candidate.id,
          fileName: candidate.fileName,
          sizeBytes: candidate.sizeBytes,
          modifiedAt: candidate.modifiedAt,
          metadataOnly: true
        }
      }
    });

    if (args.has("json")) {
      input.writeStdout(`${JSON.stringify({ recorded: record, candidate }, null, 2)}\n`);
      return 0;
    }

    input.writeStdout([
      `Recorded discovered ${adapter.displayName} locator.`,
      `candidateId: ${candidate.id}`,
      `locator: ${record.locator}`,
      `projectId: ${record.projectId}`,
      `taskId: ${record.taskId ?? "-"}`,
      "metadata: metadata only; transcript/message/content fields were not imported."
    ].join("\n") + "\n");
    return 0;
  }

  if (args.has("json")) {
    input.writeStdout(`${JSON.stringify({ agentCli: adapter.agentCli, home, candidates }, null, 2)}\n`);
    return 0;
  }

  input.writeStdout(formatDiscovery(adapter, home, candidates));
  return 0;
}

export function discoverCodexCandidates(codexHome: string) {
  return discoverCandidates(DISCOVERY_ADAPTERS.codex, codexHome);
}

function isDiscoveryAgentCli(value: string): value is DiscoveryAgentCli {
  return value === "codex" || value === "gemini" || value === "claude";
}

function resolveDiscoveryHome(args: Map<string, string[]>, adapter: DiscoveryAdapter) {
  return args.get("home")?.[0] ?? args.get(adapter.homeAlias)?.[0] ?? adapter.defaultHome;
}

function discoverCandidates(adapter: DiscoveryAdapter, home: string): DiscoveryCandidate[] {
  let files: string[] = [];
  try {
    files = walkFiles(home).filter((file) => /\.(json|jsonl|md|txt)$/i.test(file));
  } catch {
    return [];
  }

  return files.slice(0, 100).map((file, index) => {
    const stat = statSync(file);
    const metadata = readSafeTopLevelMetadata(file);
    const locator = stringMetadata(metadata.sessionId)
      ?? stringMetadata(metadata.conversationId)
      ?? stringMetadata(metadata.id)
      ?? path.relative(home, file);
    return {
      id: `${adapter.agentCli}-${index + 1}`,
      agentCli: adapter.agentCli,
      locator,
      sessionPath: file,
      fileName: path.basename(file),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      metadata
    } satisfies DiscoveryCandidate;
  });
}

function walkFiles(root: string): string[] {
  const output: string[] = [];
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      output.push(fullPath);
    }
  }
  return output;
}

function readSafeTopLevelMetadata(file: string): Record<string, unknown> {
  if (!file.endsWith(".json")) {
    return {};
  }
  try {
    const text = readFileSync(file, "utf8").slice(0, 64 * 1024);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const metadata: Record<string, unknown> = {};
    for (const key of SAFE_TOP_LEVEL_KEYS) {
      if (typeof parsed[key] === "string") {
        metadata[key] = sanitizeMetadataValue(parsed[key]);
      }
    }
    return metadata;
  } catch {
    return {};
  }
}

function sanitizeMetadataValue(value: string) {
  if (/^https?:\/\//.test(value)) {
    try {
      const url = new URL(value);
      return url.origin;
    } catch {
      return "[redacted-url]";
    }
  }
  return value;
}

function stringMetadata(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatDiscovery(adapter: DiscoveryAdapter, home: string, candidates: DiscoveryCandidate[]) {
  const lines = [
    `${adapter.displayName} discovery`,
    `home: ${home}`,
    `candidateCount: ${candidates.length}`,
    "metadata: metadata only; transcript/message/content fields are not imported.",
    ""
  ];
  if (candidates.length === 0) {
    lines.push(`No ${adapter.displayName} locator candidates found.`);
  } else {
    for (const candidate of candidates) {
      lines.push(`- ${candidate.id} ${candidate.locator} | file=${candidate.fileName} | size=${candidate.sizeBytes} | modifiedAt=${candidate.modifiedAt}`);
    }
  }
  lines.push("", `To record: agent-memory discover ${adapter.agentCli} --record <candidate-id>`);
  return `${lines.join("\n")}\n`;
}
