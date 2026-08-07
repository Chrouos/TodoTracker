-- Work note image attachments and revocable public shares.

alter table projects add column if not exists notes text not null default '';

create table if not exists note_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  time_entry_id uuid references time_entries(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  constraint note_attachments_one_target check (num_nonnulls(project_id, task_id, time_entry_id) = 1)
);

create table if not exists note_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  time_entry_id uuid references time_entries(id) on delete cascade,
  token text not null unique default gen_random_uuid()::text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint note_shares_one_target check (num_nonnulls(project_id, task_id, time_entry_id) = 1)
);

create unique index if not exists note_shares_one_active_project on note_shares(project_id) where project_id is not null and revoked_at is null;
create unique index if not exists note_shares_one_active_task on note_shares(task_id) where task_id is not null and revoked_at is null;
create unique index if not exists note_shares_one_active_entry on note_shares(time_entry_id) where time_entry_id is not null and revoked_at is null;

alter table note_attachments enable row level security;
alter table note_shares enable row level security;

insert into storage.buckets (id, name, public) values ('note-attachments', 'note-attachments', false)
on conflict (id) do update set public = false;

create or replace function note_target_team(p_project_id uuid default null, p_task_id uuid default null, p_time_entry_id uuid default null)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select team_id from projects where id = p_project_id), (select team_id from tasks where id = p_task_id), (select team_id from time_entries where id = p_time_entry_id));
$$;

create policy note_attachments_member_read on note_attachments for select using (is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_attachments_member_write on note_attachments for insert with check (is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_attachments_member_delete on note_attachments for delete using (is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_shares_member_read on note_shares for select using (is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_shares_member_insert on note_shares for insert with check (created_by = auth.uid() and is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_shares_member_revoke on note_shares for update using (created_by = auth.uid() and is_team_member(note_target_team(project_id, task_id, time_entry_id))) with check (revoked_at is not null);

create policy note_attachment_storage_read on storage.objects for select using (bucket_id = 'note-attachments' and auth.uid() is not null);
create policy note_attachment_storage_insert on storage.objects for insert with check (bucket_id = 'note-attachments' and auth.uid() is not null);
create policy note_attachment_storage_delete on storage.objects for delete using (bucket_id = 'note-attachments' and owner_id = auth.uid()::text);
