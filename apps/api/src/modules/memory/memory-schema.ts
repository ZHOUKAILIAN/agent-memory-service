import { z } from "zod";

export const memoryBlockTypeSchema = z.enum([
  "background",
  "constraints",
  "decisions",
  "todo",
  "status"
]);

export const createMemoryBlockSchema = z.object({
  block_type: memoryBlockTypeSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  source: z.string().min(1),
  importance: z.number().min(0).max(1).default(0.5)
});

export type MemoryBlockType = z.infer<typeof memoryBlockTypeSchema>;
export type CreateMemoryBlockInput = z.infer<typeof createMemoryBlockSchema>;
