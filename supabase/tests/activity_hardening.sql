-- Catalog-only Storage fixtures: no physical bytes are uploaded by these tests.
-- Numeric metadata.size and string metadata.mimetype imitate finalized API rows.
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.rejected(statement text,code text,label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if SQLSTATE=code then return; end if;
  raise exception 'FAIL: %, expected %, got %: %',label,code,SQLSTATE,SQLERRM;
 end;
 raise exception 'FAIL: expected rejection: %',label;
end $$;

select pg_temp.assert_true((select not convalidated from pg_constraint
 where conrelid='public.activity_attachments'::regclass and conname='activity_attachments_one_mib'),
 'historical rows are not silently validated or rewritten');
select pg_temp.assert_true((select not public and file_size_limit=1048576
 and allowed_mime_types=array['image/jpeg','image/png'] from storage.buckets where id='activity-media'),
 'private bucket keeps MIME allowlist and tightens byte limit');

insert into auth.users(id) values
 ('71000000-0000-0000-0000-000000000001'),('71000000-0000-0000-0000-000000000002'),
 ('71000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select public.create_club('Hardening A','Nairobi') as club \gset
reset role;
insert into public.club_members values (:'club','71000000-0000-0000-0000-000000000002','club_member',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000002',true);
insert into public.activities(id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at)
 values('72000000-0000-0000-0000-000000000001',:'club',auth.uid(),'training','Hardening','2026-11-08','Field',1,'',now());
insert into public.activities(id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at)
 values('72000000-0000-0000-0000-000000000001',:'club',auth.uid(),'training','Conflicting retry','2026-11-08','Field',1,'',now())
 on conflict(id) do nothing;
select pg_temp.assert_true((select title='Hardening' from public.activities where id='72000000-0000-0000-0000-000000000001'),
 'conflicting retry cannot overwrite original client UUID payload');
select :'club'||'/72000000-0000-0000-0000-000000000001/' as prefix \gset
-- An interrupted upload exists before its attachment row, and is reusable later.
insert into storage.objects(bucket_id,name,owner_id,metadata)
 select 'activity-media',:'prefix'||id||'.jpg',auth.uid()::text,
 jsonb_build_object('size',1048576,'mimetype','image/jpeg')
 from unnest(array['73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002',
 '73000000-0000-0000-0000-000000000003','73000000-0000-0000-0000-000000000004']) id;
select format('insert into public.activity_attachments values(%L,%L,%L,%L,1048576)',
 '73000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001',
 :'prefix'||'73000000-0000-0000-0000-000000000001.jpg','image/jpeg') as insert_one \gset

-- No cleanup is authorized by age or a missing metadata row. A year-old
-- object can still belong to an offline client whose retries never expire.
reset role;
update storage.objects set created_at=now()-interval '1 year'
 where name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg';
set local role authenticated;
select pg_temp.assert_true((select count(*)=4 from storage.objects where bucket_id='activity-media' and name like :'prefix'||'%'),
 'interrupted and old retryable uploads remain readable before metadata');
delete from storage.objects where bucket_id='activity-media'
 and name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg';
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='activity-media'
 and name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg'),
 'RLS prevents clients from deleting a potentially retryable orphan');

-- Fail closed on absent, string/fractional/oversized size and missing/wrong MIME.
reset role;
update storage.objects set metadata=null where name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg';
set local role authenticated;
select pg_temp.rejected(:'insert_one','23514','absent finalized metadata');
reset role;
update storage.objects set metadata='{"size":"1048576","mimetype":"image/jpeg"}' where name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg';
set local role authenticated;
select pg_temp.rejected(:'insert_one','23514','size must be a JSON number');
reset role;
update storage.objects set metadata='{"size":1048575.5,"mimetype":"image/jpeg"}' where name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg';
set local role authenticated;
select pg_temp.rejected(:'insert_one','23514','fractional or mismatching size');
reset role;
update storage.objects set metadata='{"size":1048577,"mimetype":"image/jpeg"}' where name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg';
set local role authenticated;
select pg_temp.rejected(:'insert_one','23514','object size cannot exceed one MiB');
reset role;
update storage.objects set metadata='{"size":1048576}' where name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg';
set local role authenticated;
select pg_temp.rejected(:'insert_one','23514','missing object MIME');
reset role;
update storage.objects set metadata='{"size":1048576,"mimetype":"image/png"}' where name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg';
set local role authenticated;
select pg_temp.rejected(:'insert_one','23514','mismatching object MIME');
reset role;
update storage.objects set metadata='{"size":1048576,"mimetype":"image/jpeg"}' where name=:'prefix'||'73000000-0000-0000-0000-000000000001.jpg';
set local role authenticated;
select pg_temp.rejected(replace(:'insert_one','1048576','1048577'),'23514','new byte constraint');
:insert_one;
select pg_temp.rejected(replace(:'insert_one','1048576','1048575'),'23514','client cannot underreport size');
select replace(:'insert_one','73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002') as insert_two \gset
:insert_two;
select replace(:'insert_one','73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000003') as insert_three \gset
:insert_three;
:insert_one on conflict(id) do nothing;
:insert_two on conflict(id) do nothing;
:insert_three on conflict(id) do nothing;
select pg_temp.assert_true((select count(*)=3 from public.activity_attachments),'three slots survive duplicate retries');
select pg_temp.rejected(replace(:'insert_one','73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000004'),
 '23514','fourth distinct attachment');
select pg_temp.rejected('select * from private.activity_attachment_quota','42501','quota is not exposed');
select pg_temp.rejected('select private.track_activity_attachment_quota()','42501','trigger cannot be called by clients');
select pg_temp.rejected('update public.activity_attachments set file_size=1','42501','attachments stay immutable');

-- Live authorization, not a cached role; previously uploaded bytes grant nothing.
reset role;
select pg_temp.assert_true((select attachment_count=3 from private.activity_attachment_quota where activity_id='72000000-0000-0000-0000-000000000001'),
 'failed inserts and duplicates do not leak quota');
delete from public.club_members where club_id=:'club' and user_id='71000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.activity_attachments),'revoked member cannot read metadata');
select pg_temp.rejected(:'insert_one'||' on conflict(id) do nothing','42501','revoked retry cannot bypass RLS');
select pg_temp.rejected(format('insert into storage.objects(bucket_id,name,owner_id,metadata) values(%L,%L,auth.uid()::text,%L)',
 'activity-media',:'prefix'||'73000000-0000-0000-0000-000000000005.jpg','{"size":1,"mimetype":"image/jpeg"}'),
 '42501','revoked member cannot upload');
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000003',true);
select pg_temp.rejected(:'insert_one','42501','outsider cannot attach even with known path');
set local role anon;
select pg_temp.rejected('select * from public.activity_attachments','42501','anonymous metadata read');
reset role;
-- Trusted deletion maintains quota, but clients still have no delete grant.
delete from public.activity_attachments where id='73000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select attachment_count=2 from private.activity_attachment_quota where activity_id='72000000-0000-0000-0000-000000000001'),
 'trusted deletion releases a slot transactionally');
rollback;
\echo 'Activity hardening SQL assertions passed (fixtures rolled back).'
