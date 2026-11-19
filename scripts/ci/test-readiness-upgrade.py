#!/usr/bin/env python3
"""Apply the actual Phase B migration over populated predecessors, rollback only."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
migration = (root / 'supabase/migrations/202611080005_readiness_schema.sql').read_text()
body = migration.replace('begin;', '', 1).rsplit('commit;', 1)[0]
assert '$readiness_upgrade$' not in body
sql = r'''
\set ON_ERROR_STOP on
begin;
-- Reconstruct the pre-B schema without Phase C event hooks; rollback restores them.
do $$ declare t record; begin
 for t in select tgname, tgrelid::regclass as relation from pg_trigger
 where tgfoid in (select oid from pg_proc where pronamespace='private'::regnamespace
 and proname in ('readiness_club_event','readiness_catalogue_event')) loop
 execute format('drop trigger %I on %s',t.tgname,t.relation);
 end loop;
end $$;
drop table public.readiness_result_evidence;
drop table public.readiness_results;
drop table public.processing_jobs;
drop table public.readiness_requirement_mappings;
drop function private.check_readiness_mapping();
drop function private.check_readiness_result();
alter table public.opportunity_requirements drop constraint readiness_requirement_identity;
alter table public.evidence drop constraint readiness_evidence_club;
alter table public.activities drop constraint readiness_activity_club;
insert into public.opportunities(id,title,organiser,description,source_url,application_method,status,review_date)
values('bc000000-0000-0000-0000-000000000001','Upgrade fixture','Test','Test','https://example.org','Test','unconfirmed',current_date);
insert into public.opportunity_requirements(id,opportunity_id,version,requirement_type,document_type,description,min_count,source_note,source_reference,condition,verification)
select ('bc100000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'bc000000-0000-0000-0000-000000000001',7,
case when n in (1,2,5) then 'document' when n=3 then 'activity' else 'club_info' end,
case when n in (1,2,5) then 'club_registration' end,'Never infer tournament or profile fields from this description',
case when n in (1,3,5) then 2 end,'Preserve original source note',
'{"url":"https://example.org","verified_at":"2026-11-08","publisher":"Test"}',
case when n=5 then '{"unresolved":true}'::jsonb end,'verified'
from generate_series(1,5) n;
create temporary table before_readiness(table_name text primary key,rows jsonb);
do $$ declare t text; snapshot jsonb; begin
 foreach t in array array['opportunities','opportunity_requirements','opportunity_rules','application_tracking','clubs','club_members','evidence','activities','activity_attachments'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',t) into snapshot;
  insert into before_readiness values(t,snapshot);
 end loop;
end $$;
'''
sql += 'do $apply$ begin execute $readiness_upgrade$' + body + '$readiness_upgrade$; end $apply$;\n'
sql += r'''
do $$ declare t record; snapshot jsonb; begin
 for t in select * from before_readiness loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',t.table_name) into snapshot;
  if snapshot is distinct from t.rows then raise exception 'Existing data changed: %',t.table_name; end if;
 end loop;
 if (select count(*) from public.readiness_requirement_mappings) <> (select count(*) from public.opportunity_requirements)
 then raise exception 'Incomplete mapping backfill'; end if;
 if (select count(*) from public.readiness_requirement_mappings where opportunity_id='bc000000-0000-0000-0000-000000000001' and requirement_version=7 and mapping_type='document' and min_count=2 and document_type='club_registration') <> 2
 then raise exception 'Structured document facts not preserved'; end if;
 if (select count(*) from public.readiness_requirement_mappings where opportunity_id='bc000000-0000-0000-0000-000000000001' and mapping_type='unsupported') <> 3
 then raise exception 'Null counts or free text inferred'; end if;
 if exists(select 1 from public.readiness_results) or exists(select 1 from public.processing_jobs)
 then raise exception 'Migration fabricated assessments or jobs'; end if;
end $$;
rollback;
\echo 'PASS populated readiness upgrade: original rows/source/version/conditions preserved, only structured mappings backfilled'
'''
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST='127.0.0.1', PGPORT='54322', PGDATABASE='postgres',
           PGUSER='postgres', PGPASSWORD='postgres', PGCONNECT_TIMEOUT='10')
subprocess.run(['psql', '-X', '--set=ON_ERROR_STOP=1'], input=sql,
               text=True, env=env, check=True, timeout=60)
