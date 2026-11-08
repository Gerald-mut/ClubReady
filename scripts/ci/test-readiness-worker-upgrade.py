#!/usr/bin/env python3
"""Replay actual Phase C over populated Phase B; rollback restores local schema."""
import os
import subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
body=(root/'supabase/migrations/202611080006_readiness_worker.sql').read_text().replace('begin;','',1).rsplit('commit;',1)[0]
sql=r'''
\set ON_ERROR_STOP on
begin;
do $$ declare t record; begin
 for t in select tgname,tgrelid::regclass relation from pg_trigger
 where tgfoid in (select oid from pg_proc where pronamespace='private'::regnamespace
 and proname in ('readiness_club_event','readiness_catalogue_event')) loop
 execute format('drop trigger %I on %s',t.tgname,t.relation);
 end loop;
end $$;
drop function public.process_next_job();
drop function private.prepare_readiness(integer);
drop function private.evaluate_readiness(uuid,bigint);
drop function private.enqueue_readiness(uuid);
drop function private.readiness_club_event();
drop function private.readiness_catalogue_event();
drop table private.readiness_clubs,private.readiness_catalogue,private.readiness_settings;
drop function if exists public.readiness_health();
drop role readiness_worker;
drop index public.processing_jobs_club_generation;
insert into public.clubs(id,name,county) values('c1000000-0000-0000-0000-000000000001','Populated predecessor','Nairobi');
insert into public.processing_jobs(club_id,generation) values('c1000000-0000-0000-0000-000000000001',9);
create temporary table worker_before as select jsonb_agg(to_jsonb(c) order by id) snapshot from public.clubs c;
'''
sql+=body+r'''
select private.prepare_readiness(1);
do $$ begin
 if (select snapshot from worker_before) is distinct from (select jsonb_agg(to_jsonb(c) order by id) from public.clubs c)
 then raise exception 'Upgrade changed source clubs'; end if;
 if not exists(select 1 from public.processing_jobs where club_id='c1000000-0000-0000-0000-000000000001' and status='queued' and generation=10)
 then raise exception 'Populated club was not bootstrapped'; end if;
end $$;
rollback;
\echo 'PASS populated Phase C upgrade and bounded bootstrap'
'''
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST='127.0.0.1',PGPORT='54322',PGDATABASE='postgres',PGUSER='postgres',PGPASSWORD='postgres')
subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1'],input=sql,text=True,env=env,check=True,timeout=60)
