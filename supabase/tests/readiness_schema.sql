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
insert into public.readiness_results(id,club_id,opportunity_id,requirement_id,requirement_version)
select ('b4000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'b1000000-0000-0000-0000-000000000001',
 'b2000000-0000-0000-0000-000000000001',('b3000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,2
from generate_series(1,5) n;
insert into public.readiness_results(id,club_id,opportunity_id,requirement_id,requirement_version)
values ('b4000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000002',
 'b2000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001',2);
insert into public.evidence(id,club_id,uploaded_by,document_type,file_name,storage_path,mime_type,file_size)
select ('b5000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 ('b1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'b0000000-0000-0000-0000-000000000001',
 'club_registration','Fixture.pdf','b1000000-0000-0000-0000-'||lpad(n::text,12,'0')||'/b5000000-0000-0000-0000-'||lpad(n::text,12,'0')||'.pdf','application/pdf',100
from generate_series(1,2) n;
insert into public.activities(id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at)
select ('b6000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 ('b1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'b0000000-0000-0000-0000-000000000001',
 'tournament','Fixture',current_date,'Field',1,'',now() from generate_series(1,2) n;
insert into public.readiness_result_evidence(result_id,club_id,evidence_id) values
 ('b4000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001'),
 ('b4000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000002','b5000000-0000-0000-0000-000000000002');
insert into public.readiness_result_evidence(result_id,club_id,activity_id) values
 ('b4000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select bool_and(status='unknown' and applicability='unknown' and evaluated_at is null and processing_state='never_assessed') from public.readiness_results where opportunity_id='b2000000-0000-0000-0000-000000000001'),'defaults preserve unknown, including conditional and unsupported');
update public.readiness_results set status='supplied',applicability='applicable',reason='structured_fixture',evaluated_at=now(),processing_state='current'
 where id='b4000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select status='supplied' from public.readiness_results where id='b4000000-0000-0000-0000-000000000001'),'mapped verified unconditional result allowed');
select pg_temp.rejected($q$update public.readiness_results set status='supplied',applicability='applicable',evaluated_at=now() where requirement_id in ('b3000000-0000-0000-0000-000000000004','b3000000-0000-0000-0000-000000000005')$q$,'23514','unsupported and conditional stay unknown');
select pg_temp.rejected($q$update public.readiness_results set status='supplied',applicability='applicable',evaluated_at=now() where requirement_id='b3000000-0000-0000-0000-000000000005'$q$,'23514','mapped conditional stays unknown');
-- Every supported evidence state is distinct from processing state.
update public.readiness_results set status='not_supplied' where id='b4000000-0000-0000-0000-000000000001';
update public.readiness_results set status='expiring' where id='b4000000-0000-0000-0000-000000000001';
update public.readiness_results set status='expired' where id='b4000000-0000-0000-0000-000000000001';
update public.readiness_results set status='not_applicable',applicability='not_applicable' where id='b4000000-0000-0000-0000-000000000001';
select pg_temp.rejected($q$update public.readiness_results set status='queued'$q$,'23514','processing state cannot be evidence state');
update public.readiness_results set status='unknown',applicability='unknown' where id='b4000000-0000-0000-0000-000000000001';
update public.opportunity_requirements set verification='needs_verification' where id='b3000000-0000-0000-0000-000000000001';
select pg_temp.rejected($q$update public.readiness_results set status='supplied',applicability='applicable',evaluated_at=now() where id='b4000000-0000-0000-0000-000000000001'$q$,'23514','unverified stays unknown');
update public.opportunity_requirements set verification='verified' where id='b3000000-0000-0000-0000-000000000001';
select pg_temp.rejected($q$update public.readiness_results set opportunity_id='b2000000-0000-0000-0000-000000000002'$q$,'23503','wrong opportunity');
select pg_temp.rejected($q$update public.readiness_results set requirement_version=1$q$,'23503','wrong result version');
select pg_temp.rejected($q$update public.opportunity_requirements set version=3 where id='b3000000-0000-0000-0000-000000000001'$q$,'23503','referenced version cannot drift');
select pg_temp.rejected($q$update public.readiness_requirement_mappings set club_fields=array['invented'] where mapping_type='club_info'$q$,'23514','profile allowlist');
select pg_temp.rejected($q$update public.readiness_requirement_mappings set document_type='financial_report' where requirement_id='b3000000-0000-0000-0000-000000000001'$q$,'23514','mapping matches structured type');
select pg_temp.rejected($q$insert into public.readiness_result_evidence(result_id,club_id,evidence_id) values('b4000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000002')$q$,'23503','cross-club evidence');
select pg_temp.rejected($q$insert into public.readiness_result_evidence(result_id,club_id,activity_id) values('b4000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000002')$q$,'23503','cross-club activity');
select pg_temp.rejected($q$update public.readiness_result_evidence set club_id='b1000000-0000-0000-0000-000000000002' where result_id='b4000000-0000-0000-0000-000000000001'$q$,'23503','forged link club');
select pg_temp.rejected($q$update public.evidence set club_id='b1000000-0000-0000-0000-000000000002',storage_path='b1000000-0000-0000-0000-000000000002/b5000000-0000-0000-0000-000000000001.pdf' where id='b5000000-0000-0000-0000-000000000001'$q$,'23503','parent ownership cannot drift');
select pg_temp.rejected($q$insert into public.readiness_result_evidence(result_id,club_id,evidence_id) values('b4000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000099')$q$,'23503','missing evidence');
select pg_temp.rejected($q$insert into public.readiness_result_evidence(result_id,club_id) values('b4000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001')$q$,'23514','exactly one support');
select pg_temp.rejected($q$update public.readiness_result_evidence set activity_id='b6000000-0000-0000-0000-000000000001' where evidence_id='b5000000-0000-0000-0000-000000000001'$q$,'23514','two supports rejected');
select pg_temp.rejected($q$insert into public.readiness_result_evidence(result_id,club_id,evidence_id) values('b4000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001')$q$,'23505','duplicate document support');
select pg_temp.rejected($q$insert into public.readiness_result_evidence(result_id,club_id,activity_id) values('b4000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000001')$q$,'23505','duplicate activity support');
-- Phase C has already enqueued fixture events; isolate queue constraint checks.
delete from public.processing_jobs;
insert into public.processing_jobs(club_id) values('b1000000-0000-0000-0000-000000000001');
select pg_temp.rejected($q$insert into public.processing_jobs(club_id) values('b1000000-0000-0000-0000-000000000001')$q$,'23505','one queued job');
insert into public.processing_jobs(club_id,status,locked_at,claimed_generation) values('b1000000-0000-0000-0000-000000000001','running',now(),1);
select pg_temp.rejected($q$insert into public.processing_jobs(club_id,status,locked_at,claimed_generation) values('b1000000-0000-0000-0000-000000000001','running',now(),1)$q$,'23505','one running job alongside queued successor');
select pg_temp.rejected($q$update public.processing_jobs set claimed_generation=2 where status='running'$q$,'23514','claim generation bounded');
select pg_temp.rejected($q$update public.processing_jobs set attempts=max_attempts+1$q$,'23514','attempt bound');
-- Both a regular member and an admin use live membership, never browser roles.
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=5 from public.readiness_results),'member own results only');
select pg_temp.assert_true((select count(*)=2 from public.readiness_result_evidence),'member own links only');
select pg_temp.rejected('select * from public.processing_jobs','42501','jobs hidden');
-- Check all table-level mutation grants, then actually attempt each operation.
do $$ declare t text; op text; begin
 foreach t in array array['processing_jobs','readiness_results','readiness_result_evidence','readiness_requirement_mappings'] loop
  foreach op in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
   perform pg_temp.assert_true(not has_table_privilege(current_user,'public.'||t,op),'no client '||op||' on '||t);
  end loop;
  perform pg_temp.rejected('insert into public.'||t||' default values','42501','browser insert '||t);
  perform pg_temp.rejected('delete from public.'||t,'42501','browser delete '||t);
 end loop;
end $$;
select pg_temp.rejected('update public.readiness_results set status=''unknown''','42501','browser result update');
select pg_temp.rejected('update public.processing_jobs set attempts=1','42501','browser job update');
select pg_temp.rejected('update public.readiness_result_evidence set evidence_id=null','42501','browser link update');
select pg_temp.rejected('update public.readiness_requirement_mappings set mapping_type=''unsupported''','42501','browser mapping update');
select pg_temp.rejected('select private.check_readiness_result()','42501','internal function execution');
reset role;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.readiness_results),'other admin own result only');
select pg_temp.assert_true((select count(*)=1 from public.readiness_result_evidence),'other admin own link only');
reset role;
delete from public.club_members where user_id='b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.readiness_results),'revoked member loses access');
select pg_temp.assert_true((select count(*)=0 from public.readiness_result_evidence),'revoked member loses support access');
set local role anon;
select pg_temp.rejected('select * from public.readiness_results','42501','anonymous results');
select pg_temp.rejected('select * from public.readiness_result_evidence','42501','anonymous links');
select pg_temp.rejected('select * from public.processing_jobs','42501','anonymous jobs');
select pg_temp.rejected('select * from public.readiness_requirement_mappings','42501','anonymous mappings');
reset role;
set local role service_role;
select pg_temp.rejected('insert into public.processing_jobs default values','42501','no implicit service worker grants');
reset role;
select pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class where oid in ('public.processing_jobs'::regclass,'public.readiness_results'::regclass,'public.readiness_result_evidence'::regclass,'public.readiness_requirement_mappings'::regclass)),'RLS enabled');
rollback;
\echo 'PASS readiness schema relationships, mappings, queue constraints, versions, unknown states and security'
