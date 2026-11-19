-- Disposable database only, after all migrations. Fixtures roll back.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when insufficient_privilege or check_violation or not_null_violation or foreign_key_violation or datetime_field_overflow then return; end;
 raise exception 'FAIL: expected rejection: %', label;
end $$;
select pg_temp.assert_true((select not public and file_size_limit=1048576 and allowed_mime_types=array['image/jpeg','image/png'] from storage.buckets where id='activity-media'), 'private image bucket limits');
insert into auth.users(id) values ('51000000-0000-0000-0000-000000000001'), ('51000000-0000-0000-0000-000000000002'), ('51000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
select public.create_club('Activity A','Nairobi') as club_a \gset
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000002',true);
select public.create_club('Activity B','Kisumu') as club_b \gset
reset role;
insert into public.club_members(club_id,user_id,role) values (:'club_a','51000000-0000-0000-0000-000000000003','club_member');
set local role authenticated;
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000003',true);
-- An ordinary member uploads before the activity exists.
select :'club_a'||'/52000000-0000-0000-0000-000000000001/53000000-0000-0000-0000-000000000001.jpg' as path \gset
-- Catalog-only fixtures imitate Storage API metadata, not physical uploads.
insert into storage.objects(bucket_id,name,owner_id,metadata) values ('activity-media',:'path',auth.uid()::text,'{"size":100,"mimetype":"image/jpeg"}');
select format('insert into public.activities(id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at) values (%L,%L,%L,%L,%L,%L,%L,12,%L,%L)', '52000000-0000-0000-0000-000000000001', :'club_a', '51000000-0000-0000-0000-000000000003','training','Practice','2026-11-08','Nairobi','Notes','2026-11-07T10:00:00Z') as insert_activity \gset
:insert_activity;
:insert_activity on conflict(id) do nothing;
select pg_temp.assert_true((select count(*)=1 and bool_and(created_at='2026-11-07T10:00:00Z'::timestamptz and synced_at=now()) from public.activities), 'retry keeps one row and original client timestamp');
insert into public.activity_attachments values ('53000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',:'path','image/jpeg',100);
insert into public.activity_attachments values ('53000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',:'path','image/jpeg',100) on conflict(id) do nothing;
select pg_temp.assert_true((select count(*)=1 from public.activity_attachments), 'attachment retry no-op');
select pg_temp.denied(format('insert into public.activities(id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at,synced_at) values (gen_random_uuid(),%L,auth.uid(),%L,%L,current_date,%L,1,%L,now(),now())', :'club_a','training','Server time','Nairobi',''), 'client cannot supply synced_at');
select replace(:'path','53000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000002') as path_two \gset
insert into storage.objects(bucket_id,name,owner_id,metadata) values ('activity-media',:'path_two',auth.uid()::text,'{"size":1048576,"mimetype":"image/png"}');
select format('insert into public.activity_attachments values (%L,%L,%L,%L,1048576)', '53000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000001',:'path_two','image/png') as insert_attachment \gset
select pg_temp.denied(replace(:'insert_attachment','1048576','1048577'), 'attachment size limit');
select pg_temp.denied(replace(:'insert_attachment','1048576','0'), 'nonempty attachment');
select pg_temp.denied(replace(:'insert_attachment','image/png','image/webp'), 'attachment MIME');
select pg_temp.denied(replace(:'insert_attachment',:'path_two',:'path_two'||'x'), 'attachment deterministic path');
:insert_attachment;
-- Reuse a valid insert with another UUID for constraint/permission probes.
select replace(:'insert_activity','52000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000002') as probe \gset
select pg_temp.denied(replace(:'probe',:'club_a',:'club_b'), 'cross club insert');
select pg_temp.denied(replace(:'probe','51000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000001'), 'creator spoof');
select pg_temp.denied(replace(:'probe',quote_literal('training'),quote_literal('invalid')), 'activity type');
select pg_temp.denied(replace(:'probe',quote_literal('Practice'),quote_literal(E'\t\n ')), 'blank title');
select pg_temp.denied(replace(:'probe',quote_literal('Practice'),quote_literal(repeat('x',151))), 'title limit');
select pg_temp.denied(replace(:'probe',quote_literal('Nairobi'),quote_literal(' ')), 'blank location');
select pg_temp.denied(replace(:'probe',quote_literal('Nairobi'),quote_literal(repeat('x',201))), 'location limit');
select pg_temp.denied(replace(:'probe',quote_literal('Notes'),quote_literal(repeat('x',5001))), 'notes limit');
select pg_temp.denied(replace(:'probe',',12,',',0,'), 'positive participants');
select pg_temp.denied(replace(:'probe',',12,',',9007199254740992,'), 'safe integer participants');
select pg_temp.denied(replace(:'probe','2026-11-08','2026-02-30'), 'calendar date');
select pg_temp.denied(replace(:'probe','2026-11-08','infinity'), 'finite date');
select pg_temp.denied('update public.activities set title=''Changed''', 'activity update');
select pg_temp.denied('delete from public.activities', 'activity delete');
select pg_temp.denied('update public.activity_attachments set file_size=1', 'attachment update');
select pg_temp.denied('delete from public.activity_attachments', 'attachment delete');
select pg_temp.denied(format('insert into storage.objects(bucket_id,name,owner_id) values (%L,%L,%L)','activity-media',replace(:'path',:'club_a',:'club_b'),auth.uid()::text), 'cross club upload');
select pg_temp.denied(format('insert into storage.objects(bucket_id,name,owner_id) values (%L,%L,%L)','activity-media',:'path','someone-else'), 'storage owner spoof');
select pg_temp.denied(format('insert into storage.objects(bucket_id,name,owner_id) values (%L,%L,%L)','activity-media',:'path'||'/nested',auth.uid()::text), 'malformed path');
select pg_temp.denied(format('insert into public.activity_attachments values (%L,%L,%L,%L,100)','53000000-0000-0000-0000-000000000003','52000000-0000-0000-0000-000000000001',replace(:'path','53000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000003'),'image/jpeg'), 'missing uploaded object');
-- Admin may read but cannot attach files to another member's activity.
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((select count(*)=1 from public.activities), 'club admin reads member activity');
select pg_temp.assert_true((select count(*)=2 from public.activity_attachments), 'club admin reads attachments');
select replace(:'path','53000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000003') as admin_path \gset
insert into storage.objects(bucket_id,name,owner_id,metadata) values ('activity-media',:'admin_path',auth.uid()::text,'{"size":100,"mimetype":"image/jpeg"}');
select pg_temp.denied(format('insert into public.activity_attachments values (%L,%L,%L,%L,100)','53000000-0000-0000-0000-000000000003','52000000-0000-0000-0000-000000000001',:'admin_path','image/jpeg'), 'another creator attachment');
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.activities), 'unrelated activity hidden');
select pg_temp.assert_true((select count(*)=0 from public.activity_attachments), 'unrelated attachments hidden');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='activity-media'), 'cross club storage read denied');
select pg_temp.denied(replace(:'probe','51000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000002'), 'unrelated user insert');
delete from storage.objects where bucket_id='activity-media';
reset role;
select pg_temp.assert_true((select count(*)=3 from storage.objects where bucket_id='activity-media' and name in (:'path', :'path_two', :'admin_path')), 'storage bytes cannot be deleted by client');
set local role anon;
select pg_temp.denied('select * from public.activities','anonymous activities');
select pg_temp.denied('select * from public.activity_attachments','anonymous attachments');
reset role;
rollback;
\echo 'Activity sync SQL assertions passed (fixtures rolled back).'
