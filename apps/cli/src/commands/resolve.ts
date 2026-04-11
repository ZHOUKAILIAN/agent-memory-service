import path from "node:path";

import type { ApiClient } from "../http/client.ts";
import { getWorkspaceBinding, saveWorkspaceBinding } from "../storage/sqlite.ts";

export async function resolveCommand(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    writeStdout: (chunk: string) => void;
  }
) {
  const existingBinding = getWorkspaceBinding(input.cwd);

  if (existingBinding) {
    input.writeStdout(`${JSON.stringify(existingBinding, null, 2)}\n`);
    return 0;
  }

  const taskTitle = args.get("name")?.[0] ?? path.basename(input.cwd);
  const taskDescription = args.get("description")?.[0] ?? "Created by agent-memory CLI";
  const projectName = args.get("project-name")?.[0] ?? path.basename(input.cwd);
  const projectDescription = args.get("project-description")?.[0] ?? "Created by agent-memory CLI";
  const repoUrl = args.get("repo-url")?.[0];

  const project = await input.apiClient.resolveProject({
    name: projectName,
    description: projectDescription,
    repo_url: repoUrl
  });

  const task = await input.apiClient.resolveTask({
    project_id: project.id,
    title: taskTitle,
    description: taskDescription,
    source: args.get("source")?.[0] ?? "agent-memory-cli",
    external_ref: args.get("external-ref")?.[0]
  });

  const binding = saveWorkspaceBinding(input.cwd, {
    projectId: project.id,
    projectName: project.name,
    taskId: task.id,
    taskTitle: task.title,
    repoUrl: project.repo_url ?? null
  });

  input.writeStdout(`${JSON.stringify(binding, null, 2)}\n`);
  return 0;
}
