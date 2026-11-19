\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(stmt text) returns void language plpgsql as $$
begin
 begin execute stmt; exception when insufficient_privilege then return; end;
 raise exception 'FAIL: allowed %',stmt;
end $$;
insert into auth.users(id) values('f0000000-0000-0000-0000-000000000001'),('f0000000-0000-0000-0000-000000000002');
insert into public.clubs(id,name,county) values('f1000000-0000-0000-0000-000000000001','Member API','Nairobi'),('f1000000-0000-0000-0000-000000000002','Other club','Nairobi');
insert into public.club_members(club_id,user_id,role) values('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','club_member'),('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','club_admin');
insert into public.opportunities(id,title,organiser,description,source_url,application_method,status,review_date) values
 ('f2000000-0000-0000-0000-000000000001','API fixture','Test','Test','https://example.org','Test','unconfirmed',current_date);
insert into public.opportunity_requirements(id,opportunity_id,version,requirement_type,document_type,description,min_count,source_note,verification,source_reference) values
 ('f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001',1,'document','other','API requirement',1,'Test','verified','{"verified_at":"2026-11-08"}');
insert into public.readiness_requirement_mappings(requirement_id,opportunity_id,requirement_version,mapping_type,document_type,min_count) values
 ('f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001',1,'document','other',1);
\ir helpers/readiness_queue.sql
insert into pg_temp.readiness_fixture_clubs values ('f1000000-0000-0000-0000-000000000001');
-- Start this club with no pending work to exercise the never-assessed state.
delete from public.processing_jobs where club_id in (select club_id from pg_temp.readiness_fixture_clubs);
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.ok(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')->>'state'='never_assessed','never assessed');
select pg_temp.denied($q$select public.readiness_lifecycle('f1000000-0000-0000-0000-000000000002')$q$);
select pg_temp.denied($q$select public.request_readiness_assessment('f1000000-0000-0000-0000-000000000002')$q$);
select pg_temp.denied('select public.readiness_lifecycle(null)');
select pg_temp.denied('select public.process_next_job()');
select pg_temp.denied('select * from public.processing_jobs');
select pg_temp.denied('select * from private.readiness_requests');
select pg_temp.ok((public.request_readiness_assessment('f1000000-0000-0000-0000-000000000001')->>'accepted')::boolean,'member accepted');
select pg_temp.ok(not (public.request_readiness_assessment('f1000000-0000-0000-0000-000000000001')->>'accepted')::boolean,'throttled');
select pg_temp.ok(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')->>'state'='queued','queued');
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000002',true);
select pg_temp.ok(not (public.request_readiness_assessment('f1000000-0000-0000-0000-000000000001')->>'accepted')::boolean,'cooldown shared by different members');
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);

reset role;
select pg_temp.ok((select count(*)=1 from public.processing_jobs where club_id='f1000000-0000-0000-0000-000000000001'),'bounded jobs');
select pg_temp.ok((select generation=2 from private.readiness_clubs where club_id='f1000000-0000-0000-0000-000000000001'),'throttle does not increment generation');
-- Finish actual worker evaluation before testing freshness drift.
select pg_temp.process_fixture_job();
select pg_temp.process_fixture_job();
set local role authenticated;
select pg_temp.ok(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')->>'state'='up_to_date','current after worker');
select pg_temp.ok(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')->>'last_assessed_at' is not null,'assessment timestamp');
select pg_temp.ok((select array_agg(key order by key)=array['last_assessed_at','state'] from jsonb_object_keys(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')) key),'minimal response');
reset role;
delete from public.readiness_results where club_id='f1000000-0000-0000-0000-000000000001' and requirement_id='f3000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.ok(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')->>'state'='stale','missing mapped result cannot be current');
reset role;
select private.evaluate_readiness('f1000000-0000-0000-0000-000000000001',generation) from private.readiness_clubs where club_id='f1000000-0000-0000-0000-000000000001';
update private.readiness_catalogue set revision=revision+1;
set local role authenticated;
select pg_temp.ok(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')->>'state'='stale','catalogue lag detected before fanout');
reset role;
update private.readiness_clubs set catalogue_revision=(select revision from private.readiness_catalogue),swept_on=current_date-1 where club_id='f1000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.ok(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')->>'state'='stale','expiry sweep stale');
reset role;
update private.readiness_requests set requested_at=clock_timestamp()-interval '61 seconds' where club_id='f1000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.ok((public.request_readiness_assessment('f1000000-0000-0000-0000-000000000001')->>'accepted')::boolean,'cooldown ends');
reset role;
update public.processing_jobs set status='running',locked_at=now(),claimed_generation=generation where club_id='f1000000-0000-0000-0000-000000000001' and status='queued';
set local role authenticated;
select pg_temp.ok(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')->>'state'='processing','running state');
reset role;
update public.processing_jobs set status='failed',locked_at=null,finished_at=now() where club_id='f1000000-0000-0000-0000-000000000001' and status='running';
set local role authenticated;
select pg_temp.ok(public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')->>'state'='failed','failed state');
reset role;
delete from public.club_members where club_id='f1000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.denied($q$select public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')$q$);
select pg_temp.denied($q$select public.request_readiness_assessment('f1000000-0000-0000-0000-000000000001')$q$);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.denied($q$select public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')$q$);
select pg_temp.denied($q$select public.request_readiness_assessment('f1000000-0000-0000-0000-000000000001')$q$);
reset role;
set local role anon;
select pg_temp.denied($q$select public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')$q$);
select pg_temp.denied($q$select public.request_readiness_assessment('f1000000-0000-0000-0000-000000000001')$q$);
reset role;
set local role service_role;
select pg_temp.denied($q$select public.request_readiness_assessment('f1000000-0000-0000-0000-000000000001')$q$);
select pg_temp.denied($q$select public.readiness_lifecycle('f1000000-0000-0000-0000-000000000001')$q$);
reset role;
select pg_temp.ok((select bool_and(proconfig @> array['search_path=""']) from pg_proc where oid in ('public.readiness_lifecycle(uuid)'::regprocedure,'public.request_readiness_assessment(uuid)'::regprocedure)),'safe search paths');
rollback;
