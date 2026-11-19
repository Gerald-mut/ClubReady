#!/usr/bin/env python3
"""Apply the actual additive member API migration over populated predecessors."""
import os
import subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[2]
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST='127.0.0.1', PGPORT='54322', PGDATABASE='postgres', PGUSER='postgres', PGPASSWORD='postgres', PGCONNECT_TIMEOUT='5')
body = (root / 'supabase/migrations/202611080008_readiness_member_api.sql').read_text().strip().removeprefix('begin;').removesuffix('commit;')
sql = """
begin;
drop function public.request_readiness_assessment(uuid),public.readiness_lifecycle(uuid);
drop table private.readiness_requests;
create temp table phase_f_baseline(name text primary key,digest text);
do $$ declare t text; h text;
begin
 foreach t in array array['public.clubs','public.club_members','public.activities','public.activity_attachments','public.evidence','public.opportunity_requirements','public.readiness_requirement_mappings','public.readiness_results','public.readiness_result_evidence','public.processing_jobs','private.readiness_clubs','private.readiness_catalogue'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text,$empty$[]$empty$)) from %s x',t) into h;
  insert into phase_f_baseline values(t,h);
 end loop;
end $$;
""" + body + """
do $$ declare r record; h text;
begin
 for r in select * from phase_f_baseline loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text,$empty$[]$empty$)) from %s x',r.name) into h;
  if h is distinct from r.digest then raise exception 'Predecessor data changed: %',r.name; end if;
 end loop;
end $$;
rollback;
"""
result = subprocess.run(['psql', '-Xq', '-v', 'ON_ERROR_STOP=1'], input=sql, env=env, capture_output=True, text=True, timeout=30)
if result.returncode:
    raise RuntimeError(result.stderr)
print('PASS additive member API upgrade preserves 12 predecessor tables in the populated database')
