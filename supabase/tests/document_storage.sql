-- Run after migrations against a disposable database; all fixtures roll back.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
select pg_temp.assert_true((select not public and file_size_limit=5242880
 and allowed_mime_types=array['application/pdf','image/jpeg','image/png']
 from storage.buckets where id='club-evidence'), 'private bucket format and size limits');
insert into auth.users(id) values ('70000000-0000-0000-0000-000000000007');
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000007',true);
select public.create_club('Storage test','Nairobi') as club_id \gset
-- Upload before metadata exists, then delete it: required for upload compensation.
insert into storage.objects(bucket_id,name,owner_id) values
 ('club-evidence', :'club_id'||'/80000000-0000-0000-0000-000000000008.png','70000000-0000-0000-0000-000000000007');
delete from storage.objects where bucket_id='club-evidence';
select pg_temp.assert_true(not exists(select 1 from storage.objects where bucket_id='club-evidence'), 'admin can clean up orphan upload');
do $$
begin
 begin
  insert into storage.objects(bucket_id,name,owner_id)
  select 'club-evidence',id::text||'/nested/file.pdf',auth.uid()::text from public.clubs;
  raise exception 'FAIL: nested path accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into storage.objects(bucket_id,name,owner_id)
  select 'club-evidence',id::text||'/80000000-0000-0000-0000-000000000008.pdf','someone-else' from public.clubs;
  raise exception 'FAIL: forged owner accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
\echo 'Document Storage assertions passed (fixtures rolled back).'
