import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { getBridgeDatabasePath } from "../workspace.ts";

export type WorkspaceBinding = {
  workspacePath: string;
  projectId: string;
  projectName: string;
  taskId?: string | null;
  taskTitle?: string | null;
  repoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OutboxEventRecord<TPayload = unknown> = {
  id: string;
  eventType: string;
  payload: TPayload;
  createdAt: string;
};

export type AgentCli = "codex" | "gemini" | "claude" | "other";

export type AgentSessionLocatorRecord = {
  id: string;
  workspacePath: string;
  projectId: string;
  taskId?: string | null;
  taskKey?: string | null;
  agentCli: AgentCli;
  locator: string;
  sessionPath?: string | null;
  providerLabel?: string | null;
  baseUrlHash?: string | null;
  baseUrlLabel?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function openDatabase(cwd: string) {
  const database = new DatabaseSync(getBridgeDatabasePath(cwd));

  database.exec(`
    create table if not exists workspace_bindings (
      workspace_path text primary key,
      project_id text not null,
      project_name text not null,
      task_id text,
      task_title text,
      repo_url text,
      created_at text not null,
      updated_at text not null
    );
  `);

  ensureColumn(database, "workspace_bindings", "task_id", "text");
  ensureColumn(database, "workspace_bindings", "task_title", "text");

  database.exec(`
    create table if not exists outbox_events (
      id text primary key,
      event_type text not null,
      payload text not null,
      created_at text not null
    );
  `);

  database.exec(`
    create table if not exists agent_session_locators (
      id text primary key,
      workspace_path text not null,
      project_id text not null,
      task_id text,
      task_key text,
      agent_cli text not null,
      locator text not null,
      session_path text,
      provider_label text,
      base_url_hash text,
      base_url_label text,
      metadata_json text not null,
      created_at text not null,
      updated_at text not null
    );
  `);

  database.exec(`
    create unique index if not exists agent_session_locators_workspace_agent_locator_idx
    on agent_session_locators (workspace_path, agent_cli, locator);
  `);

  return database;
}

export function getWorkspaceBinding(cwd: string): WorkspaceBinding | null {
  const database = openDatabase(cwd);
  const row = database.prepare(`
    select workspace_path, project_id, project_name, task_id, task_title, repo_url, created_at, updated_at
    from workspace_bindings
    where workspace_path = ?
  `).get(cwd) as
    | {
        workspace_path: string;
        project_id: string;
        project_name: string;
        task_id?: string | null;
        task_title?: string | null;
        repo_url?: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  database.close();

  if (!row) {
    return null;
  }

  return {
    workspacePath: row.workspace_path,
    projectId: row.project_id,
    projectName: row.project_name,
    taskId: row.task_id ?? null,
    taskTitle: row.task_title ?? null,
    repoUrl: row.repo_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function saveWorkspaceBinding(cwd: string, input: {
  projectId: string;
  projectName: string;
  taskId?: string | null;
  taskTitle?: string | null;
  repoUrl?: string | null;
}) {
  const database = openDatabase(cwd);
  const now = new Date().toISOString();

  database.prepare(`
    insert into workspace_bindings (
      workspace_path,
      project_id,
      project_name,
      task_id,
      task_title,
      repo_url,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict (workspace_path) do update set
      project_id = excluded.project_id,
      project_name = excluded.project_name,
      task_id = excluded.task_id,
      task_title = excluded.task_title,
      repo_url = excluded.repo_url,
      updated_at = excluded.updated_at
  `).run(
    cwd,
    input.projectId,
    input.projectName,
    input.taskId ?? null,
    input.taskTitle ?? null,
    input.repoUrl ?? null,
    now,
    now
  );

  database.close();

  return getWorkspaceBinding(cwd)!;
}

export function enqueueOutboxEvent<TPayload>(
  cwd: string,
  input: {
    id: string;
    eventType: string;
    payload: TPayload;
  }
) {
  const database = openDatabase(cwd);
  const now = new Date().toISOString();

  database.prepare(`
    insert into outbox_events (id, event_type, payload, created_at)
    values (?, ?, ?, ?)
  `).run(
    input.id,
    input.eventType,
    JSON.stringify(input.payload),
    now
  );

  database.close();
}

export function listOutboxEvents<TPayload>(cwd: string) {
  const database = openDatabase(cwd);
  const rows = database.prepare(`
    select id, event_type, payload, created_at
    from outbox_events
    order by created_at asc
  `).all() as Array<{
    id: string;
    event_type: string;
    payload: string;
    created_at: string;
  }>;

  database.close();

  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    payload: JSON.parse(row.payload) as TPayload,
    createdAt: row.created_at
  })) satisfies Array<OutboxEventRecord<TPayload>>;
}

export function deleteOutboxEvent(cwd: string, id: string) {
  const database = openDatabase(cwd);
  database.prepare("delete from outbox_events where id = ?").run(id);
  database.close();
}

export function saveAgentSessionLocator(
  cwd: string,
  input: Omit<AgentSessionLocatorRecord, "id" | "createdAt" | "updatedAt">
) {
  const database = openDatabase(cwd);
  const now = new Date().toISOString();
  const existing = database.prepare(`
    select id, created_at
    from agent_session_locators
    where workspace_path = ? and agent_cli = ? and locator = ?
  `).get(cwd, input.agentCli, input.locator) as { id: string; created_at: string } | undefined;

  const id = existing?.id ?? randomUUID().replace(/-/g, "");
  const createdAt = existing?.created_at ?? now;

  database.prepare(`
    insert into agent_session_locators (
      id,
      workspace_path,
      project_id,
      task_id,
      task_key,
      agent_cli,
      locator,
      session_path,
      provider_label,
      base_url_hash,
      base_url_label,
      metadata_json,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict (workspace_path, agent_cli, locator) do update set
      project_id = excluded.project_id,
      task_id = excluded.task_id,
      task_key = excluded.task_key,
      session_path = excluded.session_path,
      provider_label = excluded.provider_label,
      base_url_hash = excluded.base_url_hash,
      base_url_label = excluded.base_url_label,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run(
    id,
    cwd,
    input.projectId,
    input.taskId ?? null,
    input.taskKey ?? null,
    input.agentCli,
    input.locator,
    input.sessionPath ?? null,
    input.providerLabel ?? null,
    input.baseUrlHash ?? null,
    input.baseUrlLabel ?? null,
    JSON.stringify(input.metadata ?? {}),
    createdAt,
    now
  );

  database.close();

  return getAgentSessionLocatorByIdentity(cwd, input.agentCli, input.locator)!;
}

export function listAgentSessionLocators(cwd: string) {
  const database = openDatabase(cwd);
  const rows = database.prepare(`
    select
      id,
      workspace_path,
      project_id,
      task_id,
      task_key,
      agent_cli,
      locator,
      session_path,
      provider_label,
      base_url_hash,
      base_url_label,
      metadata_json,
      created_at,
      updated_at
    from agent_session_locators
    where workspace_path = ?
    order by updated_at desc, created_at desc
  `).all(cwd) as Array<{
    id: string;
    workspace_path: string;
    project_id: string;
    task_id?: string | null;
    task_key?: string | null;
    agent_cli: AgentCli;
    locator: string;
    session_path?: string | null;
    provider_label?: string | null;
    base_url_hash?: string | null;
    base_url_label?: string | null;
    metadata_json: string;
    created_at: string;
    updated_at: string;
  }>;

  database.close();
  return rows.map(mapAgentSessionLocatorRow);
}

function getAgentSessionLocatorByIdentity(cwd: string, agentCli: AgentCli, locator: string) {
  const database = openDatabase(cwd);
  const row = database.prepare(`
    select
      id,
      workspace_path,
      project_id,
      task_id,
      task_key,
      agent_cli,
      locator,
      session_path,
      provider_label,
      base_url_hash,
      base_url_label,
      metadata_json,
      created_at,
      updated_at
    from agent_session_locators
    where workspace_path = ? and agent_cli = ? and locator = ?
  `).get(cwd, agentCli, locator) as {
    id: string;
    workspace_path: string;
    project_id: string;
    task_id?: string | null;
    task_key?: string | null;
    agent_cli: AgentCli;
    locator: string;
    session_path?: string | null;
    provider_label?: string | null;
    base_url_hash?: string | null;
    base_url_label?: string | null;
    metadata_json: string;
    created_at: string;
    updated_at: string;
  } | undefined;

  database.close();
  return row ? mapAgentSessionLocatorRow(row) : null;
}

function mapAgentSessionLocatorRow(row: {
  id: string;
  workspace_path: string;
  project_id: string;
  task_id?: string | null;
  task_key?: string | null;
  agent_cli: AgentCli;
  locator: string;
  session_path?: string | null;
  provider_label?: string | null;
  base_url_hash?: string | null;
  base_url_label?: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    workspacePath: row.workspace_path,
    projectId: row.project_id,
    taskId: row.task_id ?? null,
    taskKey: row.task_key ?? null,
    agentCli: row.agent_cli,
    locator: row.locator,
    sessionPath: row.session_path ?? null,
    providerLabel: row.provider_label ?? null,
    baseUrlHash: row.base_url_hash ?? null,
    baseUrlLabel: row.base_url_label ?? null,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } satisfies AgentSessionLocatorRecord;
}

function ensureColumn(database: DatabaseSync, tableName: string, columnName: string, definition: string) {
  const columns = database.prepare(`pragma table_info(${tableName})`).all() as Array<{ name: string }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  database.exec(`alter table ${tableName} add column ${columnName} ${definition}`);
}
