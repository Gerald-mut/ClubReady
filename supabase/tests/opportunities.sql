-- Disposable database after migrations and opportunity seed. All fixtures roll back.
\set QUIET 1
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text,label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when insufficient_privilege or check_violation or unique_violation or foreign_key_violation then return; end;
 raise exception 'FAIL: expected rejection: %',label;
end $$;
select '60000000-0000-0000-0000-000000000001' as opportunity \gset
select pg_temp.assert_true((select count(*) >= 3 from public.opportunities),'three documented seed records');
select pg_temp.assert_true(not exists(select 1 from public.opportunities where status in ('closed','historical') and not is_demonstration),'closed examples labelled demonstration');
select pg_temp.assert_true((select count(distinct opportunity_id) >= 3 from public.opportunity_requirements),'three requirement sets');
insert into auth.users(id) values
 ('62000000-0000-0000-0000-000000000001'),
 ('62000000-0000-0000-0000-000000000002'),
 ('62000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000001',true) as ignored \gset
select public.create_club('Catalogue A','Nairobi') as club_a \gset
select public.create_club_invite(:'club_a','club_member') as token \gset
insert into public.application_tracking(club_id,opportunity_id,status,notes) values (:'club_a',:'opportunity','preparing','A private note');
select id as tracking_id, updated_at as initial_time from public.application_tracking where club_id=:'club_a' \gset
select pg_temp.assert_true((select updated_by=auth.uid() from public.application_tracking where id=:'tracking_id'),'insert actor stamped');
update public.application_tracking set status='submitted', notes='Updated A' where id=:'tracking_id';
select pg_temp.assert_true((select status='submitted' and updated_at >= :'initial_time'::timestamptz and updated_by=auth.uid() from public.application_tracking where id=:'tracking_id'),'admin updates and timestamp stamped');
select pg_temp.denied(format('insert into public.application_tracking(club_id,opportunity_id) values (%L,%L)',:'club_a',:'opportunity'),'one row per club and opportunity');
select pg_temp.denied('update public.application_tracking set updated_by=null','cannot forge updater');
select pg_temp.denied('update public.application_tracking set updated_at=''2000-01-01''','cannot forge time');
select pg_temp.denied('update public.application_tracking set club_id=gen_random_uuid()','cannot move club');
select pg_temp.denied('update public.application_tracking set opportunity_id=gen_random_uuid()','cannot move opportunity');
select pg_temp.denied('update public.application_tracking set id=gen_random_uuid()','cannot change identity');
select pg_temp.denied('update public.application_tracking set status=''eligible''','invalid tracking status');
select pg_temp.denied('update public.application_tracking set notes=repeat(''x'',10001)','notes bounded');
-- Member sees shared club but cannot mutate it.
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000002',true) as ignored \gset
select public.accept_club_invite(:'token') as ignored \gset
select pg_temp.assert_true((select count(*)=1 from public.application_tracking),'member reads tracking');
update public.application_tracking set notes='Member attack';
delete from public.application_tracking;
select pg_temp.assert_true((select notes='Updated A' from public.application_tracking where id=:'tracking_id'),'member update/delete affect no rows');
select pg_temp.denied(format('insert into public.application_tracking(club_id,opportunity_id) values (%L,%L)',:'club_a','60000000-0000-0000-0000-000000000002'),'member insert denied');
-- Unrelated admin can track the same opportunity independently.
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000003',true) as ignored \gset
select public.create_club('Catalogue B','Kiambu') as club_b \gset
select pg_temp.assert_true((select count(*)=0 from public.application_tracking),'cross-club rows hidden');
select pg_temp.assert_true((select count(*) >= 3 from public.opportunities),'authenticated nonmember catalogue reads');
select pg_temp.assert_true((select count(*) >= 10 from public.opportunity_requirements),'authenticated requirements read');
update public.application_tracking set notes='Outsider attack' where id=:'tracking_id';
delete from public.application_tracking where id=:'tracking_id';
select pg_temp.denied(format('insert into public.application_tracking(club_id,opportunity_id) values (%L,%L)',:'club_a',:'opportunity'),'cross-club insert denied');
insert into public.application_tracking(club_id,opportunity_id) values (:'club_b',:'opportunity');
select pg_temp.assert_true((select count(*)=1 and bool_and(status='not_started') from public.application_tracking),'other club tracks same opportunity');
-- Client catalogue is read-only, including admins.
select pg_temp.denied('insert into public.opportunities default values','catalogue insert denied');
select pg_temp.denied('update public.opportunities set title=''Attack''','catalogue update denied');
select pg_temp.denied('delete from public.opportunities','catalogue delete denied');
select pg_temp.denied('truncate public.opportunities cascade','catalogue truncate denied');
select pg_temp.denied('insert into public.opportunity_requirements default values','requirements insert denied');
select pg_temp.denied('update public.opportunity_requirements set is_current=false','requirements update denied');
select pg_temp.denied('delete from public.opportunity_requirements','requirements delete denied');
delete from public.application_tracking where club_id=:'club_b';
select pg_temp.assert_true((select count(*)=0 from public.application_tracking),'admin deletes own tracking');
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000001',true) as ignored \gset
select pg_temp.assert_true((select notes='Updated A' from public.application_tracking where id=:'tracking_id'),'outsider mutations did not affect A');
set local role anon;
select pg_temp.denied('select * from public.opportunities','anonymous catalogue denied');
select pg_temp.denied('select * from public.opportunity_requirements','anonymous requirements denied');
select pg_temp.denied('select * from public.application_tracking','anonymous tracking denied');
select pg_temp.denied('insert into public.application_tracking default values','anonymous writes denied');
reset role;
-- Trusted-writer constraint checks, independent of client privilege denial.
select pg_temp.denied(format('insert into public.opportunity_requirements(opportunity_id,version,requirement_type,description,source_note) values(%L,0,''other'',''x'',''source'')',:'opportunity'),'positive versions');
select pg_temp.denied(format('insert into public.opportunity_requirements(opportunity_id,requirement_type,document_type,description,source_note) values(%L,''document'',''invented'',''x'',''source'')',:'opportunity'),'evidence categories match');
select pg_temp.denied(format('insert into public.opportunity_requirements(opportunity_id,requirement_type,description,source_note) values(%L,''document'',''x'',''source'')',:'opportunity'),'document type required');
select pg_temp.denied(format('insert into public.opportunity_requirements(opportunity_id,requirement_type,description,min_count,source_note) values(%L,''activity'',''x'',0,''source'')',:'opportunity'),'positive count');
-- History can coexist with the current published set.
insert into public.opportunity_requirements(opportunity_id,version,requirement_type,description,source_note,is_current)
 values (:'opportunity',2,'other','Updated reference','Test source',true),
 (:'opportunity',1,'other','Past reference','Test source',false);
select pg_temp.assert_true((select count(distinct version)=2 from public.opportunity_requirements where opportunity_id=:'opportunity'),'requirement versions retained');
rollback;
\echo 'Opportunities SQL assertions passed (fixtures rolled back).'
