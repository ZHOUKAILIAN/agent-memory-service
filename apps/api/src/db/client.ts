import { Pool } from "pg";

export function createDatabasePool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to start the API server");
  }

  return new Pool({
    connectionString
  });
}
