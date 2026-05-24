import { readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { getWorkspaceBinding } from "../storage/sqlite.ts";
import { saveBoundAgentSessionLocator } from "./agent-sessions.ts";

type CodexCandidate = {
  id: string;
  agentCli: "codex";
  locator: string;
  sessionPath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  metadata: Record<string, unknown>;
};

export async function discoverCommand(
  args: Map<string, string[]>,
  input: {
    cwd: string;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const target = args.get("_subcommand")?.[0] ?? "help";
  if (target !== "codex") {
    input.writeStderr("Usage: agent-memory discover codex [--codex-home <path>] [--json] [--record <candidate-id>]\n");
    return 1;
  }

  const codexHome = args.get("codex-home")?.[0] ?? path.join(os.homedir(), ".codex");
  const candidates = discoverCodexCandidates(codexHome);
  const recordId = args.get("record")?.[0];

  if (recordId) {
    const binding = getWorkspaceBinding(input.cwd);
    if (!binding) {
      input.writeStderr("No workspace binding found. Run `agent-memory resolve` first before recording a discovered Codex locator.\n");
      return 1;
    }
    const candidate = candidates.find((item) => item.id === recordId);
    if (!candidate) {
      input.writeStderr(`No Codex discovery candidate found for id: ${recordId}\n`);
      return 1;
    }
    const record = saveBoundAgentSessionLocator(input.cwd, {
      binding,
      record: {
        agentCli: "codex",
        locator: candidate.locator,
        sessionPath: candidate.sessionPath,
        providerLabel: stringMetadata(candidate.metadata.providerLabel) ?? "codex",
        baseUrl: stringMetadata(candidate.metadata.baseUrl),
        metadata: {
          discovery: "codex",
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
      "Recorded discovered Codex locator.",
      `candidateId: ${candidate.id}`,
      `locator: ${record.locator}`,
      `projectId: ${record.projectId}`,
      `taskId: ${record.taskId ?? "-"}`,
      "metadata: metadata only; transcript/message/content fields were not imported."
    ].join("\n") + "\n");
    return 0;
  }

  if (args.has("json")) {
    input.writeStdout(`${JSON.stringify({ codexHome, candidates }, null, 2)}\n`);
    return 0;
  }

  input.writeStdout(formatCodexDiscovery(codexHome, candidates));
  return 0;
}

export function discoverCodexCandidates(codexHome: string): CodexCandidate[] {
  let files: string[] = [];
  try {
    files = walkFiles(codexHome).filter((file) => /\.(json|jsonl|md|txt)$/i.test(file));
  } catch {
    return [];
  }

  return files.slice(0, 100).map((file, index) => {
    const stat = statSync(file);
    const metadata = readSafeTopLevelMetadata(file);
    const locator = stringMetadata(metadata.sessionId)
      ?? stringMetadata(metadata.conversationId)
      ?? stringMetadata(metadata.id)
      ?? path.relative(codexHome, file);
    return {
      id: `codex-${index + 1}`,
      agentCli: "codex",
      locator,
      sessionPath: file,
      fileName: path.basename(file),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      metadata
    };
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
    for (const key of ["id", "sessionId", "conversationId", "providerLabel", "baseUrl", "createdAt", "updatedAt", "model"] as const) {
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

function formatCodexDiscovery(codexHome: string, candidates: CodexCandidate[]) {
  const lines = [
    "Codex discovery",
    `codexHome: ${codexHome}`,
    `candidateCount: ${candidates.length}`,
    "metadata: metadata only; transcript/message/content fields are not imported.",
    ""
  ];
  if (candidates.length === 0) {
    lines.push("No Codex locator candidates found.");
  } else {
    for (const candidate of candidates) {
      lines.push(`- ${candidate.id} ${candidate.locator} | file=${candidate.fileName} | size=${candidate.sizeBytes} | modifiedAt=${candidate.modifiedAt}`);
    }
  }
  lines.push("", "To record: agent-memory discover codex --record <candidate-id>");
  return `${lines.join("\n")}\n`;
}
