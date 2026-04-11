create table if not exists tasks (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  title text not null,
  description text not null,
  source text not null,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_project_title_key unique (project_id, title)
);

create index if not exists tasks_project_updated_at_idx
  on tasks (project_id, updated_at desc);

create index if not exists tasks_external_ref_idx
  on tasks (external_ref);

create table if not exists task_summary_memories (
  task_id text primary key references tasks (id) on delete cascade,
  summary text not null,
  current_status text,
  active_decisions text[] not null default array[]::text[],
  active_constraints text[] not null default array[]::text[],
  next_steps text[] not null default array[]::text[],
  updated_at timestamptz not null default now()
);

create table if not exists task_checkpoints (
  id text primary key,
  task_id text not null references tasks (id) on delete cascade,
  source text not null,
  summary text not null,
  content text not null,
  current_status text,
  decisions text[] not null default array[]::text[],
  constraints text[] not null default array[]::text[],
  next_steps text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create index if not exists task_checkpoints_task_created_at_idx
  on task_checkpoints (task_id, created_at desc);
