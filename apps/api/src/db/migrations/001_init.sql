create table if not exists projects (
  id text primary key,
  name text not null,
  description text not null,
  repo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_entries (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  source text not null,
  entry_type text not null,
  actor text not null,
  content text not null,
  summary text,
  tags text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create index if not exists conversation_entries_project_created_at_idx
  on conversation_entries (project_id, created_at desc);

create table if not exists memory_blocks (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  block_type text not null,
  title text not null,
  content text not null,
  source text not null,
  importance double precision not null default 0.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_blocks_project_type_title_key unique (project_id, block_type, title)
);

create index if not exists memory_blocks_project_block_type_idx
  on memory_blocks (project_id, block_type);
