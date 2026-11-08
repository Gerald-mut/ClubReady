-- Phase A, stage 1. Preserve direct immutable UUID inserts and existing RLS.
begin;

-- Storage's API supplies these two catalog fields after upload. This verifies
-- catalog consistency, not file signatures, image decoding or authenticity.
create function private.activity_object_metadata_matches(metadata jsonb, bytes bigint, mime text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare object_size numeric;
begin
 if metadata is null or jsonb_typeof(metadata->'size') is distinct from 'number'
    or jsonb_typeof(metadata->'mimetype') is distinct from 'string' then
  return false;
 end if;
 object_size := (metadata->>'size')::numeric;
 return bytes between 1 and 1048576
    and mime in ('image/jpeg','image/png')
    and object_size = bytes and metadata->>'mimetype' = mime;
end $$;
revoke all on function private.activity_object_metadata_matches(jsonb,bigint,text)
 from public, anon, authenticated;

-- Freeze attachment writes during the audit/backfill. Never delete or silently
-- rewrite historical attachments. Abort atomically if an old activity exceeds 3.
lock table public.activity_attachments in share row exclusive mode;
do $$
declare oversized bigint; over_cap bigint; inconsistent bigint; oversized_objects bigint;
begin
 select count(*) into oversized from public.activity_attachments where file_size > 1048576;
 select count(*) into over_cap from (
  select activity_id from public.activity_attachments group by activity_id having count(*) > 3
 ) violations;
 select count(*) into inconsistent from public.activity_attachments a
 left join storage.objects o on o.bucket_id='activity-media' and o.name=a.storage_path
 where private.activity_object_metadata_matches(o.metadata,a.file_size,a.mime_type) is not true;
 select count(*) into oversized_objects from storage.objects where bucket_id='activity-media'
  and case when jsonb_typeof(metadata->'size')='number' then (metadata->>'size')::numeric > 1048576 else false end;
 raise notice 'Activity hardening preflight: oversized_rows=%, over_cap_activities=%, missing_or_inconsistent_objects=%, oversized_objects=%',
  oversized, over_cap, inconsistent, oversized_objects;
 if over_cap > 0 then
  raise exception 'Activity hardening blocked: % existing activities exceed three attachments; reconcile explicitly before retrying', over_cap
   using errcode='23514';
 end if;
end $$;

-- NOT VALID deliberately preserves historical oversized rows while enforcing
-- the new bound on all new/updated rows. Validation needs a separate data review.
alter table public.activity_attachments add constraint activity_attachments_one_mib
 check (file_size between 1 and 1048576) not valid;
update storage.buckets set file_size_limit=1048576 where id='activity-media';
-- Do not change the private flag, MIME allowlist, any policy or any client grant.

create table private.activity_attachment_quota (
 activity_id uuid primary key references public.activities(id) on delete cascade,
 attachment_count integer not null constraint activity_attachment_quota_limit
  check (attachment_count between 0 and 3)
);
alter table private.activity_attachment_quota enable row level security;
revoke all on private.activity_attachment_quota from public, anon, authenticated;
insert into private.activity_attachment_quota(activity_id,attachment_count)
 select activity_id,count(*)::integer from public.activity_attachments group by activity_id;

create function private.check_activity_attachment_object() returns trigger
language plpgsql security definer set search_path = '' as $$
declare object_metadata jsonb;
begin
 -- A row lock prevents catalog replacement/deletion during this insert. The
 -- original INSERT RLS still checks creator, live membership, path and ownership.
 select o.metadata into object_metadata from storage.objects o
 where o.bucket_id='activity-media' and o.name=new.storage_path for share;
 if not found or private.activity_object_metadata_matches(object_metadata,new.file_size,new.mime_type) is not true then
  raise exception 'Activity attachment must match finalized Storage size and MIME metadata'
   using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.check_activity_attachment_object() from public, anon, authenticated;
create trigger activity_attachment_object_check before insert or update on public.activity_attachments
 for each row execute function private.check_activity_attachment_object();

create function private.track_activity_attachment_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_activity uuid; new_activity uuid;
begin
 if TG_OP <> 'INSERT' then old_activity := old.activity_id; end if;
 if TG_OP <> 'DELETE' then new_activity := new.activity_id; end if;
 if TG_OP='UPDATE' and old_activity=new_activity then return new; end if;

 -- Explicit per-activity serialization; stable ordering for trusted moves.
 -- NO KEY UPDATE serializes writers without conflicting with the foreign key's
 -- KEY SHARE lock (which would create an avoidable lock-upgrade deadlock).
 perform 1 from public.activities where id in (old_activity,new_activity) order by id for no key update;
 if old_activity is not null then
  update private.activity_attachment_quota set attachment_count=attachment_count-1
   where activity_id=old_activity;
  if not found then raise exception 'Activity attachment quota is inconsistent' using errcode='23514'; end if;
 end if;
 if new_activity is not null then
  -- An atomic counter also prevents stale-snapshot overcounts at REPEATABLE
  -- READ/SERIALIZABLE: a conflicting transaction fails rather than allowing 4.
  insert into private.activity_attachment_quota as q(activity_id,attachment_count) values(new_activity,1)
   on conflict(activity_id) do update set attachment_count=q.attachment_count+1;
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.track_activity_attachment_quota() from public, anon, authenticated;
-- AFTER is essential: ON CONFLICT DO NOTHING must not increment the counter.
create trigger activity_attachment_quota after insert or delete or update of activity_id on public.activity_attachments
 for each row execute function private.track_activity_attachment_quota();
commit;
