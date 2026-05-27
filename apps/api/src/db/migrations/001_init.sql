create table if not exists projects (
  id text primary key,
  name text not null,
  description text not null,
  repo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
