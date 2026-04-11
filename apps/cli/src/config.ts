export function getBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return (env.AGENT_MEMORY_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
