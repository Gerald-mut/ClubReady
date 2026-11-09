\set ON_ERROR_STOP on
\set QUIET 1
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.rejected(statement text,expected_state text,label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if SQLSTATE=expected_state then return; end if;
  raise exception 'FAIL: %: expected %, got %: %',label,expected_state,SQLSTATE,SQLERRM;
 end;
 raise exception 'FAIL: expected rejection: %',label;
end $$;
-- Stable fixture IDs and rollback keep the curated catalogue untouched.
insert into auth.users(id) values ('b0000000-0000-0000-0000-000000000001'),('b0000000-0000-0000-0000-000000000002');
insert into public.clubs(id,name,county) values
 ('b1000000-0000-0000-0000-000000000001','Readiness A','Nairobi'),
 ('b1000000-0000-0000-0000-000000000002','Readiness B','Nairobi');
insert into public.club_members(club_id,user_id,role) values
 ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','club_member'),
 ('b1000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','club_admin');
insert into public.opportunities(id,title,organiser,description,source_url,application_method,status,review_date) values
 ('b2000000-0000-0000-0000-000000000001','Schema fixture','Test','Test','https://example.org','Test','unconfirmed',current_date),
 ('b2000000-0000-0000-0000-000000000002','Other fixture','Test','Test','https://example.org','Test','unconfirmed',current_date);
insert into public.opportunity_requirements(id,opportunity_id,version,requirement_type,document_type,description,min_count,source_note,verification,source_reference,condition)
select ('b3000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'b2000000-0000-0000-0000-000000000001',2,
 case n when 1 then 'document' when 2 then 'activity' when 3 then 'club_info' when 5 then 'activity' else 'other' end,
 case when n=1 then 'club_registration' end,'Fixture: never parse this text',case when n in (1,2,5) then 1 end,'Test source',
 'verified','{"verified_at":"2026-11-08","url":"https://example.org"}',case when n=5 then '{"unresolved":true}'::jsonb end
from generate_series(1,5) n;
insert into public.readiness_requirement_mappings(requirement_id,opportunity_id,requirement_version,mapping_type,document_type,activity_type,club_fields,min_count)
select id,opportunity_id,version,case when requirement_type='other' then 'unsupported' else requirement_type end,
 document_type,case when requirement_type='activity' then 'tournament' end,
 case when requirement_type='club_info' then array['name','county'] end,min_count
from public.opportunity_requirements where opportunity_id='b2000000-0000-0000-0000-000000000001';
insert into public.evidence(id,club_id,uploaded_by,document_type,file_name,storage_path,mime_type,file_size)
select ('b5000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 ('b1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'b0000000-0000-0000-0000-000000000001',
 'club_registration','Fixture.pdf','b1000000-0000-0000-0000-'||lpad(n::text,12,'0')||'/b5000000-0000-0000-0000-'||lpad(n::text,12,'0')||'.pdf','application/pdf',100
from generate_series(1,2) n;
insert into public.activities(id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at)
select ('b6000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 ('b1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'b0000000-0000-0000-0000-000000000001',
 'tournament','Fixture',current_date,'Field',1,'',now() from generate_series(1,2) n;

\ir helpers/readiness_queue.sql
insert into pg_temp.readiness_fixture_clubs values
 ('b1000000-0000-0000-0000-000000000001'),
 ('b1000000-0000-0000-0000-000000000002');
-- Worker fixtures are rollback-only; each explicit assertion has a label.
select pg_temp.assert_true((select count(*)=2 from public.processing_jobs where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and status='queued'),'events coalesce per club');
select private.prepare_readiness(100);
set local role readiness_worker;
select pg_temp.process_fixture_job();
select pg_temp.process_fixture_job();
reset role;
select pg_temp.assert_true((select count(*)=10 from public.readiness_results where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and opportunity_id='b2000000-0000-0000-0000-000000000001'),'both clubs evaluated');
select pg_temp.assert_true((select bool_and(status='supplied') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000002'),'activity counts');
select pg_temp.assert_true((select bool_and(status='unknown') from public.readiness_results where requirement_id in ('b3000000-0000-0000-0000-000000000004','b3000000-0000-0000-0000-000000000005')),'unsupported and conditional unknown');
select pg_temp.assert_true((select count(*)=2 from public.readiness_result_evidence where result_id in (select id from public.readiness_results where opportunity_id='b2000000-0000-0000-0000-000000000001' and club_id in (select club_id from pg_temp.readiness_fixture_clubs)) and activity_id is not null),'exact activity supports');
select pg_temp.assert_true((select bool_and(status='unknown') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000001'),'null expiry unknown');
-- Idempotent activity upload retries neither duplicate supports nor enqueue again.
insert into public.activities select * from public.activities where club_id in (select club_id from pg_temp.readiness_fixture_clubs) on conflict(id) do nothing;
select pg_temp.assert_true((select count(*)=2 from public.activities where club_id in (select club_id from pg_temp.readiness_fixture_clubs)),'duplicate activity retry count');
select pg_temp.assert_true((select count(*)=0 from public.processing_jobs where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and status='queued'),'duplicate activity retry no extra work');
update public.evidence set expires_at=(clock_timestamp() at time zone 'UTC')::date+31 where club_id in (select club_id from pg_temp.readiness_fixture_clubs);
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.assert_true((select bool_and(status='supplied') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000001'),'beyond horizon supplied');
update public.evidence set expires_at=(clock_timestamp() at time zone 'UTC')::date where club_id in (select club_id from pg_temp.readiness_fixture_clubs);
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.assert_true((select bool_and(status='expiring') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000001'),'UTC expiry date inclusive');
update public.evidence set expires_at=(clock_timestamp() at time zone 'UTC')::date+10 where club_id in (select club_id from pg_temp.readiness_fixture_clubs);
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.assert_true((select bool_and(status='expiring') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000001'),'expiring window');
update public.opportunity_requirements set min_count=2 where id='b3000000-0000-0000-0000-000000000001';
update public.readiness_requirement_mappings set min_count=2 where requirement_id='b3000000-0000-0000-0000-000000000001';
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.assert_true((select bool_and(status='not_supplied') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000001'),'partial count is not supplied');
insert into public.evidence(club_id,uploaded_by,document_type,file_name,storage_path,mime_type,file_size,expires_at)
select club_id,uploaded_by,document_type,file_name,club_id::text||'/'||gen_random_uuid()::text||'.pdf',mime_type,file_size,(clock_timestamp() at time zone 'UTC')::date+100 from public.evidence where club_id in (select club_id from pg_temp.readiness_fixture_clubs);
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.assert_true((select bool_and(status='expiring') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000001'),'mixed current supports use expiring when stable count is short');
select pg_temp.assert_true((select count(*)=4 from public.readiness_result_evidence where result_id in (select id from public.readiness_results where opportunity_id='b2000000-0000-0000-0000-000000000001' and club_id in (select club_id from pg_temp.readiness_fixture_clubs)) and evidence_id is not null),'exact document supports including partial counts');
update public.readiness_requirement_mappings set club_fields=array['name','description'] where requirement_id='b3000000-0000-0000-0000-000000000003';
update public.clubs set description=' ' where id in (select club_id from pg_temp.readiness_fixture_clubs);
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.assert_true((select bool_and(status='not_supplied') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000003'),'profile blank triggers missing information');
update public.evidence set expires_at=(clock_timestamp() at time zone 'UTC')::date-1 where club_id in (select club_id from pg_temp.readiness_fixture_clubs);
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.assert_true((select bool_and(status='expired') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000001'),'expired documents');
delete from public.evidence where club_id in (select club_id from pg_temp.readiness_fixture_clubs);
select pg_temp.assert_true((select count(*)=2 from public.processing_jobs where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and status='queued'),'evidence deletion enqueues');
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.assert_true((select bool_and(status='not_supplied') from public.readiness_results where requirement_id='b3000000-0000-0000-0000-000000000001'),'deleted evidence missing');
update public.opportunity_requirements set description=description||' changed' where id='b3000000-0000-0000-0000-000000000002';
select private.prepare_readiness(100);
select pg_temp.assert_true((select bool_and(processing_state='stale') from public.readiness_results where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and opportunity_id='b2000000-0000-0000-0000-000000000001'),'catalogue invalidates snapshots');
select pg_temp.assert_true((select count(*)=2 from public.processing_jobs where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and status='queued'),'catalogue revision bounded fanout');
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.rejected($q$select private.evaluate_readiness('b1000000-0000-0000-0000-000000000001',1)$q$,'P0001','older evaluation cannot replace current generation');
select private.enqueue_readiness('b1000000-0000-0000-0000-000000000001');
select private.enqueue_readiness('b1000000-0000-0000-0000-000000000002');
-- Inject a real result-write failure. Evaluation must roll back entirely while
-- attempts/backoff persist outside the evaluator subtransaction.
create temporary table before_failure as select jsonb_agg(to_jsonb(r)-'processing_state' order by id) snapshot from public.readiness_results r where club_id in (select club_id from pg_temp.readiness_fixture_clubs);
create function pg_temp.fail_result() returns trigger language plpgsql as $$ begin raise exception 'secret must not be logged'; end $$;
create trigger test_failure before insert or update on public.readiness_results for each row execute function pg_temp.fail_result();
select pg_temp.process_fixture_job();
select pg_temp.assert_true((select count(*)=1 from public.processing_jobs where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and status='queued' and attempts=1 and last_error='evaluation_error:P0001' and run_after>clock_timestamp()),'safe retry bookkeeping and backoff');
drop trigger test_failure on public.readiness_results;
-- Exercise all five attempts with time advanced only by trusted test SQL.
create trigger test_failure before insert on public.readiness_result_evidence for each row execute function pg_temp.fail_result();
do $$ declare n integer; begin for n in 1..12 loop
 update public.processing_jobs set run_after=clock_timestamp() where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and status='queued';
 perform pg_temp.process_fixture_job();
end loop; end $$;
select pg_temp.assert_true((select count(*)=2 from public.processing_jobs where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and status='failed' and attempts=5),'five attempts exhausted');
drop trigger test_failure on public.readiness_result_evidence;
update public.processing_jobs set status='queued',max_attempts=100,finished_at=null,run_after=clock_timestamp() where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and status='failed';
select pg_temp.process_fixture_job(); select pg_temp.process_fixture_job();
select pg_temp.assert_true((select count(*)=2 from public.processing_jobs where club_id in (select club_id from pg_temp.readiness_fixture_clubs) and status='failed' and attempts=5 and last_error='attempt_limit'),'legacy maximum cannot permit sixth attempt');
select pg_temp.assert_true((select snapshot from before_failure)=(select jsonb_agg(to_jsonb(r)-'processing_state' order by id) from public.readiness_results r where club_id in (select club_id from pg_temp.readiness_fixture_clubs)),'failed evaluations roll back all result values');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.process_next_job()','execute') and not has_function_privilege('anon','public.process_next_job()','execute') and not has_function_privilege('service_role','public.process_next_job()','execute'),'worker privilege boundary');
set local role authenticated;
select pg_temp.rejected('select public.process_next_job()','42501','client execution denied');
reset role;
rollback;
\echo 'PASS readiness worker assertions'
