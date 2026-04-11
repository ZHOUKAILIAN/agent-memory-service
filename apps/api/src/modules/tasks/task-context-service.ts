import type { ProjectRepository } from "../projects/project-repository.js";
import type { TaskCheckpointRepository } from "./task-checkpoint-repository.js";
import type { TaskRepository } from "./task-repository.js";
import type { TaskSummaryRepository } from "./task-summary-repository.js";

export type TaskContextDependencies = {
  projectRepository: ProjectRepository;
  taskCheckpointRepository: TaskCheckpointRepository;
  taskRepository: TaskRepository;
  taskSummaryRepository: TaskSummaryRepository;
  taskId: string;
  checkpointLimit?: number;
};

export async function buildTaskContext({
  projectRepository,
  taskCheckpointRepository,
  taskRepository,
  taskSummaryRepository,
  taskId,
  checkpointLimit
}: TaskContextDependencies) {
  const task = await taskRepository.findTaskById(taskId);

  if (!task) {
    const error = new Error(`task not found: ${taskId}`) as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const project = await projectRepository.getProjectById(task.project_id);

  if (!project) {
    const error = new Error(`project not found: ${task.project_id}`) as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const [summary, checkpoints] = await Promise.all([
    taskSummaryRepository.getTaskSummaryByTaskId(taskId),
    taskCheckpointRepository.listCheckpointsByTask(taskId, checkpointLimit)
  ]);

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      repo_url: project.repo_url ?? null
    },
    task: {
      id: task.id,
      project_id: task.project_id,
      title: task.title,
      description: task.description,
      source: task.source,
      external_ref: task.external_ref ?? null
    },
    summary: summary ?? {
      task_id: task.id,
      summary: "",
      current_status: null,
      active_decisions: [],
      active_constraints: [],
      next_steps: [],
      updated_at: null
    },
    checkpoints: {
      recent: checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        source: checkpoint.source,
        summary: checkpoint.summary,
        current_status: checkpoint.current_status ?? null,
        created_at: checkpoint.created_at
      }))
    },
    generated_at: new Date().toISOString()
  };
}
