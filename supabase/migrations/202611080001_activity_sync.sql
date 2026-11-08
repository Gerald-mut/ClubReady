-- Phase 5 database contract. Apply after the membership migration.
begin;
create table public.activities (
 id uuid primary key,
 club_id uuid not null references public.clubs(id),
 created_by uuid not null references auth.users(id),
 activity_type text not null check (activity_type in ('training','match','tournament','community','other')),
 title text not null check (length(title) between 1 and 150 and title ~ '[^[:space:]]'),
 date date not null check (date between date '0001-01-01' and date '9999-12-31'),
 location text not null check (length(location) between 1 and 200 and location ~ '[^[:space:]]'),
 participants_count bigint not null check (participants_count between 1 and 9007199254740991),
 notes text not null check (length(notes) <= 5000),
 created_at timestamptz not null check (isfinite(created_at)),
 synced_at timestamptz not null default now()
);
create index activities_club_id_idx on public.activities(club_id);
create table public.activity_attachments (
 id uuid primary key,
 activity_id uuid not null references public.activities(id),
 storage_path text not null unique,
 mime_type text not null check (mime_type in ('image/jpeg','image/png')),
 file_size bigint not null check (file_size between 1 and 5242880)
);
create index activity_attachments_activity_id_idx on public.activity_attachments(activity_id);
comment on table public.activities is 'Immutable client UUIDs support retry-safe inserts. Future evidence links can reference this primary key; no evidence relationship is implemented.';
alter table public.activities enable row level security;
alter table public.activity_attachments enable row level security;
revoke all on public.activities, public.activity_attachments from public, anon, authenticated;
grant select on public.activities, public.activity_attachments to authenticated;
-- The server owns synced_at; clients supply the original UUID and creation time.
grant insert(id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at) on public.activities to authenticated;
grant insert on public.activity_attachments to authenticated;
create policy activities_read on public.activities for select to authenticated
 using (private.is_member(club_id));
create policy activities_insert on public.activities for insert to authenticated
 with check (private.is_member(club_id) and created_by=(select auth.uid()));
create policy activity_attachments_read on public.activity_attachments for select to authenticated
 using (exists(select 1 from public.activities a where a.id=activity_id));
create policy activity_attachments_insert on public.activity_attachments for insert to authenticated
 with check (exists(select 1 from public.activities a
  where a.id=activity_id and a.created_by=(select auth.uid())
  and private.is_member(a.club_id)
  and storage_path=a.club_id::text||'/'||a.id::text||'/'||activity_attachments.id::text||'.jpg')
  and exists(select 1 from storage.objects o where o.bucket_id='activity-media'
   and o.name=storage_path and o.owner_id=(select auth.uid())::text));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('activity-media','activity-media',false,5242880,array['image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy activity_media_read on storage.objects for select to authenticated
 using (bucket_id='activity-media' and private.storage_member(name));
-- Upload before activity metadata exists. No overwrite/delete policies: retries
-- read the existing deterministic object instead of replacing its bytes.
create policy activity_media_insert on storage.objects for insert to authenticated
 with check (bucket_id='activity-media' and private.storage_member(name)
 and owner_id=(select auth.uid())::text
 and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$');
commit;
