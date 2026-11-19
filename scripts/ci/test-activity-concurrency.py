#!/usr/bin/env python3
"""Real concurrent psql sessions against the disposable local Supabase stack.

Catalog-only fixtures are committed so both sessions can see them. They contain
no physical Storage files. Discard them by resetting/stopping the disposable
stack, never by treating SQL DELETE as file cleanup. Run last in the SQL suite.
"""

import os
from pathlib import Path
import queue
import subprocess
import threading
import time
import uuid


ROOT = Path(__file__).resolve().parents[2]
LOGS = Path(os.environ.get("CLUBREADY_TEST_LOG_DIR", ROOT / ".codex-logs"))
LOGS.mkdir(parents=True, exist_ok=True)
ENV = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
ENV.update(PGHOST="127.0.0.1", PGPORT="54322", PGDATABASE="postgres",
           PGUSER="postgres", PGPASSWORD="postgres", PGCONNECT_TIMEOUT="10")
PSQL = ["psql", "-X", "-A", "-t", "-q", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose"]


def query(sql):
    result = subprocess.run(PSQL, input=sql, text=True, capture_output=True,
                            env=ENV, timeout=15, check=False)
    with (LOGS / "phase-a-concurrency-observer.log").open("a") as log:
        log.write(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError("Observer query failed; see phase-a-concurrency-observer.log")
    return result.stdout.strip()


def concurrent_case(label, isolation, expected_code=None, duplicate=False):
    user, club, activity = (str(uuid.uuid4()) for _ in range(3))
    images = [str(uuid.uuid4()) for _ in range(4)]
    prefix = f"{club}/{activity}/"

    def attachment(image):
        return (f"insert into public.activity_attachments values ('{image}',"
                f"'{activity}','{prefix}{image}.jpg','image/jpeg',100) "
                "on conflict(id) do nothing;")

    # This setup is SQL catalog stubbing, not a Storage API integration test.
    objects = ",".join(f"('activity-media','{prefix}{image}.jpg','{user}',"
                       "'{\"size\":100,\"mimetype\":\"image/jpeg\"}')" for image in images)
    query(f"""
      begin;
      insert into auth.users(id) values('{user}');
      insert into public.clubs(id,name,county) values('{club}','Concurrency','Nairobi');
      insert into public.club_members(club_id,user_id,role) values('{club}','{user}','club_member');
      insert into public.activities(id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at)
        values('{activity}','{club}','{user}','training','Concurrency','2026-11-08','Field',1,'',now());
      insert into storage.objects(bucket_id,name,owner_id,metadata) values {objects};
      {attachment(images[0])}
      {attachment(images[1])}
      commit;
    """)

    app_a, app_b = f"phase-a-{label}-a", f"phase-a-{label}-b"
    lines = queue.Queue()
    processes = []
    with (LOGS / f"phase-a-concurrency-{label}-a.log").open("w") as log_a, \
         (LOGS / f"phase-a-concurrency-{label}-b.log").open("w") as log_b:
        a = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=log_a, text=True, env={**ENV, "PGAPPNAME": app_a})
        processes.append(a)

        def receive_a():
            for line in a.stdout:
                log_a.write(line)
                log_a.flush()
                lines.put(line.strip())

        reader = threading.Thread(target=receive_a, daemon=True)
        reader.start()
        try:
            a.stdin.write(f"""
              begin isolation level {isolation};
              set local statement_timeout='15s';
              set local role authenticated;
              select set_config('request.jwt.claim.sub','{user}',true);
              select 'pid='||pg_backend_pid();
              {attachment(images[2])}
              select 'ready';
            """)
            a.stdin.flush()
            pid_a = None
            deadline = time.monotonic() + 15
            while True:
                line = lines.get(timeout=max(0.01, deadline - time.monotonic()))
                if line.startswith("pid="):
                    pid_a = int(line[4:])
                if line == "ready":
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError("Session A did not reach its uncommitted insert")
            assert pid_a is not None

            b = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=log_b,
                                 stderr=log_b, text=True, env={**ENV, "PGAPPNAME": app_b})
            processes.append(b)
            b.stdin.write(f"""
              begin isolation level {isolation};
              set local statement_timeout='15s';
              set local role authenticated;
              select set_config('request.jwt.claim.sub','{user}',true);
              -- Prime a snapshot before A commits, including at REPEATABLE READ.
              select count(*) from public.activity_attachments where activity_id='{activity}';
              {attachment(images[2] if duplicate else images[3])}
              commit;
            """)
            b.stdin.close()

            # Prove actual overlap and blocking, not merely two sequential calls.
            deadline = time.monotonic() + 10
            while query(f"select exists(select 1 from pg_stat_activity where application_name='{app_b}' "
                        f"and {pid_a}=any(pg_blocking_pids(pid)));") != "t":
                if b.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError("Session B never blocked behind A; concurrency proof failed")
                time.sleep(0.05)

            a.stdin.write("commit;\n")
            a.stdin.close()
            assert a.wait(timeout=15) == 0, "Session A failed"
            reader.join(timeout=2)
            b_code = b.wait(timeout=15)
            log_b.flush()
            if expected_code:
                error = (LOGS / f"phase-a-concurrency-{label}-b.log").read_text()
                assert b_code != 0 and expected_code in error, "Wrong competing-insert outcome"
                if expected_code == "23514":
                    assert "activity_attachment_quota_limit" in error
            else:
                assert b_code == 0, "Concurrent identical retry should succeed"

            assert query(f"select count(*) from public.activity_attachments where activity_id='{activity}';") == "3"
            assert query(f"select attachment_count from private.activity_attachment_quota where activity_id='{activity}';") == "3"
            assert query(f"select count(*) from storage.objects where bucket_id='activity-media' and name like '{prefix}%';") == "4"
            print(f"PASS {label}: B blocked behind A; final attachment/quota counts=3; uploads retained")
        finally:
            for process in processes:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
            reader.join(timeout=2)


if __name__ == "__main__":
    concurrent_case("read-committed", "read committed", expected_code="23514")
    concurrent_case("repeatable-read", "repeatable read", expected_code="40001")
    concurrent_case("duplicate", "read committed", duplicate=True)
    print("Activity attachment concurrency assertions passed (discard the disposable stack).")
