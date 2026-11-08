#!/usr/bin/env python3
"""Dedicated infrastructure LOGIN on the fixed disposable database only."""
import json
import os
import subprocess
import uuid
from pathlib import Path

root = Path(__file__).resolve().parents[2]
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST='127.0.0.1', PGPORT='54322', PGDATABASE='postgres', PGUSER='postgres', PGPASSWORD='postgres', PGCONNECT_TIMEOUT='5')
role = 'scheduler_test_' + uuid.uuid4().hex
club = str(uuid.uuid4())


def sql(text, login=env, success=True):
    result = subprocess.run(['psql', '-XAtqw', '-v', 'ON_ERROR_STOP=1'], input=text, text=True, capture_output=True, env=login, timeout=20)
    assert (result.returncode == 0) == success, 'unexpected database permissions/result'
    return result.stdout.strip()


created = False
try:
    sql(f"create role {role} login password 'disposable-scheduler-test' nosuperuser nocreatedb nocreaterole noreplication nobypassrls; grant readiness_worker to {role}; grant connect on database postgres to {role}; grant usage on schema public to {role};")
    created = True
    login = dict(env, PGUSER=role, PGPASSWORD='disposable-scheduler-test')
    sql(f"insert into public.clubs(id,name,county) values('{club}','Scheduler integration','Nairobi');")
    # Start with all pre-existing due work processed on this disposable stack.
    for _ in range(100):
        sql('select public.process_next_job();', login)
        if sql("select count(*) from public.processing_jobs where status='queued' and run_after<=clock_timestamp()") == '0':
            break
    sql(f"update public.clubs set description='Scheduled source event' where id='{club}';")
    result = subprocess.run(['python3', '-B', str(root / 'scripts/readiness/run.py'), '--max-calls', '3'], env=login, capture_output=True, text=True, timeout=50)
    data = json.loads(result.stdout)
    assert result.returncode == 0 and data['calls'] == 3 and data['jobs_returned'] >= 1, 'runner failed to process source event'
    assert sql(f"select count(*) from public.processing_jobs where club_id='{club}' and status='queued'") == '0'
    assert sql(f"select count(*) from public.processing_jobs where club_id='{club}' and status='done'") != '0'
    for statement in ['select * from public.processing_jobs;', 'select * from public.readiness_results;', 'select private.prepare_readiness(1);', 'set role postgres;']:
        sql(statement, login, success=False)
    for client in ['anon', 'authenticated', 'service_role']:
        sql(f'set role {client}; select public.readiness_health();', success=False)
    print('PASS actual infrastructure LOGIN, source-event scheduling, commits, table/private/admin denial and client health denial')
finally:
    sql(f"delete from public.clubs where id='{club}';")
    if created:
        sql(f'revoke usage on schema public from {role}; revoke connect on database postgres from {role}; revoke readiness_worker from {role}; drop role {role};')
