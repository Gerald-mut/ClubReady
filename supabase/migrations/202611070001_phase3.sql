-- Create club profiles, memberships and supplied evidence with database-enforced
-- permissions. A trusted atomic function creates each club and its first admin;
-- scoped membership helpers avoid recursive RLS without accepting client roles.
-- Existing private-file policies support evidence ownership; no future-phase
-- activity or opportunity relationships are introduced here.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.clubs (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 150),
 county text not null check (length(trim(county)) between 1 and 80),
 sub_county text check (length(sub_county) <= 100),
 year_established integer check (year_established between 1800 and extract(year from now())::integer),
 description text check (length(description) <= 5000),
 contact_email text check (length(contact_email) <= 254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.club_members (
 club_id uuid not null references public.clubs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('club_admin','club_member')),
 joined_at timestamptz not null default now(), primary key (club_id,user_id)
);
create index club_members_user_id_idx on public.club_members(user_id);
create table public.evidence (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete cascade,
 uploaded_by uuid not null references auth.users(id),
 document_type text not null check (document_type in ('club_registration','coach_qualification','annual_work_programme','safeguarding_policy','governing_body_resolution','financial_report','other')),
 file_name text not null check (length(file_name) between 1 and 255),
 storage_path text not null unique,
 mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
 file_size bigint not null check (file_size > 0 and file_size <= 5242880),
 status text not null default 'supplied' check (status = 'supplied'),
 expires_at date, uploaded_at timestamptz not null default now(),
 check (storage_path ~ ('^' || club_id::text || '/[0-9a-f-]{36}\.(pdf|jpg|png)$'))
);
create index evidence_club_id_idx on public.evidence(club_id);
-- Evidence has its own stable ID; future relations can reference it without changing ownership.
create function private.touch_club() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger clubs_updated before update on public.clubs for each row execute function private.touch_club();

-- These narrowly scoped helpers bypass membership RLS without recursively querying policies.
create function private.is_member(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.club_members where club_id=target and user_id=(select auth.uid()))
$$;
create function private.is_admin(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.club_members where club_id=target and user_id=(select auth.uid()) and role='club_admin')
$$;
revoke all on function private.is_member(uuid), private.is_admin(uuid), private.touch_club() from public, anon;
grant execute on function private.is_member(uuid), private.is_admin(uuid) to authenticated;

create function public.create_club(p_name text, p_county text, p_sub_county text default null, p_year_established integer default null, p_description text default null, p_contact_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare club uuid; actor uuid := auth.uid();
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into public.clubs(name,county,sub_county,year_established,description,contact_email)
 values(trim(p_name),trim(p_county),nullif(trim(p_sub_county),''),p_year_established,nullif(trim(p_description),''),nullif(trim(p_contact_email),'')) returning id into club;
 insert into public.club_members(club_id,user_id,role) values(club,actor,'club_admin');
 return club;
end $$;
revoke all on function public.create_club(text,text,text,integer,text,text) from public, anon;
grant execute on function public.create_club(text,text,text,integer,text,text) to authenticated;

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.evidence enable row level security;
revoke all on public.clubs, public.club_members, public.evidence from anon, authenticated;
grant select on public.clubs, public.club_members, public.evidence to authenticated;
grant update(name,county,sub_county,year_established,description,contact_email) on public.clubs to authenticated;
grant insert, delete on public.evidence to authenticated;
-- Metadata is immutable: replace a document to correct its details. No client membership writes.
create policy clubs_read on public.clubs for select to authenticated using (private.is_member(id));
create policy clubs_edit on public.clubs for update to authenticated using (private.is_admin(id)) with check (private.is_admin(id));
create policy memberships_read on public.club_members for select to authenticated using (private.is_member(club_id));
create policy evidence_read on public.evidence for select to authenticated using (private.is_member(club_id));
create policy evidence_insert on public.evidence for insert to authenticated with check (
 private.is_admin(club_id) and uploaded_by=(select auth.uid()) and exists (
 select 1 from storage.objects where bucket_id='club-evidence' and name=storage_path and owner_id=(select auth.uid())::text
 ));
create policy evidence_delete on public.evidence for delete to authenticated using (private.is_admin(club_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('club-evidence','club-evidence',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Compare text paths rather than casting untrusted object names to UUID.
create function private.storage_member(path text, admin_only boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.club_members where club_id::text=split_part(path,'/',1)
 and user_id=(select auth.uid()) and (not admin_only or role='club_admin'))
$$;
revoke all on function private.storage_member(text,boolean) from public, anon;
grant execute on function private.storage_member(text,boolean) to authenticated;
create policy club_files_read on storage.objects for select to authenticated using (bucket_id='club-evidence' and private.storage_member(name));
create policy club_files_upload on storage.objects for insert to authenticated with check (
 bucket_id='club-evidence' and private.storage_member(name,true) and owner_id=(select auth.uid())::text
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$');
create policy club_files_delete on storage.objects for delete to authenticated using (bucket_id='club-evidence' and private.storage_member(name,true));
commit;
