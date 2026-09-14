create table if not exists desk_access (
  user_id    text primary key,
  name       text not null default '',
  note       text not null default '',
  status     text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists desk_access_status_idx on desk_access (status);
