-- ClubReady: initial schema
-- Tables, enums, RLS policies and the RPC functions the Edge Functions call.
-- Rules: every private table has RLS on; the frontend never gets write access
-- to derived data (readiness results, jobs); club ownership is never trusted
-- from the client.

------------------------------------------------------------------------------
-- Enums
------------------------------------------------------------------------------
create type public.club_role         as enum ('club_admin', 'club_member');
create type public.rule_type         as enum ('has_credential', 'min_activities', 'participant_ratio', 'manual_review');
create type public.readiness_status  as enum ('evidence_available', 'needs_review', 'not_met', 'not_evaluated');
create type public.job_status        as enum ('pending', 'running', 'done', 'failed');
create type public.credential_status as enum ('uploaded', 'verified');

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------
create table public.clubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 2 and 120),
  join_code  text not null unique
             default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id    uuid not null references public.clubs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.club_role not null default 'club_member',
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id);

-- Platform admins (can manage opportunities). No API access; managed via SQL.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table public.activities (
  id                    uuid primary key default gen_random_uuid(),
  club_id               uuid not null references public.clubs (id) on delete cascade,
  client_id             uuid not null,               -- UUID generated offline by the client
  title                 text not null check (char_length(trim(title)) between 1 and 200),
  activity_type         text not null default 'training'
                        check (activity_type in ('training', 'match', 'tournament', 'community_event', 'other')),
  occurred_at           timestamptz not null,
  client_created_at     timestamptz not null,
  participants_total    integer check (participants_total >= 0),
  participants_under_18 integer check (participants_under_18 >= 0),
  participants_girls    integer check (participants_girls >= 0),
  created_by            uuid not null references auth.users (id),
  synced_at             timestamptz not null default now(),
  constraint activities_club_client_key unique (club_id, client_id),
  constraint activities_under18_le_total
    check (participants_under_18 is null or participants_total is null or participants_under_18 <= participants_total),
  constraint activities_girls_le_total
    check (participants_girls is null or participants_total is null or participants_girls <= participants_total)
);
create index activities_club_occurred_idx on public.activities (club_id, occurred_at desc);

create table public.opportunities (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  source_url  text,
  verified_at date,            -- when a human last verified the source
  deadline    date,            -- leave null unless verified
  created_at  timestamptz not null default now()
);

create table public.requirements (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  key            text not null,
  title          text not null,
  rule_type      public.rule_type not null,
  rule_config    jsonb not null default '{}'::jsonb,
  sort_order     integer not null default 0,
  unique (opportunity_id, key)
);

-- Documents a club has uploaded. Uploaded != verified: it only ever yields needs_review.
create table public.club_credentials (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs (id) on delete cascade,
  category     text not null,
  status       public.credential_status not null default 'uploaded',
  storage_path text,          -- {club_id}/{credential_id}
  expires_at   date,
  uploaded_by  uuid not null references auth.users (id),
  created_at   timestamptz not null default now()
);
create index club_credentials_club_idx on public.club_credentials (club_id, category);

create table public.readiness_results (
  club_id        uuid not null references public.clubs (id) on delete cascade,
  requirement_id uuid not null references public.requirements (id) on delete cascade,
  status         public.readiness_status not null,
  detail         jsonb not null default '{}'::jsonb,
  evaluated_at   timestamptz not null default now(),
  primary key (club_id, requirement_id)
);

-- Transactional outbox. Written in the same transaction as the activity.
create table public.processing_jobs (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete cascade,
  kind       text not null default 'recheck_readiness',
  status     public.job_status not null default 'pending',
  attempts   integer not null default 0,
  last_error text,
  run_after  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one pending job per club and kind: bursts of syncs coalesce into one recheck.
create unique index processing_jobs_one_pending_idx
  on public.processing_jobs (club_id, kind) where status = 'pending';
create index processing_jobs_sweep_idx
  on public.processing_jobs (status, run_after);

------------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER avoids RLS recursion on club_members)
------------------------------------------------------------------------------
create function public.is_club_member(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id and m.user_id = (select auth.uid())
  );
$$;

create function public.is_club_admin(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id and m.user_id = (select auth.uid()) and m.role = 'club_admin'
  );
$$;

------------------------------------------------------------------------------
-- RPC: create / join club
------------------------------------------------------------------------------
create function public.create_club(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.clubs (name, created_by) values (trim(p_name), v_uid) returning id into v_id;
  insert into public.club_members (club_id, user_id, role) values (v_id, v_uid, 'club_admin');
  return v_id;
end;
$$;

create function public.join_club(p_join_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select id into v_id from public.clubs where join_code = lower(trim(p_join_code));
  if v_id is null then
    raise exception 'invalid_join_code' using errcode = 'P0002';
  end if;
  insert into public.club_members (club_id, user_id) values (v_id, v_uid)
  on conflict do nothing;
  return v_id;
end;
$$;

------------------------------------------------------------------------------
-- RPC: idempotent activity sync + outbox job, one transaction
------------------------------------------------------------------------------
create function public.sync_activity(
  p_club_id               uuid,
  p_client_id             uuid,
  p_title                 text,
  p_activity_type         text,
  p_occurred_at           timestamptz,
  p_client_created_at     timestamptz,
  p_participants_total    integer default null,
  p_participants_under_18 integer default null,
  p_participants_girls    integer default null
)
returns uuid                       -- always the client's own id (the acknowledgement)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_inserted uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_club_member(p_club_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  insert into public.activities (
    club_id, client_id, title, activity_type, occurred_at, client_created_at,
    participants_total, participants_under_18, participants_girls, created_by
  ) values (
    p_club_id, p_client_id, p_title, coalesce(p_activity_type, 'training'), p_occurred_at, p_client_created_at,
    p_participants_total, p_participants_under_18, p_participants_girls, v_uid
  )
  on conflict (club_id, client_id) do nothing
  returning id into v_inserted;

  -- Only a genuinely new activity queues a recheck; retries change nothing.
  if v_inserted is not null then
    insert into public.processing_jobs (club_id, kind)
    values (p_club_id, 'recheck_readiness')
    on conflict (club_id, kind) where status = 'pending' do nothing;
  end if;

  return p_client_id;
end;
$$;

------------------------------------------------------------------------------
-- Privileges: nothing for anon; functions only for signed-in users
------------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on public.processing_jobs, public.app_admins from authenticated;

revoke all on function public.is_club_member(uuid)  from public, anon;
revoke all on function public.is_club_admin(uuid)   from public, anon;
revoke all on function public.create_club(text)     from public, anon;
revoke all on function public.join_club(text)       from public, anon;
revoke all on function public.sync_activity(uuid, uuid, text, text, timestamptz, timestamptz, integer, integer, integer)
  from public, anon;

grant execute on function public.is_club_member(uuid)  to authenticated;
grant execute on function public.is_club_admin(uuid)   to authenticated;
grant execute on function public.create_club(text)     to authenticated;
grant execute on function public.join_club(text)       to authenticated;
grant execute on function public.sync_activity(uuid, uuid, text, text, timestamptz, timestamptz, integer, integer, integer)
  to authenticated;

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------
alter table public.clubs             enable row level security;
alter table public.club_members      enable row level security;
alter table public.app_admins        enable row level security;
alter table public.activities        enable row level security;
alter table public.opportunities     enable row level security;
alter table public.requirements      enable row level security;
alter table public.club_credentials  enable row level security;
alter table public.readiness_results enable row level security;
alter table public.processing_jobs   enable row level security;

-- clubs: members read; admins edit. Creation goes through create_club().
create policy clubs_select on public.clubs
  for select to authenticated using (public.is_club_member(id));
create policy clubs_update on public.clubs
  for update to authenticated using (public.is_club_admin(id)) with check (public.is_club_admin(id));

-- club_members: members see their club's roster. Writes go through RPCs.
create policy club_members_select on public.club_members
  for select to authenticated using (public.is_club_member(club_id));

-- activities: read-only for members. Writes go through sync_activity().
create policy activities_select on public.activities
  for select to authenticated using (public.is_club_member(club_id));

-- opportunities and requirements: readable by any signed-in user; changed via SQL only.
create policy opportunities_select on public.opportunities
  for select to authenticated using (true);
create policy requirements_select on public.requirements
  for select to authenticated using (true);

-- credentials: members read and upload, but can only create 'uploaded' rows.
create policy credentials_select on public.club_credentials
  for select to authenticated using (public.is_club_member(club_id));
create policy credentials_insert on public.club_credentials
  for insert to authenticated
  with check (public.is_club_member(club_id) and status = 'uploaded' and uploaded_by = (select auth.uid()));

-- readiness_results: members read; only the engine (service role) writes.
create policy readiness_select on public.readiness_results
  for select to authenticated using (public.is_club_member(club_id));

-- app_admins and processing_jobs: RLS on, no policies, no grants. Service role only.
