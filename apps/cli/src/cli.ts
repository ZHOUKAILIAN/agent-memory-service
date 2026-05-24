import { getBaseUrl } from "./config.ts";
import { checkpointCommand } from "./commands/checkpoint.ts";
import { agentSessionsCommand } from "./commands/agent-sessions.ts";
import { contextCommand } from "./commands/context.ts";
import { demoCommand } from "./commands/demo.ts";
import { discoverCommand } from "./commands/discover.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { flushOutboxCommand } from "./commands/flush-outbox.ts";
import { resolveCommand } from "./commands/resolve.ts";
import { createHttpApiClient, type ApiClient } from "./http/client.ts";

export type CliIo = {
  apiClient?: Partial<ApiClient>;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  writeStdout?: (chunk: string) => void;
  writeStderr?: (chunk: string) => void;
};

const helpText = `Commands: resolve, doctor, context, checkpoint, flush-outbox, agent-sessions, demo, discover
Global flags: --workspace <path>
doctor/agent-sessions/demo/discover flags: --json for machine-readable output
Demo: demo codex-continuity [--workspace <path>] [--json]
Discovery: discover <codex|gemini|claude|all> [--home <path>] [--codex-home <path>] [--gemini-home <path>] [--claude-home <path>] [--json] [--record <candidate-id>]
`;


export async function runCli(argv: string[], io: CliIo = {}) {
  const writeStdout = io.writeStdout ?? ((chunk: string) => process.stdout.write(chunk));
  const writeStderr = io.writeStderr ?? ((chunk: string) => process.stderr.write(chunk));
  const command = argv[0] ?? "help";
  const flags = parseFlags(argv.slice(1));
  const cwd = flags.get("workspace")?.[0]
    ?? io.env?.AGENT_MEMORY_WORKSPACE
    ?? io.cwd
    ?? process.cwd();
  const apiClient = {
    ...createHttpApiClient(getBaseUrl(io.env)),
    ...io.apiClient
  } satisfies ApiClient;

  if (command === "help" || command === "--help" || command === "-h") {
    writeStdout(helpText);
    return 0;
  }

  if (command === "resolve") {
    return await resolveCommand(flags, {
      apiClient,
      cwd,
      writeStdout
    });
  }

  if (command === "doctor") {
    return await doctorCommand(flags, {
      cwd,
      env: io.env,
      writeStdout
    });
  }

  if (command === "context") {
    return await contextCommand(flags, {
      apiClient,
      cwd,
      writeStdout,
      writeStderr
    });
  }

  if (command === "checkpoint") {
    return await checkpointCommand(flags, {
      apiClient,
      cwd,
      writeStdout,
      writeStderr
    });
  }

  if (command === "flush-outbox") {
    return await flushOutboxCommand(flags, {
      apiClient,
      cwd,
      writeStdout,
      writeStderr
    });
  }

  if (command === "agent-sessions") {
    const subcommand = argv[1] ?? "list";
    flags.set("_subcommand", [subcommand]);
    return await agentSessionsCommand(flags, {
      cwd,
      writeStdout,
      writeStderr
    });
  }

  if (command === "discover") {
    const subcommand = argv[1] ?? "help";
    flags.set("_subcommand", [subcommand]);
    return await discoverCommand(flags, {
      cwd,
      writeStdout,
      writeStderr
    });
  }

  if (command === "demo") {
    const subcommand = argv[1] ?? "help";
    flags.set("_subcommand", [subcommand]);
    return await demoCommand(flags, {
      apiClient,
      cwd,
      env: io.env,
      writeStdout,
      writeStderr
    });
  }

  writeStderr(`Unknown command: ${command}\n`);
  writeStdout(helpText);
  return 1;
}

function parseFlags(argv: string[]) {
  const flags = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextToken = argv[index + 1];
    const value = nextToken && !nextToken.startsWith("--") ? nextToken : "true";

    if (value === nextToken) {
      index += 1;
    }

    const existing = flags.get(key) ?? [];
    existing.push(value);
    flags.set(key, existing);
  }

  return flags;
}
