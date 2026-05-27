export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  repo_url?: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateProjectPayload = {
  name: string;
  description: string;
  repo_url?: string;
};

export type ResolveProjectPayload = CreateProjectPayload;

export type TaskRecord = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  source: string;
  external_ref?: string | null;
  created_at: string;
  updated_at: string;
};

export type ResolveTaskPayload = {
  project_id: string;
  title: string;
  description: string;
  source: string;
  external_ref?: string;
};

export type TaskContextBundle = {
  project: {
    id: string;
    name: string;
    description: string;
    repo_url?: string | null;
  };
  task: {
    id: string;
    project_id: string;
    title: string;
    description: string;
    source: string;
    external_ref?: string | null;
  };
  summary: {
    task_id: string;
    summary: string;
    current_status: string | null;
    active_decisions: string[];
    active_constraints: string[];
    next_steps: string[];
    updated_at: string | null;
  };
  checkpoints: {
    recent: Array<{
      id: string;
      source: string;
      summary: string;
      current_status: string | null;
      created_at: string;
    }>;
  };
  generated_at: string;
};

export type ApiClient = {
  createProject(input: CreateProjectPayload): Promise<ProjectRecord>;
  resolveProject(input: ResolveProjectPayload): Promise<ProjectRecord>;
  resolveTask(input: ResolveTaskPayload): Promise<TaskRecord>;
  getTaskContext(taskId: string, checkpointLimit?: number): Promise<TaskContextBundle>;
  createTaskCheckpoint(taskId: string, input: {
    source: string;
    summary: string;
    content?: string;
    current_status?: string;
    decisions: string[];
    constraints: string[];
    next_steps: string[];
  }): Promise<void>;
};

export function createHttpApiClient(baseUrl: string): ApiClient {
  return {
    async createProject(input) {
      const response = await fetch(`${baseUrl}/projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`create project failed with status ${response.status}`);
      }

      const data = await response.json() as { project: ProjectRecord };
      return data.project;
    },
    async resolveProject(input) {
      const response = await fetch(`${baseUrl}/projects/resolve`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`resolve project failed with status ${response.status}`);
      }

      const data = await response.json() as { project: ProjectRecord };
      return data.project;
    },
    async resolveTask(input) {
      const response = await fetch(`${baseUrl}/tasks/resolve`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`resolve task failed with status ${response.status}`);
      }

      const data = await response.json() as { task: TaskRecord };
      return data.task;
    },
    async getTaskContext(taskId, checkpointLimit) {
      const query = typeof checkpointLimit === "number"
        ? `?checkpoint_limit=${checkpointLimit}`
        : "";
      const response = await fetch(`${baseUrl}/tasks/${taskId}/context${query}`);

      if (!response.ok) {
        throw new Error(`get task context failed with status ${response.status}`);
      }

      return await response.json() as TaskContextBundle;
    },
    async createTaskCheckpoint(taskId, input) {
      const response = await fetch(`${baseUrl}/tasks/${taskId}/checkpoints`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`create task checkpoint failed with status ${response.status}`);
      }
    }
  };
}
