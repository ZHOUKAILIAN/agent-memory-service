import path from "node:path";
import { mkdirSync } from "node:fs";

export function getBridgeDirectory(cwd: string) {
  return path.join(cwd, ".agent-memory");
}

export function ensureBridgeDirectory(cwd: string) {
  const directory = getBridgeDirectory(cwd);
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function getBridgeDatabasePath(cwd: string) {
  return path.join(ensureBridgeDirectory(cwd), "bridge.sqlite");
}
