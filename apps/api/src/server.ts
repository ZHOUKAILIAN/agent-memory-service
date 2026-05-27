import { createPostgresProjectRepository } from "./modules/projects/project-repository.js";
import { createPostgresTaskCheckpointRepository } from "./modules/tasks/task-checkpoint-repository.js";
import { createPostgresTaskRepository } from "./modules/tasks/task-repository.js";
import { createPostgresTaskSummaryRepository } from "./modules/tasks/task-summary-repository.js";
import { buildApp } from "./app.js";
import { createDatabasePool } from "./db/client.js";

const pool = createDatabasePool();
const app = buildApp({
  projectRepository: createPostgresProjectRepository(pool),
  taskCheckpointRepository: createPostgresTaskCheckpointRepository(pool),
  taskRepository: createPostgresTaskRepository(pool),
  taskSummaryRepository: createPostgresTaskSummaryRepository(pool)
});

app.addHook("onClose", async () => {
  await pool.end();
});

app.listen({ host: "0.0.0.0", port: 3000 }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
