-- ============================================================
-- TeamTracker — Supabase / Postgres schema
-- 執行順序：直接整份貼進 Supabase SQL Editor
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
create type team_role   as enum ('owner', 'admin', 'member');
create type entry_source as enum ('extension', 'web', 'import', 'manual');
create type task_status  as enum ('todo', 'doing', 'done', 'archived');

-- ------------------------------------------------------------
-- profiles：鏡射 auth.users，放可公開給 team 看的欄位
-- ------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- 註冊時自動建 profile
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------------
-- teams / team_members / team_invites
-- ------------------------------------------------------------
create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table team_members (
  team_id   uuid not null references teams(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      team_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index on team_members (user_id);

create table team_invites (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  email       text not null,
  role        team_role not null default 'member',
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  uuid not null references auth.users(id),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index on team_invites (team_id, lower(email)) where accepted_at is null;

-- ------------------------------------------------------------
-- projects / tags
-- ------------------------------------------------------------
create table projects (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  -- 上層專案；null = 最上層。刪父層時子層往上接（在應用層處理）
  parent_id   uuid references projects(id) on delete set null,
  name        text not null,
  notes       text not null default '',
  color       text not null default '#64748b',
  archived_at timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  constraint no_self_parent check (parent_id is null or parent_id <> id)
);
-- 同一層底下名稱不重複（不同父層可以同名，例如各客戶都有「維運」）
create unique index on projects (team_id, parent_id, lower(name))
  where parent_id is not null;
create unique index on projects (team_id, lower(name))
  where parent_id is null;
create index on projects (parent_id);

create table tags (
  id      uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name    text not null,
  color   text not null default '#94a3b8'
);
create unique index on tags (team_id, lower(name));

-- ------------------------------------------------------------
-- tasks（todo）
-- ------------------------------------------------------------
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  parent_task_id uuid references tasks(id) on delete set null,
  title       text not null,
  notes       text,
  status      task_status not null default 'todo',
  assignee_id uuid references auth.users(id) on delete set null,
  -- 開單時間：建立當下決定，不可改
  opened_at     timestamptz not null default now(),
  -- 截止日：唯一可以手改的，只到日期精度
  due_date      date,
  reminder_at   timestamptz,
  -- 結案時間：按下完成的當下；重新打開時設回 null
  completed_at  timestamptz,
  -- 被重新打開過幾次
  reopen_count  integer not null default 0,
  constraint completed_after_opened
    check (completed_at is null or completed_at >= opened_at),
  -- 狀態與結案時間必須一致，避免兩邊各說各話
  constraint completed_matches_status
    check ((status = 'done') = (completed_at is not null)),
  sort_order  double precision not null default 0,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on tasks (team_id, status);
create index on tasks (assignee_id) where status <> 'done';

-- ------------------------------------------------------------
-- time_entries — 核心表
-- ------------------------------------------------------------
create table time_entries (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references teams(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  project_id       uuid references projects(id) on delete set null,
  task_id          uuid references tasks(id) on delete set null,
  description      text not null default '',
  notes            text not null default '',
  started_at       timestamptz not null,
  ended_at         timestamptz,
  duration_seconds integer generated always as
                     (extract(epoch from (ended_at - started_at))::integer) stored,
  source           entry_source not null default 'extension',
  -- 客戶端產生的 uuid，離線佇列重送時做冪等 upsert
  client_entry_id  uuid not null,
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,

  constraint ended_after_started check (ended_at is null or ended_at > started_at)
);

-- 冪等鍵：同一 user 的同一 client_entry_id 只會有一筆
create unique index time_entries_client_key on time_entries (user_id, client_entry_id);
-- 一個人同時只能有一個計時中的 entry
create unique index one_running_per_user on time_entries (user_id)
  where ended_at is null and deleted_at is null;
-- 報表查詢用
create index on time_entries (team_id, started_at desc) where deleted_at is null;
create index on time_entries (user_id, started_at desc) where deleted_at is null;

create table time_entry_tags (
  entry_id uuid not null references time_entries(id) on delete cascade,
  tag_id   uuid not null references tags(id) on delete cascade,
  primary key (entry_id, tag_id)
);

create table note_attachments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  task_id       uuid references tasks(id) on delete cascade,
  time_entry_id uuid references time_entries(id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes >= 0),
  created_at    timestamptz not null default now(),
  constraint note_attachments_one_target
    check (num_nonnulls(project_id, task_id, time_entry_id) = 1)
);
create index on note_attachments (project_id, created_at desc)
  where project_id is not null;
create index on note_attachments (task_id, created_at desc)
  where task_id is not null;
create index on note_attachments (time_entry_id, created_at desc)
  where time_entry_id is not null;

create table note_shares (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  task_id       uuid references tasks(id) on delete cascade,
  time_entry_id uuid references time_entries(id) on delete cascade,
  token         text not null unique default gen_random_uuid()::text,
  created_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  constraint note_shares_one_target
    check (num_nonnulls(project_id, task_id, time_entry_id) = 1)
);
create unique index note_shares_one_active_project
  on note_shares (project_id)
  where project_id is not null and revoked_at is null;
create unique index note_shares_one_active_task
  on note_shares (task_id)
  where task_id is not null and revoked_at is null;
create unique index note_shares_one_active_entry
  on note_shares (time_entry_id)
  where time_entry_id is not null and revoked_at is null;
create index on note_shares (created_by, created_at desc);

create or replace function guard_note_share_revocation()
returns trigger language plpgsql as $$
begin
  if old.revoked_at is not null then
    raise exception 'note_share_already_revoked';
  end if;

  if new.id <> old.id
     or new.project_id is distinct from old.project_id
     or new.task_id is distinct from old.task_id
     or new.time_entry_id is distinct from old.time_entry_id
     or new.token is distinct from old.token
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'note_share_immutable';
  end if;

  if new.revoked_at is null then
    raise exception 'note_share_revoked_at_required';
  end if;

  return new;
end $$;

create trigger t_note_shares_revoke_guard
  before update on note_shares
  for each row execute function guard_note_share_revocation();

-- updated_at 自動維護
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger t_time_entries_touch before update on time_entries
  for each row execute function touch_updated_at();
create trigger t_tasks_touch before update on tasks
  for each row execute function touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================

-- SECURITY DEFINER 讓 policy 讀 team_members 時不觸發遞迴
create or replace function is_team_member(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = p_team and user_id = auth.uid()
  );
$$;

create or replace function team_role_of(p_team uuid)
returns team_role language sql stable security definer set search_path = public as $$
  select role from team_members
  where team_id = p_team and user_id = auth.uid();
$$;

alter table profiles        enable row level security;
alter table teams           enable row level security;
alter table team_members    enable row level security;
alter table team_invites    enable row level security;
alter table projects        enable row level security;
alter table tags            enable row level security;
alter table tasks           enable row level security;
alter table time_entries    enable row level security;
alter table time_entry_tags enable row level security;
alter table note_attachments enable row level security;
alter table note_shares      enable row level security;

create or replace function note_target_team(
  p_project_id uuid default null,
  p_task_id uuid default null,
  p_time_entry_id uuid default null
)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select team_id from projects where id = p_project_id),
    (select team_id from tasks where id = p_task_id),
    (select team_id from time_entries where id = p_time_entry_id)
  );
$$;

create policy note_attachments_member_read on note_attachments
  for select using (is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_attachments_member_write on note_attachments
  for insert with check (is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_attachments_member_delete on note_attachments
  for delete using (is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_shares_member_read on note_shares
  for select using (is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_shares_member_insert on note_shares
  for insert with check (created_by = auth.uid() and is_team_member(note_target_team(project_id, task_id, time_entry_id)));
create policy note_shares_member_revoke on note_shares
  for update using (created_by = auth.uid() and is_team_member(note_target_team(project_id, task_id, time_entry_id)))
  with check (revoked_at is not null);

insert into storage.buckets (id, name, public)
values ('note-attachments', 'note-attachments', false)
on conflict (id) do update set public = false;

create policy note_attachment_storage_read on storage.objects
  for select using (bucket_id = 'note-attachments' and auth.uid() is not null);
create policy note_attachment_storage_insert on storage.objects
  for insert with check (bucket_id = 'note-attachments' and auth.uid() is not null);
create policy note_attachment_storage_delete on storage.objects
  for delete using (bucket_id = 'note-attachments' and owner_id = auth.uid()::text);

-- profiles：自己可改；同 team 的人可讀
create policy profiles_self_write on profiles
  for update using (id = auth.uid());
create policy profiles_read on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from team_members m1
      join team_members m2 on m1.team_id = m2.team_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );

-- teams
create policy teams_read on teams
  for select using (is_team_member(id));
create policy teams_insert on teams
  for insert with check (created_by = auth.uid());
create policy teams_admin_write on teams
  for update using (team_role_of(id) in ('owner', 'admin'));
create policy teams_owner_delete on teams
  for delete using (team_role_of(id) = 'owner');

-- team_members
create policy tm_read on team_members
  for select using (is_team_member(team_id));
create policy tm_admin_write on team_members
  for all using (team_role_of(team_id) in ('owner', 'admin'))
  with check (team_role_of(team_id) in ('owner', 'admin'));
create policy tm_self_leave on team_members
  for delete using (user_id = auth.uid());

-- team_invites：只有 admin 看得到 / 開得了
create policy invites_admin on team_invites
  for all using (team_role_of(team_id) in ('owner', 'admin'))
  with check (team_role_of(team_id) in ('owner', 'admin'));

-- projects / tags / tasks：team 成員都可讀寫
create policy projects_member on projects
  for all using (is_team_member(team_id)) with check (is_team_member(team_id));
create policy tags_member on tags
  for all using (is_team_member(team_id)) with check (is_team_member(team_id));
create policy tasks_member on tasks
  for all using (is_team_member(team_id)) with check (is_team_member(team_id));

-- time_entries：同 team 可讀（報表用），但只能寫自己的
create policy entries_read on time_entries
  for select using (is_team_member(team_id));
create policy entries_own_write on time_entries
  for insert with check (user_id = auth.uid() and is_team_member(team_id));
create policy entries_own_update on time_entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy entries_own_delete on time_entries
  for delete using (user_id = auth.uid());

create policy entry_tags_member on time_entry_tags
  for all using (
    exists (select 1 from time_entries e
            where e.id = entry_id and is_team_member(e.team_id))
  )
  with check (
    exists (select 1 from time_entries e
            where e.id = entry_id and e.user_id = auth.uid())
  );

-- ============================================================
-- RPC：擴充端只呼叫這三顆，避免前端拼邏輯
-- ============================================================

-- 開始計時：自動關掉還開著的那筆
create or replace function start_timer(
  p_team_id    uuid,
  p_client_id  uuid,
  p_project_id uuid default null,
  p_task_id    uuid default null,
  p_desc       text default '',
  p_started_at timestamptz default now()
) returns time_entries
language plpgsql security invoker set search_path = public as $$
declare v_row time_entries;
begin
  update time_entries
     set ended_at = p_started_at
   where user_id = auth.uid() and ended_at is null and deleted_at is null;

  insert into time_entries (team_id, user_id, project_id, task_id,
                            description, started_at, client_entry_id)
  values (p_team_id, auth.uid(), p_project_id, p_task_id,
          p_desc, p_started_at, p_client_id)
  on conflict (user_id, client_entry_id) do update
    set description = excluded.description
  returning * into v_row;

  return v_row;
end $$;

-- 停止計時
create or replace function stop_timer(p_ended_at timestamptz default now())
returns time_entries
language plpgsql security invoker set search_path = public as $$
declare v_row time_entries;
begin
  update time_entries
     set ended_at = p_ended_at
   where user_id = auth.uid() and ended_at is null and deleted_at is null
  returning * into v_row;
  return v_row;
end $$;

-- 接受邀請（token 由信件連結帶入）
create or replace function accept_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv team_invites;
begin
  select * into v_inv from team_invites
   where token = p_token and accepted_at is null and expires_at > now();

  if v_inv.id is null then
    raise exception 'invite_invalid_or_expired';
  end if;

  if lower(v_inv.email) <> lower((select email from auth.users where id = auth.uid())) then
    raise exception 'invite_email_mismatch';
  end if;

  insert into team_members (team_id, user_id, role)
  values (v_inv.team_id, auth.uid(), v_inv.role)
  on conflict (team_id, user_id) do nothing;

  update team_invites set accepted_at = now() where id = v_inv.id;
  return v_inv.team_id;
end $$;

-- 建立 team 時，建立者自動成為 owner
create or replace function handle_new_team()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into team_members (team_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end $$;

create trigger on_team_created
  after insert on teams
  for each row execute function handle_new_team();

-- ============================================================
-- 報表 view
-- ============================================================
create or replace function create_note_share(p_kind text, p_target_id uuid)
returns note_shares language plpgsql security invoker set search_path = public as $$
declare v_share note_shares;
begin
  if p_kind = 'project' then
    insert into note_shares (project_id, created_by) values (p_target_id, auth.uid())
    on conflict (project_id) where project_id is not null and revoked_at is null
    do update set revoked_at = null returning * into v_share;
  elsif p_kind = 'task' then
    insert into note_shares (task_id, created_by) values (p_target_id, auth.uid())
    on conflict (task_id) where task_id is not null and revoked_at is null
    do update set revoked_at = null returning * into v_share;
  elsif p_kind = 'entry' then
    insert into note_shares (time_entry_id, created_by) values (p_target_id, auth.uid())
    on conflict (time_entry_id) where time_entry_id is not null and revoked_at is null
    do update set revoked_at = null returning * into v_share;
  else raise exception 'invalid_note_target';
  end if;
  return v_share;
end $$;

create or replace function revoke_note_share(p_share_id uuid)
returns boolean language sql security invoker set search_path = public as $$
  update note_shares set revoked_at = now()
   where id = p_share_id and created_by = auth.uid() and revoked_at is null
  returning true;
$$;

create or replace function get_shared_note(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_share note_shares; v_result jsonb;
begin
  select * into v_share from note_shares where token = p_token and revoked_at is null;
  if v_share.id is null then return null; end if;
  if v_share.project_id is not null then
    select jsonb_build_object('kind','project','id',p.id,'title',p.name,'notes','', 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'fileName',a.file_name,'mimeType',a.mime_type,'storagePath',a.storage_path)) from note_attachments a where a.project_id=p.id),'[]'::jsonb)) into v_result from projects p where p.id=v_share.project_id;
  elsif v_share.task_id is not null then
    select jsonb_build_object('kind','task','id',t.id,'title',t.title,'notes',coalesce(t.notes,''), 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'fileName',a.file_name,'mimeType',a.mime_type,'storagePath',a.storage_path)) from note_attachments a where a.task_id=t.id),'[]'::jsonb)) into v_result from tasks t where t.id=v_share.task_id;
  else
    select jsonb_build_object('kind','entry','id',e.id,'title',e.description,'notes',coalesce(e.notes,''),'startedAt',e.started_at,'endedAt',e.ended_at, 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'fileName',a.file_name,'mimeType',a.mime_type,'storagePath',a.storage_path)) from note_attachments a where a.time_entry_id=e.id),'[]'::jsonb)) into v_result from time_entries e where e.id=v_share.time_entry_id and e.deleted_at is null;
  end if;
  return v_result;
end $$;

create view v_entry_daily as
select
  e.team_id,
  e.user_id,
  e.project_id,
  (e.started_at at time zone 'Asia/Taipei')::date as day,
  sum(e.duration_seconds) as seconds
from time_entries e
where e.deleted_at is null and e.ended_at is not null
group by 1, 2, 3, 4;
