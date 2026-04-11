import { z } from "zod";

export const createConversationSchema = z.object({
  source: z.string().min(1),
  entry_type: z.string().min(1),
  actor: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string().min(1),
  summary: z.string().min(1).optional(),
  tags: z.array(z.string()).default([])
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
