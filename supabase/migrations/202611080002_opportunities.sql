-- Curated catalogue; client permissions never permit catalogue mutations.
begin;
create table public.opportunities (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(trim(title)) between 1 and 250),
 organiser text not null check (length(trim(organiser)) between 1 and 250),
 description text not null check (length(trim(description)) between 1 and 10000),
 source_url text not null check (source_url ~ '^https://[^[:space:]]+$'),
 application_method text not null check (length(trim(application_method)) between 1 and 2000),
 application_url text check (application_url ~ '^https://[^[:space:]]+$'),
 deadline timestamptz,
 status text not null check (status in ('open','closed','historical')),
 review_date date not null,
 is_demonstration boolean not null default false,
 created_at timestamptz not null default now(),
 check (status = 'open' or is_demonstration)
);
create table public.opportunity_requirements (
 id uuid primary key default gen_random_uuid(),
 opportunity_id uuid not null references public.opportunities(id) on delete cascade,
 version integer not null default 1 check (version > 0),
 requirement_type text not null check (requirement_type in ('document','activity','club_info','other')),
 document_type text check (document_type in ('club_registration','coach_qualification','annual_work_programme','safeguarding_policy','governing_body_resolution','financial_report','other')),
 description text not null check (length(trim(description)) between 1 and 5000),
 min_count integer check (min_count > 0),
 source_note text not null check (length(trim(source_note)) between 1 and 3000),
 is_current boolean not null default true,
 check ((requirement_type = 'document' and document_type is not null) or
        (requirement_type <> 'document' and document_type is null)),
 check (min_count is null or requirement_type in ('document','activity'))
);
create index opportunity_requirements_opportunity_idx on public.opportunity_requirements(opportunity_id,version);
create table public.application_tracking (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete cascade,
 opportunity_id uuid not null references public.opportunities(id) on delete cascade,
 status text not null default 'not_started' check (status in ('not_started','preparing','submitted','outcome_received')),
 notes text check (length(notes) <= 10000),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 unique (club_id,opportunity_id)
);
create index application_tracking_opportunity_idx on public.application_tracking(opportunity_id);
create function private.stamp_application_tracking() returns trigger
language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'UPDATE' and (new.id <> old.id or new.club_id <> old.club_id or new.opportunity_id <> old.opportunity_id) then
  raise exception 'Tracking identity cannot change' using errcode = '42501';
 end if;
 new.updated_by := auth.uid();
 new.updated_at := clock_timestamp();
 return new;
end $$;
revoke all on function private.stamp_application_tracking() from public, anon, authenticated;
create trigger application_tracking_stamp before insert or update on public.application_tracking
 for each row execute function private.stamp_application_tracking();
alter table public.opportunities enable row level security;
alter table public.opportunity_requirements enable row level security;
alter table public.application_tracking enable row level security;
revoke all on public.opportunities, public.opportunity_requirements, public.application_tracking from public, anon, authenticated;
grant select on public.opportunities, public.opportunity_requirements, public.application_tracking to authenticated;
grant insert (club_id,opportunity_id,status,notes), update (status,notes), delete on public.application_tracking to authenticated;
create policy opportunities_read on public.opportunities for select to authenticated using (true);
create policy opportunity_requirements_read on public.opportunity_requirements for select to authenticated using (true);
create policy application_tracking_read on public.application_tracking for select to authenticated using (private.is_member(club_id));
create policy application_tracking_insert on public.application_tracking for insert to authenticated with check (private.is_admin(club_id));
create policy application_tracking_update on public.application_tracking for update to authenticated using (private.is_admin(club_id)) with check (private.is_admin(club_id));
create policy application_tracking_delete on public.application_tracking for delete to authenticated using (private.is_admin(club_id));
commit;
