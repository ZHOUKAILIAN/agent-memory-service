import { z } from "zod";

export const createTaskSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  source: z.string().min(1),
  external_ref: z.string().min(1).optional()
});

export const resolveTaskSchema = createTaskSchema;

export const createTaskCheckpointSchema = z.object({
  source: z.string().min(1),
  summary: z.string().min(1),
  content: z.string().min(1).optional(),
  current_status: z.string().min(1).optional(),
  decisions: z.array(z.string().min(1)).default([]),
  constraints: z.array(z.string().min(1)).default([]),
  next_steps: z.array(z.string().min(1)).default([])
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type ResolveTaskInput = z.infer<typeof resolveTaskSchema>;
export type CreateTaskCheckpointInput = z.infer<typeof createTaskCheckpointSchema>;
