-- Run only against a disposable local/test Supabase database after migrations.
-- All fixtures are rolled back. Never point tests at production.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when insufficient_privilege or check_violation then return; end;
 raise exception 'FAIL: expected permission/validation rejection: %', label;
end $$;
insert into auth.users(id) values
 ('10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002'),
 ('30000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.create_club('Club A','Nairobi') as club_a \gset
select pg_temp.assert_true((select role='club_admin' from public.club_members where club_id=:'club_a'), 'creator is admin');
select pg_temp.denied($q$select public.create_club('','Nairobi')$q$, 'blank club name');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select public.create_club('Club B','Kisumu') as club_b \gset
select pg_temp.assert_true((select count(*)=1 from public.clubs), 'B sees only B');
select pg_temp.assert_true((select count(*)=0 from public.clubs where id=:'club_a'), 'B cannot read A');
update public.clubs set name='ATTACK' where id=:'club_a';
select pg_temp.denied(format('insert into public.club_members values (%L,%L,%L,now())', :'club_a','20000000-0000-0000-0000-000000000002','club_admin'), 'self promotion');
select pg_temp.denied(format('update public.clubs set id=%L where id=%L', :'club_a', :'club_b'), 'club id immutable');
reset role;
insert into public.club_members(club_id,user_id,role) values (:'club_a','30000000-0000-0000-0000-000000000003','club_member');
-- Storage service normally creates these rows after checking upload policies.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
insert into storage.objects(bucket_id,name,owner_id) values ('club-evidence', :'club_a'||'/40000000-0000-0000-0000-000000000004.pdf','10000000-0000-0000-0000-000000000001');
insert into public.evidence(club_id,uploaded_by,document_type,file_name,storage_path,mime_type,file_size)
values (:'club_a','10000000-0000-0000-0000-000000000001','other','test.pdf',:'club_a'||'/40000000-0000-0000-0000-000000000004.pdf','application/pdf',100) returning id as evidence_id \gset
select pg_temp.assert_true((select status='supplied' from public.evidence where id=:'evidence_id'), 'supplied default');
update public.clubs set description='Updated by admin' where id=:'club_a';
select pg_temp.assert_true((select description='Updated by admin' from public.clubs where id=:'club_a'), 'admin edits');
select pg_temp.denied(format('update public.evidence set uploaded_by=%L where id=%L','20000000-0000-0000-0000-000000000002', :'evidence_id'), 'uploader immutable');
select pg_temp.denied(format('update public.evidence set club_id=%L where id=%L', :'club_b', :'evidence_id'), 'evidence club immutable');
select pg_temp.denied(format('update public.evidence set status=%L where id=%L','verified', :'evidence_id'), 'no verification');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.evidence), 'unrelated evidence hidden');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='club-evidence'), 'unrelated files hidden');
delete from public.evidence where id=:'evidence_id';
delete from storage.objects where bucket_id='club-evidence';
select pg_temp.denied(format('insert into storage.objects(bucket_id,name,owner_id) values (%L,%L,%L)', 'club-evidence', :'club_a'||'/50000000-0000-0000-0000-000000000005.pdf', '20000000-0000-0000-0000-000000000002'), 'cross club upload');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.evidence), 'member reads own evidence');
select pg_temp.assert_true((select count(*)=2 from public.club_members), 'member sees only own club memberships');
select pg_temp.denied(format('insert into public.evidence(club_id,uploaded_by,document_type,file_name,storage_path,mime_type,file_size) values (%L,%L,%L,%L,%L,%L,100)', :'club_a','30000000-0000-0000-0000-000000000003','other','member.pdf',:'club_a'||'/60000000-0000-0000-0000-000000000006.pdf','application/pdf'), 'member cannot create evidence metadata');
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='club-evidence'), 'member reads own file');
update public.clubs set name='ATTACK' where id=:'club_a';
select pg_temp.assert_true((select name='Club A' from public.clubs where id=:'club_a'), 'member cannot edit');
delete from public.evidence where id=:'evidence_id';
select pg_temp.assert_true((select count(*)=1 from public.evidence), 'member cannot delete evidence');
delete from storage.objects where bucket_id='club-evidence';
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='club-evidence'), 'member cannot delete file');
select pg_temp.denied(format('insert into storage.objects(bucket_id,name,owner_id) values (%L,%L,%L)', 'club-evidence', :'club_a'||'/50000000-0000-0000-0000-000000000005.pdf', '30000000-0000-0000-0000-000000000003'), 'member cannot upload');
select pg_temp.denied($q$update public.club_members set role='club_admin'$q$, 'member cannot promote');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select pg_temp.denied(format('insert into public.evidence(club_id,uploaded_by,document_type,file_name,storage_path,mime_type,file_size) values (%L,%L,%L,%L,%L,%L,100)', :'club_a','20000000-0000-0000-0000-000000000002','other','fake.pdf',:'club_a'||'/50000000-0000-0000-0000-000000000005.pdf','application/pdf'), 'uploader impersonation');
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='club-evidence'), 'cross club deletion did not remove file');
delete from storage.objects where bucket_id='club-evidence';
delete from public.evidence where id=:'evidence_id';
select pg_temp.assert_true((select count(*)=0 from public.evidence), 'admin deletes evidence');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='club-evidence'), 'admin deletes file');
reset role;
select pg_temp.assert_true((select count(*)=2 from public.clubs where id in (:'club_a', :'club_b')), 'failed club creation rolled back');
-- Force membership creation to fail after the club insert, proving RPC atomicity.
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000009',true);
do $$
begin
 begin
  perform public.create_club('Atomic rollback sentinel','Nairobi');
  raise exception 'FAIL: membership foreign key should reject an unknown creator';
 exception when foreign_key_violation then null;
 end;
end $$;
reset role;
select pg_temp.assert_true(not exists(select 1 from public.clubs where name='Atomic rollback sentinel'), 'membership failure rolls back club insert');
set local role anon;
select pg_temp.denied($q$select * from public.clubs$q$, 'anonymous read');
select pg_temp.denied($q$select public.create_club('Anonymous','Nairobi')$q$, 'anonymous create');
reset role;
rollback;
\echo 'Phase 3 SQL security assertions passed (fixtures rolled back).'
