#!/usr/bin/env python3
"""Committed fixtures and independent sessions on the fixed disposable stack."""
import concurrent.futures
import os
import subprocess
import time
import uuid

env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST='127.0.0.1', PGPORT='54322', PGDATABASE='postgres', PGUSER='postgres', PGPASSWORD='postgres', PGCONNECT_TIMEOUT='5')
club, user = str(uuid.uuid4()), str(uuid.uuid4())
command = ['psql', '-XAtq', '-v', 'ON_ERROR_STOP=1']
def sql(text, success=True):
    result = subprocess.run(command, input=text, text=True, capture_output=True, env=env, timeout=20)
    assert (result.returncode == 0) == success, result.stderr
    return result.stdout.strip()
def request():
    return sql(f"set role authenticated; set request.jwt.claim.sub='{user}'; select public.request_readiness_assessment('{club}')->>'accepted';")
def session(text):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    process.stdin.write(text + '\n'); process.stdin.flush()
    return process
try:
    sql(f"insert into auth.users(id) values('{user}'); insert into public.clubs(id,name,county) values('{club}','API concurrency','Nairobi'); insert into public.club_members values('{club}','{user}','club_member',now());")
    generation = sql(f"select generation from private.readiness_clubs where club_id='{club}'")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        accepted = list(pool.map(lambda _: request(), range(8)))
    assert accepted.count('true') == 1 and accepted.count('false') == 7
    assert sql(f"select generation from private.readiness_clubs where club_id='{club}'") == str(int(generation) + 1)
    assert sql(f"select count(*) from public.processing_jobs where club_id='{club}' and status='queued'") == '1'
    print('PASS 8 concurrent requests: one accepted, seven throttled, one generation, one queued job')
    # A blocked request must stamp its cooldown after acquiring the rate lock,
    # rather than replaying the stale INSERT/EXCLUDED timestamp from before wait.
    a = session(f"begin; select pg_backend_pid(); update private.readiness_requests set requested_at=clock_timestamp()-interval '61 seconds' where club_id='{club}'; select 'ready';")
    pid = int(a.stdout.readline().strip()); assert a.stdout.readline().strip() == 'ready'
    b = session(f"select pg_backend_pid(); set role authenticated; set request.jwt.claim.sub='{user}'; select public.request_readiness_assessment('{club}')->>'accepted';")
    blocked = int(b.stdout.readline().strip())
    deadline = time.monotonic() + 10
    while sql(f'select {pid}=any(pg_blocking_pids({blocked}))') != 't':
        assert time.monotonic() < deadline
        time.sleep(.05)
    marker = sql('select clock_timestamp()')
    a.stdin.write('commit;\n'); a.stdin.close(); assert a.wait(timeout=10) == 0
    assert b.stdout.readline().strip() == 'true'
    b.stdin.close(); assert b.wait(timeout=10) == 0
    assert sql(f"select requested_at>='{marker}'::timestamptz from private.readiness_requests where club_id='{club}'") == 't'
    assert request() == 'false'
    print('PASS contended cooldown starts after row lock acquisition; waiting requests cannot replay old timestamps')
    # Hold an accepted request open; deletion must wait, then future calls deny.
    sql(f"update private.readiness_requests set requested_at=now()-interval '61 seconds' where club_id='{club}'")
    a = session(f"begin; set role authenticated; set request.jwt.claim.sub='{user}'; select public.request_readiness_assessment('{club}')->>'accepted'; select pg_backend_pid();")
    assert a.stdout.readline().strip() == 'true'
    pid = int(a.stdout.readline().strip())
    b = session(f"begin; select pg_backend_pid(); delete from public.club_members where club_id='{club}' and user_id='{user}'; commit; select 'revoked';")
    blocked = int(b.stdout.readline().strip())
    deadline = time.monotonic() + 10
    while sql(f'select {pid}=any(pg_blocking_pids({blocked}))') != 't':
        assert time.monotonic() < deadline
        time.sleep(.05)
    a.stdin.write('commit;\n'); a.stdin.close(); assert a.wait(timeout=10) == 0
    assert b.stdout.readline().strip() == 'revoked'
    b.stdin.close(); assert b.wait(timeout=10) == 0
    sql(f"set role authenticated; set request.jwt.claim.sub='{user}'; select public.request_readiness_assessment('{club}');", success=False)
    print('PASS live revocation serializes with request commit; subsequent request denied')
finally:
    sql(f"delete from public.clubs where id='{club}'; delete from auth.users where id='{user}';")
