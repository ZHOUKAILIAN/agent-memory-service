import { createPostgresConversationRepository } from "./modules/conversations/conversation-repository.js";
import { createPostgresMemoryRepository } from "./modules/memory/memory-repository.js";
import { createPostgresProjectRepository } from "./modules/projects/project-repository.js";
import { buildApp } from "./app.js";
import { createDatabasePool } from "./db/client.js";

const pool = createDatabasePool();
const app = buildApp({
  conversationRepository: createPostgresConversationRepository(pool),
  memoryRepository: createPostgresMemoryRepository(pool),
  projectRepository: createPostgresProjectRepository(pool)
});

app.addHook("onClose", async () => {
  await pool.end();
});

app.listen({ host: "0.0.0.0", port: 3000 }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
