import { readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { getWorkspaceBinding } from "../storage/sqlite.ts";
import { saveBoundAgentSessionLocator } from "./agent-sessions.ts";

type DiscoveryAgentCli = "codex" | "gemini" | "claude";
type DiscoveryMode = DiscoveryAgentCli | "all";

type DiscoveryCandidate = {
  id: string;
  agentCli: DiscoveryAgentCli;
  locator: string;
  sessionPath: string;
  relativePath: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  modifiedAt: string;
  topLevelIdType: "sessionId" | "conversationId" | "id" | "path-fallback";
  topLevelIdValue: string;
  sourceSummary: string;
  reasonSummary: string;
  metadataOnly: true;
  metadata: Record<string, unknown>;
};

type DiscoveryAdapter = {
  agentCli: DiscoveryAgentCli;
  displayName: string;
  defaultHome: string;
  homeAlias: string;
};

type DiscoveryGroup = {
  agentCli: DiscoveryAgentCli;
  displayName: string;
  home: string;
  sourceSummary: string;
  candidateCount: number;
  metadataOnly: true;
  candidates: DiscoveryCandidate[];
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
  if (!target || !isDiscoveryMode(target)) {
    input.writeStderr("Usage: agent-continuity discover <codex|gemini|claude|all> [--home <path>] [--codex-home <path>] [--gemini-home <path>] [--claude-home <path>] [--json] [--record <candidate-id>]\n");
    return 1;
  }

  if (target === "all") {
    if (args.has("home")) {
      input.writeStderr("`discover all` does not accept `--home`. Use `--codex-home`, `--gemini-home`, or `--claude-home` instead.\n");
      return 1;
    }
    if (args.has("record")) {
      input.writeStderr("`discover all` does not support `--record`. Record a single candidate with `discover <codex|gemini|claude> --record <candidate-id>`.\n");
      return 1;
    }

    const groups = discoveryAgentCliValues().map((agentCli) => {
      const adapter = DISCOVERY_ADAPTERS[agentCli];
      const { home, sourceSummary } = resolveDiscoveryHome(args, adapter, false);
      const candidates = discoverCandidates(adapter, home, sourceSummary);
      return {
        agentCli,
        displayName: adapter.displayName,
        home,
        sourceSummary,
        candidateCount: candidates.length,
        metadataOnly: true,
        candidates
      } satisfies DiscoveryGroup;
    });

    if (args.has("json")) {
      input.writeStdout(`${JSON.stringify({ mode: "all", groups }, null, 2)}\n`);
      return 0;
    }

    input.writeStdout(formatAllDiscovery(groups));
    return 0;
  }

  const adapter = DISCOVERY_ADAPTERS[target];
  const { home, sourceSummary } = resolveDiscoveryHome(args, adapter, true);
  const candidates = discoverCandidates(adapter, home, sourceSummary);
  const recordId = args.get("record")?.[0];

  if (recordId) {
    const binding = getWorkspaceBinding(input.cwd);
    if (!binding) {
      input.writeStderr(`No workspace binding found. Run \`agent-continuity resolve\` first before recording a discovered ${adapter.displayName} locator.\n`);
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
    input.writeStdout(`${JSON.stringify({ agentCli: adapter.agentCli, home, sourceSummary, candidates }, null, 2)}\n`);
    return 0;
  }

  input.writeStdout(formatDiscovery(adapter, home, sourceSummary, candidates));
  return 0;
}

export function discoverCodexCandidates(codexHome: string) {
  return discoverCandidates(DISCOVERY_ADAPTERS.codex, codexHome, "explicit codex home");
}

function discoveryAgentCliValues(): DiscoveryAgentCli[] {
  return ["codex", "gemini", "claude"];
}

function isDiscoveryMode(value: string): value is DiscoveryMode {
  return value === "all" || isDiscoveryAgentCli(value);
}

function isDiscoveryAgentCli(value: string): value is DiscoveryAgentCli {
  return value === "codex" || value === "gemini" || value === "claude";
}

function resolveDiscoveryHome(args: Map<string, string[]>, adapter: DiscoveryAdapter, allowGenericHome: boolean) {
  const explicitSourceHome = args.get(adapter.homeAlias)?.[0];
  if (explicitSourceHome) {
    return {
      home: explicitSourceHome,
      sourceSummary: `explicit ${adapter.agentCli} home`
    };
  }

  if (allowGenericHome) {
    const genericHome = args.get("home")?.[0];
    if (genericHome) {
      return {
        home: genericHome,
        sourceSummary: `explicit ${adapter.agentCli} home via --home`
      };
    }
  }

  return {
    home: adapter.defaultHome,
    sourceSummary: `default ${adapter.agentCli} home`
  };
}

function discoverCandidates(adapter: DiscoveryAdapter, home: string, sourceSummary: string): DiscoveryCandidate[] {
  let files: string[] = [];
  try {
    files = walkFiles(home).filter((file) => /\.(json|jsonl|md|txt)$/i.test(file));
  } catch {
    return [];
  }

  return files.slice(0, 100).map((file, index) => {
    const stat = statSync(file);
    const metadata = readSafeTopLevelMetadata(file);
    const relativePath = path.relative(home, file);
    const safeId = resolveSafeId(metadata, relativePath);
    const locator = safeId.value;
    const fileType = inferFileType(file);
    return {
      id: `${adapter.agentCli}-${index + 1}`,
      agentCli: adapter.agentCli,
      locator,
      sessionPath: file,
      relativePath,
      fileName: path.basename(file),
      fileType,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      topLevelIdType: safeId.type,
      topLevelIdValue: safeId.value,
      sourceSummary,
      reasonSummary: buildReasonSummary(fileType, safeId.type, safeId.value, stat.size, stat.mtime.toISOString()),
      metadataOnly: true,
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

function inferFileType(file: string) {
  const ext = path.extname(file).toLowerCase().replace(/^\./, "");
  return ext.length > 0 ? ext : "unknown";
}

function resolveSafeId(metadata: Record<string, unknown>, fallbackPath: string) {
  const sessionId = stringMetadata(metadata.sessionId);
  if (sessionId) {
    return { type: "sessionId" as const, value: sessionId };
  }

  const conversationId = stringMetadata(metadata.conversationId);
  if (conversationId) {
    return { type: "conversationId" as const, value: conversationId };
  }

  const id = stringMetadata(metadata.id);
  if (id) {
    return { type: "id" as const, value: id };
  }

  return { type: "path-fallback" as const, value: fallbackPath };
}

function buildReasonSummary(fileType: string, idType: DiscoveryCandidate["topLevelIdType"], idValue: string, sizeBytes: number, modifiedAt: string) {
  return `${fileType} file, ${idType}=${idValue}, modified ${modifiedAt}, size ${sizeBytes} bytes, metadata-only`;
}

function formatDiscovery(adapter: DiscoveryAdapter, home: string, sourceSummary: string, candidates: DiscoveryCandidate[]) {
  const lines = [
    `${adapter.displayName} discovery`,
    `home: ${home}`,
    `source: ${sourceSummary}`,
    `candidateCount: ${candidates.length}`,
    "metadata: metadata only; transcript/message/content fields are not imported.",
    ""
  ];
  if (candidates.length === 0) {
    lines.push(`No ${adapter.displayName} locator candidates found.`);
  } else {
    for (const candidate of candidates) {
      lines.push(`- ${candidate.id} ${candidate.locator}`);
      lines.push(`  reason: ${candidate.reasonSummary}`);
      lines.push(`  source: ${candidate.sourceSummary}; path=${candidate.relativePath}`);
      lines.push(`  mtime: ${candidate.modifiedAt} | size: ${candidate.sizeBytes}`);
    }
  }
  lines.push("", `To record: agent-continuity discover ${adapter.agentCli} --record <candidate-id>`);
  return `${lines.join("\n")}\n`;
}

function formatAllDiscovery(groups: DiscoveryGroup[]) {
  const lines = [
    "Cross-CLI discovery",
    "metadata: metadata only; transcript/message/content fields are not imported.",
    ""
  ];

  for (const group of groups) {
    lines.push(
      `${group.displayName} (${group.agentCli})`,
      `home: ${group.home}`,
      `source: ${group.sourceSummary}`,
      `candidateCount: ${group.candidateCount}`,
      "boundary: metadata-only",
      ""
    );

    if (group.candidates.length === 0) {
      lines.push(`- No ${group.displayName} locator candidates found.`, "");
      continue;
    }

    for (const candidate of group.candidates) {
      lines.push(`- ${candidate.id} ${candidate.locator}`);
      lines.push(`  reason: ${candidate.reasonSummary}`);
      lines.push(`  source: ${candidate.sourceSummary}; path=${candidate.relativePath}`);
      lines.push(`  mtime: ${candidate.modifiedAt} | size: ${candidate.sizeBytes}`);
    }
    lines.push("");
  }

  lines.push("Record one candidate at a time with: agent-continuity discover <codex|gemini|claude> --record <candidate-id>");
  return `${lines.join("\n")}\n`;
}
