import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  repo_url: z.string().url().optional()
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
