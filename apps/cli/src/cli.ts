import { getBaseUrl } from "./config.ts";
import { checkpointCommand } from "./commands/checkpoint.ts";
import { contextCommand } from "./commands/context.ts";
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

const helpText = "Commands: resolve, context, checkpoint, flush-outbox\n";

export async function runCli(argv: string[], io: CliIo = {}) {
  const writeStdout = io.writeStdout ?? ((chunk: string) => process.stdout.write(chunk));
  const writeStderr = io.writeStderr ?? ((chunk: string) => process.stderr.write(chunk));
  const command = argv[0] ?? "help";
  const cwd = io.cwd ?? process.cwd();
  const apiClient = {
    ...createHttpApiClient(getBaseUrl(io.env)),
    ...io.apiClient
  } satisfies ApiClient;

  if (command === "help" || command === "--help" || command === "-h") {
    writeStdout(helpText);
    return 0;
  }

  if (command === "resolve") {
    return await resolveCommand(parseFlags(argv.slice(1)), {
      apiClient,
      cwd,
      writeStdout
    });
  }

  if (command === "context") {
    return await contextCommand(parseFlags(argv.slice(1)), {
      apiClient,
      cwd,
      writeStdout,
      writeStderr
    });
  }

  if (command === "checkpoint") {
    return await checkpointCommand(parseFlags(argv.slice(1)), {
      apiClient,
      cwd,
      writeStdout,
      writeStderr
    });
  }

  if (command === "flush-outbox") {
    return await flushOutboxCommand(parseFlags(argv.slice(1)), {
      apiClient,
      cwd,
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
