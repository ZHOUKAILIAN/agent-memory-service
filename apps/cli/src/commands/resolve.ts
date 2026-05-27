import path from "node:path";

import type { ApiClient } from "../http/client.ts";
import { getWorkspaceBinding, saveWorkspaceBinding, type WorkspaceBinding } from "../storage/sqlite.ts";

export async function resolveWorkspaceBinding(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
  }
): Promise<WorkspaceBinding> {
  const existingBinding = getWorkspaceBinding(input.cwd);

  if (existingBinding) {
    return existingBinding;
  }

  const taskTitle = args.get("name")?.[0] ?? path.basename(input.cwd);
  const taskDescription = args.get("description")?.[0] ?? "Created by agent-continuity CLI";
  const projectName = args.get("project-name")?.[0] ?? path.basename(input.cwd);
  const projectDescription = args.get("project-description")?.[0] ?? "Created by agent-continuity CLI";
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
    source: args.get("source")?.[0] ?? "agent-continuity-cli",
    external_ref: args.get("external-ref")?.[0]
  });

  return saveWorkspaceBinding(input.cwd, {
    projectId: project.id,
    projectName: project.name,
    taskId: task.id,
    taskTitle: task.title,
    repoUrl: project.repo_url ?? null
  });
}

export async function resolveCommand(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    writeStdout: (chunk: string) => void;
  }
) {
  const binding = await resolveWorkspaceBinding(args, {
    apiClient: input.apiClient,
    cwd: input.cwd
  });

  input.writeStdout(`${JSON.stringify(binding, null, 2)}\n`);
  return 0;
}
