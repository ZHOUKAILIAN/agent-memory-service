import type { ApiClient, TaskContextBundle, TaskRecord } from "../../src/http/client.ts";

export function createDemoApiClient() {
  const taskCheckpoints = new Map<string, Array<{
    source: string;
    summary: string;
    content?: string;
    current_status?: string;
    decisions: string[];
    constraints: string[];
    next_steps: string[];
    created_at: string;
  }>>();

  const taskById = new Map<string, TaskRecord>();

  const apiClient: Partial<ApiClient> = {
    async resolveProject(input) {
      return {
        id: "prj_demo",
        name: input.name,
        description: input.description,
        repo_url: input.repo_url ?? null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      };
    },
    async resolveTask(input) {
      const task = {
        id: "tsk_demo",
        project_id: input.project_id,
        title: input.title,
        description: input.description,
        source: input.source,
        external_ref: input.external_ref ?? null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      } satisfies TaskRecord;
      taskById.set(task.id, task);
      return task;
    },
    async createTaskCheckpoint(taskId, input) {
      const records = taskCheckpoints.get(taskId) ?? [];
      records.unshift({
        source: input.source,
        summary: input.summary,
        content: input.content,
        current_status: input.current_status,
        decisions: input.decisions,
        constraints: input.constraints,
        next_steps: input.next_steps,
        created_at: "2026-04-11T12:05:00.000Z"
      });
      taskCheckpoints.set(taskId, records);
    },
    async getTaskContext(taskId, checkpointLimit) {
      const task = taskById.get(taskId) ?? {
        id: taskId,
        project_id: "prj_demo",
        title: "handoff-continuity-demo-task",
        description: "Created by agent-memory demo",
        source: "agent-memory-cli",
        external_ref: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      } satisfies TaskRecord;
      const checkpoints = taskCheckpoints.get(taskId) ?? [];
      const latest = checkpoints[0];
      const limit = typeof checkpointLimit === "number" ? checkpointLimit : 3;

      return {
        project: {
          id: "prj_demo",
          name: "handoff-continuity-demo-project",
          description: "Created by agent-memory demo",
          repo_url: null
        },
        task,
        summary: {
          task_id: taskId,
          summary: latest?.summary ?? "",
          current_status: latest?.current_status ?? null,
          active_decisions: latest?.decisions ?? [],
          active_constraints: latest?.constraints ?? [],
          next_steps: latest?.next_steps ?? [],
          updated_at: latest?.created_at ?? null
        },
        checkpoints: {
          recent: checkpoints.slice(0, limit).map((checkpoint, index) => ({
            id: `chk_demo_${index + 1}`,
            source: checkpoint.source,
            summary: checkpoint.summary,
            current_status: checkpoint.current_status ?? null,
            created_at: checkpoint.created_at
          }))
        },
        generated_at: "2026-04-11T12:06:00.000Z"
      } satisfies TaskContextBundle;
    }
  };

  return apiClient;
}
