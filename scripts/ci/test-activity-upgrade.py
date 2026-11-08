#!/usr/bin/env python3
"""Rollback-only upgrade regression on the fixed disposable local database."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
migration = (root / 'supabase/migrations/202611080004_activity_hardening.sql').read_text()
# Execute the actual migration body in a subtransaction so failure atomicity can
# be asserted without committing fixtures or editing the migration itself.
body = migration.replace('begin;', '', 1).rsplit('commit;', 1)[0]
assert '$upgrade$' not in body
sql = r'''
begin;
set local storage.allow_delete_query=true;
drop trigger activity_attachment_object_check on public.activity_attachments;
drop trigger activity_attachment_quota on public.activity_attachments;
drop function private.check_activity_attachment_object();
drop function private.track_activity_attachment_quota();
drop table private.activity_attachment_quota;
drop function private.activity_object_metadata_matches(jsonb,bigint,text);
alter table public.activity_attachments drop constraint activity_attachments_one_mib;
update storage.buckets set file_size_limit=5242880 where id='activity-media';
insert into auth.users(id) values ('81000000-0000-0000-0000-000000000001');
insert into public.clubs(id,name,county) values ('81000000-0000-0000-0000-000000000002','Upgrade','Nairobi');
insert into public.activities(id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at)
values ('81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000002',
'81000000-0000-0000-0000-000000000001','training','Historical','2026-11-08','Field',1,'',now());
insert into public.activity_attachments
select ('82000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
'81000000-0000-0000-0000-000000000003','historical/'||n,'image/jpeg',2097152
from generate_series(1,4) n;
'''
sql += "do $test$ begin begin execute $upgrade$" + body + r'''$upgrade$;
raise exception 'Expected over-cap migration rejection';
exception when check_violation then
 if SQLERRM not like 'Activity hardening blocked:%' then raise; end if;
end;
if to_regclass('private.activity_attachment_quota') is not null
 or exists(select 1 from pg_constraint where conname='activity_attachments_one_mib')
 or (select file_size_limit from storage.buckets where id='activity-media') <> 5242880
then raise exception 'Failed migration did not roll back atomically'; end if;
end $test$;
delete from public.activity_attachments where storage_path='historical/4';
'''
sql += "do $test$ begin execute $upgrade$" + body + r'''$upgrade$; end $test$;
do $test$ begin
if (select count(*) from public.activity_attachments where storage_path like 'historical/%' and file_size=2097152) <> 3
 or (select attachment_count from private.activity_attachment_quota where activity_id='81000000-0000-0000-0000-000000000003') <> 3
 or (select convalidated from pg_constraint where conname='activity_attachments_one_mib')
then raise exception 'Historical data or quota backfill changed unexpectedly'; end if;
end $test$;
rollback;
\echo 'PASS historical oversized/missing-object preservation, quota backfill, over-cap atomic rejection'
'''
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST='127.0.0.1', PGPORT='54322', PGDATABASE='postgres',
           PGUSER='postgres', PGPASSWORD='postgres', PGCONNECT_TIMEOUT='10')
subprocess.run(['psql', '-X', '--set=ON_ERROR_STOP=1'], input=sql,
               text=True, env=env, check=True, timeout=60)
