#!/usr/bin/env python3
"""Real sessions, committed disposable fixtures; no hosted connections."""
import os
import subprocess
import uuid
import time
from pathlib import Path
ENV = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
ENV.update(PGHOST='127.0.0.1', PGPORT='54322', PGDATABASE='postgres', PGUSER='postgres', PGPASSWORD='postgres')
CMD=['psql','-XAtq','-v','ON_ERROR_STOP=1']
def q(sql):
    r=subprocess.run(CMD,input=sql,text=True,capture_output=True,env=ENV,timeout=20)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()
def session(sql):
    p=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
    p.stdin.write(sql+'\n');p.stdin.flush()
    return p
def line(p):
    return p.stdout.readline().strip()
club=str(uuid.uuid4())
# Remove only derived disposable queue history from prior concurrency fixtures.
q("delete from public.processing_jobs; update private.readiness_clubs set catalogue_revision=(select revision from private.readiness_catalogue),swept_on=(clock_timestamp() at time zone 'UTC')::date;")
q(f"insert into public.clubs(id,name,county) values('{club}','Worker concurrency','Nairobi'); select private.prepare_readiness(100);")
a=session("begin; select pg_backend_pid(); select public.process_next_job(); select 'ready';")
pid=int(line(a)); job=line(a); assert line(a)=='ready'
assert q('select public.process_next_job()')=='', 'second worker claimed locked club'
print('PASS simultaneous workers: second worker skips club held by first transaction')
b=session(f"begin; select pg_backend_pid(); update public.clubs set description='event during evaluation' where id='{club}'; commit; select 'event committed';")
pid_b=int(line(b))
deadline=time.monotonic()+10
while q(f'select {pid}=any(pg_blocking_pids({pid_b}))')!='t':
    assert time.monotonic()<deadline, 'event did not overlap worker'
    time.sleep(.05)
a.stdin.write('commit;\n');a.stdin.close();assert a.wait(timeout=10)==0
assert line(b)=='event committed';b.stdin.close();assert b.wait(timeout=10)==0
assert q(f"select count(*) from public.processing_jobs where club_id='{club}' and status='queued'")=='1'
assert q(f"select generation>(select generation from public.processing_jobs where id='{job}') from public.processing_jobs where club_id='{club}' and status='queued'")=='t'
print('PASS event during processing: observed blocking; successor generation queued after commit')
# Kill an actual backend after evaluation and before COMMIT. All claim/result
# changes must disappear; the original queued job must be processable again.
a=session("begin; select pg_backend_pid(); select public.process_next_job(); select 'ready';")
pid=int(line(a));job=line(a);assert line(a)=='ready'
assert q(f'select pg_terminate_backend({pid})')=='t'
a.stdin.close();a.wait(timeout=10)
assert q(f"select status from public.processing_jobs where id='{job}'")=='queued'
assert q('select public.process_next_job()')==job
assert q(f"select status from public.processing_jobs where id='{job}'")=='done'
print('PASS backend termination: uncommitted claim rolled back; same job processed successfully')
